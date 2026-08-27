import RunClient from './run-client'
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
  const { mode, from } = await searchParams
  const sessionMode: SessionMode =
    mode === 'remediation' ? 'remediation' : 'standard'
  const sourceSessionId = from ? Number(from) : null

  /* Shaded once on the server; it does not change mid-run. */
  const { showTableDuringRun } = getSettings()
  const reference = showTableDuringRun ? referenceView() : null

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
