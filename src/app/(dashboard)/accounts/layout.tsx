import { requireFinancePage } from '@/server/page-access'
import { FinanceReadonly } from '@/components/shared/FinanceReadonly'
import AccountsHydrate from '@/components/accounts/AccountsHydrate'
import { ModuleTables } from '@/components/shared/ModuleTables'

export const dynamic = 'force-dynamic'

/** Soft gate for Accounts module — VIEW on financial_reports. */
export default async function AccountsLayout({ children }: { children: React.ReactNode }) {
  await requireFinancePage('accounts', 'financial_reports')
  return (
    <div className="sara-module-content">
      <FinanceReadonly>
        <AccountsHydrate>
          <ModuleTables storageKey="sara.textSize.accounts">{children}</ModuleTables>
        </AccountsHydrate>
      </FinanceReadonly>
    </div>
  )
}
