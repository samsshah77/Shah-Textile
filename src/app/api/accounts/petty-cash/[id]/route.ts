import { accountsHandler, audit, body, versionParam } from '@/server/accounts/api'
import { pettyUpdate } from '@/lib/accounts/schemas'
import * as repo from '@/server/accounts/repo'

export const runtime = 'nodejs'

export const PATCH = accountsHandler(
  async (ctx) => {
    const { baseVersion, ...patch } = await body(ctx.req, pettyUpdate)
    const { before, after } = await repo.inTx((db) => repo.updatePetty(db, ctx.params.id, baseVersion, patch))
    await audit(ctx, 'petty.update', `petty:${after.id}`, before, after, { month: after.month })
    return { entry: after }
  },
  { write: true }
)

export const DELETE = accountsHandler(
  async (ctx) => {
    const version = versionParam(ctx.req)
    const before = await repo.inTx((db) => repo.deletePetty(db, ctx.params.id, version))
    await audit(ctx, 'petty.delete', `petty:${before.id}`, before, null, { month: before.month })
    return { deleted: before.id }
  },
  { write: true }
)
