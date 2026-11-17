'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SupplierTwistingPanel, type TwistFilter } from '@/components/floor/SupplierTwistingPanel'
import { SectionLoader } from '@/components/shared/Loaders'
import { useAuth } from '@/context/AuthContext'

/** Yarn Supply → Twisting: lots issued from Fazal Umer Balance, moved back when twisting is done. */
function Twisting() {
  const router = useRouter()
  const raw = useSearchParams().get('show')
  const filter: TwistFilter = raw === 'done' ? 'done' : raw === 'all' ? 'all' : 'in'
  return (
    <SupplierTwistingPanel
      filter={filter}
      onFilterChange={(f) => router.replace(f === 'in' ? '/yarn-supply/twisting' : `/yarn-supply/twisting?show=${f}`, { scroll: false })}
    />
  )
}

export default function SupplierTwistingPage() {
  const { canView } = useAuth()
  if (!canView('yarn_supply')) {
    return <div className="alert alert-warning mt-3">You do not have access to Yarn Supply.</div>
  }
  return (
    <div className="py-3">
      <Suspense fallback={<SectionLoader />}>
        <Twisting />
      </Suspense>
    </div>
  )
}
