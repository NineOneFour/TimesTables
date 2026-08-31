import SiteNav from '@/components/site-nav'
import { activeFacts } from '@/lib/facts'
import { parseKidId, requireKid, requireParent } from '@/lib/dal'
import { TIMER_RUNGS_MS, getSettings } from '@/lib/settings'
import SettingsForm from './settings-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Settings' }

/** Parent only: a child never changes their own practice setup. */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>
}) {
  await requireParent()
  const { kid: kidParam } = await searchParams
  const kid = await requireKid(parseKidId(kidParam))

  const settings = getSettings(kid.id)
  const poolSize = activeFacts(settings).length

  return (
    <div className="shell">
      <SiteNav
        role="parent"
        current="/settings"
        kidId={kid.id}
        kidName={kid.name}
      />
      <div className="stack">
        <header>
          <p className="eyebrow">Settings</p>
          <h1>Practice setup for {kid.name}</h1>
          <p className="note" style={{ marginTop: 8 }}>
            {poolSize} facts are in {kid.name}&rsquo;s pool right now, each
            tracked separately in the order it is shown.
          </p>
        </header>
        <SettingsForm kidId={kid.id} initial={settings} rungs={TIMER_RUNGS_MS} />
      </div>
    </div>
  )
}
