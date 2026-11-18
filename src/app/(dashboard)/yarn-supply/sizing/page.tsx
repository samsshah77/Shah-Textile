'use client'

import { Suspense } from 'react'
import { SupplierDeptPanel } from '@/components/floor/SupplierDeptPanel'
import { usePeriodParams } from '@/components/floor/YarnPeriodTools'
import { SectionLoader } from '@/components/shared/Loaders'
import { useAuth } from '@/context/AuthContext'

/** Yarn Supply → Sizing: lots sent from Fazal Umer Balance (?view=daily|weekly|monthly|all&date=YYYY-MM-DD). */
function Sizing() {
  const { period, date, today, setPeriod } = usePeriodParams('daily')
  return <SupplierDeptPanel dest="SIZING" period={period} date={date} today={today} onPeriodChange={setPeriod} />
}

export default function SupplierSizingPage() {
  const { canView } = useAuth()
  if (!canView('yarn_supply')) {
    return <div className="alert alert-warning mt-3">You do not have access to Yarn Supply.</div>
  }
  return (
    <div className="py-3">
      <Suspense fallback={<SectionLoader />}>
        <Sizing />
      </Suspense>
    </div>
  )
}
