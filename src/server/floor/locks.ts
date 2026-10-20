/**
 * Production month lock. A locked month cannot be changed by anyone (day sheets,
 * deleting days / parts, yarn movements dated in it). Only the admin (Javed Sir)
 * locks and unlocks.
 */
import { prisma } from '@/lib/prisma'

export class FloorLockedError extends Error {
  readonly status = 423
  constructor(month: string) {
    super(`${month} ka production mahina lock hai — tabdeeli nahi ho sakti. Javed Sir unlock kar sakte hain.`)
    this.name = 'FloorLockedError'
  }
}

export type FloorMonthLock = { month: string; locked: boolean; lockedBy: string | null; lockedAt: string | null }

export async function listMonthLocks(): Promise<FloorMonthLock[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ month: string; locked: boolean; lockedBy: string | null; lockedAt: Date | null }>>(
    `SELECT "month", "locked", "lockedBy", "lockedAt" FROM "floor_month_locks" ORDER BY "month"`
  )
  return rows.map((r) => ({ ...r, lockedAt: r.lockedAt ? new Date(r.lockedAt).toISOString() : null }))
}

export async function isMonthLocked(month: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ locked: boolean }>>(
    `SELECT "locked" FROM "floor_month_locks" WHERE "month" = $1`,
    month
  )
  return Boolean(rows[0]?.locked)
}

/** Throws 423 when the date's month is locked. */
export async function assertDateOpen(date: string): Promise<void> {
  const month = String(date || '').slice(0, 7)
  if (/^\d{4}-\d{2}$/.test(month) && (await isMonthLocked(month))) throw new FloorLockedError(month)
}

export async function setMonthLock(month: string, locked: boolean, by: string): Promise<FloorMonthLock> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "floor_month_locks" ("month","locked","lockedBy","lockedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)
     ON CONFLICT ("month") DO UPDATE SET "locked" = EXCLUDED."locked", "lockedBy" = EXCLUDED."lockedBy", "lockedAt" = EXCLUDED."lockedAt"`,
    month,
    locked,
    by
  )
  const all = await listMonthLocks()
  return all.find((l) => l.month === month) as FloorMonthLock
}
