import { accountsHandler, audit, query } from '@/server/accounts/api'
import { AccountsError } from '@/server/accounts/errors'
import * as repo from '@/server/accounts/repo'
import { MONTH_FILES, applyMonthImport, previewMonthImport } from '@/server/accounts/monthImport'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function fileFor(month: string | null) {
  const file = month ? MONTH_FILES[month] : undefined
  if (!file) throw new AccountsError(404, `Is mahine (${month || '-'}) ki koi import file nahi.`, 'NOT_FOUND')
  return file
}

/** ?month=YYYY-MM → what the import would add (nothing is written). No month → list. */
export const GET = accountsHandler(async ({ req }) => {
  const month = query(req, 'month')
  if (!month) return { months: Object.keys(MONTH_FILES) }
  const file = fileFor(month)
  const db = await repo.db()
  return { preview: await previewMonthImport(db, file) }
})

/** { month } → add only the missing bills / petty entries (Tufail only, once). */
export const POST = accountsHandler(
  async (ctx) => {
    const raw = (await ctx.req.json().catch(() => null)) as { month?: unknown } | null
    const file = fileFor(typeof raw?.month === 'string' ? raw.month : null)
    const by = ctx.actor.name || ctx.actor.email || ctx.actor.id
    const result = await repo.inTx((db) => applyMonthImport(db, file, by))
    await audit(ctx, 'import.month', `import:${file.month}`, null, result, { month: file.month, source: file.source })
    return { result }
  },
  { write: true }
)
