import { NextResponse } from 'next/server'
import { apiKid } from '@/lib/dal'
import { deleteAbandonedSession } from '@/lib/sessions'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await apiKid(request, 'kid')
  if (!access.ok) return access.response

  const { id } = await context.params
  const sessionId = Number(id)
  if (!Number.isInteger(sessionId)) {
    return NextResponse.json({ error: 'Invalid session id' }, { status: 400 })
  }
  deleteAbandonedSession(access.kidId, sessionId)
  return NextResponse.json({ ok: true })
}
