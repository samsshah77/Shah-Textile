/**
 * Tables / columns the row-level floor saving needs. Idempotent, run once per process
 * (and retried on the next request if it failed).
 */
import { prisma } from '@/lib/prisma'
import { ensureFloorPayrollTables } from '@/server/ensureFloorPayrollTables'

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "floor_month_locks" (
    "month" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    CONSTRAINT "floor_month_locks_pkey" PRIMARY KEY ("month")
  )`,
  `CREATE TABLE IF NOT EXISTS "floor_migrations" (
    "name" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB,
    CONSTRAINT "floor_migrations_pkey" PRIMARY KEY ("name")
  )`,
  // NORMAL = arrival / issue; OPENING = carried-over stock; CORRECTION = fix typed in the table.
  `ALTER TABLE "floor_yarn_movements" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'NORMAL'`,
]

let ready: Promise<void> | null = null

export function ensureFloorSetup(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await ensureFloorPayrollTables()
      for (const sql of STATEMENTS) await prisma.$executeRawUnsafe(sql)
      const { reconcileYarnOnce } = await import('@/server/floor/yarn')
      await reconcileYarnOnce()
    })().catch((err) => {
      ready = null
      throw err
    })
  }
  return ready
}
