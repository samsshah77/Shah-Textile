/** An expected refusal from the accounts API (bad input, stale copy, locked month …). */
export class AccountsError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: 'BAD_INPUT' | 'NOT_FOUND' | 'STALE' | 'LOCKED' | 'FORBIDDEN' | 'CONFLICT' = 'BAD_INPUT'
  ) {
    super(message)
  }
}

export const staleError = () =>
  new AccountsError(
    409,
    'This entry was already changed from another tab or computer — refresh the page, then make the change again.',
    'STALE'
  )

export const lockedError = (month: string) =>
  new AccountsError(423, `${month} is locked — Tufail must unlock it first.`, 'LOCKED')
