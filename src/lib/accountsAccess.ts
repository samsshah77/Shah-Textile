/**
 * Who may see and change Accounts + Salary (single place for both, browser and server).
 *
 *  - Edit: Tufail only (Accountant).
 *  - View only: Javed (Admin).
 *  - Everyone else (e.g. Ahmer, Quality Controller): no access — Production only.
 */
type FinanceUser =
  | { id?: string | null; email?: string | null; name?: string | null; role?: string | null; roleKey?: string | null }
  | null
  | undefined

function facts(user: NonNullable<FinanceUser>) {
  return {
    role: (user.role || user.roleKey || '').toLowerCase(),
    id: (user.id || '').toLowerCase(),
    email: (user.email || '').toLowerCase(),
    name: (user.name || '').toLowerCase(),
  }
}

/** Tufail — the only person who can change Accounts and Salary data. */
export function isAccountsController(user: FinanceUser): boolean {
  if (!user) return false
  const u = facts(user)
  if (u.role === 'accountant') return true
  if (u.id === 'usr_acc_tufail') return true
  if (u.email === 'tufail@saratextile.com' || u.email === 'accountant@saratextile.com') return true
  return /\btuf+ail\b/.test(u.name)
}

/** Tufail (edit) and Javed / Admin (view only) may open Accounts and Salary. */
export function canViewFinance(user: FinanceUser): boolean {
  if (!user) return false
  if (isAccountsController(user)) return true
  const u = facts(user)
  if (u.role === 'admin') return true
  if (u.id === 'usr_admin_javed') return true
  if (u.email === 'javed@saratextile.com' || u.email === 'admin@saratextile.com') return true
  return /\bjaved\b/.test(u.name)
}
