'use client'

import { useActionState, useState } from 'react'
import { addKid, removeKid, updateKid, type KidFormState } from '@/app/actions/kids'
import { PIN_LENGTH } from '@/lib/account-limits'
import styles from './kids.module.css'

export function AddKidForm() {
  const [state, action, pending] = useActionState<KidFormState, FormData>(
    addKid,
    {},
  )

  return (
    <form action={action}>
      <div className={styles.formRow}>
        <label className="field">
          <span className="fieldLabel">Name</span>
          <input className="input" type="text" name="name" required />
        </label>
        <label className="field">
          <span className="fieldLabel">PIN</span>
          <input
            className="input"
            type="text"
            name="pin"
            inputMode="numeric"
            maxLength={PIN_LENGTH}
            required
          />
        </label>
        <button className="btn btnPrimary" type="submit" disabled={pending}>
          {pending ? 'Adding…' : 'Add child'}
        </button>
      </div>
      {state.error && <p className="formError">{state.error}</p>}
    </form>
  )
}

export function EditKidForm({
  kidId,
  name,
}: {
  kidId: number
  name: string
}) {
  const [state, action, pending] = useActionState<KidFormState, FormData>(
    updateKid,
    {},
  )

  return (
    <form action={action}>
      <input type="hidden" name="kidId" value={kidId} />
      <div className={styles.formRow}>
        <label className="field">
          <span className="fieldLabel">Name</span>
          <input className="input" type="text" name="name" defaultValue={name} required />
        </label>
        <label className="field">
          <span className="fieldLabel">New PIN</span>
          <input
            className="input"
            type="text"
            name="pin"
            inputMode="numeric"
            maxLength={PIN_LENGTH}
            placeholder="unchanged"
          />
        </label>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {state.error && <p className="formError">{state.error}</p>}
      {state.ok && <p className="note">Saved.</p>}
    </form>
  )
}

export function RemoveKidForm({
  kidId,
  name,
}: {
  kidId: number
  name: string
}) {
  const [state, action, pending] = useActionState<KidFormState, FormData>(
    removeKid,
    {},
  )
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        className={styles.danger}
        onClick={() => setOpen(true)}
      >
        Remove {name}
      </button>
    )
  }

  return (
    <form action={action}>
      <p className="note">
        This permanently deletes {name} and all of their practice history. Type{' '}
        <b>{name}</b> to confirm.
      </p>
      <input type="hidden" name="kidId" value={kidId} />
      <div className={styles.formRow}>
        <label className="field">
          <span className="fieldLabel">Confirm name</span>
          <input className="input" type="text" name="confirmName" required />
        </label>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? 'Removing…' : 'Remove'}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {state.error && <p className="formError">{state.error}</p>}
    </form>
  )
}
