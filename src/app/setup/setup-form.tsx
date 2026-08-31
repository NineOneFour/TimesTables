'use client'

import { useActionState } from 'react'
import { setUpHousehold, type FormState } from '@/app/actions/auth'
import { MIN_PASSWORD_LENGTH, PIN_LENGTH } from '@/lib/account-limits'

export default function SetupForm({ claiming }: { claiming: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    setUpHousehold,
    {},
  )

  return (
    <form action={action}>
      <section className="panel">
        <div className="panelHeader">
          <h2>Your account</h2>
          <span className="eyebrow">Parent</span>
        </div>
        <p className="note" style={{ marginBottom: 16 }}>
          You sign in with this to set up practice and see how everyone is doing.
        </p>

        <label className="field">
          <span className="fieldLabel">Email</span>
          <input
            className="input"
            type="email"
            name="email"
            autoComplete="username"
            required
          />
        </label>

        <label className="field">
          <span className="fieldLabel">Password</span>
          <input
            className="input"
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
          <span className="note">
            At least {MIN_PASSWORD_LENGTH} characters.
          </span>
        </label>
      </section>

      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panelHeader">
          <h2>First child</h2>
          <span className="eyebrow">Practises here</span>
        </div>
        <p className="note" style={{ marginBottom: 16 }}>
          {claiming
            ? 'The practice history already in this app will be kept under this name. You can add more children later.'
            : 'They sign in with just this PIN, so it can be something they will remember. You can add more children later.'}
        </p>

        <label className="field">
          <span className="fieldLabel">Name</span>
          <input
            className="input"
            type="text"
            name="kidName"
            autoComplete="off"
            required
          />
        </label>

        <label className="field">
          <span className="fieldLabel">PIN</span>
          <input
            className="input inputPin"
            type="password"
            name="pin"
            inputMode="numeric"
            autoComplete="off"
            pattern={`\\d{${PIN_LENGTH}}`}
            maxLength={PIN_LENGTH}
            required
          />
          <span className="note">{PIN_LENGTH} digits.</span>
        </label>
      </section>

      {state.error && (
        <p className="formError" style={{ marginTop: 16 }}>
          {state.error}
        </p>
      )}

      <div className="btnRow" style={{ marginTop: 20 }}>
        <button className="btn btnPrimary" type="submit" disabled={pending}>
          {pending ? 'Setting up…' : 'Finish setup'}
        </button>
      </div>
    </form>
  )
}
