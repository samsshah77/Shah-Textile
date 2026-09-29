import { prisma } from '@/lib/prisma'

/** Idempotent DDL so live VPS gets floor_* + payroll_store without SSH `prisma db push`. */
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "floor_looms" (
    "loomNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'G6200',
    "year" INTEGER,
    "pictureDataUrl" TEXT,
    "pictureDataUrls" JSONB NOT NULL DEFAULT '[]',
    "defaultRpm" INTEGER NOT NULL DEFAULT 340,
    "shed" TEXT DEFAULT 'Main Floor',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "statusSince" TEXT,
    "qualityId" TEXT,
    "weftYarnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "floor_looms_pkey" PRIMARY KEY ("loomNumber")
  )`,
  `CREATE TABLE IF NOT EXISTS "floor_beams" (
    "beamNo" TEXT NOT NULL,
    "warp" TEXT NOT NULL DEFAULT '',
    "reed" INTEGER NOT NULL DEFAULT 60,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 66,
    "totalThreads" INTEGER NOT NULL DEFAULT 0,
    "length" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loomType" TEXT NOT NULL DEFAULT 'G6200',
    "fillStatus" TEXT NOT NULL DEFAULT 'FULL',
    "usedInLoom" TEXT,
    "location" TEXT DEFAULT 'STORE',
    "mountedOn" TEXT,
    "beamEndedOn" TEXT,
    "endedFromLoom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "floor_beams_pkey" PRIMARY KEY ("beamNo")
  )`,
  `CREATE TABLE IF NOT EXISTS "floor_yarns" (
    "id" TEXT NOT NULL,
    "yarnType" TEXT NOT NULL,
    "bags" INTEGER NOT NULL DEFAULT 0,
    "receivedKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "issuedKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedLbs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "issuedLbs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceLbs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "floor_yarns_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "floor_yarn_movements" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "yarnId" TEXT NOT NULL,
    "yarnType" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weightLbs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bags" INTEGER,
    "loomNumber" INTEGER,
    "pick" INTEGER,
    "lotOrSupplier" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "floor_yarn_movements_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "floor_yarn_movements_date_idx" ON "floor_yarn_movements"("date")`,
  `CREATE INDEX IF NOT EXISTS "floor_yarn_movements_yarnId_idx" ON "floor_yarn_movements"("yarnId")`,
  `CREATE TABLE IF NOT EXISTS "floor_yarn_issuances" (
    "id" TEXT NOT NULL,
    "yarnId" TEXT NOT NULL,
    "yarnType" TEXT NOT NULL,
    "loomNumber" INTEGER NOT NULL,
    "issuedKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pick" INTEGER NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "floor_yarn_issuances_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "floor_yarn_issuances_date_idx" ON "floor_yarn_issuances"("date")`,
  `CREATE INDEX IF NOT EXISTS "floor_yarn_issuances_yarnId_idx" ON "floor_yarn_issuances"("yarnId")`,
  `CREATE TABLE IF NOT EXISTS "floor_qualities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fabricType" TEXT NOT NULL DEFAULT 'Suiting',
    "warpYarn" TEXT NOT NULL DEFAULT '',
    "weftYarn" TEXT NOT NULL DEFAULT '',
    "reed" INTEGER NOT NULL DEFAULT 120,
    "pick" INTEGER NOT NULL DEFAULT 60,
    "widthInch" DOUBLE PRECISION NOT NULL DEFAULT 66,
    "gsm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "floor_qualities_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "floor_daily_sheets" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "loomNumber" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "floor_daily_sheets_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "floor_daily_sheets_date_loomNumber_key" ON "floor_daily_sheets"("date", "loomNumber")`,
  `CREATE INDEX IF NOT EXISTS "floor_daily_sheets_date_idx" ON "floor_daily_sheets"("date")`,
  `CREATE TABLE IF NOT EXISTS "payroll_store" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_store_pkey" PRIMARY KEY ("key")
  )`,
  // Existing live tables may predate these columns — ADD IF NOT EXISTS (Postgres 9.1+ via DO block).
  `ALTER TABLE "floor_qualities" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE'`,
  `ALTER TABLE "floor_qualities" ADD COLUMN IF NOT EXISTS "endedOn" TEXT`,
  `ALTER TABLE "floor_qualities" ADD COLUMN IF NOT EXISTS "createdOn" TEXT`,
  `ALTER TABLE "floor_looms" ADD COLUMN IF NOT EXISTS "statusSince" TEXT`,
]

export async function ensureFloorPayrollTables(): Promise<{ ok: true; statements: number }> {
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql)
  }
  return { ok: true, statements: STATEMENTS.length }
}
