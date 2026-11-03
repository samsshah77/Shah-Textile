/**
 * Salary data storage: one database row per sheet row (and one per HR setting).
 *
 * Every row has a version. A change set from the browser is applied in ONE transaction:
 *  - a row changed elsewhere since the browser loaded it → the whole set is refused (409)
 *  - rows of a locked month are left exactly as stored and reported back ("kept")
 *  - all writes are serialized (advisory lock), so two saves can never interleave
 *
 * The old `payroll_store` table (one JSON blob per sheet) is copied here once and then
 * left untouched as a backup.
 */
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { stableJson } from '@/server/stableJson'
import {
  ALL_SHEETS,
  META_SHEET,
  MONTH_SHEETS,
  ROW_SHEETS,
  ensureRowIds,
  rowMonth,
  type ApplyResult,
  type ChangeSet,
  type Conflict,
  type PayrollOp,
} from '@/lib/payroll/sync'

export type Db = {
  $queryRawUnsafe: typeof prisma.$queryRawUnsafe
  $executeRawUnsafe: typeof prisma.$executeRawUnsafe
}

export class PayrollError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'PayrollError'
  }
}

/** Advisory lock ids: all salary writes / the one-time copy. */
const WRITE_LOCK = 7712002
const IMPORT_LOCK = 7712003

const DDL = [
  `CREATE TABLE IF NOT EXISTS "payroll_rows" (
    "sheet" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "month" TEXT,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    CONSTRAINT "payroll_rows_pkey" PRIMARY KEY ("sheet", "id")
  )`,
  `CREATE INDEX IF NOT EXISTS "payroll_rows_sheet_position_idx" ON "payroll_rows" ("sheet", "position")`,
  `CREATE INDEX IF NOT EXISTS "payroll_rows_month_idx" ON "payroll_rows" ("month")`,
  `CREATE TABLE IF NOT EXISTS "payroll_import_log" (
    "source" TEXT PRIMARY KEY,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB NOT NULL
  )`,
]

let tablesReady: Promise<void> | null = null
export function ensurePayrollTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      try {
        const sentinel = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
          `SELECT to_regclass('public.payroll_rows') IS NOT NULL AS exists`
        )
        if (sentinel[0]?.exists) return
      } catch {
        // fallback
      }
      for (const sql of DDL) await prisma.$executeRawUnsafe(sql)
    })().catch((err) => {
      tablesReady = null
      throw err
    })
  }
  return tablesReady
}

export async function inPayrollTx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  await ensurePayrollTables()
  return prisma.$transaction((tx) => fn(tx as unknown as Db), { timeout: 30000, maxWait: 15000 })
}

// ------------------------------------------------------------------ one-time copy

export type ImportReport = { ran: boolean; source: string; rows: Record<string, number>; fixedIds: number }

type BlobRow = { key: string; payload: unknown }

/** Rows to insert for a whole old-style store ({ key: array | settings object }). */
export function storeToRows(store: Record<string, unknown>): {
  rows: Array<{ sheet: string; id: string; month: string | null; position: number; payload: unknown }>
  counts: Record<string, number>
  fixedIds: number
} {
  const rows: Array<{ sheet: string; id: string; month: string | null; position: number; payload: unknown }> = []
  const counts: Record<string, number> = {}
  let fixedIds = 0
  for (const sheet of ALL_SHEETS) {
    const value = store[sheet]
    if (sheet === META_SHEET) {
      const obj = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
      let i = 0
      for (const [field, v] of Object.entries(obj)) {
        if (v === undefined) continue
        rows.push({ sheet, id: field, month: null, position: i++, payload: v })
      }
      counts[sheet] = i
      continue
    }
    const list = Array.isArray(value) ? structuredClone(value) : []
    const { rows: withIds, fixed } = ensureRowIds(list)
    fixedIds += fixed
    withIds.forEach((row, i) => rows.push({ sheet, id: row.id as string, month: rowMonth(row), position: i, payload: row }))
    counts[sheet] = withIds.length
  }
  return { rows, counts, fixedIds }
}

async function insertRows(
  db: Db,
  rows: Array<{ sheet: string; id: string; month: string | null; position: number; payload: unknown }>,
  by: string | null
) {
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK)
    await db.$executeRawUnsafe(
      `INSERT INTO "payroll_rows" ("sheet","id","month","position","payload","version","updatedBy")
       SELECT t.s, t.i, t.m, t.p, t.j::jsonb, 1, $6
       FROM unnest($1::text[], $2::text[], $3::text[], $4::float8[], $5::text[]) AS t(s, i, m, p, j)`,
      part.map((r) => r.sheet),
      part.map((r) => r.id),
      part.map((r) => r.month),
      part.map((r) => r.position),
      part.map((r) => JSON.stringify(r.payload)),
      by
    )
  }
}

let importGate: Promise<ImportReport> | null = null

/**
 * Copy the old `payroll_store` blobs into `payroll_rows` exactly once (all-or-nothing,
 * serialized across processes). A brand-new database starts from the Excel seed.
 */
export function ensurePayrollImported(seed: () => Record<string, unknown>): Promise<ImportReport> {
  if (!importGate) {
    importGate = (async () => {
      await ensurePayrollTables()
      try {
        const done = await prisma.$queryRawUnsafe<Array<{ source: string }>>(
          `SELECT "source" FROM "payroll_import_log" LIMIT 1`
        )
        if (done.length) return { ran: false, source: done[0].source, rows: {}, fixedIds: 0 }
      } catch {
        // fallback to tx
      }
      return inPayrollTx(async (db) => {
        await db.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${IMPORT_LOCK})`)
        const done = await db.$queryRawUnsafe<Array<{ source: string }>>(`SELECT "source" FROM "payroll_import_log" LIMIT 1`)
        if (done.length) return { ran: false, source: done[0].source, rows: {}, fixedIds: 0 }

        const already = await db.$queryRawUnsafe<Array<{ n: number }>>(`SELECT COUNT(*)::int AS n FROM "payroll_rows"`)
        if ((already[0]?.n || 0) > 0) {
          // Rows exist without a log entry (should never happen) — never overwrite them.
          await db.$executeRawUnsafe(
            `INSERT INTO "payroll_import_log" ("source","details") VALUES ('existing-rows', $1::jsonb)`,
            JSON.stringify({ note: 'payroll_rows already had data; nothing copied' })
          )
          return { ran: false, source: 'existing-rows', rows: {}, fixedIds: 0 }
        }

        const hasOld = await db.$queryRawUnsafe<Array<{ r: string | null }>>(`SELECT to_regclass('public.payroll_store')::text AS r`)
        const blobs = hasOld[0]?.r
          ? await db.$queryRawUnsafe<BlobRow[]>(`SELECT "key", "payload" FROM "payroll_store"`)
          : []
        const store: Record<string, unknown> = {}
        for (const b of blobs) store[b.key] = b.payload
        const fromSeed: string[] = []
        if (blobs.length === 0) {
          Object.assign(store, seed())
          fromSeed.push('all')
        } else {
          const s = seed()
          for (const sheet of ALL_SHEETS) {
            if (store[sheet] == null && s[sheet] != null) {
              store[sheet] = s[sheet]
              fromSeed.push(sheet)
            }
          }
        }
        const { rows, counts, fixedIds } = storeToRows(store)
        await insertRows(db, rows, 'copy-from-payroll_store')
        const source = blobs.length ? 'payroll_store' : 'seed'
        await db.$executeRawUnsafe(
          `INSERT INTO "payroll_import_log" ("source","details") VALUES ($1, $2::jsonb)`,
          source,
          JSON.stringify({ counts, fixedIds, fromSeed })
        )
        console.log('[payroll] copied salary data into payroll_rows', JSON.stringify({ source, counts, fixedIds, fromSeed }))
        return { ran: true, source, rows: counts, fixedIds }
      })
    })().catch((err) => {
      importGate = null
      console.error('[payroll] copying old salary data failed', err)
      throw new PayrollError(
        503,
        'Salary ka data nayi tables mein copy nahi ho saka — kuch na likhein, admin ko batayein.'
      )
    })
  }
  return importGate
}

// ------------------------------------------------------------------ read

export type PayrollState = {
  store: Record<string, unknown>
  versions: Record<string, Record<string, number>>
}

type DbRow = { sheet: string; id: string; payload: unknown; version: number; month: string | null }

export async function loadPayrollState(db: Db): Promise<PayrollState> {
  const rows = await db.$queryRawUnsafe<DbRow[]>(
    `SELECT "sheet","id","payload","version" FROM "payroll_rows" ORDER BY "sheet","position","id"`
  )
  const store: Record<string, unknown> = {}
  const versions: Record<string, Record<string, number>> = {}
  for (const sheet of ALL_SHEETS) {
    store[sheet] = sheet === META_SHEET ? {} : []
    versions[sheet] = {}
  }
  for (const r of rows) {
    if (!(r.sheet in store)) continue
    versions[r.sheet][r.id] = Number(r.version)
    if (r.sheet === META_SHEET) (store[r.sheet] as Record<string, unknown>)[r.id] = r.payload
    else (store[r.sheet] as unknown[]).push(r.payload)
  }
  return { store, versions }
}

/** Whole salary store, old shape ({ key: rows }). For reports that read salaries. */
export async function loadPayrollStore(): Promise<Record<string, unknown>> {
  await ensurePayrollTables()
  return (await loadPayrollState(prisma as unknown as Db)).store
}

export function lockedMonths(meta: unknown): Set<string> {
  const locks =
    meta && typeof meta === 'object' && !Array.isArray(meta)
      ? ((meta as Record<string, unknown>) as Record<string, { locked?: boolean } | undefined>)
      : {}
  return new Set(Object.entries(locks).filter(([, v]) => Boolean(v?.locked)).map(([m]) => m))
}

// ------------------------------------------------------------------ write

const MAX_OPS = 5000
const MAX_ROW_BYTES = 64 * 1024

export function validateChangeSet(input: unknown): ChangeSet {
  const bad = (msg: string) => new PayrollError(400, msg)
  if (!input || typeof input !== 'object') throw bad('Change set missing.')
  const { ops, order } = input as { ops?: unknown; order?: unknown }
  if (!Array.isArray(ops)) throw bad('ops must be a list.')
  if (ops.length > MAX_OPS) throw bad('Bohat zyada tabdeeliyan ek saath — chhote hisson mein save karein.')
  const out: ChangeSet = { ops: [] }
  const seen = new Set<string>()
  for (const raw of ops) {
    const o = raw as Partial<PayrollOp> & { row?: unknown }
    if (!o || (o.op !== 'put' && o.op !== 'del')) throw bad('Unknown op.')
    if (typeof o.sheet !== 'string' || !ALL_SHEETS.includes(o.sheet)) throw bad(`Unknown sheet: ${String(o.sheet)}`)
    if (typeof o.id !== 'string' || !o.id || o.id.length > 200) throw bad('Row id missing.')
    const base = Number(o.base)
    if (!Number.isInteger(base) || base < 0) throw bad('Row version missing.')
    const key = `${o.sheet}\u0000${o.id}`
    if (seen.has(key)) throw bad(`Row ${o.id} appears twice in one save.`)
    seen.add(key)
    if (o.op === 'put') {
      if (o.sheet !== META_SHEET) {
        const row = o.row as { id?: unknown } | null
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw bad(`Row ${o.id} is not an object.`)
        if (row.id !== o.id) throw bad(`Row ${o.id} has a different id inside.`)
      } else if (o.row === undefined) {
        throw bad(`Setting ${o.id} has no value.`)
      }
      if (JSON.stringify(o.row).length > MAX_ROW_BYTES) throw bad(`Row ${o.id} is too large.`)
      out.ops.push({ op: 'put', sheet: o.sheet, id: o.id, base, row: o.row })
    } else {
      out.ops.push({ op: 'del', sheet: o.sheet, id: o.id, base })
    }
  }
  if (order != null) {
    if (typeof order !== 'object' || Array.isArray(order)) throw bad('order must be an object.')
    out.order = {}
    for (const [sheet, ids] of Object.entries(order as Record<string, unknown>)) {
      if (!ROW_SHEETS.includes(sheet)) throw bad(`Cannot order sheet ${sheet}.`)
      if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) throw bad('order ids must be strings.')
      out.order[sheet] = ids as string[]
    }
  }
  return out
}

export type AppliedChange = ApplyResult & {
  /** Per sheet: old and new payload of every row that changed (for the audit log). */
  audit: Record<string, { before: Record<string, unknown>; after: Record<string, unknown> }>
}

/**
 * Apply a change set inside `db` (a transaction). Throws PayrollError 409 with the
 * conflicting rows when any row's version moved on since the browser loaded it.
 */
export async function applyChangeSet(db: Db, cs: ChangeSet, actorName: string | null): Promise<AppliedChange> {
  await db.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${WRITE_LOCK})`)
  const result: AppliedChange = { versions: {}, kept: [], keptMonths: [], audit: {} }
  if (cs.ops.length === 0 && !cs.order) return result

  const sheets = cs.ops.map((o) => o.sheet)
  const ids = cs.ops.map((o) => o.id)
  const current = cs.ops.length
    ? await db.$queryRawUnsafe<DbRow[]>(
        `SELECT p."sheet", p."id", p."payload", p."version", p."month"
         FROM "payroll_rows" p
         JOIN unnest($1::text[], $2::text[]) AS t(s, i) ON p."sheet" = t.s AND p."id" = t.i
         FOR UPDATE OF p`,
        sheets,
        ids
      )
    : []
  const byKey = new Map(current.map((r) => [`${r.sheet}\u0000${r.id}`, r]))

  const conflicts: Conflict[] = []
  for (const o of cs.ops) {
    const cur = byKey.get(`${o.sheet}\u0000${o.id}`)
    const curVersion = cur ? Number(cur.version) : 0
    if (o.op === 'del' && !cur) continue // already gone — nothing to protect
    if (curVersion !== o.base) conflicts.push({ sheet: o.sheet, id: o.id, base: o.base, current: curVersion })
  }
  if (conflicts.length) {
    throw new PayrollError(
      409,
      'Yeh data kisi aur tab ya computer se badal chuka hai — aap ki aakhri tabdeeli save nahi hui. ' +
        'Naya data load kar diya gaya hai; zaroorat ho to dobara likhein.',
      { conflicts: conflicts.slice(0, 50) }
    )
  }

  const metaLocks = await db.$queryRawUnsafe<Array<{ payload: unknown }>>(
    `SELECT "payload" FROM "payroll_rows" WHERE "sheet" = $1 AND "id" = 'monthLocks'`,
    META_SHEET
  )
  const locked = lockedMonths(metaLocks[0]?.payload)

  const positions = await db.$queryRawUnsafe<Array<{ sheet: string; maxp: number | null }>>(
    `SELECT "sheet", MAX("position") AS maxp FROM "payroll_rows" GROUP BY "sheet"`
  )
  const nextPos = new Map(positions.map((p) => [p.sheet, Number(p.maxp ?? -1) + 1]))

  const note = (sheet: string, id: string, before: unknown, after: unknown) => {
    const a = (result.audit[sheet] ||= { before: {}, after: {} })
    a.before[id] = before ?? null
    a.after[id] = after ?? null
  }
  const keptMonths = new Set<string>()

  for (const o of cs.ops) {
    const cur = byKey.get(`${o.sheet}\u0000${o.id}`)
    if (MONTH_SHEETS.includes(o.sheet) && locked.size) {
      const oldM = cur?.month || null
      const newM = o.op === 'put' ? rowMonth(o.row) : null
      const hit = [oldM, newM].find((m) => m && locked.has(m))
      if (hit) {
        keptMonths.add(hit)
        result.kept.push({ sheet: o.sheet, id: o.id, row: cur ? cur.payload : null, version: cur ? Number(cur.version) : 0 })
        continue
      }
    }
    const v = (result.versions[o.sheet] ||= {})
    if (o.op === 'del') {
      if (!cur) {
        v[o.id] = null
        continue
      }
      await db.$executeRawUnsafe(`DELETE FROM "payroll_rows" WHERE "sheet" = $1 AND "id" = $2`, o.sheet, o.id)
      v[o.id] = null
      note(o.sheet, o.id, cur.payload, null)
      continue
    }
    const json = JSON.stringify(o.row)
    const month = o.sheet === META_SHEET ? null : rowMonth(o.row)
    if (cur) {
      if (stableJson(cur.payload) === stableJson(o.row)) {
        v[o.id] = Number(cur.version)
        continue
      }
      await db.$executeRawUnsafe(
        `UPDATE "payroll_rows" SET "payload" = $3::jsonb, "month" = $4, "version" = "version" + 1,
           "updatedAt" = CURRENT_TIMESTAMP, "updatedBy" = $5
         WHERE "sheet" = $1 AND "id" = $2`,
        o.sheet,
        o.id,
        json,
        month,
        actorName
      )
      v[o.id] = Number(cur.version) + 1
      note(o.sheet, o.id, cur.payload, o.row)
    } else {
      const pos = nextPos.get(o.sheet) ?? 0
      nextPos.set(o.sheet, pos + 1)
      await db.$executeRawUnsafe(
        `INSERT INTO "payroll_rows" ("sheet","id","month","position","payload","version","updatedBy")
         VALUES ($1, $2, $3, $4, $5::jsonb, 1, $6)`,
        o.sheet,
        o.id,
        month,
        pos,
        json,
        actorName
      )
      v[o.id] = 1
      note(o.sheet, o.id, null, o.row)
    }
  }

  for (const [sheet, order] of Object.entries(cs.order || {})) {
    // Listed rows take positions 0..n-1 in the given order; any row not listed
    // (e.g. a locked row kept above) keeps its relative place after them.
    await db.$executeRawUnsafe(
      `WITH listed AS (
         SELECT t.id, t.idx FROM unnest($2::text[]) WITH ORDINALITY AS t(id, idx)
       ), ranked AS (
         SELECT p."id", COALESCE(l.idx - 1, $3 + ROW_NUMBER() OVER (ORDER BY p."position", p."id")) AS np
         FROM "payroll_rows" p LEFT JOIN listed l ON l.id = p."id"
         WHERE p."sheet" = $1
       )
       UPDATE "payroll_rows" p SET "position" = r.np FROM ranked r
       WHERE p."sheet" = $1 AND p."id" = r."id" AND p."position" IS DISTINCT FROM r.np`,
      sheet,
      order,
      order.length
    )
  }

  result.keptMonths = [...keptMonths].sort()
  return result
}

/** Rows (current server copy) for the given keys — used after a refused save. */
export async function readRows(db: Db, keys: Array<{ sheet: string; id: string }>): Promise<DbRow[]> {
  if (!keys.length) return []
  return db.$queryRawUnsafe<DbRow[]>(
    `SELECT p."sheet", p."id", p."payload", p."version", p."month" FROM "payroll_rows" p
     JOIN unnest($1::text[], $2::text[]) AS t(s, i) ON p."sheet" = t.s AND p."id" = t.i`,
    keys.map((k) => k.sheet),
    keys.map((k) => k.id)
  )
}

export function newRequestId(): string {
  return randomUUID()
}
