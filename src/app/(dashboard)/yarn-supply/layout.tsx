import { requireAreaPage } from '@/server/page-access'
import { FloorSaveAlerts } from '@/components/floor/FloorSaveAlerts'

export const dynamic = 'force-dynamic'

/** Yarn Supply (the supplier's page): View on "Yarn Supply" (Administration → Permissions). */
export default async function YarnSupplyLayout({ children }: { children: React.ReactNode }) {
  await requireAreaPage(['yarn_supply'], '/yarn-supply')
  return (
    <>
      {children}
      <FloorSaveAlerts />
    </>
  )
}
