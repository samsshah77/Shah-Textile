/** Accounts + Salary edits are limited to Tufail (accountant). */
export function isAccountsController(
  user: { id?: string | null; email?: string | null; name?: string | null } | null | undefined
): boolean {
  if (!user) return false
  const id = (user.id || '').toLowerCase()
  const email = (user.email || '').toLowerCase()
  const name = (user.name || '').toLowerCase()
  if (id === 'usr_acc_tufail') return true
  if (email === 'tufail@saratextile.com' || email === 'accountant@saratextile.com') return true
  return /\btuf+ail\b/.test(name)
}
