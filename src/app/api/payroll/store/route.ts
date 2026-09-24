import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import {
  dbPayrollGetAll,
  dbPayrollIsEmpty,
  dbPayrollSave,
} from '@/server/payrollDb'
import { getPayrollSeedStore, STORAGE_KEYS } from '@/services/payrollService'

export const runtime = 'nodejs'

const ALLOWED_KEYS = new Set<string>(Object.values(STORAGE_KEYS))

async function requireSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  return token ? await verifySession(token) : null
}

export async function GET() {
  try {
    if (await dbPayrollIsEmpty()) {
      const seed = getPayrollSeedStore()
      await Promise.all(
        Object.entries(seed).map(([key, value]) => dbPayrollSave(key, value))
      )
    }

    const store = await dbPayrollGetAll()
    return NextResponse.json({ ok: true, store })
  } catch (err) {
    console.error('[payroll/bootstrap]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Bootstrap failed' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const claims = await requireSession(req)
    if (!claims) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const key = String(body?.key || '')
    const value = body?.value

    if (!key) {
      return NextResponse.json({ ok: false, error: 'key required' }, { status: 400 })
    }

    if (!ALLOWED_KEYS.has(key)) {
      return NextResponse.json({ ok: false, error: `Unknown key: ${key}` }, { status: 400 })
    }

    await dbPayrollSave(key, value)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[payroll/store PUT]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Save failed' },
      { status: 500 }
    )
  }
}
