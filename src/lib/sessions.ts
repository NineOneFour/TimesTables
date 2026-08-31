import { getDb, nowIso } from './db'
import { blankFactRecord, pairKey } from './facts'
import { nextMasteryScore, statusForScore } from './mastery'
import {
  STANDARD_SESSION_LENGTH,
  buildRemediationSession,
  buildStandardSession,
} from './selection'
import { getSettings } from './settings'
import { evaluateTimerProgression } from './timer'
import type {
  AttemptInput,
  AttemptRecord,
  AttemptResult,
  Fact,
  FactRecord,
  SessionMode,
  SessionRecord,
} from './types'

/** A correct answer at or above this fraction of the limit counts as slow. */
export const SLOW_ANSWER_FRACTION = 0.7

/** Weight given to the newest answered attempt in a fact's recent response time. */
const RESPONSE_TIME_ALPHA = 0.3

const RECENT_RESULTS_KEPT = 10

export interface NewSession {
  sessionId: number
  mode: SessionMode
  timeLimitMs: number
  problems: Fact[]
}

export function createStandardSession(kidId: number): NewSession {
  const settings = getSettings(kidId)
  const problems = buildStandardSession(kidId, settings, STANDARD_SESSION_LENGTH)
  return insertSession(kidId, 'standard', settings.timeLimitMs, problems, null)
}

/**
 * Remediation over the facts a previous session found difficult: anything
 * incorrect, timed out, or answered correctly but slowly.
 */
export function createRemediationSession(
  kidId: number,
  sourceSessionId: number,
): NewSession {
  const settings = getSettings(kidId)
  const facts = getDifficultFacts(kidId, sourceSessionId)
  const problems = buildRemediationSession(facts)
  return insertSession(
    kidId,
    'remediation',
    settings.timeLimitMs,
    problems,
    sourceSessionId,
  )
}

function insertSession(
  kidId: number,
  mode: SessionMode,
  timeLimitMs: number,
  problems: Fact[],
  sourceSessionId: number | null,
): NewSession {
  const result = getDb()
    .prepare(
      `INSERT INTO sessions (kidId, mode, startedAt, timeLimitMs, sourceSessionId)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(kidId, mode, nowIso(), timeLimitMs, sourceSessionId)
  return {
    sessionId: Number(result.lastInsertRowid),
    mode,
    timeLimitMs,
    problems,
  }
}

export function getDifficultFacts(kidId: number, sessionId: number): Fact[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT a, b
         FROM attempts
        WHERE kidId = ?
          AND sessionId = ?
          AND (result != 'correct' OR responseMs >= timeLimitMs * ?)`,
    )
    .all(kidId, sessionId, SLOW_ANSWER_FRACTION) as Fact[]
  return rows
}

export interface CompletionSummary {
  session: SessionRecord
  timerChange: { fromMs: number; toMs: number; reason: string } | null
}

/**
 * Record a finished run: every attempt becomes a permanent historical row,
 * fact records are updated to reflect current ability, and the per-problem
 * limit is re-evaluated.
 */
export function completeSession(
  kidId: number,
  sessionId: number,
  attempts: AttemptInput[],
): CompletionSummary {
  const db = getDb()
  const session = getSession(kidId, sessionId)
  if (!session) throw new Error(`Unknown session ${sessionId}`)
  if (session.completedAt) throw new Error(`Session ${sessionId} already recorded`)

  const timeLimitMs = session.timeLimitMs
  const timestamp = nowIso()

  const insertAttempt = db.prepare(
    `INSERT INTO attempts
       (kidId, sessionId, a, b, answerGiven, correctAnswer, result, responseMs, timeLimitMs, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const upsertFact = db.prepare(
    `INSERT INTO facts
       (kidId, a, b, pairKey, masteryScore, masteryStatus, totalAttempts, correctAttempts,
        incorrectAttempts, timeouts, totalResponseMs, recentResponseMs, lastSeen,
        lastResult, recentResults)
     VALUES (@kidId, @a, @b, @pairKey, @masteryScore, @masteryStatus, @totalAttempts,
             @correctAttempts, @incorrectAttempts, @timeouts, @totalResponseMs,
             @recentResponseMs, @lastSeen, @lastResult, @recentResults)
     ON CONFLICT (kidId, a, b) DO UPDATE SET
       masteryScore = @masteryScore,
       masteryStatus = @masteryStatus,
       totalAttempts = @totalAttempts,
       correctAttempts = @correctAttempts,
       incorrectAttempts = @incorrectAttempts,
       timeouts = @timeouts,
       totalResponseMs = @totalResponseMs,
       recentResponseMs = @recentResponseMs,
       lastSeen = @lastSeen,
       lastResult = @lastResult,
       recentResults = @recentResults`,
  )
  const insertMasteryEvent = db.prepare(
    `INSERT INTO mastery_events (kidId, a, b, fromStatus, toStatus, masteryScore, sessionId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const selectFact = db.prepare(
    'SELECT * FROM facts WHERE kidId = ? AND a = ? AND b = ?',
  )

  const run = db.transaction(() => {
    let correct = 0
    let incorrect = 0
    let timeouts = 0
    let totalResponseMs = 0

    for (const attempt of attempts) {
      const correctAnswer = attempt.a * attempt.b
      const result = normaliseResult(attempt, correctAnswer)
      const responseMs = Math.min(
        Math.max(Math.round(attempt.responseMs), 0),
        timeLimitMs,
      )

      insertAttempt.run(
        kidId,
        sessionId,
        attempt.a,
        attempt.b,
        attempt.answerGiven,
        correctAnswer,
        result,
        responseMs,
        timeLimitMs,
        timestamp,
      )

      if (result === 'correct') correct += 1
      else if (result === 'incorrect') incorrect += 1
      else timeouts += 1
      totalResponseMs += responseMs

      const existingRow = selectFact.get(kidId, attempt.a, attempt.b) as
        | (Omit<FactRecord, 'recentResults'> & { recentResults: string })
        | undefined
      const previous: FactRecord = existingRow
        ? {
            ...existingRow,
            recentResults: JSON.parse(existingRow.recentResults),
          }
        : blankFactRecord(attempt.a, attempt.b)

      const updated = applyAttemptToFact(previous, result, responseMs, timeLimitMs, timestamp)
      upsertFact.run({
        ...updated,
        kidId,
        recentResults: JSON.stringify(updated.recentResults),
      })

      if (updated.masteryStatus !== previous.masteryStatus) {
        insertMasteryEvent.run(
          kidId,
          attempt.a,
          attempt.b,
          previous.masteryStatus,
          updated.masteryStatus,
          updated.masteryScore,
          sessionId,
          timestamp,
        )
      }
    }

    db.prepare(
      `UPDATE sessions
          SET completedAt = ?, presented = ?, correct = ?, incorrect = ?,
              timeouts = ?, totalResponseMs = ?
        WHERE kidId = ? AND id = ?`,
    ).run(
      timestamp,
      attempts.length,
      correct,
      incorrect,
      timeouts,
      totalResponseMs,
      kidId,
      sessionId,
    )
  })

  run()

  const timerChange =
    session.mode === 'standard'
      ? evaluateTimerProgression(kidId, sessionId)
      : null

  return { session: getSession(kidId, sessionId)!, timerChange }
}

function normaliseResult(
  attempt: AttemptInput,
  correctAnswer: number,
): AttemptResult {
  if (attempt.result === 'timeout' || attempt.answerGiven === null) {
    return 'timeout'
  }
  return attempt.answerGiven === correctAnswer ? 'correct' : 'incorrect'
}

/**
 * Fold one attempt into a fact record. `totalResponseMs` covers every
 * attempt (a timeout contributing the full limit), while `recentResponseMs`
 * tracks answered attempts only, since a timeout has no real response time.
 */
export function applyAttemptToFact(
  previous: FactRecord,
  result: AttemptResult,
  responseMs: number,
  timeLimitMs: number,
  timestamp: string,
): FactRecord {
  const totalAttempts = previous.totalAttempts + 1
  const masteryScore = nextMasteryScore(
    previous.masteryScore,
    result,
    responseMs,
    timeLimitMs,
  )
  const answered = result !== 'timeout'
  const recentResponseMs = answered
    ? previous.recentResponseMs === null
      ? responseMs
      : previous.recentResponseMs +
        RESPONSE_TIME_ALPHA * (responseMs - previous.recentResponseMs)
    : previous.recentResponseMs

  return {
    a: previous.a,
    b: previous.b,
    pairKey: pairKey(previous.a, previous.b),
    masteryScore,
    masteryStatus: statusForScore(masteryScore, totalAttempts),
    totalAttempts,
    correctAttempts: previous.correctAttempts + (result === 'correct' ? 1 : 0),
    incorrectAttempts:
      previous.incorrectAttempts + (result === 'incorrect' ? 1 : 0),
    timeouts: previous.timeouts + (result === 'timeout' ? 1 : 0),
    totalResponseMs: previous.totalResponseMs + responseMs,
    recentResponseMs,
    lastSeen: timestamp,
    lastResult: result,
    recentResults: [result, ...previous.recentResults].slice(
      0,
      RECENT_RESULTS_KEPT,
    ),
  }
}

/*
  The kidId goes into the WHERE clause rather than being checked after the read,
  so another kid's session id returns "not found" instead of fetching the row
  and relying on a caller to reject it.
*/

export function getSession(kidId: number, id: number): SessionRecord | null {
  const row = getDb()
    .prepare('SELECT * FROM sessions WHERE kidId = ? AND id = ?')
    .get(kidId, id) as SessionRecord | undefined
  return row ?? null
}

export function getSessionAttempts(
  kidId: number,
  sessionId: number,
): AttemptRecord[] {
  return getDb()
    .prepare(
      'SELECT * FROM attempts WHERE kidId = ? AND sessionId = ? ORDER BY id',
    )
    .all(kidId, sessionId) as AttemptRecord[]
}

export function deleteAbandonedSession(kidId: number, id: number) {
  const db = getDb()
  const session = getSession(kidId, id)
  if (!session || session.completedAt) return
  db.prepare('DELETE FROM attempts WHERE kidId = ? AND sessionId = ?').run(
    kidId,
    id,
  )
  db.prepare('DELETE FROM sessions WHERE kidId = ? AND id = ?').run(kidId, id)
}
