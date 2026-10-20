import { accountsHandler, audit, body } from '@/server/accounts/api'
import { lockSet } from '@/lib/accounts/schemas'
import * as repo from '@/server/accounts/repo'

export const runtime = 'nodejs'

/** Close (lock) or reopen an accounts month. A locked month cannot be changed. */
export const PUT = accountsHandler(
  async (ctx) => {
    const input = await body(ctx.req, lockSet)
    const before = await repo.getLock(await repo.db(), input.month)
    const lock = await repo.inTx((db) => repo.setLock(db, input.month, input.locked, ctx.actor.name || ctx.actor.id))
    await audit(ctx, input.locked ? 'month.lock' : 'month.unlock', `lock:${input.month}`, before, lock)
    return { lock }
  },
  { write: true }
)
