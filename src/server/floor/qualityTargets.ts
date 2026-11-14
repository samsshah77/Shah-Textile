/**
 * Active Qualities → Target (meters) per quality. Balance = Target − meters produced.
 * Kept in its own small table, created at runtime (CREATE … IF NOT EXISTS), so the
 * quality records themselves are not touched.
 */
import { prisma } from '@/lib/prisma'

const DDL = [
  `CREATE TABLE IF NOT EXISTS "floor_quality_targets" (
    "qualityId" TEXT PRIMARY KEY,
    "targetMeters" DOUBLE PRECISION NOT NULL,
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
]

let ready: Promise<void> | null = null
function ensureTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const sql of DDL) await prisma.$executeRawUnsafe(sql)
    })().catch((e) => {
      ready = null
      throw e
    })
  }
  return ready
}

export class QualityTargetError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/** qualityId → target meters. */
export async function listQualityTargets(): Promise<Record<string, number>> {
  await ensureTable()
  const rows = await prisma.$queryRawUnsafe<Array<{ qualityId: string; targetMeters: number }>>(
    `SELECT "qualityId", "targetMeters" FROM "floor_quality_targets"`
  )
  const out: Record<string, number> = {}
  for (const r of rows) out[r.qualityId] = Number(r.targetMeters) || 0
  return out
}

/** Set (meters > 0) or clear (null / 0) the target of one quality. */
export async function setQualityTarget(qualityId: string, meters: number | null, by: string): Promise<number | null> {
  await ensureTable()
  const id = String(qualityId || '').trim()
  if (!id) throw new QualityTargetError('Quality not found.')
  const exists = await prisma.floorQuality.findUnique({ where: { id }, select: { id: true } })
  if (!exists) throw new QualityTargetError('Quality not found. Please refresh the page.', 404)
  const n = meters == null ? 0 : Math.round(Number(meters) * 100) / 100
  if (!Number.isFinite(n) || n < 0 || n > 1e8) throw new QualityTargetError('Enter the target in meters.')
  if (n === 0) {
    await prisma.$executeRawUnsafe(`DELETE FROM "floor_quality_targets" WHERE "qualityId" = $1`, id)
    return null
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO "floor_quality_targets" ("qualityId","targetMeters","updatedBy","updatedAt")
     VALUES ($1,$2,$3,CURRENT_TIMESTAMP)
     ON CONFLICT ("qualityId") DO UPDATE SET "targetMeters" = EXCLUDED."targetMeters",
       "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = CURRENT_TIMESTAMP`,
    id,
    n,
    by
  )
  return n
}
