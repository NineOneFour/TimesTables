'use server'

import { revalidatePath } from 'next/cache'
import {
  createKid,
  deleteKid,
  getOwnedKid,
  kidNameTaken,
  renameKid,
  setKidPin,
  validateKidName,
  validatePin,
} from '@/lib/accounts'
import { requireParent } from '@/lib/dal'

/*
  Kid management. Parent-only, and every action re-checks ownership through
  getOwnedKid rather than trusting the id that arrived in the form — a form field
  is attacker-controlled, so the id being present is not evidence it is theirs.
*/

export interface KidFormState {
  error?: string
  ok?: boolean
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

export async function addKid(
  _state: KidFormState,
  formData: FormData,
): Promise<KidFormState> {
  const { parentId } = await requireParent()
  const name = field(formData, 'name')
  const pin = field(formData, 'pin')

  const problem = validateKidName(name) ?? validatePin(pin)
  if (problem) return { error: problem }
  if (kidNameTaken(parentId, name)) {
    return { error: 'You already have someone with that name.' }
  }

  createKid(parentId, name, pin)
  revalidatePath('/kids')
  return { ok: true }
}

export async function updateKid(
  _state: KidFormState,
  formData: FormData,
): Promise<KidFormState> {
  const { parentId } = await requireParent()
  const kidId = Number(field(formData, 'kidId'))
  const kid = Number.isInteger(kidId) ? getOwnedKid(parentId, kidId) : null
  if (!kid) return { error: 'That child could not be found.' }

  const name = field(formData, 'name')
  const pin = field(formData, 'pin')

  const nameProblem = validateKidName(name)
  if (nameProblem) return { error: nameProblem }
  if (kidNameTaken(parentId, name, kid.id)) {
    return { error: 'You already have someone with that name.' }
  }
  renameKid(kid.id, name)

  // An empty PIN field means "leave it alone", not "clear it".
  if (pin.length > 0) {
    const pinProblem = validatePin(pin)
    if (pinProblem) return { error: pinProblem }
    setKidPin(kid.id, pin)
  }

  revalidatePath('/kids')
  return { ok: true }
}

export async function removeKid(
  _state: KidFormState,
  formData: FormData,
): Promise<KidFormState> {
  const { parentId } = await requireParent()
  const kidId = Number(field(formData, 'kidId'))
  const kid = Number.isInteger(kidId) ? getOwnedKid(parentId, kidId) : null
  if (!kid) return { error: 'That child could not be found.' }

  // Deleting practice history is not recoverable, so the name must be retyped.
  if (field(formData, 'confirmName').trim() !== kid.name) {
    return { error: `Type ${kid.name} exactly to confirm.` }
  }

  deleteKid(kid.id)
  revalidatePath('/kids')
  return { ok: true }
}
