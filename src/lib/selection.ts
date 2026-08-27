import { factKey, getActiveFactRecords } from './facts'
import type { Fact, FactRecord, MasteryStatus, Settings } from './types'

export const STANDARD_SESSION_LENGTH = 50

/**
 * Target selection weights from the spec. These are weights that steer a
 * randomised draw, not per-session quotas, so a session's actual composition
 * varies around these ratios.
 */
const TARGET_SHARES: Record<Exclude<MasteryStatus, 'unknown'>, number> = {
  weak: 0.4,
  developing: 0.3,
  strong: 0.2,
  mastered: 0.1,
}

/**
 * Unknown facts need enough exposure to establish a first measurement, so
 * their share scales with how much of the pool is still unknown. When nothing
 * is known the whole pool is unknown and exposure is even; as data accumulates
 * the share shrinks and the target weights above take over.
 */
const UNKNOWN_SHARE_MULTIPLIER = 1.5
const UNKNOWN_SHARE_CAP = 0.85

/**
 * A fact may be drawn at most this many times in one session, so a run never
 * turns into drilling the same handful of facts. When a band holds very few
 * facts this cap binds before its target share is reached — a 4-fact band can
 * supply at most 8 of 50 problems — and the surplus goes to the other bands.
 */
const MAX_APPEARANCES = 2

function groupShares(records: FactRecord[]): Record<MasteryStatus, number> {
  const counts = {
    unknown: 0,
    weak: 0,
    developing: 0,
    strong: 0,
    mastered: 0,
  } as Record<MasteryStatus, number>
  for (const record of records) counts[record.masteryStatus] += 1

  const unknownFraction = counts.unknown / Math.max(records.length, 1)
  const raw: Record<MasteryStatus, number> = {
    unknown: Math.min(
      UNKNOWN_SHARE_CAP,
      UNKNOWN_SHARE_MULTIPLIER * unknownFraction,
    ),
    ...TARGET_SHARES,
  }

  // Empty bands would otherwise waste their share, so renormalise over the
  // bands that actually contain facts.
  let total = 0
  for (const status of Object.keys(raw) as MasteryStatus[]) {
    if (counts[status] === 0) raw[status] = 0
    total += raw[status]
  }
  if (total === 0) return raw

  const shares = {} as Record<MasteryStatus, number>
  for (const status of Object.keys(raw) as MasteryStatus[]) {
    shares[status] = raw[status] / total
  }
  return shares
}

export interface WeightedFact extends Fact {
  status: MasteryStatus
  weight: number
}

/** Per-fact draw weights, spread evenly within each mastery band. */
export function weightFacts(records: FactRecord[]): WeightedFact[] {
  const shares = groupShares(records)
  const counts = {} as Record<MasteryStatus, number>
  for (const record of records) {
    counts[record.masteryStatus] = (counts[record.masteryStatus] ?? 0) + 1
  }
  return records.map((record) => ({
    a: record.a,
    b: record.b,
    status: record.masteryStatus,
    weight: shares[record.masteryStatus] / counts[record.masteryStatus],
  }))
}

function drawWeighted(candidates: WeightedFact[]): WeightedFact {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0)
  let roll = Math.random() * total
  for (const candidate of candidates) {
    roll -= candidate.weight
    if (roll <= 0) return candidate
  }
  return candidates[candidates.length - 1]
}

/**
 * Build a session's problem list by weighted random draw. Mastered facts keep
 * a nonzero weight so regression stays detectable.
 */
export function buildStandardSession(
  settings: Settings,
  length = STANDARD_SESSION_LENGTH,
): Fact[] {
  const weighted = weightFacts(getActiveFactRecords(settings))
  const appearances = new Map<string, number>()
  const problems: Fact[] = []

  for (let i = 0; i < length; i += 1) {
    const previous = problems[problems.length - 1]
    let eligible = weighted.filter((candidate) => {
      const seen = appearances.get(factKey(candidate.a, candidate.b)) ?? 0
      if (seen >= MAX_APPEARANCES) return false
      if (previous && candidate.a === previous.a && candidate.b === previous.b) {
        return false
      }
      return true
    })
    // Only possible with a pool smaller than the session; fall back to allowing
    // repeats rather than returning a short session.
    if (eligible.length === 0) {
      eligible = weighted.filter(
        (candidate) =>
          !previous ||
          candidate.a !== previous.a ||
          candidate.b !== previous.b,
      )
    }
    if (eligible.length === 0) eligible = weighted

    const picked = drawWeighted(eligible)
    appearances.set(
      factKey(picked.a, picked.b),
      (appearances.get(factKey(picked.a, picked.b)) ?? 0) + 1,
    )
    problems.push({ a: picked.a, b: picked.b })
  }

  return problems
}

/**
 * Focused remediation: cycle the supplied facts in shuffled rounds rather than
 * running another weighted 50-question challenge.
 */
export function buildRemediationSession(
  facts: Fact[],
  repetitions = 3,
  maxLength = 30,
): Fact[] {
  if (facts.length === 0) return []
  const problems: Fact[] = []
  for (let round = 0; round < repetitions; round += 1) {
    const shuffled = [...facts]
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    for (const fact of shuffled) {
      const previous = problems[problems.length - 1]
      if (previous && previous.a === fact.a && previous.b === fact.b) {
        problems.splice(problems.length - 1, 0, fact)
      } else {
        problems.push(fact)
      }
    }
  }
  return problems.slice(0, maxLength)
}
