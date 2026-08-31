import Link from 'next/link'
import { redirect } from 'next/navigation'
import { bootstrapMode } from '@/lib/accounts'
import { readHousehold } from '@/lib/auth'
import SignInForm from './signin-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sign in' }

export default async function SignInPage() {
  if (bootstrapMode() !== 'closed') redirect('/setup')
  // Only offer the kid route on a device a parent has already used, since that
  // is the only place a PIN can be checked.
  const household = await readHousehold()

  return (
    <div className="gate">
      <header style={{ marginBottom: 24 }}>
        <p className="eyebrow">Multiplication Practice</p>
        <h1 className="gateTitle">Sign in</h1>
        <p className="note">For parents. Practice setup and progress live here.</p>
      </header>
      <SignInForm />
      {household !== null && (
        <p className="gateFoot">
          Practising instead? <Link href="/signin/kid">Sign in with a PIN</Link>
        </p>
      )}
    </div>
  )
}
