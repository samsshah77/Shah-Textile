import { accountsHandler, audit, body } from '@/server/accounts/api'
import { lineAdd } from '@/lib/accounts/schemas'
import * as repo from '@/server/accounts/repo'

export const runtime = 'nodejs'

/** Add one more item to a bill (after a given line, or at the end). */
export const POST = accountsHandler(
  async (ctx) => {
    const input = await body(ctx.req, lineAdd)
    const { before, after } = await repo.inTx((db) =>
      repo.addLine(db, ctx.params.id, input.baseVersion, input.line, input.afterLineId)
    )
    await audit(ctx, 'bill.line.add', `bill:${after.id}`, before, after, { month: after.month })
    return { bill: after }
  },
  { write: true }
)
