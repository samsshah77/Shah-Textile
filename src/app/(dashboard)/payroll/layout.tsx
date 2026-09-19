import { requirePagePermission } from '@/server/page-access'

/** Soft gate for Payroll module — VIEW on payroll_runs. */
export default async function PayrollLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('payroll', 'payroll_runs')
  return children
}
