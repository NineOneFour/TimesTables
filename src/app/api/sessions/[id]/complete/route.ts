import { NextResponse } from 'next/server'
import { completeSession } from '@/lib/sessions'
import type { AttemptInput } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  try {
    const summary = completeSession(sessionId, body.attempts)
    return NextResponse.json({ sessionId, timerChange: summary.timerChange })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to record session' },
      { status: 500 },
    )
  }
}
