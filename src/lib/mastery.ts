import type { AttemptResult, MasteryStatus } from './types'

/**
 * Mastery is a single continuous 0-100 measurement per fact. Human-readable
 * bands are derived from it, and movement is unrestricted in both directions.
 *
 * Every attempt is reduced to a quality value in 0..1 and folded into the
 * score with an exponentially weighted moving average, so recent attempts
 * dominate without old ones being discarded. Per-attempt movement is clamped
 * so no single answer can swing a fact across the whole range.
 */

/** Score assigned to a brand-new fact, so early attempts move gradually. */
export const INITIAL_MASTERY = 50

/** Attempts required before a fact leaves `unknown`. */
export const MIN_ATTEMPTS_FOR_STATUS = 5

/** EWMA weight given to the newest attempt. */
const ALPHA = 0.25

/** Maximum points a single attempt may move the score. */
const MAX_DELTA = 12

/** A correct answer at or under this fraction of the limit scores full marks. */
const FAST_FRACTION = 0.2

/** A correct answer at or over this fraction of the limit scores the floor. */
const SLOW_FRACTION = 0.9

/** Quality floor for a correct-but-very-slow answer. */
const SLOW_CORRECT_QUALITY = 0.5

/** An engaged-but-wrong answer still scores above a timeout. */
const INCORRECT_QUALITY = 0.15

const BANDS: { min: number; status: MasteryStatus }[] = [
  { min: 87, status: 'mastered' },
  { min: 70, status: 'strong' },
  { min: 45, status: 'developing' },
  { min: 0, status: 'weak' },
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Quality of one attempt in 0..1. Response time is normalised against the
 * limit that was actually in force, so a 5s answer under a 6s limit is not
 * judged the same as a 5s answer under a 15s limit.
 */
export function attemptQuality(
  result: AttemptResult,
  responseMs: number,
  timeLimitMs: number,
): number {
  if (result === 'timeout') return 0
  if (result === 'incorrect') return INCORRECT_QUALITY

  const fast = FAST_FRACTION * timeLimitMs
  const slow = SLOW_FRACTION * timeLimitMs
  const overFast = clamp((responseMs - fast) / (slow - fast), 0, 1)
  return 1 - (1 - SLOW_CORRECT_QUALITY) * overFast
}

/** Fold one attempt into an existing mastery score. */
export function nextMasteryScore(
  currentScore: number,
  result: AttemptResult,
  responseMs: number,
  timeLimitMs: number,
): number {
  const target = attemptQuality(result, responseMs, timeLimitMs) * 100
  const delta = clamp(ALPHA * (target - currentScore), -MAX_DELTA, MAX_DELTA)
  return clamp(currentScore + delta, 0, 100)
}

export function statusForScore(
  score: number,
  totalAttempts: number,
): MasteryStatus {
  if (totalAttempts < MIN_ATTEMPTS_FOR_STATUS) return 'unknown'
  return BANDS.find((band) => score >= band.min)!.status
}

export const MASTERY_LABELS: Record<MasteryStatus, string> = {
  unknown: 'Unknown',
  weak: 'Weak',
  developing: 'Developing',
  strong: 'Strong',
  mastered: 'Mastered',
}
