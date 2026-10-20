import { accountsHandler, query } from '@/server/accounts/api'
import { AccountsError } from '@/server/accounts/errors'
import { isMonth } from '@/lib/accounts/util'
import * as svc from '@/server/accounts/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Daily Inward for one month: bills with lines, parties, lock state. */
export const GET = accountsHandler(async ({ req }) => {
  const month = query(req, 'month')
  if (!isMonth(month)) throw new AccountsError(400, 'month=YYYY-MM is required.')
  return { book: await svc.book(month) }
})
