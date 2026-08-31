import { SQL_NOW_ISO, getDb } from './db'
import { getActiveFactRecords, getAllFactRecords } from './facts'
import { getSettings } from './settings'
import type { FactRecord, MasteryStatus } from './types'

/**
 * Read-only analysis over stored sessions, attempts and mastery events.
 * Everything here answers the same question in different ways: what is
 * improving, and what should we work on next?
 */

const RECENT_WINDOW_DAYS = 7
const MIN_ATTEMPTS_FOR_TREND = 3
const SLOW_ANSWER_FRACTION = 0.7

export interface SessionTrendPoint {
  sessionId: number
  completedAt: string
  presented: number
  correct: number
  incorrect: number
  timeouts: number
  timeLimitMs: number
  accuracyPresented: number
  accuracyAttempted: number | null
  avgResponseAnsweredMs: number | null
}

/** Session-level history. Remediation runs are excluded — they are not scored challenges. */
export function getSessionTrend(kidId: number, limit = 30): SessionTrendPoint[] {
  const rows = getDb()
    .prepare(
      `SELECT s.id            AS sessionId,
              s.completedAt   AS completedAt,
              s.presented     AS presented,
              s.correct       AS correct,
              s.incorrect     AS incorrect,
              s.timeouts      AS timeouts,
              s.timeLimitMs   AS timeLimitMs,
              (SELECT AVG(responseMs) FROM attempts
                WHERE kidId = s.kidId
                  AND sessionId = s.id
                  AND result != 'timeout') AS avgAnsweredMs
         FROM sessions s
        WHERE s.kidId = ?
          AND s.mode = 'standard'
          AND s.completedAt IS NOT NULL
          AND s.presented > 0
        ORDER BY s.completedAt DESC
        LIMIT ?`,
    )
    .all(kidId, limit) as (Omit<
      SessionTrendPoint,
      'accuracyPresented' | 'accuracyAttempted' | 'avgResponseAnsweredMs'
    > & { avgAnsweredMs: number | null })[]

  return rows
    .map((row) => {
      const attempted = row.presented - row.timeouts
      return {
        sessionId: row.sessionId,
        completedAt: row.completedAt,
        presented: row.presented,
        correct: row.correct,
        incorrect: row.incorrect,
        timeouts: row.timeouts,
        timeLimitMs: row.timeLimitMs,
        accuracyPresented: row.correct / row.presented,
        accuracyAttempted: attempted === 0 ? null : row.correct / attempted,
        avgResponseAnsweredMs: row.avgAnsweredMs,
      }
    })
    .reverse()
}

export interface DailySessionCount {
  /** Local calendar day, YYYY-MM-DD. */
  day: string
  started: number
  completed: number
}

/**
 * Sessions per day, started against completed.
 *
 * Grouped by the day the session was *started*, so the two counts describe the
 * same sittings and the gap between them is the number left unfinished — a
 * session that ran past midnight would otherwise be started on one day and
 * completed on the next.
 *
 * Grouped in local time, not UTC. Timestamps are stored in UTC, and an evening
 * session west of Greenwich lands on the following UTC day — 21:05 on the 29th
 * is stored as 02:05 on the 30th, which would file it under the wrong day.
 *
 * Unlike the accuracy charts this counts focused practice runs too: the question
 * is how much practice was attempted, not how it scored.
 */
export function getDailySessionCounts(
  kidId: number,
  limit = 30,
): DailySessionCount[] {
  const rows = getDb()
    .prepare(
      `SELECT date(startedAt, 'localtime')        AS day,
              COUNT(*)                            AS started,
              SUM(completedAt IS NOT NULL)        AS completed
         FROM sessions
        WHERE kidId = ?
        GROUP BY day
        ORDER BY day DESC
        LIMIT ?`,
    )
    .all(kidId, limit) as DailySessionCount[]
  return rows
}

export interface FactWindowStats {
  attempts: number
  correct: number
  timeouts: number
  accuracy: number | null
  avgAnsweredMs: number | null
}

export type FactTrendDirection =
  | 'improving'
  | 'regressing'
  | 'steady'
  | 'insufficient-data'

export interface FactTrend {
  a: number
  b: number
  masteryScore: number
  masteryStatus: MasteryStatus
  totalAttempts: number
  recent: FactWindowStats
  previous: FactWindowStats
  direction: FactTrendDirection
  /** Positive means recent performance is better than the prior window. */
  delta: number
  inActivePool: boolean
}

interface WindowRow {
  a: number
  b: number
  attempts: number
  correct: number
  timeouts: number
  answeredMs: number | null
  answered: number
}

function windowStats(
  kidId: number,
  sinceDaysAgo: number,
  untilDaysAgo: number,
): Map<string, FactWindowStats> {
  const rows = getDb()
    .prepare(
      `SELECT a, b,
              COUNT(*)                                        AS attempts,
              SUM(result = 'correct')                         AS correct,
              SUM(result = 'timeout')                         AS timeouts,
              SUM(CASE WHEN result != 'timeout' THEN responseMs END) AS answeredMs,
              SUM(result != 'timeout')                        AS answered
         FROM attempts
        WHERE kidId = ?
          AND createdAt >= ${SQL_NOW_ISO}
          AND createdAt <  ${SQL_NOW_ISO}
        GROUP BY a, b`,
    )
    .all(kidId, `-${sinceDaysAgo} days`, `-${untilDaysAgo} days`) as WindowRow[]

  const map = new Map<string, FactWindowStats>()
  for (const row of rows) {
    const attempted = row.attempts - row.timeouts
    map.set(`${row.a}x${row.b}`, {
      attempts: row.attempts,
      correct: row.correct,
      timeouts: row.timeouts,
      accuracy: attempted === 0 ? null : row.correct / attempted,
      avgAnsweredMs:
        row.answered === 0 || row.answeredMs === null
          ? null
          : row.answeredMs / row.answered,
    })
  }
  return map
}

const EMPTY_WINDOW: FactWindowStats = {
  attempts: 0,
  correct: 0,
  timeouts: 0,
  accuracy: null,
  avgAnsweredMs: null,
}

/**
 * Per-fact week-over-week comparison. Direction combines the change in
 * accuracy with the change in speed, so a fact that got faster at the same
 * accuracy still reads as improving.
 */
export function getFactTrends(kidId: number): FactTrend[] {
  const settings = getSettings(kidId)
  const activeKeys = new Set(
    getActiveFactRecords(kidId, settings).map((r) => `${r.a}x${r.b}`),
  )
  const recent = windowStats(kidId, RECENT_WINDOW_DAYS, 0)
  const previous = windowStats(kidId, RECENT_WINDOW_DAYS * 2, RECENT_WINDOW_DAYS)

  const records: FactRecord[] = getAllFactRecords(kidId)
  const seen = new Set(records.map((r) => `${r.a}x${r.b}`))
  const activeBlanks = getActiveFactRecords(kidId, settings).filter(
    (r) => !seen.has(`${r.a}x${r.b}`),
  )

  return [...records, ...activeBlanks]
    .map((record) => {
      const key = `${record.a}x${record.b}`
      const recentStats = recent.get(key) ?? EMPTY_WINDOW
      const previousStats = previous.get(key) ?? EMPTY_WINDOW
      const { direction, delta } = compareWindows(recentStats, previousStats)
      return {
        a: record.a,
        b: record.b,
        masteryScore: record.masteryScore,
        masteryStatus: record.masteryStatus,
        totalAttempts: record.totalAttempts,
        recent: recentStats,
        previous: previousStats,
        direction,
        delta,
        inActivePool: activeKeys.has(key),
      }
    })
    .sort((x, y) => x.masteryScore - y.masteryScore)
}

function compareWindows(
  recent: FactWindowStats,
  previous: FactWindowStats,
): { direction: FactTrendDirection; delta: number } {
  if (
    recent.attempts < MIN_ATTEMPTS_FOR_TREND ||
    previous.attempts < MIN_ATTEMPTS_FOR_TREND
  ) {
    return { direction: 'insufficient-data', delta: 0 }
  }

  const accuracyDelta = (recent.accuracy ?? 0) - (previous.accuracy ?? 0)
  const speedDelta =
    recent.avgAnsweredMs === null || previous.avgAnsweredMs === null
      ? 0
      : (previous.avgAnsweredMs - recent.avgAnsweredMs) / previous.avgAnsweredMs

  // Accuracy carries most of the weight; speed breaks ties.
  const delta = accuracyDelta * 0.7 + speedDelta * 0.3
  if (delta >= 0.08) return { direction: 'improving', delta }
  if (delta <= -0.08) return { direction: 'regressing', delta }
  return { direction: 'steady', delta }
}

export interface FactProblemCount {
  a: number
  b: number
  attempts: number
  count: number
  rate: number
  avgAnsweredMs: number | null
  masteryStatus: MasteryStatus
}

function factProblemCounts(
  kidId: number,
  column: 'incorrect' | 'timeout' | 'slow',
  windowDays: number,
): FactProblemCount[] {
  const predicate =
    column === 'incorrect'
      ? "result = 'incorrect'"
      : column === 'timeout'
        ? "result = 'timeout'"
        : `result = 'correct' AND responseMs >= timeLimitMs * ${SLOW_ANSWER_FRACTION}`

  const rows = getDb()
    .prepare(
      `SELECT a.a, a.b,
              COUNT(*)                            AS attempts,
              SUM(${predicate})                   AS count,
              AVG(CASE WHEN a.result != 'timeout' THEN a.responseMs END) AS avgAnsweredMs,
              COALESCE(f.masteryStatus, 'unknown') AS masteryStatus
         FROM attempts a
         LEFT JOIN facts f
                ON f.kidId = a.kidId AND f.a = a.a AND f.b = a.b
        WHERE a.kidId = ?
          AND a.createdAt >= ${SQL_NOW_ISO}
        GROUP BY a.a, a.b
       HAVING count > 0
        ORDER BY count DESC, attempts DESC`,
    )
    .all(kidId, `-${windowDays} days`) as (Omit<FactProblemCount, 'rate'> & {
      masteryStatus: MasteryStatus
    })[]

  return rows.map((row) => ({ ...row, rate: row.count / row.attempts }))
}

export function getFrequentlyIncorrect(kidId: number, windowDays = 30) {
  return factProblemCounts(kidId, 'incorrect', windowDays)
}

export function getFrequentlyTimedOut(kidId: number, windowDays = 30) {
  return factProblemCounts(kidId, 'timeout', windowDays)
}

/** Correct, but consistently near the time limit. */
export function getCorrectButSlow(kidId: number, windowDays = 30) {
  return factProblemCounts(kidId, 'slow', windowDays)
}

export interface MasteryEvent {
  id: number
  a: number
  b: number
  fromStatus: MasteryStatus
  toStatus: MasteryStatus
  masteryScore: number
  createdAt: string
}

export function getMasteryEvents(kidId: number, limit = 40): MasteryEvent[] {
  return getDb()
    .prepare(
      `SELECT id, a, b, fromStatus, toStatus, masteryScore, createdAt
         FROM mastery_events
        WHERE kidId = ?
        ORDER BY createdAt DESC, id DESC
        LIMIT ?`,
    )
    .all(kidId, limit) as MasteryEvent[]
}

export interface MasteryDistribution {
  status: MasteryStatus
  count: number
}

export function getMasteryDistribution(kidId: number): MasteryDistribution[] {
  const records = getActiveFactRecords(kidId, getSettings(kidId))
  const order: MasteryStatus[] = [
    'unknown',
    'weak',
    'developing',
    'strong',
    'mastered',
  ]
  return order.map((status) => ({
    status,
    count: records.filter((r) => r.masteryStatus === status).length,
  }))
}

export interface OverviewStats {
  totalSessions: number
  totalAttempts: number
  factsTracked: number
  currentTimeLimitMs: number
}

export function getOverviewStats(kidId: number): OverviewStats {
  const db = getDb()
  const sessions = db
    .prepare(
      `SELECT COUNT(*) AS n FROM sessions
        WHERE kidId = ? AND mode = 'standard' AND completedAt IS NOT NULL`,
    )
    .get(kidId) as { n: number }
  const attempts = db
    .prepare('SELECT COUNT(*) AS n FROM attempts WHERE kidId = ?')
    .get(kidId) as { n: number }
  const facts = db
    .prepare(
      'SELECT COUNT(*) AS n FROM facts WHERE kidId = ? AND totalAttempts > 0',
    )
    .get(kidId) as { n: number }
  return {
    totalSessions: sessions.n,
    totalAttempts: attempts.n,
    factsTracked: facts.n,
    currentTimeLimitMs: getSettings(kidId).timeLimitMs,
  }
}

/** Weakest and strongest facts in the active pool, excluding unmeasured ones. */
export function getExtremeFacts(
  kidId: number,
  count = 10,
): {
  weakest: FactRecord[]
  strongest: FactRecord[]
} {
  const measured = getActiveFactRecords(kidId, getSettings(kidId))
    .filter((r) => r.masteryStatus !== 'unknown')
    .sort((x, y) => x.masteryScore - y.masteryScore)
  return {
    weakest: measured.slice(0, count),
    strongest: [...measured].reverse().slice(0, count),
  }
}
