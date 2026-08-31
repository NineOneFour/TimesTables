import SiteNav from '@/components/site-nav'
import ReferenceTable from '@/components/reference-table'
import { parseKidId, requireKid, requireSession } from '@/lib/dal'
import { referenceView } from '@/lib/reference'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Times table' }

export default async function TablePage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>
}) {
  const session = await requireSession()
  const { kid: kidParam } = await searchParams
  const kid = await requireKid(parseKidId(kidParam))
  const { factors, cells } = referenceView(kid.id)

  return (
    <div className="shell">
      <SiteNav
        role={session.role}
        current="/table"
        kidId={kid.id}
        kidName={session.role === 'parent' ? kid.name : undefined}
      />
      <div className="stack">
        <header>
          <p className="eyebrow">Reference</p>
          <h1>Times table</h1>
          <p className="note" style={{ marginTop: 8 }}>
            Shaded by how well each fact is known.
          </p>
        </header>
        <section className="panel">
          <ReferenceTable factors={factors} cells={cells} />
        </section>
      </div>
    </div>
  )
}
