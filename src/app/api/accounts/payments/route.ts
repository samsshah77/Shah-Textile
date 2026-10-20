import { accountsHandler, audit, body } from '@/server/accounts/api'
import { paymentCreate } from '@/lib/accounts/schemas'
import * as repo from '@/server/accounts/repo'

export const runtime = 'nodejs'

/** Record money paid to a party (FOI cash / cheque). */
export const POST = accountsHandler(
  async (ctx) => {
    const input = await body(ctx.req, paymentCreate)
    const payment = await repo.inTx((db) => repo.createPayment(db, input))
    await audit(ctx, 'payment.create', `payment:${payment.id}`, null, payment, { month: payment.month })
    return { payment }
  },
  { write: true }
)
