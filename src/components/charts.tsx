'use client'

import { useState } from 'react'
import { MASTERY_SWATCH, factLabel, masteryLabel } from '@/lib/format'
import type { MasteryStatus } from '@/lib/types'
import styles from './charts.module.css'

/* ---------------------------------------------------------------- line chart */

export interface LinePoint {
  label: string
  value: number | null
  detail: string
}

/**
 * One measure over time. Deliberately a single series per chart — two measures
 * on one pair of axes would need two y-scales, which misleads.
 */
export function LineChart({
  caption,
  points,
  min,
  max,
  unit,
  color = 'var(--accent)',
}: {
  caption: string
  points: LinePoint[]
  min: number
  max: number
  /* A descriptor rather than a formatter, so the props stay serialisable. */
  unit: 'percent' | 'seconds'
  color?: string
}) {
  const formatValue = (value: number) =>
    unit === 'percent' ? `${Math.round(value)}%` : `${value.toFixed(0)}s`

  const [hover, setHover] = useState<number | null>(null)

  const width = 640
  const height = 168
  const padding = { top: 14, right: 46, bottom: 22, left: 34 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom

  const usable = points.filter((point) => point.value !== null)
  if (usable.length < 2) {
    return (
      <figure className={styles.figure}>
        <figcaption className={styles.caption}>{caption}</figcaption>
        <p className="empty">
          Two completed sessions are needed before a trend can be drawn.
        </p>
      </figure>
    )
  }

  const span = max - min || 1
  const x = (index: number) =>
    padding.left +
    (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth)
  const y = (value: number) =>
    padding.top + plotHeight - ((value - min) / span) * plotHeight

  const path = points
    .map((point, index) =>
      point.value === null
        ? null
        : `${index === 0 || points[index - 1]?.value === null ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`,
    )
    .filter(Boolean)
    .join(' ')

  const ticks = [min, min + span / 2, max]
  const lastIndex = points.reduce(
    (best, point, index) => (point.value === null ? best : index),
    0,
  )
  const lastValue = points[lastIndex].value as number
  const hoverPoint = hover === null ? null : points[hover]

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>{caption}</figcaption>
      <svg
        className={styles.plot}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={caption}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className={styles.gridLine}
              x1={padding.left}
              x2={width - padding.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text
              className={styles.axisText}
              x={padding.left - 6}
              y={y(tick) + 3}
              textAnchor="end"
            >
              {formatValue(tick)}
            </text>
          </g>
        ))}

        <text
          className={styles.axisText}
          x={padding.left}
          y={height - 6}
        >
          {points[0].label}
        </text>
        <text
          className={styles.axisText}
          x={width - padding.right}
          y={height - 6}
          textAnchor="end"
        >
          {points[points.length - 1].label}
        </text>

        <path className={styles.series} d={path} stroke={color} />

        {hover !== null && hoverPoint !== null && hoverPoint.value !== null && (
          <>
            <line
              className={styles.crosshair}
              x1={x(hover)}
              x2={x(hover)}
              y1={padding.top}
              y2={padding.top + plotHeight}
            />
            <circle
              className={styles.hoverDot}
              cx={x(hover)}
              cy={y(hoverPoint.value)}
              r={5}
              fill={color}
            />
          </>
        )}

        <circle
          className={styles.endMarker}
          cx={x(lastIndex)}
          cy={y(lastValue)}
          r={5}
          fill={color}
        />
        <text
          className={styles.endLabel}
          x={x(lastIndex) + 10}
          y={y(lastValue) + 4}
          fill={color}
        >
          {formatValue(lastValue)}
        </text>

        {points.map((point, index) => (
          <rect
            key={index}
            className={styles.hitArea}
            x={x(index) - plotWidth / (points.length * 2) - 2}
            y={padding.top}
            width={plotWidth / points.length + 4}
            height={plotHeight}
            onMouseEnter={() => setHover(index)}
          />
        ))}
      </svg>

      {hoverPoint && hoverPoint.value !== null && (
        <div
          className={styles.tooltip}
          style={{
            left: `${(x(hover as number) / width) * 100}%`,
            top: `${((y(hoverPoint.value) - 10) / height) * 100}%`,
          }}
        >
          {hoverPoint.label} · {hoverPoint.detail}
        </div>
      )}
    </figure>
  )
}

/* ------------------------------------------------------- composition bar */

export function CompositionBar({
  correct,
  incorrect,
  timeouts,
}: {
  correct: number
  incorrect: number
  timeouts: number
}) {
  const total = correct + incorrect + timeouts
  if (total === 0) return null
  const parts = [
    { key: 'correct', label: 'Correct', count: correct, cls: styles.segCorrect },
    {
      key: 'incorrect',
      label: 'Incorrect',
      count: incorrect,
      cls: styles.segIncorrect,
    },
    {
      key: 'timeout',
      label: 'Unanswered',
      count: timeouts,
      cls: styles.segTimeout,
    },
  ].filter((part) => part.count > 0)

  return (
    <div>
      <div className={styles.bar}>
        {parts.map((part) => (
          <div
            key={part.key}
            className={`${styles.segment} ${part.cls}`}
            style={{ flexGrow: part.count }}
            title={`${part.label}: ${part.count}`}
          />
        ))}
      </div>
      <div className={styles.barLegend}>
        {parts.map((part) => (
          <span key={part.key} className={styles.barLegendItem}>
            <span className={`${styles.segment} ${part.cls}`} style={{ width: 10, height: 10 }} />
            {part.label}
            <span className={styles.barLegendCount}>{part.count}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- mastery grid */

export interface MasteryCell {
  a: number
  b: number
  status: MasteryStatus
  score: number
  attempts: number
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
 * The times table itself, coloured by current mastery. Rows are the first
 * factor as presented and columns the second, so 7 × 8 and 8 × 7 occupy
 * different cells and can be compared directly.
 */
export function MasteryGrid({
  factors,
  cells,
}: {
  factors: number[]
  cells: MasteryCell[]
}) {
  const lookup = new Map(cells.map((cell) => [`${cell.a}x${cell.b}`, cell]))

  return (
    <div>
      <div className={styles.gridWrap}>
        <table className={styles.grid}>
          <caption>
            Rows are the first factor as shown on screen, columns the second.
            Hover a cell for its mastery score and attempt count.
          </caption>
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
                  const cell = lookup.get(`${a}x${b}`)
                  const status: MasteryStatus = cell?.status ?? 'unknown'
                  return (
                    <td
                      key={b}
                      className={`${styles.cell} ${CELL_CLASSES[status]}`}
                      title={`${factLabel(a, b)} · ${masteryLabel(status)} · score ${Math.round(cell?.score ?? 0)} · ${cell?.attempts ?? 0} attempts`}
                    >
                      {status === 'unknown' ? '' : Math.round(cell!.score)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.legend}>
        {LEGEND_ORDER.map((status) => (
          <span key={status} className="chip">
            <span className={`swatch ${MASTERY_SWATCH[status]}`} />
            {masteryLabel(status)}
          </span>
        ))}
      </div>
    </div>
  )
}
