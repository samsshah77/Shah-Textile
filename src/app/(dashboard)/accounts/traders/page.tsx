'use client'

import { Suspense } from 'react'
import { PartyDirectory } from '@/components/accounts/PartyDirectory'

export default function TradersDirectoryPage() {
  return (
    <Suspense fallback={null}>
      <PartyDirectory kind="TRADER" />
    </Suspense>
  )
}
