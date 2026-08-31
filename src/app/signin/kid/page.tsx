import Link from 'next/link'
import { redirect } from 'next/navigation'
import { listKids } from '@/lib/accounts'
import { readHousehold } from '@/lib/auth'
import KidSignInForm from './kid-signin-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Start practice' }

/**
 * A PIN is only ever checked against one household's children. That household
 * comes from a signed cookie set when a parent signed in on this device, so a
 * four-digit PIN is never tested against every account on the instance.
 */
export default async function KidSignInPage() {
  const parentId = await readHousehold()
  if (parentId === null) redirect('/signin')

  const kids = listKids(parentId)
  if (kids.length === 0) redirect('/signin')

  return (
    <div className="gate">
      <header style={{ marginBottom: 24 }}>
        <p className="eyebrow">Multiplication Practice</p>
        <h1 className="gateTitle">Who is practising?</h1>
      </header>
      <KidSignInForm kids={kids.map(({ id, name }) => ({ id, name }))} />
      <p className="gateFoot">
        <Link href="/signin">Parent sign in</Link>
      </p>
    </div>
  )
}
