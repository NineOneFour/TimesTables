import { NextResponse } from 'next/server'
import { apiKid } from '@/lib/dal'
import { TIMER_RUNGS_MS, getSettings, updateSettings } from '@/lib/settings'
import { logManualTimerChange } from '@/lib/timer'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const access = await apiKid(request, 'parent')
  if (!access.ok) return access.response
  return NextResponse.json(getSettings(access.kidId))
}

export async function PATCH(request: Request) {
  const access = await apiKid(request, 'parent')
  if (!access.ok) return access.response
  const { kidId } = access

  const body = (await request.json().catch(() => ({}))) as {
    include11?: boolean
    include12?: boolean
    timeLimitMs?: number
    showTableDuringRun?: boolean
  }

  const patch: Parameters<typeof updateSettings>[1] = {}
  if (typeof body.include11 === 'boolean') patch.include11 = body.include11
  if (typeof body.include12 === 'boolean') patch.include12 = body.include12
  if (typeof body.showTableDuringRun === 'boolean') {
    patch.showTableDuringRun = body.showTableDuringRun
  }
  if (typeof body.timeLimitMs === 'number') {
    if (!TIMER_RUNGS_MS.includes(body.timeLimitMs)) {
      return NextResponse.json(
        { error: `timeLimitMs must be one of ${TIMER_RUNGS_MS.join(', ')}` },
        { status: 400 },
      )
    }
    patch.timeLimitMs = body.timeLimitMs
  }

  const before = getSettings(kidId)
  const after = updateSettings(kidId, patch)
  if (patch.timeLimitMs !== undefined) {
    logManualTimerChange(kidId, before.timeLimitMs, after.timeLimitMs)
  }
  return NextResponse.json(after)
}
