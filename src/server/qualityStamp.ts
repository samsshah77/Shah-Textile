import { prisma } from '@/lib/prisma'
import type { DailyLoomProductionEntry } from '@/types/production'

/**
 * Every saved sheet row carries the id of the quality run it belongs to (`qualityId`).
 *
 * The browser only knows quality *names*; names and picks can repeat across runs and
 * picks change mid-run, so name matching needs guesswork. The server resolves the id once,
 * at save time, and stores it on the row. Reports and the ledger then use the id.
 *
 * Rules (same as the ledger SQL):
 *  - unnamed rows ("—", ended stubs) get no id;
 *  - an id already on the row is kept while that quality still has the row's name;
 *  - otherwise: same name (letters/digits only, case-insensitive), preferring the same
 *    pick, then the run whose dates cover the row's day, then the newest run.
 */

export type QualityRef = {
  id: string
  name: string
  pick: number
  createdOn: string | null
  endedOn: string | null
}

export function qualityKey(name: string | null | undefined): string {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function named(name: string | null | undefined): boolean {
  const n = String(name || '').trim()
  return Boolean(n) && n !== '—' && n !== '-'
}

export function resolveQualityIdForRow(
  row: { qualityName?: string; pick?: number | string; qualityId?: string | null },
  day: string,
  qualities: QualityRef[]
): string | null {
  if (!named(row.qualityName)) return null
  const key = qualityKey(row.qualityName)
  if (!key) return null

  if (row.qualityId) {
    const kept = qualities.find((q) => q.id === row.qualityId)
    if (kept && qualityKey(kept.name) === key) return kept.id
  }

  const pick = Number(row.pick)
  const candidates = qualities.filter((q) => qualityKey(q.name) === key)
  if (candidates.length === 0) return null
  const score = (q: QualityRef) => {
    const start = q.createdOn ? q.createdOn.slice(0, 10) : ''
    const end = q.endedOn ? q.endedOn.slice(0, 10) : ''
    return [
      Number(q.pick) === pick ? 1 : 0,
      !start || start <= day ? 1 : 0,
      !end || end >= day ? 1 : 0,
    ]
  }
  return [...candidates].sort((a, b) => {
    const sa = score(a)
    const sb = score(b)
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sb[i] - sa[i]
    const ca = a.createdOn || ''
    const cb = b.createdOn || ''
    if (ca !== cb) return cb.localeCompare(ca)
    return a.id.localeCompare(b.id)
  })[0].id
}

export function stampQualityIds<T extends DailyLoomProductionEntry>(
  day: string,
  rows: T[],
  qualities: QualityRef[]
): T[] {
  return rows.map((r) => {
    const id = resolveQualityIdForRow(r, day, qualities)
    const next = { ...r } as T & { qualityId?: string }
    if (id) next.qualityId = id
    else delete next.qualityId
    return next
  })
}

export async function loadQualityRefs(db: Pick<typeof prisma, 'floorQuality'> = prisma): Promise<QualityRef[]> {
  const rows = await db.floorQuality.findMany({
    select: { id: true, name: true, pick: true, createdOn: true, endedOn: true },
  })
  return rows
}

/**
 * One-time fill for rows saved before ids existed: copies the id the ledger already
 * resolved into the row payload. Adds a key only — nothing else in the row changes.
 */
export async function backfillQualityIds(): Promise<number> {
  return prisma.$executeRawUnsafe(`
    UPDATE "floor_daily_sheets" s
    SET "payload" = s."payload" || jsonb_build_object('qualityId', p."qualityId")
    FROM "floor_production" p
    WHERE p."sheetId" = s."id"
      AND p."qualityId" IS NOT NULL
      AND NOT (s."payload" ? 'qualityId')`)
}

export async function countRowsMissingQualityId(): Promise<number> {
  const r = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`
    SELECT count(*) AS n FROM "floor_daily_sheets" s
    JOIN "floor_production" p ON p."sheetId" = s."id"
    WHERE p."qualityId" IS NOT NULL AND NOT (s."payload" ? 'qualityId')`)
  return Number(r[0]?.n ?? 0)
}
