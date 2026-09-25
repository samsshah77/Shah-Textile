import { requirePagePermission } from '@/server/page-access'
import { FinanceReadonly } from '@/components/shared/FinanceReadonly'
import AccountsHydrate from '@/components/accounts/AccountsHydrate'

export const dynamic = 'force-dynamic'

/** Soft gate for Accounts module — VIEW on financial_reports. */
export default async function AccountsLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('accounts', 'financial_reports')
  return (
    <div className="sara-module-content">
      <FinanceReadonly>
        <AccountsHydrate>{children}</AccountsHydrate>
      </FinanceReadonly>
    </div>
  )
}
