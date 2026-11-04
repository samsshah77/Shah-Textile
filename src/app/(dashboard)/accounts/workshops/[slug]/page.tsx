'use client'

import { Suspense, use } from 'react'
import { PartyLedgerView } from '@/components/accounts/PartyLedgerView'
import { AccountsLedgerSkeleton } from '@/components/accounts/AccountsSkeleton'

export default function PartyLedgerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return (
    <Suspense fallback={<AccountsLedgerSkeleton />}>
      <PartyLedgerView slug={slug} kind="WORKSHOP" />
    </Suspense>
  )
}
