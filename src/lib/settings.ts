import { getDb, nowIso } from './db'
import type { Settings } from './types'

export const TIMER_RUNGS_MS = [15000, 12000, 10000, 8000, 6000, 5000]

interface SettingsRow {
  include11: number
  include12: number
  timeLimitMs: number
  showTableDuringRun: number
}

export function getSettings(kidId: number): Settings {
  const row = getDb()
    .prepare(
      `SELECT include11, include12, timeLimitMs, showTableDuringRun
         FROM settings WHERE kidId = ?`,
    )
    .get(kidId) as SettingsRow | undefined

  // Creating a kid seeds this row, so a miss means the row was lost rather than
  // never written. Re-seed instead of failing a practice run over it.
  if (!row) {
    getDb()
      .prepare('INSERT OR IGNORE INTO settings (kidId, updatedAt) VALUES (?, ?)')
      .run(kidId, nowIso())
    return {
      include11: false,
      include12: false,
      timeLimitMs: TIMER_RUNGS_MS[0],
      showTableDuringRun: false,
    }
  }

  return {
    include11: row.include11 === 1,
    include12: row.include12 === 1,
    timeLimitMs: row.timeLimitMs,
    showTableDuringRun: row.showTableDuringRun === 1,
  }
}

export function updateSettings(
  kidId: number,
  patch: Partial<Settings>,
): Settings {
  const current = getSettings(kidId)
  const next: Settings = { ...current, ...patch }
  getDb()
    .prepare(
      `UPDATE settings
          SET include11 = ?, include12 = ?, timeLimitMs = ?,
              showTableDuringRun = ?, updatedAt = ?
        WHERE kidId = ?`,
    )
    .run(
      next.include11 ? 1 : 0,
      next.include12 ? 1 : 0,
      next.timeLimitMs,
      next.showTableDuringRun ? 1 : 0,
      nowIso(),
      kidId,
    )
  return next
}
