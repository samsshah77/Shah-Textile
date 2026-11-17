'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SupplierStorePanel, type StoreTab } from '@/components/floor/SupplierStorePanel'
import { SectionLoader } from '@/components/shared/Loaders'
import { useAuth } from '@/context/AuthContext'

/** Yarn Supply → Fazal Umer Balance and lots sent to Sizing / Warping (Twisting has its own page). */
function Store() {
  const router = useRouter()
  const raw = useSearchParams().get('tab')
  const tab: StoreTab = raw === 'out' ? 'out' : 'stock'
  // Old link to the Twisting tab → its own page now.
  useEffect(() => {
    if (raw === 'twist') router.replace('/yarn-supply/twisting')
  }, [raw, router])
  return <SupplierStorePanel tab={tab} />
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
