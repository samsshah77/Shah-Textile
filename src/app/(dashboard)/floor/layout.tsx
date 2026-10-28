import { requireAreaPage } from '@/server/page-access'
import { PRODUCTION_AREAS } from '@/lib/access'
import { FloorSaveAlerts } from '@/components/floor/FloorSaveAlerts'

export const dynamic = 'force-dynamic'

/** Floor pages: View on any production tab, Kamran Fault or Tracking (Administration → Permissions). */
export default async function FloorLayout({ children }: { children: React.ReactNode }) {
  await requireAreaPage([...PRODUCTION_AREAS, 'fault_reports', 'tracking'], '/floor/production')
  return (
    <>
      {children}
      <FloorSaveAlerts />
    </>
  )
}
