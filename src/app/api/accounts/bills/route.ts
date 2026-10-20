import { accountsHandler, audit, body } from '@/server/accounts/api'
import { AccountsError } from '@/server/accounts/errors'
import { billCreate } from '@/lib/accounts/schemas'
import * as repo from '@/server/accounts/repo'

export const runtime = 'nodejs'

/** New bill (one or more lines). A new party name is created on the fly. */
export const POST = accountsHandler(
  async (ctx) => {
    const input = await body(ctx.req, billCreate)
    const bill = await repo.inTx(async (db) => {
      let partyId = input.partyId
      if (!partyId) {
        if (!input.partyName) throw new AccountsError(400, 'Party is required.')
        partyId = (await repo.findOrCreateParty(db, input.partyName, input.partyKind || 'TRADER')).id
      } else if (!(await repo.getParty(db, partyId))) {
        throw new AccountsError(404, 'Party not found.', 'NOT_FOUND')
      }
      return repo.createBill(db, { ...input, partyId, createdBy: ctx.actor.id })
    })
    await audit(ctx, 'bill.create', `bill:${bill.id}`, null, bill, { month: bill.month })
    return { bill }
  },
  { write: true }
)
