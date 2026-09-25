'use client'

import { useEffect, useState } from 'react'
import { hydrateAccountsFromDb } from '@/services/accountsStore'

export default function AccountsHydrate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void hydrateAccountsFromDb().finally(() => setReady(true))
  }, [])

  if (!ready) {
    return <p className="px-3 py-4 text-muted mb-0">Accounts load ho rahe hain…</p>
  }

  return children
}
