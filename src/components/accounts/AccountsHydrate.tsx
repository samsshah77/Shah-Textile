'use client'

import { useEffect } from 'react'
import { isAccountsStoreKey } from '@/lib/accountsKeys'
import { accountsApi, ACCOUNTS_PROBLEM_EVENT } from '@/services/accounts/accountsApi'
import { FloorSaveAlerts } from '@/components/floor/FloorSaveAlerts'
import { useAuth } from '@/context/AuthContext'

const UPLOADED_FLAG = 'sara_accounts_legacy_uploaded_v1'

/**
 * Accounts now live on the server only. Once per browser, any accounts data that was
 * saved only in this browser (before the server table existed) is sent up, so it is not
 * lost; the server keeps its own copy where it has one.
 */
export default function AccountsHydrate({ children }: { children: React.ReactNode }) {
  const { canEditAccounts } = useAuth()

  useEffect(() => {
    if (!canEditAccounts) return
    try {
      if (localStorage.getItem(UPLOADED_FLAG)) return
      const entries: Record<string, unknown> = {}
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i)
        if (!key || !isAccountsStoreKey(key)) continue
        try {
          entries[key] = JSON.parse(localStorage.getItem(key) || 'null')
        } catch {
          // skip unreadable
        }
      }
      if (!Object.keys(entries).length) {
        localStorage.setItem(UPLOADED_FLAG, new Date().toISOString())
        return
      }
      accountsApi
        .legacyUpload(entries)
        .then(() => localStorage.setItem(UPLOADED_FLAG, new Date().toISOString()))
        .catch(() => {})
    } catch {
      // storage blocked — nothing to upload
    }
  }, [canEditAccounts])

  return (
    <>
      {children}
      <FloorSaveAlerts eventName={ACCOUNTS_PROBLEM_EVENT} />
    </>
  )
}
