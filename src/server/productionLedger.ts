import { prisma } from '@/lib/prisma'

/**
 * Production ledger — a normalized, query-friendly copy of the daily loom sheets.
 *
 * `floor_daily_sheets.payload` (JSON) stays the source of truth: the browser reads and
 * writes it exactly as before. After every sheet write the server re-derives that day's
 * rows into `floor_production`, which has real columns (meters, quality id, pick …) so
 * reports can be computed with plain SQL instead of browser-side heuristics.
 *
 * Safety properties:
 *  - Additive only: a new table; nothing in the existing tables is altered or deleted.
 *  - Rebuildable: the whole ledger can be regenerated from the sheets at any time
 *    (it is rebuilt on every app start), so it can never drift permanently.
 *  - Never blocks a save: every refresh is wrapped and only logs on failure.
 *
 * Quality linking: sheet rows carry only `qualityName` + `pick`. A row is linked to the
 * quality with the same name (case/space-insensitive), preferring the same pick, then
 * the quality whose run (createdOn … endedOn) covers the row's date, then the newest.
 */

export const LEDGER_TABLE = 'floor_production'

export const LEDGER_DDL = [
  `CREATE TABLE IF NOT EXISTS "floor_production" (
    "date" DATE NOT NULL,
    "loomNumber" INTEGER NOT NULL,
    "segmentIndex" INTEGER NOT NULL DEFAULT 1,
    "sheetId" TEXT NOT NULL,
    "qualityId" TEXT,
    "qualityName" TEXT NOT NULL DEFAULT '',
    "pick" NUMERIC,
    "reed" NUMERIC,
    "fabricType" TEXT,
    "status" TEXT,
    "shiftAMeters" NUMERIC NOT NULL DEFAULT 0,
    "shiftBMeters" NUMERIC NOT NULL DEFAULT 0,
    "totalMeters" NUMERIC NOT NULL DEFAULT 0,
    "theoreticalMeters" NUMERIC,
    "efficiencyPct" NUMERIC,
    "runningHours" NUMERIC,
    "rpm" NUMERIC,
    "stopLossMeters" NUMERIC,
    "approvalStatus" TEXT,
    "sourceUpdatedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "floor_production_pkey" PRIMARY KEY ("date", "loomNumber", "segmentIndex")
  )`,
  `CREATE INDEX IF NOT EXISTS "floor_production_quality_idx" ON "floor_production"("qualityId", "date")`,
  `CREATE INDEX IF NOT EXISTS "floor_production_loom_idx" ON "floor_production"("loomNumber", "date")`,
]

/** payload->>'key' as NUMERIC, or NULL when empty / not a number (never throws). */
function num(key: string): string {
  const v = `(s.payload->>'${key}')`
  return `(CASE WHEN btrim(${v}) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN btrim(${v})::numeric END)`
}

const ISO_DATE = `s."date" ~ '^\\d{4}-\\d{2}-\\d{2}$'`

/**
 * INSERT … SELECT that derives ledger rows from floor_daily_sheets.
 * `where` is an extra SQL condition on the sheets alias `s` (use $1 for a date param).
 */
export function ledgerInsertSql(where = 'TRUE'): string {
  const a = `COALESCE(${num('shiftAMeters')}, 0)`
  const b = `COALESCE(${num('shiftBMeters')}, 0)`
  const total = `(CASE WHEN COALESCE(${num('totalMeters')}, 0) > 0 THEN ${num('totalMeters')} ELSE ${a} + ${b} END)`
  return `INSERT INTO "floor_production" (
    "date","loomNumber","segmentIndex","sheetId","qualityId","qualityName","pick","reed",
    "fabricType","status","shiftAMeters","shiftBMeters","totalMeters","theoreticalMeters",
    "efficiencyPct","runningHours","rpm","stopLossMeters","approvalStatus","sourceUpdatedAt"
  )
  SELECT
    s."date"::date, s."loomNumber", s."segmentIndex", s."id",
    COALESCE(pq."id", qm."id"),
    COALESCE(btrim(s.payload->>'qualityName'), ''),
    ${num('pick')}, ${num('reed')},
    NULLIF(s.payload->>'fabricType', ''), NULLIF(s.payload->>'status', ''),
    ${a}, ${b}, ${total},
    ${num('theoretical24h')}, ${num('efficiencyPercentage')}, ${num('runningHours')},
    ${num('rpm')}, ${num('stopLossMeters')},
    NULLIF(s.payload->>'approvalStatus', ''), s."updatedAt"
  FROM "floor_daily_sheets" s
  -- a qualityId stored on the row itself wins, if it still exists
  LEFT JOIN "floor_qualities" pq ON pq."id" = NULLIF(s.payload->>'qualityId', '')
  LEFT JOIN LATERAL (
    SELECT q."id" FROM "floor_qualities" q
    WHERE lower(btrim(q."name")) = lower(btrim(s.payload->>'qualityName'))
    ORDER BY
      (q."pick"::numeric IS NOT DISTINCT FROM ${num('pick')}) DESC,
      (q."createdOn" IS NULL OR q."createdOn" <= s."date") DESC,
      (q."endedOn" IS NULL OR q."endedOn" >= s."date") DESC,
      q."createdOn" DESC NULLS LAST,
      q."id"
    LIMIT 1
  ) qm ON TRUE
  WHERE ${ISO_DATE} AND (${where})`
}

let ddlDone = false

export async function ensureLedgerTable(): Promise<void> {
  if (ddlDone) return
  for (const stmt of LEDGER_DDL) await prisma.$executeRawUnsafe(stmt)
  ddlDone = true
}

/** Re-derive one day. Never throws. */
export async function refreshProductionDay(dateStr: string): Promise<void> {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return
    await ensureLedgerTable()
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`DELETE FROM "floor_production" WHERE "date" = $1::date`, dateStr),
      prisma.$executeRawUnsafe(ledgerInsertSql(`s."date" = $1`), dateStr),
    ])
  } catch (err) {
    console.error('[ledger] refresh day failed (sheet save is unaffected)', dateStr, err)
  }
}

/** Re-derive everything (startup, quality renames). Never throws. */
export async function rebuildProductionLedger(): Promise<number | null> {
  try {
    await ensureLedgerTable()
    const [, inserted] = await prisma.$transaction([
      prisma.$executeRawUnsafe(`DELETE FROM "floor_production"`),
      prisma.$executeRawUnsafe(ledgerInsertSql()),
    ])
    return inserted
  } catch (err) {
    console.error('[ledger] full rebuild failed (app continues)', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type ProductionReport = {
  from: string
  to: string
  totals: { rows: number; meters: number; shiftA: number; shiftB: number; days: number }
  byDay: Array<{ date: string; rows: number; meters: number; shiftA: number; shiftB: number; avgEfficiency: number | null }>
  byQuality: Array<{ qualityId: string | null; qualityName: string; pick: number | null; rows: number; looms: number; meters: number; firstDate: string; lastDate: string }>
  byLoom: Array<{ loomNumber: number; rows: number; meters: number; avgEfficiency: number | null }>
  /** Sheet rows whose quality name matches no quality in the master. */
  unlinked: Array<{ date: string; loomNumber: number; qualityName: string; meters: number }>
  /** Rows dated before their quality's start date or (with meters) after its end date. */
  outsideRun: Array<{ date: string; loomNumber: number; qualityName: string; meters: number; startedOn: string | null; endedOn: string | null }>
  /** Days where ledger and raw sheets disagree — should always be empty. */
  mismatches: Array<{ date: string; sheetRows: number; ledgerRows: number; sheetMeters: number; ledgerMeters: number }>
}

const n = (v: unknown) => (v == null ? 0 : Number(v))
const nn = (v: unknown) => (v == null ? null : Math.round(Number(v) * 10) / 10)

export async function productionReport(from: string, to: string): Promise<ProductionReport> {
  await ensureLedgerTable()
  const range = `"date" BETWEEN $1::date AND $2::date`

  const byDay = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT to_char("date",'YYYY-MM-DD') AS date, count(*) AS rows, sum("totalMeters") AS meters,
            sum("shiftAMeters") AS a, sum("shiftBMeters") AS b,
            avg("efficiencyPct") FILTER (WHERE "totalMeters" > 0) AS eff
     FROM "floor_production" WHERE ${range} GROUP BY "date" ORDER BY "date"`,
    from, to
  )
  const byQuality = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT p."qualityId", COALESCE(q."name", p."qualityName") AS name, min(p."pick") AS pick,
            count(*) AS rows, count(DISTINCT p."loomNumber") AS looms, sum(p."totalMeters") AS meters,
            to_char(min(p."date"),'YYYY-MM-DD') AS first, to_char(max(p."date"),'YYYY-MM-DD') AS last
     FROM "floor_production" p LEFT JOIN "floor_qualities" q ON q."id" = p."qualityId"
     WHERE p.${range} AND p."qualityName" NOT IN ('', '-', '—')
     GROUP BY p."qualityId", COALESCE(q."name", p."qualityName")
     ORDER BY meters DESC NULLS LAST`,
    from, to
  )
  const byLoom = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT "loomNumber", count(*) AS rows, sum("totalMeters") AS meters,
            avg("efficiencyPct") FILTER (WHERE "totalMeters" > 0) AS eff
     FROM "floor_production" WHERE ${range} GROUP BY "loomNumber" ORDER BY "loomNumber"`,
    from, to
  )
  const unlinked = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT to_char("date",'YYYY-MM-DD') AS date, "loomNumber", "qualityName", "totalMeters" AS meters
     FROM "floor_production"
     WHERE ${range} AND "qualityId" IS NULL AND "qualityName" NOT IN ('', '-', '—')
     ORDER BY "date", "loomNumber" LIMIT 500`,
    from, to
  )
  const outsideRun = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT to_char(p."date",'YYYY-MM-DD') AS date, p."loomNumber", p."qualityName", p."totalMeters" AS meters,
            q."createdOn" AS started, q."endedOn" AS ended
     FROM "floor_production" p JOIN "floor_qualities" q ON q."id" = p."qualityId"
     WHERE p.${range}
       AND ( (q."createdOn" ~ '^\\d{4}-\\d{2}-\\d{2}$' AND p."date" < q."createdOn"::date)
          OR (q."endedOn" ~ '^\\d{4}-\\d{2}-\\d{2}$' AND p."date" > q."endedOn"::date AND p."totalMeters" > 0) )
     ORDER BY p."date", p."loomNumber" LIMIT 500`,
    from, to
  )
  const mismatches = await reconcile(from, to)

  const days = byDay.map((r) => ({
    date: String(r.date),
    rows: n(r.rows),
    meters: n(r.meters),
    shiftA: n(r.a),
    shiftB: n(r.b),
    avgEfficiency: nn(r.eff),
  }))
  return {
    from,
    to,
    totals: {
      rows: days.reduce((s, d) => s + d.rows, 0),
      meters: days.reduce((s, d) => s + d.meters, 0),
      shiftA: days.reduce((s, d) => s + d.shiftA, 0),
      shiftB: days.reduce((s, d) => s + d.shiftB, 0),
      days: days.length,
    },
    byDay: days,
    byQuality: byQuality.map((r) => ({
      qualityId: (r.qualityId as string) ?? null,
      qualityName: String(r.name),
      pick: r.pick == null ? null : Number(r.pick),
      rows: n(r.rows),
      looms: n(r.looms),
      meters: n(r.meters),
      firstDate: String(r.first),
      lastDate: String(r.last),
    })),
    byLoom: byLoom.map((r) => ({
      loomNumber: n(r.loomNumber),
      rows: n(r.rows),
      meters: n(r.meters),
      avgEfficiency: nn(r.eff),
    })),
    unlinked: unlinked.map((r) => ({
      date: String(r.date),
      loomNumber: n(r.loomNumber),
      qualityName: String(r.qualityName),
      meters: n(r.meters),
    })),
    outsideRun: outsideRun.map((r) => ({
      date: String(r.date),
      loomNumber: n(r.loomNumber),
      qualityName: String(r.qualityName),
      meters: n(r.meters),
      startedOn: (r.started as string) ?? null,
      endedOn: (r.ended as string) ?? null,
    })),
    mismatches,
  }
}

/** Compare the ledger with the raw JSON sheets, day by day. */
export async function reconcile(from: string, to: string): Promise<ProductionReport['mismatches']> {
  const a = `COALESCE(${num('shiftAMeters')}, 0)`
  const b = `COALESCE(${num('shiftBMeters')}, 0)`
  const total = `(CASE WHEN COALESCE(${num('totalMeters')}, 0) > 0 THEN ${num('totalMeters')} ELSE ${a} + ${b} END)`
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `WITH sh AS (
       SELECT s."date" AS d, count(*) AS r, sum(${total}) AS m FROM "floor_daily_sheets" s
       WHERE ${ISO_DATE} AND s."date" BETWEEN $1 AND $2 GROUP BY s."date"
     ), lg AS (
       SELECT to_char("date",'YYYY-MM-DD') AS d, count(*) AS r, sum("totalMeters") AS m
       FROM "floor_production" WHERE "date" BETWEEN $1::date AND $2::date GROUP BY "date"
     )
     SELECT COALESCE(sh.d, lg.d) AS date, COALESCE(sh.r,0) AS sr, COALESCE(lg.r,0) AS lr,
            COALESCE(sh.m,0) AS sm, COALESCE(lg.m,0) AS lm
     FROM sh FULL JOIN lg ON lg.d = sh.d
     WHERE COALESCE(sh.r,0) <> COALESCE(lg.r,0) OR COALESCE(sh.m,0) <> COALESCE(lg.m,0)
     ORDER BY 1`,
    from, to
  )
  return rows.map((r) => ({
    date: String(r.date),
    sheetRows: n(r.sr),
    ledgerRows: n(r.lr),
    sheetMeters: n(r.sm),
    ledgerMeters: n(r.lm),
  }))
}
