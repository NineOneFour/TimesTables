import { NextResponse } from 'next/server'
import { deleteAbandonedSession } from '@/lib/sessions'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const sessionId = Number(id)
  if (!Number.isInteger(sessionId)) {
    return NextResponse.json({ error: 'Invalid session id' }, { status: 400 })
  }
  deleteAbandonedSession(sessionId)
  return NextResponse.json({ ok: true })
}
