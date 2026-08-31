'use client'

import { useActionState } from 'react'
import { signInParent, type FormState } from '@/app/actions/auth'

export default function SignInForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    signInParent,
    {},
  )

  return (
    <form action={action} className="panel">
      <label className="field">
        <span className="fieldLabel">Email</span>
        <input
          className="input"
          type="email"
          name="email"
          autoComplete="username"
          autoFocus
          required
        />
      </label>

      <label className="field">
        <span className="fieldLabel">Password</span>
        <input
          className="input"
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </label>

      {state.error && <p className="formError">{state.error}</p>}

      <button
        className="btn btnPrimary"
        type="submit"
        disabled={pending}
        style={{ width: '100%' }}
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
