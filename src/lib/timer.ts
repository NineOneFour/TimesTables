import { getDb, nowIso } from './db'
import { TIMER_RUNGS_MS, getSettings, updateSettings } from './settings'

/**
 * The per-problem limit adapts in both directions. It never moves on the
 * strength of a single session, and it stays invisible during practice either
 * way — this only changes how much time the next session allows.
 */

const SESSIONS_TO_STEP_DOWN = 3
const SESSIONS_TO_STEP_UP = 2

const STEP_DOWN_MIN_ACCURACY = 0.9
const STEP_DOWN_MAX_AVG_RESPONSE_FRACTION = 0.55
const STEP_DOWN_MAX_TIMEOUT_RATE = 0.04

const STEP_UP_MIN_TIMEOUT_RATE = 0.15
const STEP_UP_MAX_ATTEMPTED_ACCURACY = 0.7

export function nearestRungIndex(timeLimitMs: number): number {
  let best = 0
  for (let i = 1; i < TIMER_RUNGS_MS.length; i += 1) {
    if (
      Math.abs(TIMER_RUNGS_MS[i] - timeLimitMs) <
      Math.abs(TIMER_RUNGS_MS[best] - timeLimitMs)
    ) {
      best = i
    }
  }
  return best
}

interface RecentSessionRow {
  presented: number
  correct: number
  timeouts: number
  totalResponseMs: number
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * Re-evaluate the limit after a completed session. Returns the change made, or
 * null if the current limit still fits.
 */
export function evaluateTimerProgression(
  sessionId: number,
): { fromMs: number; toMs: number; reason: string } | null {
  const settings = getSettings()
  const limit = settings.timeLimitMs
  const rung = nearestRungIndex(limit)

  const rows = getDb()
    .prepare(
      `SELECT presented, correct, timeouts, totalResponseMs
         FROM sessions
        WHERE mode = 'standard'
          AND completedAt IS NOT NULL
          AND timeLimitMs = ?
          AND presented > 0
        ORDER BY completedAt DESC
        LIMIT ?`,
    )
    .all(limit, SESSIONS_TO_STEP_DOWN) as RecentSessionRow[]

  if (rows.length === 0) return null

  const timeoutRates = rows.map((row) => row.timeouts / row.presented)
  const presentedAccuracy = rows.map((row) => row.correct / row.presented)
  const attemptedAccuracy = rows.map((row) => {
    const attempted = row.presented - row.timeouts
    return attempted === 0 ? 0 : row.correct / attempted
  })
  const avgResponse = rows.map((row) => row.totalResponseMs / row.presented)

  // Struggling takes priority over speeding up.
  const upWindow = rows.slice(0, SESSIONS_TO_STEP_UP)
  if (upWindow.length >= SESSIONS_TO_STEP_UP && rung > 0) {
    const upTimeouts = mean(timeoutRates.slice(0, SESSIONS_TO_STEP_UP))
    const upAccuracy = mean(attemptedAccuracy.slice(0, SESSIONS_TO_STEP_UP))
    if (
      upTimeouts >= STEP_UP_MIN_TIMEOUT_RATE ||
      upAccuracy < STEP_UP_MAX_ATTEMPTED_ACCURACY
    ) {
      const toMs = TIMER_RUNGS_MS[rung - 1]
      const reason =
        upTimeouts >= STEP_UP_MIN_TIMEOUT_RATE
          ? `Timeouts averaged ${(upTimeouts * 100).toFixed(0)}% over the last ${SESSIONS_TO_STEP_UP} sessions`
          : `Accuracy on attempted problems averaged ${(upAccuracy * 100).toFixed(0)}% over the last ${SESSIONS_TO_STEP_UP} sessions`
      applyChange(limit, toMs, reason, sessionId)
      return { fromMs: limit, toMs, reason }
    }
  }

  if (rows.length >= SESSIONS_TO_STEP_DOWN && rung < TIMER_RUNGS_MS.length - 1) {
    if (
      mean(presentedAccuracy) >= STEP_DOWN_MIN_ACCURACY &&
      mean(avgResponse) <= STEP_DOWN_MAX_AVG_RESPONSE_FRACTION * limit &&
      mean(timeoutRates) <= STEP_DOWN_MAX_TIMEOUT_RATE
    ) {
      const toMs = TIMER_RUNGS_MS[rung + 1]
      const reason = `${SESSIONS_TO_STEP_DOWN} sessions averaging ${(mean(presentedAccuracy) * 100).toFixed(0)}% accuracy at ${(mean(avgResponse) / 1000).toFixed(1)}s per problem`
      applyChange(limit, toMs, reason, sessionId)
      return { fromMs: limit, toMs, reason }
    }
  }

  return null
}

function applyChange(
  fromMs: number,
  toMs: number,
  reason: string,
  sessionId: number,
) {
  updateSettings({ timeLimitMs: toMs })
  getDb()
    .prepare(
      `INSERT INTO timer_events (fromMs, toMs, reason, sessionId, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(fromMs, toMs, reason, sessionId, nowIso())
}

export function logManualTimerChange(fromMs: number, toMs: number) {
  if (fromMs === toMs) return
  getDb()
    .prepare(
      `INSERT INTO timer_events (fromMs, toMs, reason, sessionId, createdAt)
       VALUES (?, ?, ?, NULL, ?)`,
    )
    .run(fromMs, toMs, 'Set manually in settings', nowIso())
}

export interface TimerEvent {
  id: number
  fromMs: number
  toMs: number
  reason: string
  createdAt: string
}

export function getTimerEvents(limit = 20): TimerEvent[] {
  return getDb()
    .prepare(
      `SELECT id, fromMs, toMs, reason, createdAt
         FROM timer_events
        ORDER BY createdAt DESC
        LIMIT ?`,
    )
    .all(limit) as TimerEvent[]
}

export function getTimerEventForSession(sessionId: number): TimerEvent | null {
  const row = getDb()
    .prepare(
      `SELECT id, fromMs, toMs, reason, createdAt
         FROM timer_events
        WHERE sessionId = ?
        ORDER BY id DESC
        LIMIT 1`,
    )
    .get(sessionId) as TimerEvent | undefined
  return row ?? null
}
