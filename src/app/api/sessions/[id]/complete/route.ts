import { NextResponse } from 'next/server'
import { apiKid } from '@/lib/dal'
import { completeSession, getSession } from '@/lib/sessions'
import type { AttemptInput } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await apiKid(request, 'kid')
  if (!access.ok) return access.response
  const { kidId } = access

  const { id } = await context.params
  const sessionId = Number(id)
  if (!Number.isInteger(sessionId)) {
    return NextResponse.json({ error: 'Invalid session id' }, { status: 400 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    attempts?: AttemptInput[]
  }
  if (!Array.isArray(body.attempts)) {
    return NextResponse.json({ error: 'attempts is required' }, { status: 400 })
  }

  /*
    Distinguished before attempting the write so a refused request does not
    surface as a server fault. The lookup is scoped by kid, so another child's
    session id is simply absent — the caller cannot tell it from a missing one.
  */
  const existing = getSession(kidId, sessionId)
  if (!existing) {
    return NextResponse.json({ error: 'No such session' }, { status: 404 })
  }
  if (existing.completedAt) {
    return NextResponse.json(
      { error: 'That session has already been recorded' },
      { status: 409 },
    )
  }

  try {
    const summary = completeSession(kidId, sessionId, body.attempts)
    return NextResponse.json({ sessionId, timerChange: summary.timerChange })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to record session' },
      { status: 500 },
    )
  }
}
