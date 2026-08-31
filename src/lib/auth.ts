import { cookies } from 'next/headers'
import { signPayload, verifyPayload } from './crypto'

/*
  Stateless signed cookies. Session state lives in the cookie rather than a
  table: per-session revocation is not worth a table for a household app, and
  the signature is what makes the contents trustworthy.

  Server only — imports next/headers.
*/

const SESSION_COOKIE = 'session'
const HOUSEHOLD_COOKIE = 'household'

const SESSION_DAYS = 30
/** Long-lived on purpose: it is what scopes a kid's PIN to one household. */
const HOUSEHOLD_DAYS = 365

export type Session =
  | { role: 'parent'; parentId: number }
  | { role: 'kid'; parentId: number; kidId: number }

interface SessionPayload {
  r: 'parent' | 'kid'
  p: number
  k?: number
  exp: number
}

/**
 * `Secure` keeps the cookie off plain HTTP, which browsers exempt localhost
 * from, so development is unaffected. A LAN deployment served over http must
 * opt out knowingly with INSECURE_COOKIES=1 rather than losing the protection
 * silently through a NODE_ENV check.
 */
function secureCookies(): boolean {
  return process.env.INSECURE_COOKIES !== '1'
}

function days(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000)
}

export async function createSession(session: Session): Promise<void> {
  const expires = days(SESSION_DAYS)
  const payload: SessionPayload = {
    r: session.role,
    p: session.parentId,
    k: session.role === 'kid' ? session.kidId : undefined,
    exp: expires.getTime(),
  }
  const store = await cookies()
  store.set(SESSION_COOKIE, signPayload(JSON.stringify(payload)), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'lax',
    path: '/',
    expires,
  })
}

export async function readSession(): Promise<Session | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value
  if (!raw) return null
  const payload = verifyPayload(raw)
  if (!payload) return null

  let parsed: SessionPayload
  try {
    parsed = JSON.parse(payload) as SessionPayload
  } catch {
    return null
  }

  if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null
  if (typeof parsed.p !== 'number') return null

  if (parsed.r === 'parent') return { role: 'parent', parentId: parsed.p }
  if (parsed.r === 'kid' && typeof parsed.k === 'number') {
    return { role: 'kid', parentId: parsed.p, kidId: parsed.k }
  }
  return null
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

/*
  The household cookie marks a device as belonging to one parent. A kid's PIN is
  only ever checked against that parent's kids, so a 4-digit PIN is never
  guessable across the whole instance. It is signed for the same reason the
  session is: an editable household id would defeat the scoping entirely.
*/

export async function rememberHousehold(parentId: number): Promise<void> {
  const store = await cookies()
  store.set(HOUSEHOLD_COOKIE, signPayload(String(parentId)), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'lax',
    path: '/',
    expires: days(HOUSEHOLD_DAYS),
  })
}

export async function readHousehold(): Promise<number | null> {
  const raw = (await cookies()).get(HOUSEHOLD_COOKIE)?.value
  if (!raw) return null
  const payload = verifyPayload(raw)
  if (!payload) return null
  const parentId = Number(payload)
  return Number.isInteger(parentId) && parentId > 0 ? parentId : null
}
