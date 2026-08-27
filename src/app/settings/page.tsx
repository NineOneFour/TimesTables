import SiteNav from '@/components/site-nav'
import { activeFacts } from '@/lib/facts'
import { TIMER_RUNGS_MS, getSettings } from '@/lib/settings'
import SettingsForm from './settings-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Settings' }

export default function SettingsPage() {
  const settings = getSettings()
  const poolSize = activeFacts(settings).length

  return (
    <div className="shell">
      <SiteNav current="/settings" />
      <div className="stack">
        <header>
          <p className="eyebrow">Settings</p>
          <h1>Practice setup</h1>
          <p className="note" style={{ marginTop: 8 }}>
            {poolSize} facts are in the pool right now, each tracked separately
            in the order it is shown.
          </p>
        </header>
        <SettingsForm initial={settings} rungs={TIMER_RUNGS_MS} />
      </div>
    </div>
  )
}
