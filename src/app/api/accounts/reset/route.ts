import { accountsHandler, audit } from '@/server/accounts/api'
import { AccountsError } from '@/server/accounts/errors'
import * as repo from '@/server/accounts/repo'
import { takeSnapshot } from '@/server/dbSnapshot'
import { applyReset, previewReset } from '@/server/accounts/resetFromFiles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** What the July–September reset would remove and add (nothing is written). */
export const GET = accountsHandler(async () => {
  const db = await repo.db()
  return { preview: await previewReset(db) }
})

/** { confirm: "RESET" } → snapshot, then remove / replace in one transaction (Tufail, once). */
export const POST = accountsHandler(
  async (ctx) => {
    const raw = (await ctx.req.json().catch(() => null)) as { confirm?: unknown } | null
    if (raw?.confirm !== 'RESET') throw new AccountsError(400, 'Tasdeeq ke liye RESET likhna zaroori hai.')
    const db = await repo.db()
    const pre = await previewReset(db)
    if (pre.done) throw new AccountsError(409, `Ye reset ${pre.done.at} ko ho chuka hai — dobara nahi hoga.`, 'CONFLICT')
    if (pre.lockedMonths.length) throw new AccountsError(423, `In mahinon ka lock pehle kholein: ${pre.lockedMonths.join(', ')}.`, 'LOCKED')
    const snapshot = await takeSnapshot('before accounts reset to Jul–Sep files')
    const by = ctx.actor.name || ctx.actor.email || ctx.actor.id
    const result = await repo.inTx((tx) => applyReset(tx, by), 120000)
    await audit(ctx, 'accounts.reset', 'reset:2026-07..09', pre, result, { snapshot: snapshot.id })
    return { result, snapshot: snapshot.id }
  },
  { write: true }
)
