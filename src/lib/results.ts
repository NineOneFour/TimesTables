import { getDb } from './db'
import { getSession, getSessionAttempts } from './sessions'
import type { AttemptRecord, SessionRecord } from './types'

export interface SessionSummary {
  session: SessionRecord
  presented: number
  correct: number
  incorrect: number
  timeouts: number
  attempted: number
  /** Correct out of everything presented — the headline score. */
  score: { correct: number; outOf: number }
  /** Correct as a share of problems the user actually answered. */
  accuracyAttempted: number | null
  /** Correct as a share of every problem presented. */
  accuracyPresented: number
  /** Mean response time over answered problems only. */
  avgResponseAnsweredMs: number | null
  /** Mean time per problem including timeouts, which consume the full limit. */
  avgResponseAllMs: number | null
  attempts: AttemptRecord[]
  /** Incorrect, timed out, or correct-but-slow, worst first. */
  difficult: AttemptRecord[]
}

const SLOW_ANSWER_FRACTION = 0.7

const RESULT_RANK = { timeout: 0, incorrect: 1, correct: 2 }

export function getSessionSummary(
  kidId: number,
  sessionId: number,
): SessionSummary | null {
  const session = getSession(kidId, sessionId)
  if (!session) return null
  const attempts = getSessionAttempts(kidId, sessionId)

  const presented = attempts.length
  const correct = attempts.filter((a) => a.result === 'correct').length
  const incorrect = attempts.filter((a) => a.result === 'incorrect').length
  const timeouts = attempts.filter((a) => a.result === 'timeout').length
  const attempted = presented - timeouts

  const answered = attempts.filter((a) => a.result !== 'timeout')
  const answeredMs = answered.reduce((sum, a) => sum + a.responseMs, 0)
  const allMs = attempts.reduce((sum, a) => sum + a.responseMs, 0)

  const difficult = attempts
    .filter(
      (a) =>
        a.result !== 'correct' ||
        a.responseMs >= a.timeLimitMs * SLOW_ANSWER_FRACTION,
    )
    .sort(
      (x, y) =>
        RESULT_RANK[x.result] - RESULT_RANK[y.result] ||
        y.responseMs - x.responseMs,
    )

  return {
    session,
    presented,
    correct,
    incorrect,
    timeouts,
    attempted,
    score: { correct, outOf: presented },
    accuracyAttempted: attempted === 0 ? null : correct / attempted,
    accuracyPresented: presented === 0 ? 0 : correct / presented,
    avgResponseAnsweredMs: answered.length === 0 ? null : answeredMs / answered.length,
    avgResponseAllMs: presented === 0 ? null : allMs / presented,
    attempts,
    difficult,
  }
}

export function getLatestCompletedSessionId(kidId: number): number | null {
  const row = getDb()
    .prepare(
      `SELECT id FROM sessions
        WHERE kidId = ? AND completedAt IS NOT NULL
        ORDER BY completedAt DESC LIMIT 1`,
    )
    .get(kidId) as { id: number } | undefined
  return row?.id ?? null
}
