import { accountsHandler, audit, body, query } from '@/server/accounts/api'
import { AccountsError } from '@/server/accounts/errors'
import { pettyCreate } from '@/lib/accounts/schemas'
import { isMonth } from '@/lib/accounts/util'
import * as repo from '@/server/accounts/repo'
import * as svc from '@/server/accounts/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** ?month=YYYY-MM → that month's journal with balance b/f; ?summary=1 → all months. */
export const GET = accountsHandler(async ({ req }) => {
  if (query(req, 'summary')) return svc.pettyMonths()
  const month = query(req, 'month')
  if (!isMonth(month)) throw new AccountsError(400, 'month=YYYY-MM is required.')
  return { statement: await svc.petty(month) }
})

export const POST = accountsHandler(
  async (ctx) => {
    const input = await body(ctx.req, pettyCreate)
    const entry = await repo.inTx((db) => repo.createPetty(db, input))
    await audit(ctx, 'petty.create', `petty:${entry.id}`, null, entry, { month: entry.month })
    return { entry }
  },
  { write: true }
)
