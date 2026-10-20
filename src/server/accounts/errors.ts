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
    'Yeh entry kisi aur tab ya computer se pehle hi badal chuki hai — page refresh karein, phir dobara tabdeeli karein.',
    'STALE'
  )

export const lockedError = (month: string) =>
  new AccountsError(423, `${month} lock hai — pehle unlock karein (Admin / Accountant).`, 'LOCKED')
