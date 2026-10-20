import { accountsHandler, audit, versionParam } from '@/server/accounts/api'
import * as repo from '@/server/accounts/repo'

export const runtime = 'nodejs'

export const DELETE = accountsHandler(
  async (ctx) => {
    const version = versionParam(ctx.req)
    const before = await repo.inTx((db) => repo.deletePayment(db, ctx.params.id, version))
    await audit(ctx, 'payment.delete', `payment:${before.id}`, before, null, { month: before.month })
    return { deleted: before.id }
  },
  { write: true }
)
