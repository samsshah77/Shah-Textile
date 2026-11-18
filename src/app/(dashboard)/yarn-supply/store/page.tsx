'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SupplierStorePanel, type StoreTab } from '@/components/floor/SupplierStorePanel'
import { usePeriodParams } from '@/components/floor/YarnPeriodTools'
import { SectionLoader } from '@/components/shared/Loaders'
import { useAuth } from '@/context/AuthContext'

/** Yarn Supply → Fazal Umer Balance (Twisting, Sizing and Sectional Warping have their own pages). */
function Store() {
  const router = useRouter()
  const raw = useSearchParams().get('tab')
  const tab: StoreTab = 'stock'
  const { period, date, today, setPeriod } = usePeriodParams('daily')
  // Old links to the Twisting / Sizing tabs → their own pages now.
  useEffect(() => {
    if (raw === 'twist') router.replace('/yarn-supply/twisting')
    if (raw === 'out') router.replace('/yarn-supply/sizing')
  }, [raw, router])
  return <SupplierStorePanel tab={tab} period={period} date={date} today={today} onPeriodChange={setPeriod} />
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
