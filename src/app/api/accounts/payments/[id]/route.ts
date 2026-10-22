import { accountsHandler, audit, body, versionParam } from '@/server/accounts/api'
import { paymentUpdate } from '@/lib/accounts/schemas'
import * as repo from '@/server/accounts/repo'

export const runtime = 'nodejs'

/** Fix a payment's date / amount / note, or add its cheque / receipt pictures. */
export const PATCH = accountsHandler(
  async (ctx) => {
    const { baseVersion, ...patch } = await body(ctx.req, paymentUpdate)
    const { before, after } = await repo.inTx((db) => repo.updatePayment(db, ctx.params.id, baseVersion, patch))
    await audit(ctx, 'payment.update', `payment:${after.id}`, before, after, { month: after.month })
    return { payment: after }
  },
  { write: true }
)

export const DELETE = accountsHandler(
  async (ctx) => {
    const version = versionParam(ctx.req)
    const before = await repo.inTx((db) => repo.deletePayment(db, ctx.params.id, version))
    await audit(ctx, 'payment.delete', `payment:${before.id}`, before, null, { month: before.month })
    return { deleted: before.id }
  },
  { write: true }
)
