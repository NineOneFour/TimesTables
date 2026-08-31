/**
 * Runs once before the server accepts requests, so a missing SESSION_SECRET
 * stops the deployment immediately instead of surfacing as a 500 at the first
 * sign-in attempt.
 */
export async function register() {
  // Only the Node runtime can read node:crypto, and only it serves these routes.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { assertSessionSecret } = await import('@/lib/crypto')
  assertSessionSecret()
}
