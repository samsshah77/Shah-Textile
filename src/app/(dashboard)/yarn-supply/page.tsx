'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { YarnSupplyBoard, type YarnSupplyTab } from '@/components/floor/YarnSupplyBoard'
import { SectionLoader } from '@/components/shared/Loaders'
import { useAuth } from '@/context/AuthContext'

const TABS: YarnSupplyTab[] = ['requests', 'sent', 'verified', 'stock']

/**
 * Yarn Supply — the supplier's page, in tabs: Requests from mill | Sent — waiting | Verified |
 * Mill stock. Permissions → "Yarn Supply": Edit for the supplier, View for Javed Sir.
 */
function Board() {
  const router = useRouter()
  const raw = useSearchParams().get('tab') as YarnSupplyTab | null
  const tab = raw && TABS.includes(raw) ? raw : 'requests'
  return <YarnSupplyBoard mode="supplier" tab={tab} onTabChange={(t) => router.replace(`/yarn-supply?tab=${t}`, { scroll: false })} />
}

export default function YarnSupplyPage() {
  const { canView } = useAuth()
  if (!canView('yarn_supply')) {
    return <div className="alert alert-warning mt-3">You do not have access to Yarn Supply.</div>
  }
  return (
    <div className="py-3">
      <Suspense fallback={<SectionLoader />}>
        <Board />
      </Suspense>
    </div>
  )
}
