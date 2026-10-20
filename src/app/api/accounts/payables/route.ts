import { accountsHandler, query } from '@/server/accounts/api'
import { AccountsError } from '@/server/accounts/errors'
import { isDate } from '@/lib/accounts/util'
import * as svc from '@/server/accounts/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A/P Synopsis: ?asOf=YYYY-MM-DD (default today) → every supplier's payable balance. */
export const GET = accountsHandler(async ({ req }) => {
  const asOf = query(req, 'asOf') || new Date().toISOString().slice(0, 10)
  if (!isDate(asOf)) throw new AccountsError(400, 'asOf=YYYY-MM-DD chahiye.')
  return { report: await svc.payables(asOf) }
})
