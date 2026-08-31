import { activeFactors, factKey, getAllFactRecords } from './facts'
import { getSettings } from './settings'
import type { ReferenceCell } from '@/components/reference-table'

/**
 * Factors and per-fact mastery for the reference chart. Shared by the reference
 * page and the run screen so both shade the same way.
 */
export function referenceView(kidId: number): {
  factors: number[]
  cells: ReferenceCell[]
} {
  const settings = getSettings(kidId)
  const factors = activeFactors(settings)
  const stored = new Map(
    getAllFactRecords(kidId).map((record) => [
      factKey(record.a, record.b),
      record,
    ]),
  )

  const cells: ReferenceCell[] = []
  for (const a of factors) {
    for (const b of factors) {
      cells.push({
        a,
        b,
        status: stored.get(factKey(a, b))?.masteryStatus ?? 'unknown',
      })
    }
  }
  return { factors, cells }
}
