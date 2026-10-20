import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { payrollHandler } from '@/server/payroll/api'
import { loadPayrollState, type Db } from '@/server/payroll/rows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Old endpoint, kept only for browser tabs opened before the update.
 * Reading still works (from the new tables); saving is refused with a clear message,
 * so an old tab can never overwrite the new data with a whole old sheet.
 */
export const GET = payrollHandler(async () => {
  const { store } = await loadPayrollState(prisma as unknown as Db)
  return { store, versions: {} }
})

export async function PUT(_req: NextRequest) {
  return NextResponse.json(
    {
      ok: false,
      blocked: true,
      error: 'Salary module update ho gaya hai — page refresh karein (F5). Is tab ki aakhri tabdeeli save nahi hui.',
    },
    { status: 409 }
  )
}
