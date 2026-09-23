'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Resigned list lives under HR Profiles → status filter "Resigned only". */
export default function ResignedEmployeesRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/payroll/profiles')
  }, [router])
  return (
    <div className="p-6 text-sm text-slate-500">Opening HR Profiles (use status filter: Resigned only)…</div>
  )
}
