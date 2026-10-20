import { NextRequest } from 'next/server'
import { takeSnapshot } from '@/server/dbSnapshot'
import { auditApplied, payrollHandler } from '@/server/payroll/api'
import {
  PayrollError,
  applyChangeSet,
  inPayrollTx,
  loadPayrollState,
  lockedMonths,
  type Db,
} from '@/server/payroll/rows'
import { META_SHEET, diffSheet, mergeChangeSets, sheetStateFrom } from '@/lib/payroll/sync'
import { applySalariedMonthGenerateToStore } from '@/services/payrollService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Create Staff / Company Contract / Efficiency rows of a new month from the roster,
 * in one transaction. Settings fields the generator does not send (month locks,
 * delete-markers, petty-cash overrides) stay exactly as they are.
 */
export const POST = payrollHandler(
  async (ctx) => {
    const body = (await ctx.req.json().catch(() => ({}))) as { month?: unknown }
    const month = String(body?.month || '').trim()
    if (!/^\d{4}-\d{2}$/.test(month)) throw new PayrollError(400, 'Month format YYYY-MM chahiye.')

    // Safety copy of all salary tables before a month is generated (never blocks).
    try {
      await takeSnapshot(`before-generate-${month}`)
    } catch (snapErr) {
      console.error('[payroll/generate-month] snapshot failed (continuing)', snapErr)
    }

    const actorName = ctx.actor.name || ctx.actor.email || ctx.actor.id
    const { result, applied } = await inPayrollTx(async (db: Db) => {
      await db.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(7712002)`)
      const state = await loadPayrollState(db)
      const meta = state.store[META_SHEET] as { monthLocks?: unknown }
      if (lockedMonths(meta?.monthLocks).has(month))
        throw new PayrollError(423, `${month} locked hai — generate se pehle unlock karein.`)
      const result = applySalariedMonthGenerateToStore(structuredClone(state.store), month)
      if (!result.ok) throw new PayrollError(400, result.message, { staff: 0, contract: 0 })
      const cs = mergeChangeSets(
        Object.entries(result.patch).map(([sheet, value]) =>
          diffSheet(sheet, sheetStateFrom(sheet, state.store[sheet], state.versions[sheet]), value)
        )
      )
      const applied = await applyChangeSet(db, cs, actorName)
      return { result, applied }
    })
    await auditApplied(ctx.req as NextRequest, ctx.actor, `generate:${month}`, applied)
    return { message: result.message, staff: result.staff, contract: result.contract, month }
  },
  { write: true }
)
