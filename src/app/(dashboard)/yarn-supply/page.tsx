'use client'

import { YarnSupplyBoard } from '@/components/floor/YarnSupplyBoard'
import { useAuth } from '@/context/AuthContext'

/**
 * Yarn Supply — the supplier's page: enter each lot of yarn sent to the mill; see whether the
 * mill has checked it (or reported an issue to correct) and the mill's yarn stock.
 * Permissions → "Yarn Supply": Edit for the supplier, View for Javed Sir.
 */
export default function YarnSupplyPage() {
  const { canView } = useAuth()
  if (!canView('yarn_supply')) {
    return <div className="alert alert-warning mt-3">You do not have access to Yarn Supply.</div>
  }
  return (
    <div className="py-3">
      <YarnSupplyBoard mode="supplier" />
    </div>
  )
}
