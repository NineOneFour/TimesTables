/**
 * Shared with client components, so this file must stay free of any server-only
 * import. accounts.ts re-exports these so server code has one place to look.
 */
export const PIN_LENGTH = 4
export const MIN_PASSWORD_LENGTH = 8
