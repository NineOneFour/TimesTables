import { getDb, nowIso } from './db'
import type { Settings } from './types'

export const TIMER_RUNGS_MS = [15000, 12000, 10000, 8000, 6000, 5000]

interface SettingsRow {
  include11: number
  include12: number
  timeLimitMs: number
  showTableDuringRun: number
}

export function getSettings(): Settings {
  const row = getDb()
    .prepare(
      `SELECT include11, include12, timeLimitMs, showTableDuringRun
         FROM settings WHERE id = 1`,
    )
    .get() as SettingsRow
  return {
    include11: row.include11 === 1,
    include12: row.include12 === 1,
    timeLimitMs: row.timeLimitMs,
    showTableDuringRun: row.showTableDuringRun === 1,
  }
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const current = getSettings()
  const next: Settings = { ...current, ...patch }
  getDb()
    .prepare(
      `UPDATE settings
          SET include11 = ?, include12 = ?, timeLimitMs = ?,
              showTableDuringRun = ?, updatedAt = ?
        WHERE id = 1`,
    )
    .run(
      next.include11 ? 1 : 0,
      next.include12 ? 1 : 0,
      next.timeLimitMs,
      next.showTableDuringRun ? 1 : 0,
      nowIso(),
    )
  return next
}
