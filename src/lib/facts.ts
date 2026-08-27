import { getDb } from './db'
import { INITIAL_MASTERY, statusForScore } from './mastery'
import type { AttemptResult, Fact, FactRecord, Settings } from './types'

export const BASE_FACTORS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

/** Stable key shared by a commutative pair, for pair-level analysis. */
export function pairKey(a: number, b: number): string {
  return a <= b ? `${a}x${b}` : `${b}x${a}`
}

export function factKey(a: number, b: number): string {
  return `${a}x${b}`
}

export function activeFactors(settings: Settings): number[] {
  const factors = [...BASE_FACTORS]
  if (settings.include11) factors.push(11)
  if (settings.include12) factors.push(12)
  return factors
}

/** Every ordered pair drawn from the active factor pool. Zero is never included. */
export function activeFacts(settings: Settings): Fact[] {
  const factors = activeFactors(settings)
  const facts: Fact[] = []
  for (const a of factors) for (const b of factors) facts.push({ a, b })
  return facts
}

interface FactRow {
  a: number
  b: number
  pairKey: string
  masteryScore: number
  masteryStatus: string
  totalAttempts: number
  correctAttempts: number
  incorrectAttempts: number
  timeouts: number
  totalResponseMs: number
  recentResponseMs: number | null
  lastSeen: string | null
  lastResult: string | null
  recentResults: string
}

function hydrate(row: FactRow): FactRecord {
  return {
    ...row,
    masteryStatus: row.masteryStatus as FactRecord['masteryStatus'],
    lastResult: row.lastResult as AttemptResult | null,
    recentResults: JSON.parse(row.recentResults) as AttemptResult[],
  }
}

export function blankFactRecord(a: number, b: number): FactRecord {
  return {
    a,
    b,
    pairKey: pairKey(a, b),
    masteryScore: INITIAL_MASTERY,
    masteryStatus: statusForScore(INITIAL_MASTERY, 0),
    totalAttempts: 0,
    correctAttempts: 0,
    incorrectAttempts: 0,
    timeouts: 0,
    totalResponseMs: 0,
    recentResponseMs: null,
    lastSeen: null,
    lastResult: null,
    recentResults: [],
  }
}

export function getAllFactRecords(): FactRecord[] {
  const rows = getDb().prepare('SELECT * FROM facts').all() as FactRow[]
  return rows.map(hydrate)
}

/**
 * Fact records for the active pool, filling in blanks for facts never seen.
 * Records outside the active pool are intentionally left alone — disabling a
 * factor removes it from practice, it never deletes its history.
 */
export function getActiveFactRecords(settings: Settings): FactRecord[] {
  const stored = new Map(
    getAllFactRecords().map((record) => [factKey(record.a, record.b), record]),
  )
  return activeFacts(settings).map(
    ({ a, b }) => stored.get(factKey(a, b)) ?? blankFactRecord(a, b),
  )
}
