'use client'

import { useEffect } from 'react'
import { hydratePayrollFromDb } from '@/services/payrollService'

export default function PayrollHydrate() {
  useEffect(() => {
    void hydratePayrollFromDb().then(() => {
      window.dispatchEvent(new CustomEvent('payroll_synced'))
    })
  }, [])

  return null
}
