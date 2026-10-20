'use client'

import { Suspense, use } from 'react'
import { PartyLedgerView } from '@/components/accounts/PartyLedgerView'

export default function PartyLedgerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return (
    <Suspense fallback={null}>
      <PartyLedgerView slug={slug} kind="WORKSHOP" />
    </Suspense>
  )
}
