import { accountsHandler, audit, body, query, versionParam } from '@/server/accounts/api'
import { AccountsError } from '@/server/accounts/errors'
import { costSave } from '@/lib/accounts/schemas'
import { isMonth } from '@/lib/accounts/util'
import * as repo from '@/server/accounts/repo'
import * as svc from '@/server/accounts/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The month's Cost Statement: payroll + purchases + petty cash live, manual lines saved. */
export const GET = accountsHandler(async ({ req }) => {
  const month = query(req, 'month')
  if (!isMonth(month)) throw new AccountsError(400, 'month=YYYY-MM is required.')
  return { statement: await svc.costStatement(month) }
})

/** Save the manual lines of a month. */
export const PUT = accountsHandler(
  async (ctx) => {
    const input = await body(ctx.req, costSave)
    const { before } = await repo.inTx((db) =>
      repo.saveCostInputs(db, input.month, input.baseVersion, input.inputs, ctx.actor.id)
    )
    await audit(ctx, 'cost.save', `cost:${input.month}`, before, input.inputs, { month: input.month })
    return { statement: await svc.costStatement(input.month) }
  },
  { write: true }
)

/** Forget this month's saved manual lines (falls back to the previous month's). */
export const DELETE = accountsHandler(
  async (ctx) => {
    const month = query(ctx.req, 'month')
    if (!isMonth(month)) throw new AccountsError(400, 'month=YYYY-MM is required.')
    const version = versionParam(ctx.req)
    const before = await repo.inTx((db) => repo.deleteCostInputs(db, month, version))
    await audit(ctx, 'cost.reset', `cost:${month}`, before, null, { month })
    return { statement: await svc.costStatement(month) }
  },
  { write: true }
)
