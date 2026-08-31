import { MIN_PASSWORD_LENGTH, PIN_LENGTH } from './account-limits'
import { getDb, nowIso } from './db'
import { NO_CREDENTIAL, hashSecret, verifySecret } from './crypto'

/*
  Parent and kid accounts, credential checks and lockout. Server only.
*/

export interface Parent {
  id: number
  email: string
  createdAt: string
}

export interface Kid {
  id: number
  parentId: number
  name: string
  createdAt: string
}

export { MIN_PASSWORD_LENGTH, PIN_LENGTH } from './account-limits'

/** Failures allowed within the window before a credential is locked out. */
const MAX_FAILURES = 5
const LOCKOUT_MINUTES = 15

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function countParents(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM parents').get() as {
    n: number
  }
  return row.n
}

export function getParent(id: number): Parent | null {
  const row = getDb()
    .prepare('SELECT id, email, createdAt FROM parents WHERE id = ?')
    .get(id) as Parent | undefined
  return row ?? null
}

export function createParent(email: string, password: string): number {
  const result = getDb()
    .prepare(
      `INSERT INTO parents (email, passwordHash, createdAt) VALUES (?, ?, ?)`,
    )
    .run(normaliseEmail(email), hashSecret(password), nowIso())
  return Number(result.lastInsertRowid)
}

export function setParentPassword(parentId: number, password: string) {
  getDb()
    .prepare('UPDATE parents SET passwordHash = ? WHERE id = ?')
    .run(hashSecret(password), parentId)
}

export type CredentialResult =
  | { ok: true; parentId: number; kidId?: number }
  | { ok: false; reason: 'invalid' | 'locked' }

export function verifyParentPassword(
  email: string,
  password: string,
): CredentialResult {
  const normalised = normaliseEmail(email)
  const scope = `parent:${normalised}`
  if (isLockedOut(scope)) return { ok: false, reason: 'locked' }

  const row = getDb()
    .prepare('SELECT id, passwordHash FROM parents WHERE email = ?')
    .get(normalised) as { id: number; passwordHash: string } | undefined

  if (!row || !verifySecret(password, row.passwordHash)) {
    recordFailure(scope)
    return { ok: false, reason: 'invalid' }
  }
  clearFailures(scope)
  return { ok: true, parentId: row.id }
}

/**
 * Kid sign-in is always scoped to one household. A PIN is short enough that
 * checking it across every kid on an instance would be trivially guessable, so
 * the caller must establish which parent this device belongs to first.
 */
export function verifyKidPin(
  parentId: number,
  kidId: number,
  pin: string,
): CredentialResult {
  const scope = `kid:${kidId}`
  if (isLockedOut(scope)) return { ok: false, reason: 'locked' }

  const row = getDb()
    .prepare('SELECT id, parentId, pinHash FROM kids WHERE id = ?')
    .get(kidId) as
    | { id: number; parentId: number; pinHash: string }
    | undefined

  if (!row || row.parentId !== parentId || !verifySecret(pin, row.pinHash)) {
    recordFailure(scope)
    return { ok: false, reason: 'invalid' }
  }
  clearFailures(scope)
  return { ok: true, parentId: row.parentId, kidId: row.id }
}

export function listKids(parentId: number): Kid[] {
  return getDb()
    .prepare(
      `SELECT id, parentId, name, createdAt FROM kids
        WHERE parentId = ? ORDER BY name`,
    )
    .all(parentId) as Kid[]
}

export function getKid(kidId: number): Kid | null {
  const row = getDb()
    .prepare('SELECT id, parentId, name, createdAt FROM kids WHERE id = ?')
    .get(kidId) as Kid | undefined
  return row ?? null
}

/** A kid, only if this parent owns them. The authorization primitive. */
export function getOwnedKid(parentId: number, kidId: number): Kid | null {
  const kid = getKid(kidId)
  if (!kid || kid.parentId !== parentId) return null
  return kid
}

/**
 * Creating a kid seeds their settings row in the same transaction, so no read
 * path ever has to cope with a kid that has no settings.
 */
export function createKid(parentId: number, name: string, pin: string): number {
  const db = getDb()
  const create = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO kids (parentId, name, pinHash, createdAt) VALUES (?, ?, ?, ?)`,
      )
      .run(parentId, name.trim(), hashSecret(pin), nowIso())
    const kidId = Number(result.lastInsertRowid)
    db.prepare(
      `INSERT INTO settings (kidId, updatedAt) VALUES (?, ?)`,
    ).run(kidId, nowIso())
    return kidId
  })
  return create()
}

export function renameKid(kidId: number, name: string) {
  getDb().prepare('UPDATE kids SET name = ? WHERE id = ?').run(name.trim(), kidId)
}

export function setKidPin(kidId: number, pin: string) {
  getDb()
    .prepare('UPDATE kids SET pinHash = ? WHERE id = ?')
    .run(hashSecret(pin), kidId)
  clearFailures(`kid:${kidId}`)
}

/** Removes the kid and, by cascade, every row they own. */
export function deleteKid(kidId: number) {
  getDb().prepare('DELETE FROM kids WHERE id = ?').run(kidId)
  clearFailures(`kid:${kidId}`)
}

/** True when the account was adopted by migration and has no usable credential. */
export function needsCredential(hash: string): boolean {
  return hash === NO_CREDENTIAL
}

export function parentNeedsPassword(parentId: number): boolean {
  const row = getDb()
    .prepare('SELECT passwordHash FROM parents WHERE id = ?')
    .get(parentId) as { passwordHash: string } | undefined
  return row === undefined || needsCredential(row.passwordHash)
}

export function kidNeedsPin(kidId: number): boolean {
  const row = getDb()
    .prepare('SELECT pinHash FROM kids WHERE id = ?')
    .get(kidId) as { pinHash: string } | undefined
  return row === undefined || needsCredential(row.pinHash)
}

/*
  Lockout. Counted per credential rather than per IP: the point is to stop a
  4-digit PIN being exhausted, and every device in a house shares an address.

  The window is compared with strftime, not datetime(). Timestamps are stored as
  ISO 8601 ('...T16:33:50.859Z') while datetime('now') yields '... 16:33:50', and
  'T' sorts above ' ', so a naive comparison matches every row from the same
  calendar day regardless of time — which would hold a lockout until midnight.
*/

function isLockedOut(scope: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM auth_failures
        WHERE scope = ?
          AND createdAt >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`,
    )
    .get(scope, `-${LOCKOUT_MINUTES} minutes`) as { n: number }
  return row.n >= MAX_FAILURES
}

function recordFailure(scope: string) {
  const db = getDb()
  db.prepare(
    'INSERT INTO auth_failures (scope, createdAt) VALUES (?, ?)',
  ).run(scope, nowIso())
  db.prepare(
    `DELETE FROM auth_failures
      WHERE createdAt < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')`,
  ).run()
}

function clearFailures(scope: string) {
  getDb().prepare('DELETE FROM auth_failures WHERE scope = ?').run(scope)
}

export function lockoutMinutes(): number {
  return LOCKOUT_MINUTES
}

/*
  First-run state. A database adopted from before accounts existed already holds
  a parent and a kid, but neither has a usable credential — that household has to
  be claimed before anyone can sign in, and it must not be claimable twice.
*/

export type BootstrapMode =
  /** No accounts at all: create the first parent. */
  | 'fresh'
  /** Adopted by migration: name the household and set its credentials. */
  | 'claim'
  /** Fully set up; setup is closed. */
  | 'closed'

export function bootstrapMode(): BootstrapMode {
  if (countParents() === 0) return 'fresh'
  const row = getDb()
    .prepare('SELECT id FROM parents WHERE passwordHash = ? LIMIT 1')
    .get(NO_CREDENTIAL) as { id: number } | undefined
  return row ? 'claim' : 'closed'
}

export function adoptedParentId(): number | null {
  const row = getDb()
    .prepare('SELECT id FROM parents WHERE passwordHash = ? LIMIT 1')
    .get(NO_CREDENTIAL) as { id: number } | undefined
  return row?.id ?? null
}

export function kidsNeedingPin(parentId: number): Kid[] {
  return getDb()
    .prepare(
      `SELECT id, parentId, name, createdAt FROM kids
        WHERE parentId = ? AND pinHash = ? ORDER BY id`,
    )
    .all(parentId, NO_CREDENTIAL) as Kid[]
}

/** Sets the parent's real email and password, replacing the adopted placeholder. */
export function claimParent(parentId: number, email: string, password: string) {
  getDb()
    .prepare('UPDATE parents SET email = ?, passwordHash = ? WHERE id = ?')
    .run(normaliseEmail(email), hashSecret(password), parentId)
}

export function emailTaken(email: string, exceptParentId?: number): boolean {
  const row = getDb()
    .prepare('SELECT id FROM parents WHERE email = ?')
    .get(normaliseEmail(email)) as { id: number } | undefined
  if (!row) return false
  return row.id !== exceptParentId
}

export function kidNameTaken(
  parentId: number,
  name: string,
  exceptKidId?: number,
): boolean {
  const row = getDb()
    .prepare('SELECT id FROM kids WHERE parentId = ? AND name = ?')
    .get(parentId, name.trim()) as { id: number } | undefined
  if (!row) return false
  return row.id !== exceptKidId
}

/*
  Validation. Returned as a message rather than thrown: every caller is a form
  action that needs to render it next to the field.
*/

export function validateEmail(email: string): string | null {
  const value = email.trim()
  if (value.length === 0) return 'Enter an email address.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return 'That does not look like an email address.'
  }
  return null
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  return null
}

export function validatePin(pin: string): string | null {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    return `The PIN must be exactly ${PIN_LENGTH} digits.`
  }
  return null
}

export function validateKidName(name: string): string | null {
  const value = name.trim()
  if (value.length === 0) return 'Enter a name.'
  if (value.length > 40) return 'That name is too long.'
  return null
}
