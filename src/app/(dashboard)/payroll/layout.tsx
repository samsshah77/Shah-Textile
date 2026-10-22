import PayrollHydrate from '@/components/payroll/PayrollHydrate'
import { FloorSaveAlerts } from '@/components/floor/FloorSaveAlerts'
import { FinanceReadonly } from '@/components/shared/FinanceReadonly'
import { requireFinancePage } from '@/server/page-access'
import { PayrollDirtyProvider } from '@/context/PayrollDirtyContext'
import { ModuleTables } from '@/components/shared/ModuleTables'

export const dynamic = 'force-dynamic'

/** Soft gate for Payroll module — VIEW on payroll_runs. */
export default async function PayrollLayout({ children }: { children: React.ReactNode }) {
  await requireFinancePage('payroll', 'payroll_runs')
  return (
    <PayrollDirtyProvider>
      <div className="sara-module-content sara-payroll">
        <PayrollHydrate>
          <FinanceReadonly>
            <ModuleTables storageKey="sara.textSize.payroll">{children}</ModuleTables>
          </FinanceReadonly>
        </PayrollHydrate>
        {/* Red banner when the server refuses a salary save (old tab / locked month). */}
        <FloorSaveAlerts eventName="payroll:save-problem" />
      </div>
    </PayrollDirtyProvider>
  )
}
