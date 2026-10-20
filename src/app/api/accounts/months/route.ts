import { accountsHandler } from '@/server/accounts/api'
import * as svc from '@/server/accounts/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Months that have accounts data (plus the running month), newest first. */
export const GET = accountsHandler(async () => svc.months())
