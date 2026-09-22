import { requirePagePermission } from '@/server/page-access'

export const dynamic = 'force-dynamic'

/** Soft gate for Accounts module — VIEW on financial_reports. */
export default async function AccountsLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('accounts', 'financial_reports')
  return <div className="sara-module-content">{children}</div>
}
