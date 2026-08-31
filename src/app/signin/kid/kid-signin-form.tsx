'use client'

import { useActionState, useState } from 'react'
import { signInKid, type FormState } from '@/app/actions/auth'
import { PIN_LENGTH } from '@/lib/account-limits'
import styles from './kid-signin.module.css'

export default function KidSignInForm({
  kids,
}: {
  kids: { id: number; name: string }[]
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    signInKid,
    {},
  )
  const [kidId, setKidId] = useState<number | null>(
    kids.length === 1 ? kids[0].id : null,
  )

  return (
    <form action={action} className="panel">
      <input type="hidden" name="kidId" value={kidId ?? ''} />

      {kids.length > 1 && (
        <div className={styles.who}>
          {kids.map((kid) => (
            <button
              key={kid.id}
              type="button"
              className={`${styles.name} ${kidId === kid.id ? styles.nameActive : ''}`}
              onClick={() => setKidId(kid.id)}
            >
              {kid.name}
            </button>
          ))}
        </div>
      )}

      {kids.length === 1 && (
        <p className={styles.greeting}>Hello, {kids[0].name}</p>
      )}

      <label className="field">
        <span className="fieldLabel">Your PIN</span>
        <input
          className="input inputPin"
          type="password"
          name="pin"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_LENGTH}
          autoFocus={kids.length === 1}
          required
        />
      </label>

      {state.error && <p className="formError">{state.error}</p>}

      <button
        className="btn btnPrimary"
        type="submit"
        disabled={pending || kidId === null}
        style={{ width: '100%' }}
      >
        {pending ? 'Starting…' : 'Start'}
      </button>
    </form>
  )
}
