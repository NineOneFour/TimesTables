'use server'

import { redirect } from 'next/navigation'
import {
  adoptedParentId,
  bootstrapMode,
  claimParent,
  countParents,
  createKid,
  createParent,
  emailTaken,
  kidsNeedingPin,
  lockoutMinutes,
  renameKid,
  setKidPin,
  validateEmail,
  validateKidName,
  validatePassword,
  validatePin,
  verifyKidPin,
  verifyParentPassword,
} from '@/lib/accounts'
import {
  createSession,
  destroySession,
  readHousehold,
  rememberHousehold,
} from '@/lib/auth'
import { currentSession } from '@/lib/dal'

export interface FormState {
  error?: string
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

/**
 * First run. Handles both a genuinely empty install and a database adopted from
 * before accounts existed, and refuses once a real account is in place — this is
 * an unauthenticated endpoint, so being closed afterwards is what stops anyone
 * from adding themselves to a running instance.
 */
export async function setUpHousehold(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const mode = bootstrapMode()
  if (mode === 'closed') {
    return { error: 'This instance is already set up. Sign in instead.' }
  }

  const email = field(formData, 'email')
  const password = field(formData, 'password')
  const kidName = field(formData, 'kidName')
  const pin = field(formData, 'pin')

  const problem =
    validateEmail(email) ??
    validatePassword(password) ??
    validateKidName(kidName) ??
    validatePin(pin)
  if (problem) return { error: problem }

  let parentId: number
  if (mode === 'claim') {
    const adopted = adoptedParentId()
    if (adopted === null) return { error: 'Setup is no longer available.' }
    if (emailTaken(email, adopted)) {
      return { error: 'That email is already in use.' }
    }
    claimParent(adopted, email, password)
    parentId = adopted

    // Adoption leaves exactly one kid holding the migrated history. Name it and
    // give it a PIN rather than creating a second one beside it.
    const pending = kidsNeedingPin(parentId)
    if (pending.length > 0) {
      renameKid(pending[0].id, kidName)
      setKidPin(pending[0].id, pin)
      for (const extra of pending.slice(1)) setKidPin(extra.id, pin)
    } else {
      createKid(parentId, kidName, pin)
    }
  } else {
    if (countParents() > 0) return { error: 'Setup is no longer available.' }
    if (emailTaken(email)) return { error: 'That email is already in use.' }
    parentId = createParent(email, password)
    createKid(parentId, kidName, pin)
  }

  await createSession({ role: 'parent', parentId })
  await rememberHousehold(parentId)
  redirect('/kids')
}

export async function signInParent(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = field(formData, 'email')
  const password = field(formData, 'password')
  if (email.trim().length === 0 || password.length === 0) {
    return { error: 'Enter your email and password.' }
  }

  const result = verifyParentPassword(email, password)
  if (!result.ok) {
    if (result.reason === 'locked') {
      return {
        error: `Too many attempts. Try again in ${lockoutMinutes()} minutes.`,
      }
    }
    // Deliberately does not distinguish an unknown email from a wrong password.
    return { error: 'That email and password do not match.' }
  }

  await createSession({ role: 'parent', parentId: result.parentId })
  // Marks this device as the household's, which is what lets a kid sign in here.
  await rememberHousehold(result.parentId)
  redirect('/kids')
}

/**
 * Kid sign-in is only possible on a device where a parent has signed in at least
 * once. The household cookie decides whose kids a PIN is checked against, so a
 * four-digit PIN is never tested against the whole instance.
 */
export async function signInKid(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parentId = await readHousehold()
  if (parentId === null) {
    return {
      error: 'This device is not set up yet. A parent needs to sign in first.',
    }
  }

  const kidId = Number(field(formData, 'kidId'))
  const pin = field(formData, 'pin')
  if (!Number.isInteger(kidId) || kidId <= 0) {
    return { error: 'Choose who is practising.' }
  }

  const result = verifyKidPin(parentId, kidId, pin)
  if (!result.ok) {
    if (result.reason === 'locked') {
      return {
        error: `Too many tries. Ask a grown-up and try again in ${lockoutMinutes()} minutes.`,
      }
    }
    return { error: 'That PIN is not right.' }
  }

  await createSession({
    role: 'kid',
    parentId: result.parentId,
    kidId: result.kidId!,
  })
  redirect('/')
}

/** Signs out but leaves the household cookie, so kid sign-in still works here. */
export async function signOut() {
  const session = await currentSession()
  await destroySession()
  redirect(session?.role === 'kid' ? '/signin/kid' : '/signin')
}
