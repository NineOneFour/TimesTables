import { NextResponse } from 'next/server'
import { createRemediationSession, createStandardSession } from '@/lib/sessions'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    mode?: string
    sourceSessionId?: number
  }

  try {
    if (body.mode === 'remediation') {
      if (typeof body.sourceSessionId !== 'number') {
        return NextResponse.json(
          { error: 'sourceSessionId is required for remediation' },
          { status: 400 },
        )
      }
      const session = createRemediationSession(body.sourceSessionId)
      if (session.problems.length === 0) {
        return NextResponse.json(
          { error: 'That session had no difficult problems to practice' },
          { status: 400 },
        )
      }
      return NextResponse.json(session)
    }

    return NextResponse.json(createStandardSession())
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to start session' },
      { status: 500 },
    )
  }
}
