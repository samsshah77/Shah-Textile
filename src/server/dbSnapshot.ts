import { prisma } from '@/lib/prisma'

/**
 * In-database snapshots of the business tables.
 *
 * Taken automatically when the app starts (= right after every deploy, before any
 * user request reaches the new code) and on demand by the admin. A snapshot is a
 * plain copy of each table inside the `data_snapshots` schema, so a bad deploy or a
 * client bug can be undone with a single SQL statement — no VPS restore needed.
 *
 * This complements (does not replace) the nightly pg_dump backup to disk.
 */

export const SNAPSHOT_TABLES = [
  'floor_daily_sheets',
  'floor_looms',
  'floor_beams',
  'floor_qualities',
  'floor_yarns',
  'floor_yarn_movements',
  'floor_yarn_issuances',
  'payroll_store',
  'accounts_store',
] as const

const SCHEMA = 'data_snapshots'
/** Keep this many snapshot sets; older ones are dropped. */
export const SNAPSHOT_KEEP = 20
/** Startup snapshots are skipped if the last one is newer than this. */
export const STARTUP_MIN_GAP_HOURS = 6

function stamp(d = new Date()): string {
  // 20261019_0542 (UTC) — sortable and safe in identifiers
  return d.toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 13)
}

function q(id: string) {
  return `"${id.replace(/"/g, '""')}"`
}

async function ensureSchema() {
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS ${q(SCHEMA)}`)
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${q(SCHEMA)}."snapshot_log" (
    "id" TEXT PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "tables" JSONB NOT NULL
  )`)
}

export type SnapshotResult = { id: string; reason: string; tables: Record<string, number> }

export async function takeSnapshot(reason: string): Promise<SnapshotResult> {
  await ensureSchema()
  const id = stamp()
  const tables: Record<string, number> = {}
  for (const t of SNAPSHOT_TABLES) {
    const exists = await prisma.$queryRawUnsafe<Array<{ r: string | null }>>(
      `SELECT to_regclass($1)::text AS r`,
      `public.${t}`
    )
    if (!exists[0]?.r) continue
    const target = `${t}__${id}`
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${q(SCHEMA)}.${q(target)}`)
    await prisma.$executeRawUnsafe(
      `CREATE TABLE ${q(SCHEMA)}.${q(target)} AS TABLE public.${q(t)}`
    )
    const c = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM ${q(SCHEMA)}.${q(target)}`
    )
    tables[t] = Number(c[0]?.n ?? 0)
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO ${q(SCHEMA)}."snapshot_log" ("id","reason","tables") VALUES ($1,$2,$3::jsonb)
     ON CONFLICT ("id") DO UPDATE SET "reason" = EXCLUDED."reason", "tables" = EXCLUDED."tables"`,
    id,
    reason,
    JSON.stringify(tables)
  )
  await pruneSnapshots()
  return { id, reason, tables }
}

export async function listSnapshots(): Promise<
  Array<{ id: string; createdAt: Date; reason: string; tables: Record<string, number> }>
> {
  await ensureSchema()
  return prisma.$queryRawUnsafe(
    `SELECT "id","createdAt","reason","tables" FROM ${q(SCHEMA)}."snapshot_log" ORDER BY "id" DESC`
  )
}

async function pruneSnapshots() {
  const old = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM ${q(SCHEMA)}."snapshot_log" ORDER BY "id" DESC OFFSET ${SNAPSHOT_KEEP}`
  )
  for (const { id } of old) {
    for (const t of SNAPSHOT_TABLES) {
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${q(SCHEMA)}.${q(`${t}__${id}`)}`)
    }
    await prisma.$executeRawUnsafe(`DELETE FROM ${q(SCHEMA)}."snapshot_log" WHERE "id" = $1`, id)
  }
}

/** Called once at server start. Never throws — a failed snapshot must not stop the app. */
export async function snapshotOnStartup(): Promise<void> {
  try {
    await ensureSchema()
    const last = await prisma.$queryRawUnsafe<Array<{ createdAt: Date }>>(
      `SELECT "createdAt" FROM ${q(SCHEMA)}."snapshot_log" ORDER BY "createdAt" DESC LIMIT 1`
    )
    const lastAt = last[0]?.createdAt ? new Date(last[0].createdAt).getTime() : 0
    if (Date.now() - lastAt < STARTUP_MIN_GAP_HOURS * 3600_000) return
    const r = await takeSnapshot('app-start')
    console.log('[snapshot] taken on startup', r.id, r.tables)
  } catch (err) {
    console.error('[snapshot] startup snapshot failed (app continues)', err)
  }
}
