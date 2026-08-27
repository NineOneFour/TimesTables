import SiteNav from '@/components/site-nav'
import ReferenceTable from '@/components/reference-table'
import { referenceView } from '@/lib/reference'
import styles from './table.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Times table' }

export default function TablePage() {
  const { factors, cells } = referenceView()

  return (
    <div className="shell">
      <SiteNav current="/table" />
      <div className="stack">
        <header>
          <p className="eyebrow">Reference</p>
          <h1>Times table</h1>
          <p className="note" style={{ marginTop: 8 }}>
            Every answer in the current factor pool. Look up whatever you need —
            the shading is only there to show which ones are already sticking.
          </p>
        </header>
        <section className="panel">
          <div className={styles.tableBlock}>
            <ReferenceTable factors={factors} cells={cells} />
          </div>
        </section>
      </div>
    </div>
  )
}
