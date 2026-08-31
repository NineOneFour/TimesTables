import { redirect } from 'next/navigation'
import RunClient from './run-client'
import { requireSession } from '@/lib/dal'
import { referenceView } from '@/lib/reference'
import { getSettings } from '@/lib/settings'
import type { SessionMode } from '@/lib/types'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Practice' }

export default async function RunPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; from?: string }>
}) {
  // Practice is always the child's own. A parent has no run of their own to
  // start, and the session endpoints reject a parent session anyway.
  const session = await requireSession()
  if (session.role !== 'kid') redirect('/kids')

  const { mode, from } = await searchParams
  const sessionMode: SessionMode =
    mode === 'remediation' ? 'remediation' : 'standard'
  const sourceSessionId = from ? Number(from) : null

  /* Shaded once on the server; it does not change mid-run. */
  const { showTableDuringRun } = getSettings(session.kidId)
  const reference = showTableDuringRun ? referenceView(session.kidId) : null

  return (
    <RunClient
      mode={sessionMode}
      sourceSessionId={
        sessionMode === 'remediation' && Number.isInteger(sourceSessionId)
          ? sourceSessionId
          : null
      }
      reference={reference}
    />
  )
}
