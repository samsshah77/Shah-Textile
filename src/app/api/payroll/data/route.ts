import { prisma } from '@/lib/prisma'
import { applyFromBrowser, payrollHandler } from '@/server/payroll/api'
import { loadPayrollState, validateChangeSet, type Db } from '@/server/payroll/rows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** All salary data with each row's version. Read-only: opening a page never changes data. */
export const GET = payrollHandler(async () => loadPayrollState(prisma as unknown as Db))

/** Apply one change set (rows added / changed / removed, new row order) atomically. */
export const POST = payrollHandler(
  async (ctx) => {
    const body = (await ctx.req.json().catch(() => null)) as { requestId?: unknown } | null
    const cs = validateChangeSet(body)
    const requestId = typeof body?.requestId === 'string' ? body.requestId.slice(0, 100) : null
    return applyFromBrowser(ctx, requestId, cs)
  },
  { write: true }
)
