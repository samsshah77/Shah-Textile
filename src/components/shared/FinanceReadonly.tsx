'use client'

import { useAuth } from '@/context/AuthContext'

/** Locks Accounts/Salary inputs for everyone except Tufail. */
export function FinanceReadonly({ children }: { children: React.ReactNode }) {
  const { canEditAccounts, canViewAccounts } = useAuth()
  if (canEditAccounts || !canViewAccounts) return <>{children}</>

  return (
    <div className="sara-finance-readonly">
      <div className="alert alert-secondary py-2 mb-3" role="status">
        View only. Accounts and Salary are controlled by Tufail.
      </div>
      {children}
    </div>
  )
}
