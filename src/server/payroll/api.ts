import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@/server/current-user'
import { isAccountsController } from '@/lib/accountsAccess'
import { writeAudit } from '@/server/auditLog'
import { getPayrollSeedStore } from '@/data/payrollSeeds'
import type { ChangeSet } from '@/lib/payroll/sync'
import {
  PayrollError,
  applyChangeSet,
  ensurePayrollImported,
  inPayrollTx,
  loadPayrollStore,
  type AppliedChange,
  type Db,
} from '@/server/payroll/rows'

export type PayrollActor = NonNullable<Awaited<ReturnType<typeof currentUser>>>

export function ensureSalaryDataReady() {
  return ensurePayrollImported(getPayrollSeedStore as () => Record<string, unknown>)
}

/** Whole salary store ({ key: rows }) for reports such as the Cost Statement. */
export async function loadSalaryStore(): Promise<Record<string, unknown>> {
  await ensureSalaryDataReady()
  return loadPayrollStore()
}

type Ctx = { req: NextRequest; actor: PayrollActor }

/**
 * Login required; writes only for the salary controllers (Tufail / admin); old data
 * copied first; refusals become clear JSON errors.
 */
export function payrollHandler(fn: (ctx: Ctx) => Promise<unknown>, opts: { write?: boolean } = {}) {
  return async (req: NextRequest) => {
    try {
      const actor = await currentUser(req)
      if (!actor) return NextResponse.json({ ok: false, error: 'Login required.' }, { status: 401 })
      if (opts.write && !isAccountsController({ ...actor, role: actor.roleKey }))
        return NextResponse.json({ ok: false, error: 'Salary changes are limited to Tufail.' }, { status: 403 })
      await ensureSalaryDataReady()
      const data = await fn({ req, actor })
      return NextResponse.json({ ok: true, ...(data as object) })
    } catch (err) {
      if (err instanceof PayrollError)
        return NextResponse.json({ ok: false, blocked: true, error: err.message, ...(err.extra || {}) }, { status: err.status })
      console.error('[payroll api]', err)
      return NextResponse.json({ ok: false, error: 'Server error — dobara koshish karein.' }, { status: 500 })
    }
  }
}

/** Write one audit entry per changed sheet (after the transaction committed). */
export async function auditApplied(req: NextRequest, actor: PayrollActor, action: string, applied: AppliedChange) {
  for (const [sheet, { before, after }] of Object.entries(applied.audit)) {
    await writeAudit({
      req,
      actor,
      module: 'payroll',
      action,
      entityKey: sheet,
      before,
      after,
      meta: { rows: Object.keys(after).length, ...(applied.keptMonths.length ? { lockedMonthsKept: applied.keptMonths } : {}) },
    })
  }
}

// A save whose answer got lost (bad network) may be sent again; answer it from memory
// instead of applying it twice.
const recent = new Map<string, { at: number; body: unknown }>()
const RECENT_MS = 10 * 60_000
function remember(id: string, body: unknown) {
  const now = Date.now()
  recent.set(id, { at: now, body })
  if (recent.size > 500) for (const [k, v] of recent) if (now - v.at > RECENT_MS) recent.delete(k)
}

export async function applyFromBrowser(ctx: Ctx, requestId: string | null, cs: ChangeSet) {
  if (requestId) {
    const hit = recent.get(requestId)
    if (hit && Date.now() - hit.at < RECENT_MS) return hit.body
  }
  const actorName = ctx.actor.name || ctx.actor.email || ctx.actor.id
  const applied = await inPayrollTx((db: Db) => applyChangeSet(db, cs, actorName))
  await auditApplied(ctx.req, ctx.actor, 'save', applied)
  const body = {
    versions: applied.versions,
    kept: applied.kept,
    keptMonths: applied.keptMonths,
    lockedNote: applied.keptMonths.length
      ? `Locked month (${applied.keptMonths.join(', ')}) ki rows nahi badli gayin — baqi save ho gaya.`
      : undefined,
  }
  if (requestId) remember(requestId, body)
  return body
}
