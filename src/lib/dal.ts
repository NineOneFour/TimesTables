import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getOwnedKid, listKids, type Kid } from './accounts'
import { readSession, type Session } from './auth'

/*
  The one place that decides who may read or write which kid's data.

  Two rules keep this auditable, and both matter more than they look:

  1. Every database function in src/lib takes kidId as an explicit argument.
     A missing scope is then a type error rather than a silent cross-account read.
  2. Nothing in src/lib reaches for the cookie to discover "the current kid".
     Only pages, route handlers and server actions call in here, then pass the
     resolved id down. Without this an ambient current-kid creeps in and the
     scoping stops being reviewable.

  Server only.
*/

export type ParentSession = { role: 'parent'; parentId: number }
export type KidSession = { role: 'kid'; parentId: number; kidId: number }

/** Memoised for the render pass, so one request decodes the cookie once. */
export const currentSession = cache(async (): Promise<Session | null> => {
  return readSession()
})

/** For pages and server actions: redirects when not signed in. */
export async function requireSession(): Promise<Session> {
  const session = await currentSession()
  if (!session) redirect('/signin')
  return session
}

/** For pages and server actions: parent role only. */
export async function requireParent(): Promise<ParentSession> {
  const session = await requireSession()
  if (session.role !== 'parent') redirect('/')
  return session
}

export type KidAccess =
  | { ok: true; kid: Kid }
  | { ok: false; status: 401 | 403 | 404 }

/**
 * Turn a requested kid id into one this session may actually use. The whole
 * access model is here: a kid resolves only to themselves, a parent only to a
 * kid they own.
 *
 * Returns a status rather than throwing so route handlers can answer with a
 * code and pages can redirect; see requireKid for the page-shaped wrapper.
 */
export function authorizeKid(
  session: Session | null,
  requested?: number,
): KidAccess {
  if (!session) return { ok: false, status: 401 }

  if (session.role === 'kid') {
    if (requested !== undefined && requested !== session.kidId) {
      return { ok: false, status: 403 }
    }
    const kid = getOwnedKid(session.parentId, session.kidId)
    // The kid was deleted while their cookie was still valid.
    if (!kid) return { ok: false, status: 401 }
    return { ok: true, kid }
  }

  if (requested === undefined) return { ok: false, status: 404 }
  const kid = getOwnedKid(session.parentId, requested)
  if (!kid) return { ok: false, status: 404 }
  return { ok: true, kid }
}

/**
 * Page-shaped kid resolution. A parent with no kid named in the URL is sent to
 * pick one; anything they may not see is a redirect rather than a leak of
 * whether that kid exists at all.
 */
export async function requireKid(requested?: number): Promise<Kid> {
  const session = await requireSession()
  const access = authorizeKid(session, requested)
  if (access.ok) return access.kid

  if (session.role === 'parent') {
    // Fall back to their only kid when the choice is unambiguous.
    if (requested === undefined) {
      const kids = listKids(session.parentId)
      if (kids.length === 1) return kids[0]
      redirect('/kids')
    }
    redirect('/kids')
  }
  redirect('/signin')
}

/** Parses a kidId search param. Returns undefined for anything unusable. */
export function parseKidId(value: string | string[] | undefined): number | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

/*
  Route handlers. Treated as public endpoints: each one authorizes for itself
  and answers with a status code, because there is nothing to redirect.
*/

export type ApiKid =
  | { ok: true; kidId: number; role: 'parent' | 'kid' }
  | { ok: false; response: Response }

function deny(status: 401 | 403 | 404, message: string): Response {
  return Response.json({ error: message }, { status })
}

/**
 * Resolves the kid an endpoint should act on. `require` says who may call it:
 * 'kid' for the practice endpoints, which write attempts and must never run
 * under a parent session, and 'parent' for setup.
 */
export async function apiKid(
  request: Request,
  require: 'kid' | 'parent' | 'either',
): Promise<ApiKid> {
  const session = await currentSession()
  if (!session) return { ok: false, response: deny(401, 'Not signed in') }

  if (require !== 'either' && session.role !== require) {
    return {
      ok: false,
      response: deny(
        403,
        require === 'kid'
          ? 'Practice runs are recorded for a child, not a parent'
          : 'Only a parent can change this',
      ),
    }
  }

  const requested = parseKidId(
    new URL(request.url).searchParams.get('kid') ?? undefined,
  )
  const access = authorizeKid(session, requested)
  if (!access.ok) {
    return {
      ok: false,
      response: deny(
        access.status,
        access.status === 404 ? 'No such child' : 'Not allowed',
      ),
    }
  }
  return { ok: true, kidId: access.kid.id, role: session.role }
}
