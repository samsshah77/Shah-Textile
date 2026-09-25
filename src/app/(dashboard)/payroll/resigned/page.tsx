'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Resigned staff directory lives under HR Profiles with tab=RESIGNED. */
export default function ResignedEmployeesRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/payroll/profiles?tab=RESIGNED')
  }, [router])
  return (
    <div className="p-6 text-sm text-slate-500">Opening Resigned Staff Directory…</div>
  )
}
