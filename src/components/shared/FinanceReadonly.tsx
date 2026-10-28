'use client'

import { useAuth } from '@/context/AuthContext'

/** Locks the inputs of Accounts / Salary for people who may only view it (Administration → Permissions). */
export function FinanceReadonly({ area, children }: { area: 'accounts' | 'payroll'; children: React.ReactNode }) {
  const { canEdit, canView } = useAuth()
  if (canEdit(area) || !canView(area)) return <>{children}</>

  return (
    <div className="sara-finance-readonly">
      <div className="alert alert-secondary py-2 mb-3" role="status">
        View only — {area === 'accounts' ? 'Accounts' : 'Salary'} mein tabdeeli ki ijazat nahi.
      </div>
      {children}
    </div>
  )
}
