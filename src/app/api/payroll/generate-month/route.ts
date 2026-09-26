import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { currentUser } from '@/server/current-user'
import { isAccountsController } from '@/lib/accountsAccess'
import { dbPayrollGetAll, dbPayrollSave } from '@/server/payrollDb'
import {
  STORAGE_KEYS,
  applySalariedMonthGenerateToStore,
} from '@/services/payrollService'

export const runtime = 'nodejs'

async function requireSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  return token ? await verifySession(token) : null
}

/**
 * Durable month generate: writes Staff / Contract / Efficiency / HR_META
 * straight to Postgres (avoids client PUT race that resets September → August).
 */
export async function POST(req: NextRequest) {
  try {
    const claims = await requireSession(req)
    if (!claims) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const actor = await currentUser(req)
    if (!isAccountsController(actor)) {
      return NextResponse.json(
        { ok: false, error: 'Salary changes are limited to Tufail.' },
        { status: 403 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const month = String(body?.month || '').trim()
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { ok: false, error: 'Month format YYYY-MM chahiye.' },
        { status: 400 }
      )
    }

    const store = await dbPayrollGetAll()
    const result = applySalariedMonthGenerateToStore(store, month)
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 })
    }

    await Promise.all(
      Object.entries(result.patch).map(([key, value]) => dbPayrollSave(key, value))
    )

    return NextResponse.json({
      ok: true,
      message: result.message,
      staff: result.staff,
      contract: result.contract,
      month,
    })
  } catch (err) {
    console.error('[payroll/generate-month]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Generate failed' },
      { status: 500 }
    )
  }
}
