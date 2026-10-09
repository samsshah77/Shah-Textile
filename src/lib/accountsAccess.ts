/** Accounts + Salary edits are allowed for Admin (Javed) and Accountant (Tufail). */
export function isAccountsController(
  user: { id?: string | null; email?: string | null; name?: string | null; role?: string | null; roleKey?: string | null } | null | undefined
): boolean {
  if (!user) return false
  const role = (user.role || user.roleKey || '').toLowerCase()
  if (role === 'admin' || role === 'accountant') return true
  const id = (user.id || '').toLowerCase()
  const email = (user.email || '').toLowerCase()
  const name = (user.name || '').toLowerCase()
  if (id === 'usr_acc_tufail' || id === 'usr_admin_javed') return true
  if (
    email === 'tufail@saratextile.com' ||
    email === 'accountant@saratextile.com' ||
    email === 'javed@saratextile.com' ||
    email === 'admin@saratextile.com'
  ) {
    return true
  }
  return /\btuf+ail\b/.test(name) || /\bjaved\b/.test(name) || /\badmin\b/.test(name)
}
