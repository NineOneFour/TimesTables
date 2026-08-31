import { redirect } from 'next/navigation'
import { bootstrapMode } from '@/lib/accounts'
import SetupForm from './setup-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Setup' }

/**
 * Reachable without signing in, so it must close itself the moment a real
 * account exists. Otherwise it is a way to add a parent to a running instance.
 */
export default function SetupPage() {
  const mode = bootstrapMode()
  if (mode === 'closed') redirect('/signin')

  return (
    <div className="gate">
      <header style={{ marginBottom: 24 }}>
        <p className="eyebrow">Multiplication Practice</p>
        <h1 className="gateTitle">
          {mode === 'claim' ? 'Set up your household' : 'Welcome'}
        </h1>
        <p className="note">
          {mode === 'claim'
            ? 'This app has practice history from before it had accounts. Set up an account to keep it.'
            : 'Create the parent account that will manage practice on this instance.'}
        </p>
      </header>
      <SetupForm claiming={mode === 'claim'} />
    </div>
  )
}
