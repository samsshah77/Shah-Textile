import { requirePagePermission } from '@/server/page-access'

/** Soft gate for Floor module — VIEW on production_entries. */
export default async function FloorLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('floor', 'production_entries')
  return children
}
