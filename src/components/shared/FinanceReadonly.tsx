'use client'

import { useAuth } from '@/context/AuthContext'

/** Locks the inputs of Accounts / Salary for people who may only view it (Administration → Permissions). */
export function FinanceReadonly({ area, children }: { area: 'accounts' | 'payroll'; children: React.ReactNode }) {
  const { canEdit, canView } = useAuth()
  if (canEdit(area) || !canView(area)) return <>{children}</>

  return (
    <div className="sara-finance-readonly">
      <div className="alert alert-warning border-warning-subtle text-dark d-flex align-items-center gap-2 py-2 px-3 mb-3 fw-medium d-print-none" role="status">
        <i className="bi bi-shield-lock-fill text-warning fs-5 flex-shrink-0" />
        <span>
          <strong>View only</strong> — {area === 'accounts' ? 'Accounts' : 'Salary'} mein tabdeeli ki ijazat nahi.
        </span>
      </div>
      {children}
    </div>
  )
}
