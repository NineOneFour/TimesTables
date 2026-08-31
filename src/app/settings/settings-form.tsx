'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { Settings } from '@/lib/types'
import styles from './settings.module.css'

export default function SettingsForm({
  kidId,
  initial,
  rungs,
}: {
  kidId: number
  initial: Settings
  rungs: number[]
}) {
  const router = useRouter()
  const [settings, setSettings] = useState(initial)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const save = async (patch: Partial<Settings>) => {
    setError(null)
    const optimistic = { ...settings, ...patch }
    setSettings(optimistic)
    const response = await fetch(`/api/settings?kid=${kidId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const payload = await response.json()
    if (!response.ok) {
      setSettings(settings)
      setError(payload.error ?? 'Could not save')
      return
    }
    setSettings(payload as Settings)
    setStatus('Saved')
    startTransition(() => router.refresh())
  }

  return (
    <>
      <section className="panel">
        <div className="panelHeader">
          <h2>Factor pool</h2>
          <span className="eyebrow">1 to 10 always included</span>
        </div>
        <p className="note">
          Turning a factor off removes it from future problems. Its history is
          kept, so its mastery and trends are still there if you turn it back
          on.
        </p>
        <div style={{ marginTop: 8 }}>
          <label className={styles.toggleRow}>
            <input
              className={styles.checkbox}
              type="checkbox"
              checked={settings.include11}
              onChange={(event) => void save({ include11: event.target.checked })}
            />
            <span className={styles.toggleBody}>
              <span className={styles.toggleLabel}>Include 11</span>
              <span className="note">Adds 11 as a factor on both sides.</span>
            </span>
          </label>
          <label className={styles.toggleRow}>
            <input
              className={styles.checkbox}
              type="checkbox"
              checked={settings.include12}
              onChange={(event) => void save({ include12: event.target.checked })}
            />
            <span className={styles.toggleBody}>
              <span className={styles.toggleLabel}>Include 12</span>
              <span className="note">Adds 12 as a factor on both sides.</span>
            </span>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <h2>Reference table</h2>
          <span className="eyebrow">Training wheels</span>
        </div>
        <p className="note">
          The times table is always available on its own page. This also puts it
          beside the problem during practice, so an unknown answer can be looked
          up instead of guessed. Attempts made with it on screen still count
          towards mastery and trends, so turn it off once the answers are
          starting to stick.
        </p>
        <div style={{ marginTop: 8 }}>
          <label className={styles.toggleRow}>
            <input
              className={styles.checkbox}
              type="checkbox"
              checked={settings.showTableDuringRun}
              onChange={(event) =>
                void save({ showTableDuringRun: event.target.checked })
              }
            />
            <span className={styles.toggleBody}>
              <span className={styles.toggleLabel}>Show during practice</span>
              <span className="note">
                Shaded the same way as the reference page.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <h2>Time per problem</h2>
          <span className="eyebrow">Adapts on its own</span>
        </div>
        <p className="note">
          This normally moves itself: shorter after several strong sessions,
          longer again if problems start running out of time. Setting it here
          overrides it until the next adjustment. The countdown is never shown
          during practice.
        </p>
        <div className={styles.limits}>
          {rungs.map((rung) => (
            <button
              key={rung}
              type="button"
              className={`${styles.limit} ${settings.timeLimitMs === rung ? styles.limitActive : ''}`}
              disabled={pending}
              onClick={() => void save({ timeLimitMs: rung })}
            >
              {rung / 1000}s
            </button>
          ))}
        </div>
      </section>

      <p className={`${styles.status} ${error ? styles.statusError : ''}`}>
        {error ?? status ?? ''}
      </p>
    </>
  )
}
