import { accountsHandler, audit, body, query } from '@/server/accounts/api'
import { AccountsError } from '@/server/accounts/errors'
import { partyUpdate } from '@/lib/accounts/schemas'
import { isMonth } from '@/lib/accounts/util'
import * as repo from '@/server/accounts/repo'
import * as svc from '@/server/accounts/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Date-wise ledger of one party (id or slug), for a month or all months. */
export const GET = accountsHandler(async ({ req, params }) => {
  const month = query(req, 'month')
  if (month && month !== 'all' && !isMonth(month)) throw new AccountsError(400, 'month must be YYYY-MM or all.')
  return { ledger: await svc.ledger(params.id, month && month !== 'all' ? month : null) }
})

/** Rename, change Trader/Workshop, cost block, remarks, or remove (active=false). */
export const PATCH = accountsHandler(
  async (ctx) => {
    const { baseVersion, ...patch } = await body(ctx.req, partyUpdate)
    const before = await repo.getParty(await repo.db(), ctx.params.id)
    const party = await repo.inTx((db) => repo.updateParty(db, ctx.params.id, baseVersion, patch))
    await audit(ctx, patch.active === false ? 'party.remove' : 'party.update', `party:${party.id}`, before, party)
    return { party }
  },
  { write: true }
)
