import { NextRequest, NextResponse } from 'next/server'
import { ZodError, type ZodType } from 'zod'
import { currentUser } from '@/server/current-user'
import { isAccountsController } from '@/lib/accountsAccess'
import { writeAudit } from '@/server/auditLog'
import { dbAccountsGetAll } from '@/server/accountsDb'
import { ensureFloorPayrollTables } from '@/server/ensureFloorPayrollTables'
import { AccountsError } from '@/server/accounts/errors'
import { applyImport, planImport, type ImportResult } from '@/server/accounts/migrate'
import { inTx } from '@/server/accounts/repo'

export type Actor = NonNullable<Awaited<ReturnType<typeof currentUser>>>

let imported: Promise<ImportResult | null> | null = null

/**
 * Copy the old accounts data into the new tables, once per process (and only the
 * sources never copied before — see migrate.ts). Serialized across processes with a
 * Postgres advisory lock.
 */
export function ensureImported(): Promise<ImportResult | null> {
  if (!imported) {
    imported = (async () => {
      await ensureFloorPayrollTables()
      const store = await dbAccountsGetAll()
      return inTx(async (db) => {
        await db.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(7712001)`)
        const res = await applyImport(db, planImport(store))
        if (res.ran) console.log('[accounts] copied old data into new tables', JSON.stringify(res))
        return res
      })
    })().catch((err) => {
      imported = null
      console.error('[accounts] copying old data failed', err)
      // Fail closed: an empty book would invite people to re-enter bills that already exist.
      throw new AccountsError(
        503,
        'Accounts ka purana data nayi tables mein copy nahi ho saka — kuch na likhein, admin ko batayein.',
        'CONFLICT'
      )
    })
  }
  return imported
}

/** Re-run the copy (after a browser uploaded data that only it had). */
export function resetImportGate(): void {
  imported = null
}

type Ctx = { req: NextRequest; actor: Actor; params: Record<string, string> }

/**
 * Wraps an accounts API handler: login required, writes only for Admin / Accountant,
 * old data copied first, and expected refusals turned into clear JSON errors.
 */
export function accountsHandler(
  fn: (ctx: Ctx) => Promise<unknown>,
  opts: { write?: boolean } = {}
) {
  return async (req: NextRequest, route?: { params?: Promise<Record<string, string>> }) => {
    try {
      const actor = await currentUser(req)
      if (!actor) return NextResponse.json({ ok: false, error: 'Login required.' }, { status: 401 })
      if (opts.write && !isAccountsController({ ...actor, role: actor.roleKey }))
        return NextResponse.json({ ok: false, error: 'Accounts mein tabdeeli sirf Admin / Accountant kar sakte hain.' }, { status: 403 })
      await ensureImported()
      const params = (await route?.params) || {}
      const data = await fn({ req, actor, params })
      return NextResponse.json({ ok: true, ...(data as object) })
    } catch (err) {
      if (err instanceof AccountsError)
        return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: err.status })
      if (err instanceof ZodError)
        return NextResponse.json(
          { ok: false, error: err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '), code: 'BAD_INPUT' },
          { status: 400 }
        )
      console.error('[accounts api]', err)
      return NextResponse.json({ ok: false, error: 'Server error — dobara koshish karein.' }, { status: 500 })
    }
  }
}

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new AccountsError(400, 'Invalid JSON body.')
  }
  return schema.parse(raw)
}

export function query(req: NextRequest, key: string): string | null {
  return req.nextUrl.searchParams.get(key)
}

export function versionParam(req: NextRequest): number {
  const v = Number(query(req, 'version'))
  if (!Number.isInteger(v) || v < 0) throw new AccountsError(400, 'version is required.')
  return v
}

export function audit(ctx: Ctx, action: string, entityKey: string, before: unknown, after: unknown, meta?: Record<string, unknown>) {
  return writeAudit({
    req: ctx.req,
    actor: { id: ctx.actor.id, name: ctx.actor.name, roleKey: ctx.actor.roleKey },
    module: 'accounts',
    action,
    entityKey,
    before,
    after,
    meta,
  })
}
