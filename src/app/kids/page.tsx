import Link from 'next/link'
import SiteNav from '@/components/site-nav'
import { listKids } from '@/lib/accounts'
import { requireParent } from '@/lib/dal'
import { getLatestCompletedSessionId } from '@/lib/results'
import { getOverviewStats } from '@/lib/trends'
import { seconds } from '@/lib/format'
import { AddKidForm, EditKidForm, RemoveKidForm } from './kid-admin'
import styles from './kids.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Children' }

export default async function KidsPage() {
  const { parentId } = await requireParent()
  const kids = listKids(parentId)

  const rows = kids.map((kid) => ({
    kid,
    stats: getOverviewStats(kid.id),
    latestSessionId: getLatestCompletedSessionId(kid.id),
  }))

  return (
    <div className="shell">
      <SiteNav role="parent" current="/kids" />
      <div className="stack">
        <header>
          <p className="eyebrow">Parent</p>
          <h1>Children</h1>
          <p className="note" style={{ marginTop: 8 }}>
            Practice settings and progress are per child. Each one signs in on
            this device with their own PIN.
          </p>
        </header>

        <section className="panel">
          <div className="panelHeader">
            <h2>Who practises here</h2>
            <span className="eyebrow">
              {kids.length === 1 ? '1 child' : `${kids.length} children`}
            </span>
          </div>

          {rows.length === 0 && (
            <p className="empty">
              No children yet. Add one below and they can start practising.
            </p>
          )}

          {rows.map(({ kid, stats, latestSessionId }) => (
            <div key={kid.id} className={styles.kid}>
              <div>
                <p className={styles.kidName}>{kid.name}</p>
                <p className={styles.kidStats}>
                  <span className={styles.kidStat}>
                    <b>{stats.totalSessions}</b> sessions
                  </span>
                  <span className={styles.kidStat}>
                    <b>{stats.totalAttempts}</b> problems
                  </span>
                  <span className={styles.kidStat}>
                    <b>{stats.factsTracked}</b> facts seen
                  </span>
                  <span className={styles.kidStat}>
                    <b>{seconds(stats.currentTimeLimitMs, 0)}</b> per problem
                  </span>
                </p>
              </div>
              <div className={styles.kidLinks}>
                <Link href={`/trends?kid=${kid.id}`}>Trends</Link>
                <Link href={`/settings?kid=${kid.id}`}>Settings</Link>
                {latestSessionId !== null && (
                  <Link href={`/results/${latestSessionId}?kid=${kid.id}`}>
                    Last results
                  </Link>
                )}
              </div>
            </div>
          ))}
        </section>

        <section className="panel">
          <div className="panelHeader">
            <h2>Add a child</h2>
            <span className="eyebrow">{'They sign in with the PIN'}</span>
          </div>
          <AddKidForm />
        </section>

        {rows.length > 0 && (
          <section className="panel">
            <div className="panelHeader">
              <h2>Names and PINs</h2>
              <span className="eyebrow">Change or remove</span>
            </div>
            {rows.map(({ kid }) => (
              <div key={kid.id} style={{ marginBottom: 24 }}>
                <EditKidForm kidId={kid.id} name={kid.name} />
                <RemoveKidForm kidId={kid.id} name={kid.name} />
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
