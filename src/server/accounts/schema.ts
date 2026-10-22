import { prisma } from '@/lib/prisma'

/**
 * Accounts tables. Created at runtime (CREATE … IF NOT EXISTS), like the production
 * ledger, so a deploy never needs `prisma db push`. Additive only: the old
 * `accounts_store` blobs are left untouched as a backup.
 *
 * Money is NUMERIC (exact), never float. Every editable row has a `version` that the
 * API checks, so an old browser tab cannot overwrite newer work.
 */
export const ACCOUNTS_DDL = [
  `CREATE TABLE IF NOT EXISTS "acc_parties" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL CHECK ("kind" IN ('TRADER','WORKSHOP')),
    "category" TEXT NOT NULL DEFAULT '',
    "costBucket" TEXT NOT NULL DEFAULT 'MACHINERY' CHECK ("costBucket" IN ('MACHINERY','ELECTRIC','REPAIR')),
    "remarks" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "acc_parties_slug_key" ON "acc_parties"("slug")`,

  `CREATE TABLE IF NOT EXISTS "acc_bills" (
    "id" TEXT PRIMARY KEY,
    "partyId" TEXT NOT NULL REFERENCES "acc_parties"("id"),
    "month" TEXT NOT NULL CHECK ("month" ~ '^\\d{4}-\\d{2}$'),
    "date" DATE NOT NULL,
    "billNo" TEXT NOT NULL DEFAULT '',
    "inwardNo" TEXT NOT NULL DEFAULT '',
    "remarks" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "acc_bills_month_idx" ON "acc_bills"("month", "sortOrder")`,
  `CREATE INDEX IF NOT EXISTS "acc_bills_party_idx" ON "acc_bills"("partyId", "date")`,

  `CREATE TABLE IF NOT EXISTS "acc_bill_lines" (
    "id" TEXT PRIMARY KEY,
    "billId" TEXT NOT NULL REFERENCES "acc_bills"("id") ON DELETE CASCADE,
    "lineNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "machine" TEXT NOT NULL DEFAULT '',
    "quantity" NUMERIC(14,3) NOT NULL DEFAULT 0,
    "rate" NUMERIC(16,2) NOT NULL DEFAULT 0,
    "amount" NUMERIC(16,2) NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS "acc_bill_lines_bill_idx" ON "acc_bill_lines"("billId", "lineNo")`,

  `CREATE TABLE IF NOT EXISTS "acc_payments" (
    "id" TEXT PRIMARY KEY,
    "partyId" TEXT NOT NULL REFERENCES "acc_parties"("id"),
    "month" TEXT NOT NULL CHECK ("month" ~ '^\\d{4}-\\d{2}$'),
    "date" DATE NOT NULL,
    "amount" NUMERIC(16,2) NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'CASH',
    "reference" TEXT NOT NULL DEFAULT '',
    "remarks" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "acc_payments_party_idx" ON "acc_payments"("partyId", "date")`,

  `CREATE TABLE IF NOT EXISTS "acc_petty_cash" (
    "id" TEXT PRIMARY KEY,
    "month" TEXT NOT NULL CHECK ("month" ~ '^\\d{4}-\\d{2}$'),
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL CHECK ("kind" IN ('OPENING','CASH_IN','EXPENSE','SALARY')),
    "debit" NUMERIC(16,2) NOT NULL DEFAULT 0,
    "credit" NUMERIC(16,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "acc_petty_cash_month_idx" ON "acc_petty_cash"("month", "sortOrder")`,

  `CREATE TABLE IF NOT EXISTS "acc_cost_inputs" (
    "month" TEXT PRIMARY KEY CHECK ("month" ~ '^\\d{4}-\\d{2}$'),
    "inputs" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS "acc_month_locks" (
    "month" TEXT PRIMARY KEY CHECK ("month" ~ '^\\d{4}-\\d{2}$'),
    "locked" BOOLEAN NOT NULL DEFAULT TRUE,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  /** One row per old store key (or seed) that was copied in, so it is never copied twice. */
  // Payables (A/P): whose payable a supplier is, and opening / adjustment entries.
  `ALTER TABLE "acc_bills" ADD COLUMN IF NOT EXISTS "attachments" JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE "acc_parties" ADD COLUMN IF NOT EXISTS "account" TEXT NOT NULL DEFAULT 'SARA' CHECK ("account" IN ('SARA','FOI'))`,
  `ALTER TABLE "acc_payments" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'PAYMENT' CHECK ("kind" IN ('PAYMENT','OPENING','ADJUSTMENT'))`,
  `ALTER TABLE "acc_payments" ADD COLUMN IF NOT EXISTS "paidFrom" TEXT NOT NULL DEFAULT 'SARA' CHECK ("paidFrom" IN ('SARA','FOI'))`,
  // Pictures of the cheque / receipt for a payment.
  `ALTER TABLE "acc_payments" ADD COLUMN IF NOT EXISTS "attachments" JSONB NOT NULL DEFAULT '[]'::jsonb`,
  // Payments copied from the old synopsis "FOI paid" column were FOI money.
  `UPDATE "acc_payments" SET "paidFrom" = 'FOI' WHERE "paidFrom" = 'SARA' AND "remarks" LIKE 'FOI paid (copied%'`,

  `CREATE TABLE IF NOT EXISTS "acc_import_log" (
    "source" TEXT PRIMARY KEY,
    "hash" TEXT NOT NULL,
    "summary" JSONB,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
]

let ready: Promise<void> | null = null

/** Create the accounts tables once per process (safe to call on every request). */
export function ensureAccountsTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const sql of ACCOUNTS_DDL) await prisma.$executeRawUnsafe(sql)
    })().catch((err) => {
      ready = null
      throw err
    })
  }
  return ready
}
