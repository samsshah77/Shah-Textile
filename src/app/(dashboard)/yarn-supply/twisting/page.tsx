'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SupplierTwistingPanel, type TwistFilter } from '@/components/floor/SupplierTwistingPanel'
import { SectionLoader } from '@/components/shared/Loaders'
import { usePeriodParams } from '@/components/floor/YarnPeriodTools'
import { useAuth } from '@/context/AuthContext'

/** Yarn Supply → Twisting: lots issued from Fazal Umer Balance, moved back when twisting is done. */
function Twisting() {
  const router = useRouter()
  const sp = useSearchParams()
  const raw = sp.get('show')
  const filter: TwistFilter = raw === 'done' ? 'done' : raw === 'all' ? 'all' : 'in'
  // Lots still in Twisting can be old, so this page opens on All; Daily / Monthly is one tap away.
  const { period, date, today, setPeriod } = usePeriodParams('all')
  return (
    <SupplierTwistingPanel
      filter={filter}
      onFilterChange={(f) => {
        const q = new URLSearchParams(sp.toString())
        if (f === 'in') q.delete('show')
        else q.set('show', f)
        const qs = q.toString()
        router.replace(qs ? `/yarn-supply/twisting?${qs}` : '/yarn-supply/twisting', { scroll: false })
      }}
      period={period}
      date={date}
      today={today}
      onPeriodChange={setPeriod}
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
