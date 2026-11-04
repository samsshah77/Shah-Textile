'use client'

import { Suspense } from 'react'
import { PartyDirectory } from '@/components/accounts/PartyDirectory'
import { AccountsCardsSkeleton } from '@/components/accounts/AccountsSkeleton'

export default function WorkshopsDirectoryPage() {
  return (
    <Suspense fallback={<AccountsCardsSkeleton />}>
      <PartyDirectory kind="WORKSHOP" />
    </Suspense>
  )
}
