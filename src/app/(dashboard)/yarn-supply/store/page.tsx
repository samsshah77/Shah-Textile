'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SupplierStorePanel, type StoreTab } from '@/components/floor/SupplierStorePanel'
import { SectionLoader } from '@/components/shared/Loaders'
import { useAuth } from '@/context/AuthContext'

/** Yarn Supply → Fazal Umer Inventory (stock + Twisting) and lots sent to Sizing / Warping. */
function Store() {
  const router = useRouter()
  const raw = useSearchParams().get('tab')
  const tab: StoreTab = raw === 'out' ? 'out' : raw === 'twist' ? 'twist' : 'stock'
  return <SupplierStorePanel tab={tab} onTabChange={(t) => router.replace(`/yarn-supply/store?tab=${t}`, { scroll: false })} />
}

export default function SupplierStorePage() {
  const { canView } = useAuth()
  if (!canView('yarn_supply')) {
    return <div className="alert alert-warning mt-3">You do not have access to Yarn Supply.</div>
  }
  return (
    <div className="py-3">
      <Suspense fallback={<SectionLoader />}>
        <Store />
      </Suspense>
    </div>
  )
}
