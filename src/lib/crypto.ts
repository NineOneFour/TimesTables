import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'

/*
  Password, PIN and cookie primitives over node:crypto. No dependency is added
  for this on purpose: the runtime tree is small and an auth library here would
  need an adapter for the raw better-sqlite3 access the rest of the app uses.

  Server only — it reads SESSION_SECRET and must never reach the browser.
*/

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_BYTES = 32
const SALT_BYTES = 16

/**
 * Stored where a hash is required but no usable credential exists. It contains
 * no `$`, so it can never parse as a hash and nothing can verify against it.
 */
export const NO_CREDENTIAL = '!'

/** `scrypt$<salt-b64>$<key-b64>`. */
export function hashSecret(secret: string): string {
  const salt = randomBytes(SALT_BYTES)
  const key = scryptSync(secret.normalize('NFKC'), salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export function verifySecret(secret: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1], 'base64')
  const expected = Buffer.from(parts[2], 'base64')
  if (expected.length !== KEY_BYTES) return false
  const actual = scryptSync(secret.normalize('NFKC'), salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })
  return timingSafeEqual(actual, expected)
}

let cachedSecret: string | null = null

/**
 * Refuses to fall back to a built-in default. A shipped default in a public
 * repository is a forged-cookie hole in every deployment that never set one.
 */
function sessionSecret(): string {
  if (cachedSecret) return cachedSecret
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 16) {
    throw new Error(
      'SESSION_SECRET is missing or too short. Generate one with `openssl rand -base64 32` ' +
        'and put it in .env.local (development) or the service environment (production).',
    )
  }
  cachedSecret = secret
  return secret
}

/**
 * Called from instrumentation at server start. Without it a misconfigured
 * deployment looks healthy — every page renders, because an absent cookie needs
 * no verification — and then fails with an opaque 500 the first time somebody
 * tries to sign in.
 */
export function assertSessionSecret(): void {
  sessionSecret()
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/** `<payload-b64url>.<hmac-b64url>`. */
export function signPayload(payload: string): string {
  const body = base64url(payload)
  const mac = createHmac('sha256', sessionSecret()).update(body).digest()
  return `${body}.${base64url(mac)}`
}

/** The payload if the signature is intact, otherwise null. */
export function verifyPayload(signed: string): string | null {
  const dot = signed.lastIndexOf('.')
  if (dot <= 0) return null
  const body = signed.slice(0, dot)
  const provided = fromBase64url(signed.slice(dot + 1))
  const expected = createHmac('sha256', sessionSecret()).update(body).digest()
  if (provided.length !== expected.length) return null
  if (!timingSafeEqual(provided, expected)) return null
  return fromBase64url(body).toString('utf8')
}
