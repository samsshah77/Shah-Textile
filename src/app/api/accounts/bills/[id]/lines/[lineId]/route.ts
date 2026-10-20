import { accountsHandler, audit, body, versionParam } from '@/server/accounts/api'
import { lineUpdate } from '@/lib/accounts/schemas'
import * as repo from '@/server/accounts/repo'

export const runtime = 'nodejs'

/** Edit one item (description, machine, qty, rate). Amount is recomputed on the server. */
export const PATCH = accountsHandler(
  async (ctx) => {
    const { baseVersion, ...patch } = await body(ctx.req, lineUpdate)
    const { before, after } = await repo.inTx((db) =>
      repo.updateLine(db, ctx.params.id, ctx.params.lineId, baseVersion, patch)
    )
    await audit(ctx, 'bill.line.update', `bill:${after.id}`, before, after, { month: after.month, lineId: ctx.params.lineId })
    return { bill: after }
  },
  { write: true }
)

/** Remove one item; removing the last item removes the bill. */
export const DELETE = accountsHandler(
  async (ctx) => {
    const version = versionParam(ctx.req)
    const { before, after } = await repo.inTx((db) => repo.deleteLine(db, ctx.params.id, ctx.params.lineId, version))
    await audit(ctx, after ? 'bill.line.delete' : 'bill.delete', `bill:${before.id}`, before, after, { month: before.month })
    return { bill: after, deleted: after ? null : before.id }
  },
  { write: true }
)
