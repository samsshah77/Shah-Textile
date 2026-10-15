import PayrollHydrate from '@/components/payroll/PayrollHydrate'
import { FinanceReadonly } from '@/components/shared/FinanceReadonly'
import { requirePagePermission } from '@/server/page-access'
import { PayrollDirtyProvider } from '@/context/PayrollDirtyContext'

export const dynamic = 'force-dynamic'

/** Soft gate for Payroll module — VIEW on payroll_runs. */
export default async function PayrollLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('payroll', 'payroll_runs')
  return (
    <PayrollDirtyProvider>
      <div className="sara-module-content sara-payroll">
        <PayrollHydrate />
        <FinanceReadonly>{children}</FinanceReadonly>
      </div>
    </PayrollDirtyProvider>
  )
}
