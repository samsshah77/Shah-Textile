import { accountsHandler, audit, body, query } from '@/server/accounts/api'
import { AccountsError } from '@/server/accounts/errors'
import { partyCreate } from '@/lib/accounts/schemas'
import { isMonth } from '@/lib/accounts/util'
import type { PartyKind } from '@/lib/accounts/types'
import * as repo from '@/server/accounts/repo'
import * as svc from '@/server/accounts/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Traders / Workshops directory with totals (?kind=TRADER|WORKSHOP&month=YYYY-MM|all). */
export const GET = accountsHandler(async ({ req }) => {
  const kind = query(req, 'kind')
  const month = query(req, 'month')
  if (kind && kind !== 'TRADER' && kind !== 'WORKSHOP') throw new AccountsError(400, 'kind must be TRADER or WORKSHOP.')
  if (month && month !== 'all' && !isMonth(month)) throw new AccountsError(400, 'month must be YYYY-MM or all.')
  return svc.directory((kind as PartyKind) || null, month && month !== 'all' ? month : null)
})

export const POST = accountsHandler(
  async (ctx) => {
    const input = await body(ctx.req, partyCreate)
    const party = await repo.inTx((db) => repo.createParty(db, input))
    await audit(ctx, 'party.create', `party:${party.id}`, null, party)
    return { party }
  },
  { write: true }
)
