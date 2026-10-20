import { accountsHandler, audit, body, versionParam } from '@/server/accounts/api'
import { billUpdate } from '@/lib/accounts/schemas'
import * as repo from '@/server/accounts/repo'

export const runtime = 'nodejs'

/** Change bill header (date, bill no., inward no., party, month) and/or all its lines. */
export const PATCH = accountsHandler(
  async (ctx) => {
    const { baseVersion, ...patch } = await body(ctx.req, billUpdate)
    const { before, after } = await repo.inTx((db) => repo.updateBill(db, ctx.params.id, baseVersion, patch))
    await audit(ctx, 'bill.update', `bill:${after.id}`, before, after, { month: after.month })
    return { bill: after }
  },
  { write: true }
)

export const DELETE = accountsHandler(
  async (ctx) => {
    const version = versionParam(ctx.req)
    const before = await repo.inTx((db) => repo.deleteBill(db, ctx.params.id, version))
    await audit(ctx, 'bill.delete', `bill:${before.id}`, before, null, { month: before.month })
    return { deleted: before.id }
  },
  { write: true }
)
