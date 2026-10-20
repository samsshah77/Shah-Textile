import { z } from 'zod'
import { accountsHandler, audit, body, ensureImported, resetImportGate } from '@/server/accounts/api'
import { dbAccountsGetAll, dbAccountsSave } from '@/server/accountsDb'
import { isAccountsStoreKey } from '@/lib/accountsKeys'

export const runtime = 'nodejs'

const schema = z.object({ entries: z.record(z.string(), z.unknown()) })

/**
 * Accounts data that only lived in one browser (saved before the server table existed).
 * Keys the server does not have yet are kept in the old store and copied into the new
 * tables; keys the server already has are ignored (the server copy wins).
 */
export const POST = accountsHandler(
  async (ctx) => {
    const { entries } = await body(ctx.req, schema)
    const have = await dbAccountsGetAll()
    const added: string[] = []
    for (const [key, value] of Object.entries(entries)) {
      if (!isAccountsStoreKey(key) || key in have || value == null) continue
      await dbAccountsSave(key, value)
      added.push(key)
    }
    if (!added.length) return { added }
    await audit(ctx, 'legacy.upload', 'accounts:legacy', null, null, { keys: added })
    resetImportGate()
    const result = await ensureImported()
    return { added, result }
  },
  { write: true }
)
