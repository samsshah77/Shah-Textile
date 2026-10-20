'use client'

import { Suspense } from 'react'
import { PartyDirectory } from '@/components/accounts/PartyDirectory'

export default function WorkshopsDirectoryPage() {
  return (
    <Suspense fallback={null}>
      <PartyDirectory kind="WORKSHOP" />
    </Suspense>
  )
}
