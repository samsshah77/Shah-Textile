import { requirePagePermission } from '@/server/page-access'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('admin', 'users')
  return <div className="sara-module-content">{children}</div>
}
