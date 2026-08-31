import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/dal'
import { getLatestCompletedSessionId } from '@/lib/results'
import styles from './home.module.css'

export const dynamic = 'force-dynamic'

/*
  The child's door. No score, no streak, no history — the analysis screens are
  one deliberate click away, so starting a run never begins with a scoreboard.

  Practice setup is not here at all now: it belongs to the parent, who has their
  own landing page.
*/
export default async function HomePage() {
  const session = await requireSession()
  if (session.role === 'parent') redirect('/kids')

  const latest = getLatestCompletedSessionId(session.kidId)

  return (
    <main className={styles.door}>
      <h1 className={styles.title}>Multiplication Practice</h1>
      <p className={styles.instruction}>
        50 problems. Type the answer, press Enter.
      </p>
      <Link className={`btn btnPrimary ${styles.start}`} href="/run">
        Start practice
      </Link>
      <div className={styles.aside}>
        <Link href="/table">Times table</Link>
        {latest !== null && <Link href={`/results/${latest}`}>Last results</Link>}
        <Link href="/trends">Trends</Link>
      </div>
    </main>
  )
}
