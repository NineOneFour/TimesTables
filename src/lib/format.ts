import { MASTERY_LABELS } from './mastery'
import type { AttemptResult, MasteryStatus } from './types'

export function seconds(ms: number | null | undefined, digits = 1): string {
  if (ms === null || ms === undefined) return '—'
  return `${(ms / 1000).toFixed(digits)}s`
}

export function percent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

export function factLabel(a: number, b: number): string {
  return `${a} × ${b}`
}

export function masteryLabel(status: MasteryStatus): string {
  return MASTERY_LABELS[status]
}

export const RESULT_LABELS: Record<AttemptResult, string> = {
  correct: 'Correct',
  incorrect: 'Incorrect',
  timeout: 'Unanswered',
}

export const RESULT_CLASSES: Record<AttemptResult, string> = {
  correct: 'resultCorrect',
  incorrect: 'resultIncorrect',
  timeout: 'resultTimeout',
}

export const MASTERY_SWATCH: Record<MasteryStatus, string> = {
  unknown: 'swatchUnknown',
  weak: 'swatchWeak',
  developing: 'swatchDeveloping',
  strong: 'swatchStrong',
  mastered: 'swatchMastered',
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function longDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
