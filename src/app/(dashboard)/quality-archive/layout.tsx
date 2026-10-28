import { requireAreaPage } from '@/server/page-access'

export const dynamic = 'force-dynamic'

/** Quality Archive: View on "Quality Archive" (Administration → Permissions). */
export default async function QualityArchiveLayout({ children }: { children: React.ReactNode }) {
  await requireAreaPage(['quality_archive'], '/quality-archive')
  return <div className="sara-module-content">{children}</div>
}
