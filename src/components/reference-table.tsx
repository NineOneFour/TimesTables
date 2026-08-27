import { MASTERY_SWATCH, factLabel, masteryLabel } from '@/lib/format'
import type { MasteryStatus } from '@/lib/types'
import styles from './reference-table.module.css'

export interface ReferenceCell {
  a: number
  b: number
  status: MasteryStatus
}

const CELL_CLASSES: Record<MasteryStatus, string> = {
  unknown: styles.cellUnknown,
  weak: styles.cellWeak,
  developing: styles.cellDeveloping,
  strong: styles.cellStrong,
  mastered: styles.cellMastered,
}

const LEGEND_ORDER: MasteryStatus[] = [
  'unknown',
  'weak',
  'developing',
  'strong',
  'mastered',
]

/**
 * The times table with its answers filled in, for looking up rather than
 * testing. Mastery is a wash behind the product, so a glance shows which
 * answers are already known without the number becoming hard to read.
 *
 * Products are commutative, so unlike the mastery grid this shows one cell per
 * ordered pair only because the axes demand it — a × b and b × a read the same.
 */
export default function ReferenceTable({
  factors,
  cells,
  caption,
  compact = false,
}: {
  factors: number[]
  cells: ReferenceCell[]
  caption?: string
  compact?: boolean
}) {
  const lookup = new Map(cells.map((cell) => [`${cell.a}x${cell.b}`, cell]))

  return (
    <div className={compact ? styles.compact : undefined}>
      <div className={styles.wrap}>
        <table className={styles.grid}>
          {caption && <caption>{caption}</caption>}
          <thead>
            <tr>
              <th className={styles.corner} scope="col">
                ×
              </th>
              {factors.map((b) => (
                <th key={b} scope="col">
                  {b}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {factors.map((a) => (
              <tr key={a}>
                <th scope="row">{a}</th>
                {factors.map((b) => {
                  const status = lookup.get(`${a}x${b}`)?.status ?? 'unknown'
                  return (
                    <td
                      key={b}
                      className={`${styles.cell} ${CELL_CLASSES[status]}`}
                      title={`${factLabel(a, b)} = ${a * b} · ${masteryLabel(status)}`}
                    >
                      {a * b}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!compact && (
        <div className={styles.legend}>
          {LEGEND_ORDER.map((status) => (
            <span key={status} className="chip">
              <span className={`swatch ${MASTERY_SWATCH[status]}`} />
              {masteryLabel(status)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
