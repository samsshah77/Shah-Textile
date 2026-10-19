import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import {
  dbPayrollGet,
  dbPayrollGetAll,
  dbPayrollIsEmpty,
  dbPayrollSave,
  dbPayrollVersion,
  dbPayrollVersions,
} from '@/server/payrollDb'
import { PayrollGuardError, assertFreshVersion, keepLockedMonths } from '@/server/payrollGuards'
import { sameJson } from '@/server/stableJson'
import {
  getPayrollSeedStore,
  integrateRosterRespectingTombstones,
  projectProfilesOntoSheets,
  dedupePayrollStore,
  STORAGE_KEYS,
} from '@/services/payrollService'
import { currentUser } from '@/server/current-user'
import { isAccountsController } from '@/lib/accountsAccess'
import { writeAudit } from '@/server/auditLog'

export const runtime = 'nodejs'

const ALLOWED_KEYS = new Set<string>(Object.values(STORAGE_KEYS))

async function requireSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  return token ? await verifySession(token) : null
}

export async function GET(req: NextRequest) {
  try {
    // Salaries are private: only logged-in users may read them.
    if (!(await requireSession(req))) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    if (await dbPayrollIsEmpty()) {
      const seed = getPayrollSeedStore()
      await Promise.all(
        Object.entries(seed).map(([key, value]) => dbPayrollSave(key, value))
      )
    }

    const store = await dbPayrollGetAll()
    const seed = getPayrollSeedStore()
    const missing = Object.entries(seed).filter(([key]) => store[key] == null)
    if (missing.length > 0) {
      await Promise.all(missing.map(([key, value]) => dbPayrollSave(key, value)))
      for (const [key, value] of missing) store[key] = value
    }

    // Repairs below write ONLY when the content really changes — a no-op write would
    // bump the key's version and make other open tabs look out of date.
    const saveIfChanged = async (patch: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(patch)) {
        if (sameJson(store[key], value)) continue
        await dbPayrollSave(key, value)
        store[key] = value
      }
    }
    await saveIfChanged(integrateRosterRespectingTombstones(store))
    await saveIfChanged(projectProfilesOntoSheets(store))
    // Live self-heal: drop same person twice in one month (mirror ∪ DB merge by id).
    await saveIfChanged(dedupePayrollStore(store))

    return NextResponse.json({ ok: true, store, versions: await dbPayrollVersions() })
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

    const actor = await currentUser(req)
    if (!isAccountsController(actor)) {
      return NextResponse.json(
        { ok: false, error: 'Salary changes are limited to Tufail.' },
        { status: 403 }
      )
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

    // 1. Built on an older copy than the database has? (other tab / computer saved since)
    assertFreshVersion(body?.baseVersion, await dbPayrollVersion(key))
    // 2. Locked months may not change.
    const before = await dbPayrollGet(key)
    const meta = await dbPayrollGet(STORAGE_KEYS.HR_META)
    const { value: toSave, keptMonths } = keepLockedMonths(before, value, meta, key === STORAGE_KEYS.HR_META)
    const lockedNote =
      keptMonths.length > 0
        ? `Locked month (${keptMonths.join(', ')}) ki rows nahi badli gayin — baqi save ho gaya.`
        : undefined

    if (sameJson(before, toSave)) {
      return NextResponse.json({ ok: true, version: await dbPayrollVersion(key), lockedNote })
    }
    await dbPayrollSave(key, toSave)
    await writeAudit({
      req, actor, module: 'payroll', action: 'save', entityKey: key, before, after: toSave,
      meta: keptMonths.length ? { lockedMonthsKept: keptMonths } : undefined,
    })
    return NextResponse.json({ ok: true, version: await dbPayrollVersion(key), lockedNote })
  } catch (err) {
    if (err instanceof PayrollGuardError) {
      return NextResponse.json(
        { ok: false, blocked: true, error: err.message },
        { status: err.status }
      )
    }
    console.error('[payroll/store PUT]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Save failed' },
      { status: 500 }
    )
  }
}
