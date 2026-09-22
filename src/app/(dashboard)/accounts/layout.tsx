import { requirePagePermission } from '@/server/page-access'

/** Soft gate for Accounts module — VIEW on financial_reports. */
export default async function AccountsLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('accounts', 'financial_reports')
  return <div className="sara-module-content">{children}</div>
}
