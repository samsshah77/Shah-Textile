/**
 * Yarn Supply: the supplier enters each lot of yarn they send (yarn, bags, kg per bag,
 * challan / lot / vehicle #). The mill (Yarn Stock, Edit) checks it when it arrives:
 *   - Verify   → an INWARD movement is recorded, so the yarn is added to Yarn Stock
 *                (the mill may type the bags / kg it actually received);
 *   - Report issue → the supplier sees the note, corrects the entry and it is checked again.
 * A verified entry can still be corrected by the mill: its INWARD movement is changed.
 * Kept in its own table, created at runtime (CREATE … IF NOT EXISTS) like the other floor tables.
 */
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { assertDateOpen } from '@/server/floor/locks'
import { inYarnTx, insertMovement, recomputeYarnTotals, yarnRowFor, YarnError } from '@/server/floor/yarn'
import { kgToLbs } from '@/services/production/loomBeamHelpers'

import type {
  YarnDispatch,
  YarnDispatchInput,
  YarnDispatchLog,
  YarnDispatchStatus,
  YarnReceiveInput,
  YarnRequest,
  YarnRequestInput,
  YarnRequestLog,
  YarnDestination,
  SupplierStockEntry,
  SupplierStockInput,
  SupplierStoreBalance,
  SupplierStoreMove,
  SupplierTwisting,
  SupplierTwistingInput,
  SupplierTwistingOut,
  SupplierBalanceReset,
} from '@/lib/floor/yarnSupply'

export type {
  YarnDispatch,
  YarnDispatchInput,
  YarnReceiveInput,
  YarnRequest,
  YarnRequestInput,
  SupplierStockInput,
  SupplierTwistingInput,
  SupplierTwistingOut,
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS "floor_yarn_dispatches" (
    "id" TEXT PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "yarnType" TEXT NOT NULL,
    "sentDate" TEXT NOT NULL,
    "bags" INTEGER NOT NULL DEFAULT 0,
    "bagKg" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "weightKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "challanNo" TEXT NOT NULL DEFAULT '',
    "lotNo" TEXT NOT NULL DEFAULT '',
    "vehicleNo" TEXT NOT NULL DEFAULT '',
    "remarks" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issueNote" TEXT NOT NULL DEFAULT '',
    "issueBy" TEXT NOT NULL DEFAULT '',
    "receivedDate" TEXT,
    "receivedBags" INTEGER,
    "receivedKg" DOUBLE PRECISION,
    "verifyNote" TEXT NOT NULL DEFAULT '',
    "verifiedBy" TEXT NOT NULL DEFAULT '',
    "verifiedAt" TIMESTAMP(3),
    "yarnId" TEXT,
    "movementId" TEXT,
    "log" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "deletedAt" TIMESTAMP(3)
  )`,
  `CREATE INDEX IF NOT EXISTS "floor_yarn_dispatches_status_idx" ON "floor_yarn_dispatches"("status", "sentDate")`,
  // The mill's request a lot was sent against.
  `ALTER TABLE "floor_yarn_dispatches" ADD COLUMN IF NOT EXISTS "requestId" TEXT`,
  `CREATE TABLE IF NOT EXISTS "floor_yarn_requests" (
    "id" TEXT PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "yarnType" TEXT NOT NULL,
    "kg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bags" INTEGER,
    "neededBy" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "requestedBy" TEXT NOT NULL DEFAULT '',
    "requestedById" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" TEXT NOT NULL DEFAULT '',
    "closeNote" TEXT NOT NULL DEFAULT '',
    "closedAt" TIMESTAMP(3),
    "log" JSONB NOT NULL DEFAULT '[]'::jsonb
  )`,
  `ALTER TABLE "floor_yarn_requests" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT`,
  // Where a lot goes: MILL (Sara Textile, checked by the mill) or Fazal Umer's own SIZING / WARPING.
  `ALTER TABLE "floor_yarn_dispatches" ADD COLUMN IF NOT EXISTS "destination" TEXT NOT NULL DEFAULT 'MILL'`,
  // Fazal Umer's store: yarn added to his inventory (dispatches take it out).
  `CREATE TABLE IF NOT EXISTS "floor_supplier_stock" (
    "id" TEXT PRIMARY KEY,
    "yarnType" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "bags" INTEGER NOT NULL DEFAULT 0,
    "kg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3)
  )`,
  // Twisting: raw yarn in → (done) twisted yarn into the Inventory (a stock entry linked back).
  `CREATE TABLE IF NOT EXISTS "floor_supplier_twisting" (
    "id" TEXT PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'IN_TWISTING',
    "inYarnType" TEXT NOT NULL,
    "inDate" TEXT NOT NULL,
    "inBags" INTEGER NOT NULL DEFAULT 0,
    "inKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "outYarnType" TEXT NOT NULL DEFAULT '',
    "outDate" TEXT,
    "outBags" INTEGER,
    "outKg" DOUBLE PRECISION,
    "stockId" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL DEFAULT '',
    "movedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3)
  )`,
  // Who Fazal Umer got the yarn from; each bag's kg for twisted yarn moved to the Inventory.
  `ALTER TABLE "floor_supplier_stock" ADD COLUMN IF NOT EXISTS "supplierName" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "floor_supplier_stock" ADD COLUMN IF NOT EXISTS "bagKg" JSONB`,
  `ALTER TABLE "floor_supplier_twisting" ADD COLUMN IF NOT EXISTS "supplierName" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "floor_supplier_twisting" ADD COLUMN IF NOT EXISTS "outBagKg" JSONB`,
  // A lot issued to Twisting from the Balance: its dispatch (destination TWISTING) takes the kg out.
  `ALTER TABLE "floor_supplier_twisting" ADD COLUMN IF NOT EXISTS "dispatchId" TEXT`,
  // "Reset Balance to zero" (admin): only entries made after the latest active reset count in the Balance.
  `CREATE TABLE IF NOT EXISTS "floor_supplier_balance_resets" (
    "id" TEXT PRIMARY KEY,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "by" TEXT NOT NULL DEFAULT '',
    "byId" TEXT NOT NULL DEFAULT '',
    "undoneAt" TIMESTAMP(3),
    "undoneBy" TEXT NOT NULL DEFAULT ''
  )`,
]

let ready: Promise<void> | null = null
export function ensureYarnDispatchTable(): Promise<void> {
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

type Row = {
  destination?: string | null
  id: string
  status: string
  yarnType: string
  sentDate: string
  bags: number
  bagKg: unknown
  weightKg: number
  challanNo: string
  lotNo: string
  vehicleNo: string
  remarks: string
  createdBy: string
  createdById: string
  createdAt: Date | string
  updatedAt: Date | string
  issueNote: string
  issueBy: string
  receivedDate: string | null
  receivedBags: number | null
  receivedKg: number | null
  verifyNote: string
  verifiedBy: string
  verifiedAt: Date | string | null
  yarnId: string | null
  movementId: string | null
  requestId?: string | null
  log: unknown
}

const iso = (d: Date | string | null) => (d == null ? null : d instanceof Date ? d.toISOString() : String(d))
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100
const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const clip = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n)

const toDestination = (v: unknown): YarnDestination =>
  v === 'SIZING' ? 'SIZING' : v === 'WARPING' ? 'WARPING' : v === 'TWISTING' ? 'TWISTING' : 'MILL'

function toDispatch(r: Row): YarnDispatch {
  const status: YarnDispatchStatus =
    r.status === 'VERIFIED' ? 'VERIFIED' : r.status === 'ISSUE' ? 'ISSUE' : r.status === 'SENT' ? 'SENT' : 'PENDING'
  return {
    id: r.id,
    status,
    yarnType: r.yarnType,
    sentDate: r.sentDate,
    bags: Number(r.bags) || 0,
    bagKg: Array.isArray(r.bagKg) ? (r.bagKg as unknown[]).map((v) => r2(Number(v))) : [],
    weightKg: r2(r.weightKg),
    challanNo: r.challanNo || '',
    lotNo: r.lotNo || '',
    vehicleNo: r.vehicleNo || '',
    remarks: r.remarks || '',
    createdBy: r.createdBy || '',
    createdAt: iso(r.createdAt) || '',
    updatedAt: iso(r.updatedAt) || '',
    issueNote: r.issueNote || '',
    issueBy: r.issueBy || '',
    receivedDate: r.receivedDate,
    receivedBags: r.receivedBags == null ? null : Number(r.receivedBags),
    receivedKg: r.receivedKg == null ? null : r2(r.receivedKg),
    verifyNote: r.verifyNote || '',
    verifiedBy: r.verifiedBy || '',
    verifiedAt: iso(r.verifiedAt),
    requestId: r.requestId || null,
    destination: toDestination(r.destination),
    log: Array.isArray(r.log) ? (r.log as YarnDispatchLog[]) : [],
  }
}

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function cleanInput(p: YarnDispatchInput) {
  const yarnType = clip(p.yarnType, 120)
  if (!yarnType) throw new YarnError('Enter the yarn.')
  if (!isYmd(p.sentDate) || p.sentDate > today()) throw new YarnError('Pick a valid date (today or earlier).')
  const bagKg = (Array.isArray(p.bagKg) ? p.bagKg : []).map((v) => r2(Number(v)))
  if (bagKg.length < 1 || bagKg.length > 200) throw new YarnError('Enter the bags (1 to 200).')
  if (bagKg.some((w) => !Number.isFinite(w) || w <= 0 || w > 10000)) throw new YarnError('Enter the weight of every bag.')
  return {
    yarnType,
    sentDate: p.sentDate,
    bagKg,
    bags: bagKg.length,
    weightKg: r2(bagKg.reduce((a, b) => a + b, 0)),
    challanNo: clip(p.challanNo, 60),
    lotNo: clip(p.lotNo, 60),
    vehicleNo: clip(p.vehicleNo, 40),
    remarks: clip(p.remarks, 500),
    destination: toDestination(p.destination),
    // Only lots to the mill can go against a mill request.
    requestId: p.requestId && toDestination(p.destination) === 'MILL' ? clip(p.requestId, 80) : null,
  }
}

/** A lot may be sent only against a request that is still open (or the one it already had). */
async function checkRequestLink(requestId: string | null, keep?: string | null) {
  if (!requestId || requestId === keep) return
  const rows = await prisma.$queryRawUnsafe<Array<{ status: string }>>(
    `SELECT "status" FROM "floor_yarn_requests" WHERE "id" = $1`,
    requestId
  )
  if (!rows[0]) throw new YarnError('That request was not found. Please refresh the page.', 404)
  if (rows[0].status !== 'OPEN') throw new YarnError('That request is closed by Sara Textile — send without it, or ask Sara Textile.', 409)
}

function cleanReceive(p: YarnReceiveInput) {
  if (!isYmd(p.receivedDate) || p.receivedDate > today()) throw new YarnError('Pick a valid received date (today or earlier).')
  const bags = Math.round(Number(p.receivedBags))
  const kg = r2(Number(p.receivedKg))
  if (!Number.isFinite(bags) || bags < 0 || bags > 10000) throw new YarnError('Enter the bags received.')
  if (!Number.isFinite(kg) || kg <= 0 || kg > 1e7) throw new YarnError('Enter the kg received.')
  return { receivedDate: p.receivedDate, receivedBags: bags, receivedKg: kg, note: clip(p.note, 500) }
}

const logEntry = (by: string, action: YarnDispatchLog['action'], note?: string): YarnDispatchLog => ({
  at: new Date().toISOString(),
  by,
  action,
  ...(note ? { note } : {}),
})

export async function listYarnDispatches(): Promise<YarnDispatch[]> {
  await ensureYarnDispatchTable()
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT * FROM "floor_yarn_dispatches" WHERE "deletedAt" IS NULL AND COALESCE("destination", 'MILL') = 'MILL'
     ORDER BY CASE "status" WHEN 'VERIFIED' THEN 1 ELSE 0 END, "sentDate" DESC, "createdAt" DESC LIMIT 500`
  )
  return rows.map(toDispatch)
}

/** Lots sent to Fazal Umer's own Sizing / Warping (record only) and issued to Twisting. */
export async function listDeptDispatches(): Promise<YarnDispatch[]> {
  await ensureYarnDispatchTable()
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT * FROM "floor_yarn_dispatches" WHERE "deletedAt" IS NULL AND "destination" IN ('SIZING','WARPING','TWISTING')
     ORDER BY "sentDate" DESC, "createdAt" DESC LIMIT 5000`
  )
  return rows.map(toDispatch)
}

export async function getYarnDispatch(id: string): Promise<YarnDispatch | null> {
  await ensureYarnDispatchTable()
  const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM "floor_yarn_dispatches" WHERE "id" = $1 AND "deletedAt" IS NULL`, id)
  return rows[0] ? toDispatch(rows[0]) : null
}

async function mustGet(id: string): Promise<YarnDispatch> {
  const d = await getYarnDispatch(id)
  if (!d) throw new YarnError('This entry was not found (it may have been deleted). Please refresh the page.', 404)
  return d
}

type RawClient = Pick<typeof prisma, '$queryRawUnsafe' | '$executeRawUnsafe'>

/**
 * SQL: the row (alias `a`) was made after the latest active "Reset Balance to zero" — only those count
 * in the Balance. With no reset everything counts.
 */
const afterReset = (a: string) =>
  `${a}."createdAt" > COALESCE((SELECT MAX(r."at") FROM "floor_supplier_balance_resets" r WHERE r."undoneAt" IS NULL), '-infinity'::timestamp)`

/** Does this stock entry / dispatch count in the Balance (made after the latest reset)? */
async function countsInBalance(db: RawClient, table: 'floor_supplier_stock' | 'floor_yarn_dispatches', id: string): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<Array<{ counts: boolean }>>(`SELECT ${afterReset('a')} AS "counts" FROM "${table}" a WHERE a."id" = $1`, id)
  return Boolean(rows[0]?.counts)
}

/** Fazal Umer Balance left for one yarn: added − sent anywhere (same rule as supplierStoreBalances). */
async function storeLeftKg(db: RawClient, yarnType: string): Promise<number> {
  const k = storeKey(yarnType)
  const ins = await db.$queryRawUnsafe<Array<{ yarnType: string; kg: number }>>(
    `SELECT a."yarnType", a."kg" FROM "floor_supplier_stock" a WHERE a."deletedAt" IS NULL AND ${afterReset('a')}`
  )
  const outs = await db.$queryRawUnsafe<Array<{ yarnType: string; weightKg: number }>>(
    `SELECT a."yarnType", a."weightKg" FROM "floor_yarn_dispatches" a WHERE a."deletedAt" IS NULL AND ${afterReset('a')}`
  )
  let left = 0
  for (const r of ins) if (storeKey(r.yarnType) === k) left += Number(r.kg) || 0
  for (const r of outs) if (storeKey(r.yarnType) === k) left -= Number(r.weightKg) || 0
  return r2(left)
}

/**
 * The Balance never goes below zero: a lot can be sent only from what is in the Balance.
 * `keep` = the entry being corrected (its own kg counts as available; lowering an old entry is always allowed).
 * An entry from before the Balance reset is outside the Balance, so correcting it does not touch it.
 */
async function assertInventoryHas(
  db: RawClient,
  yarnType: string,
  kg: number,
  keep?: { id: string; yarnType: string; weightKg: number } | null
) {
  if (keep && !(await countsInBalance(db, 'floor_yarn_dispatches', keep.id))) return
  const same = Boolean(keep && storeKey(keep.yarnType) === storeKey(yarnType))
  if (same && keep && kg <= keep.weightKg + 0.001) return
  const avail = r2((await storeLeftKg(db, yarnType)) + (same && keep ? keep.weightKg : 0))
  if (kg > avail + 0.001) {
    throw new YarnError(
      avail <= 0
        ? `${yarnType} is not in Fazal Umer Balance — add it to the Balance first.`
        : `Only ${avail} kg of ${yarnType} is in Fazal Umer Balance — you cannot send ${r2(kg)} kg.`,
      409
    )
  }
}

/** Taking kg out of the Balance (edit / delete / undo) must not leave it below zero. */
async function assertInventoryCanLose(db: RawClient, yarnType: string, kg: number) {
  if (kg <= 0) return
  const left = await storeLeftKg(db, yarnType)
  if (left - kg < -0.001) {
    throw new YarnError(
      `Cannot do this — ${yarnType} has already been sent out of the Balance. Only ${Math.max(0, left)} kg of it is left.`,
      409
    )
  }
}

/** One send / correction at a time, so two sends together cannot take the same kg. */
const lockStore = (db: RawClient) => db.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('floor:supplier-store'))::text`)

/** Who the yarn in the Balance came from (for a lot issued to Twisting): the suppliers of that yarn's entries. */
async function balanceSuppliers(db: RawClient, yarnType: string): Promise<string> {
  const k = storeKey(yarnType)
  const rows = await db.$queryRawUnsafe<Array<{ yarnType: string; supplierName: string | null; counts: boolean }>>(
    `SELECT a."yarnType", a."supplierName", ${afterReset('a')} AS "counts" FROM "floor_supplier_stock" a
     WHERE a."deletedAt" IS NULL ORDER BY a."date" DESC, a."createdAt" DESC`
  )
  const mine = rows.filter((r) => storeKey(r.yarnType) === k && (r.supplierName || '').trim())
  const pick = mine.some((r) => r.counts) ? mine.filter((r) => r.counts) : mine
  const names: string[] = []
  for (const r of pick) {
    const n = (r.supplierName || '').trim()
    if (!names.some((x) => x.toLowerCase() === n.toLowerCase())) names.push(n)
  }
  return names.join(', ').slice(0, 120)
}

type TwistLock = { id: string; status: string }

/** The Twisting lot of a lot issued to Twisting (locked for this transaction). */
async function twistOfDispatch(db: RawClient, dispatchId: string): Promise<TwistLock | null> {
  const rows = await db.$queryRawUnsafe<TwistLock[]>(
    `SELECT "id", "status" FROM "floor_supplier_twisting" WHERE "dispatchId" = $1 AND "deletedAt" IS NULL FOR UPDATE`,
    dispatchId
  )
  return rows[0] || null
}

const DEST_NOTE: Record<YarnDestination, string | undefined> = {
  MILL: undefined,
  SIZING: 'To Sizing',
  WARPING: 'To Sectional Warping',
  TWISTING: 'To Twisting',
}

/** Supplier: a new lot sent (an issue to Twisting also opens its Twisting lot). */
export async function createYarnDispatch(p: YarnDispatchInput, by: { id: string; name: string }): Promise<YarnDispatch> {
  await ensureYarnDispatchTable()
  const c = cleanInput(p)
  await checkRequestLink(c.requestId)
  const id = `ysd-${Date.now()}-${randomUUID().slice(0, 8)}`
  await prisma.$transaction(async (tx) => {
    await lockStore(tx)
    await assertInventoryHas(tx, c.yarnType, c.weightKg)
    await tx.$executeRawUnsafe(
      `INSERT INTO "floor_yarn_dispatches"
        ("id","status","yarnType","sentDate","bags","bagKg","weightKg","challanNo","lotNo","vehicleNo","remarks","createdBy","createdById","log","requestId","destination")
       VALUES ($1,$15,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$16)`,
      id,
      c.yarnType,
      c.sentDate,
      c.bags,
      JSON.stringify(c.bagKg),
      c.weightKg,
      c.challanNo,
      c.lotNo,
      c.vehicleNo,
      c.remarks,
      by.name,
      by.id,
      JSON.stringify([logEntry(by.name, 'SENT', DEST_NOTE[c.destination])]),
      c.requestId,
      c.destination === 'MILL' ? 'PENDING' : 'SENT',
      c.destination
    )
    if (c.destination === 'TWISTING') {
      await tx.$executeRawUnsafe(
        `INSERT INTO "floor_supplier_twisting" ("id","inYarnType","inDate","inBags","inKg","note","createdBy","createdById","supplierName","dispatchId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        `yst-${Date.now()}-${randomUUID().slice(0, 8)}`,
        c.yarnType,
        c.sentDate,
        c.bags,
        c.weightKg,
        c.remarks,
        by.name,
        by.id,
        await balanceSuppliers(tx, c.yarnType),
        id
      )
    }
  })
  return mustGet(id)
}

/** Supplier: correct an entry the mill has not verified yet (after an issue it goes back for checking). */
export async function updateYarnDispatch(id: string, p: YarnDispatchInput, by: string): Promise<YarnDispatch> {
  const before = await mustGet(id)
  if (before.status === 'VERIFIED') throw new YarnError('Already verified by Sara Textile — it can no longer be changed here.', 409)
  const c = cleanInput(p)
  // A lot issued to Twisting stays a Twisting lot (and only the Twisting page issues new ones).
  if (before.destination === 'TWISTING') c.destination = 'TWISTING'
  else if (c.destination === 'TWISTING') throw new YarnError('Issue yarn to Twisting from the Twisting page.', 409)
  await checkRequestLink(c.requestId, before.requestId)
  const note = before.status === 'ISSUE' ? `Corrected after: ${before.issueNote}` : undefined
  await prisma.$transaction(async (tx) => {
    await lockStore(tx)
    const twist = before.destination === 'TWISTING' ? await twistOfDispatch(tx, id) : null
    if (twist?.status === 'DONE') {
      throw new YarnError('This lot has already come back from Twisting to the Balance — Undo that on the Twisting page first.', 409)
    }
    await assertInventoryHas(tx, c.yarnType, c.weightKg, before)
    await tx.$executeRawUnsafe(
      `UPDATE "floor_yarn_dispatches" SET
         "status" = $14, "destination" = $13, "yarnType" = $2, "sentDate" = $3, "bags" = $4, "bagKg" = $5::jsonb, "weightKg" = $6,
         "challanNo" = $7, "lotNo" = $8, "vehicleNo" = $9, "remarks" = $10, "issueNote" = '', "issueBy" = '',
         "updatedAt" = CURRENT_TIMESTAMP, "log" = "log" || $11::jsonb, "requestId" = $12
       WHERE "id" = $1 AND "status" <> 'VERIFIED' AND "deletedAt" IS NULL`,
      id,
      c.yarnType,
      c.sentDate,
      c.bags,
      JSON.stringify(c.bagKg),
      c.weightKg,
      c.challanNo,
      c.lotNo,
      c.vehicleNo,
      c.remarks,
      JSON.stringify([logEntry(by, 'EDITED', note)]),
      c.requestId,
      c.destination,
      c.destination === 'MILL' ? 'PENDING' : 'SENT'
    )
    if (twist) {
      await tx.$executeRawUnsafe(
        `UPDATE "floor_supplier_twisting" SET "inYarnType" = $2, "inDate" = $3, "inBags" = $4, "inKg" = $5, "note" = $6,
           "supplierName" = CASE WHEN $7 = '' THEN "supplierName" ELSE $7 END, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1`,
        twist.id,
        c.yarnType,
        c.sentDate,
        c.bags,
        c.weightKg,
        c.remarks,
        storeKey(c.yarnType) === storeKey(before.yarnType) ? '' : await balanceSuppliers(tx, c.yarnType)
      )
    }
  })
  return mustGet(id)
}

/** Supplier: remove an entry sent by mistake (not once verified; a Twisting lot only while still in Twisting). */
export async function deleteYarnDispatch(id: string): Promise<YarnDispatch> {
  const before = await mustGet(id)
  if (before.status === 'VERIFIED') throw new YarnError('Already verified by Sara Textile — it cannot be deleted.', 409)
  await prisma.$transaction(async (tx) => {
    await lockStore(tx)
    const twist = before.destination === 'TWISTING' ? await twistOfDispatch(tx, id) : null
    if (twist?.status === 'DONE') {
      throw new YarnError('This lot has already come back from Twisting to the Balance — Undo that on the Twisting page first.', 409)
    }
    await tx.$executeRawUnsafe(
      `UPDATE "floor_yarn_dispatches" SET "deletedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "status" <> 'VERIFIED'`,
      id
    )
    if (twist) await tx.$executeRawUnsafe(`UPDATE "floor_supplier_twisting" SET "deletedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, twist.id)
  })
  return before
}

/** Mill: something is wrong — the supplier sees the note and corrects the entry. */
export async function reportYarnDispatchIssue(id: string, note: string, by: string): Promise<YarnDispatch> {
  const before = await mustGet(id)
  if (before.destination !== 'MILL') throw new YarnError('This lot did not go to Sara Textile — Sara Textile does not check it.', 409)
  if (before.status === 'VERIFIED') throw new YarnError('Already verified — use Edit to correct the received figures.', 409)
  const text = clip(note, 500)
  if (!text) throw new YarnError('Write what is wrong.')
  await prisma.$executeRawUnsafe(
    `UPDATE "floor_yarn_dispatches" SET "status" = 'ISSUE', "issueNote" = $2, "issueBy" = $3,
       "updatedAt" = CURRENT_TIMESTAMP, "log" = "log" || $4::jsonb
     WHERE "id" = $1 AND "status" <> 'VERIFIED'`,
    id,
    text,
    by,
    JSON.stringify([logEntry(by, 'ISSUE', text)])
  )
  return mustGet(id)
}

const supplierLabel = (d: YarnDispatch) =>
  [`Supplier${d.createdBy ? ` (${d.createdBy})` : ''}`, d.challanNo ? `Challan ${d.challanNo}` : '', d.lotNo ? `Lot ${d.lotNo}` : '']
    .filter(Boolean)
    .join(' · ')
    .slice(0, 190)

/** Mill: received — add it to Yarn Stock (an INWARD movement on the received date). */
export async function verifyYarnDispatch(id: string, p: YarnReceiveInput, by: string): Promise<YarnDispatch> {
  await ensureYarnDispatchTable()
  const c = cleanReceive(p)
  await assertDateOpen(c.receivedDate)
  await inYarnTx(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Row[]>(
      `SELECT * FROM "floor_yarn_dispatches" WHERE "id" = $1 AND "deletedAt" IS NULL FOR UPDATE`,
      id
    )
    if (!rows[0]) throw new YarnError('This entry was not found (it may have been deleted). Please refresh the page.', 404)
    const d = toDispatch(rows[0])
    if (d.destination !== 'MILL') throw new YarnError('This lot did not go to Sara Textile — Sara Textile does not check it.', 409)
    if (d.status === 'VERIFIED') throw new YarnError('Already verified.', 409)
    const yarn = await yarnRowFor(tx, d.yarnType)
    const movementId = await insertMovement(tx, {
      type: 'INWARD',
      yarnId: yarn.id,
      yarnType: yarn.yarnType,
      date: c.receivedDate,
      weightKg: c.receivedKg,
      bags: c.receivedBags,
      lotOrSupplier: supplierLabel(d),
    })
    await recomputeYarnTotals(tx, [yarn.id])
    const diff =
      c.receivedBags !== d.bags || c.receivedKg !== d.weightKg
        ? `Received ${c.receivedBags} bags, ${c.receivedKg} kg (sent ${d.bags} bags, ${d.weightKg} kg)`
        : ''
    await tx.$executeRawUnsafe(
      `UPDATE "floor_yarn_dispatches" SET "status" = 'VERIFIED', "receivedDate" = $2, "receivedBags" = $3, "receivedKg" = $4,
         "verifyNote" = $5, "verifiedBy" = $6, "verifiedAt" = CURRENT_TIMESTAMP, "yarnId" = $7, "movementId" = $8,
         "updatedAt" = CURRENT_TIMESTAMP, "log" = "log" || $9::jsonb
       WHERE "id" = $1`,
      id,
      c.receivedDate,
      c.receivedBags,
      c.receivedKg,
      c.note,
      by,
      yarn.id,
      movementId,
      JSON.stringify([logEntry(by, 'VERIFIED', [diff, c.note].filter(Boolean).join(' — ') || undefined)])
    )
  })
  return mustGet(id)
}

/** Mill: correct the received figures of a verified entry — its Yarn Stock entry changes with it. */
export async function correctVerifiedYarnDispatch(id: string, p: YarnReceiveInput, by: string): Promise<YarnDispatch> {
  await ensureYarnDispatchTable()
  const c = cleanReceive(p)
  await assertDateOpen(c.receivedDate)
  await inYarnTx(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Row[]>(
      `SELECT * FROM "floor_yarn_dispatches" WHERE "id" = $1 AND "deletedAt" IS NULL FOR UPDATE`,
      id
    )
    if (!rows[0]) throw new YarnError('This entry was not found (it may have been deleted). Please refresh the page.', 404)
    const row = rows[0]
    const d = toDispatch(row)
    if (d.status !== 'VERIFIED') throw new YarnError('Not verified yet — use Verify.', 409)
    if (d.receivedDate) await assertDateOpen(d.receivedDate)
    let movementId = row.movementId
    let yarnId = row.yarnId
    const moved = movementId
      ? await tx.$executeRawUnsafe(
          `UPDATE "floor_yarn_movements" SET "date" = $2, "weightKg" = $3, "weightLbs" = $4, "bags" = $5, "updatedAt" = CURRENT_TIMESTAMP
           WHERE "id" = $1`,
          movementId,
          c.receivedDate,
          c.receivedKg,
          kgToLbs(c.receivedKg),
          c.receivedBags
        )
      : 0
    if (!moved) {
      // Its stock entry is gone (e.g. the yarn row was rebuilt): record it again.
      const yarn = await yarnRowFor(tx, d.yarnType)
      yarnId = yarn.id
      movementId = await insertMovement(tx, {
        type: 'INWARD',
        yarnId: yarn.id,
        yarnType: yarn.yarnType,
        date: c.receivedDate,
        weightKg: c.receivedKg,
        bags: c.receivedBags,
        lotOrSupplier: supplierLabel(d),
      })
    }
    if (yarnId) await recomputeYarnTotals(tx, [yarnId])
    const note = `Received changed to ${c.receivedBags} bags, ${c.receivedKg} kg on ${c.receivedDate} (was ${d.receivedBags ?? 0} bags, ${d.receivedKg ?? 0} kg on ${d.receivedDate || '—'})`
    await tx.$executeRawUnsafe(
      `UPDATE "floor_yarn_dispatches" SET "receivedDate" = $2, "receivedBags" = $3, "receivedKg" = $4, "verifyNote" = $5,
         "yarnId" = $6, "movementId" = $7, "updatedAt" = CURRENT_TIMESTAMP, "log" = "log" || $8::jsonb
       WHERE "id" = $1`,
      id,
      c.receivedDate,
      c.receivedBags,
      c.receivedKg,
      c.note || d.verifyNote,
      yarnId,
      movementId,
      JSON.stringify([logEntry(by, 'CORRECTED', [note, c.note].filter(Boolean).join(' — '))])
    )
  })
  return mustGet(id)
}

/** The mill's yarn stock, for the supplier page (name + balance only). */
export async function millYarnStock(): Promise<Array<{ id: string; yarnType: string; balanceKg: number }>> {
  const rows = await prisma.floorYarn.findMany({ select: { id: true, yarnType: true, balanceKg: true }, orderBy: { yarnType: 'asc' } })
  return rows.map((y) => ({ id: y.id, yarnType: y.yarnType, balanceKg: r2(y.balanceKg) }))
}

// ── Requests: the mill asks the supplier for yarn ─────────────────────────────────────────

type RequestRow = {
  id: string
  status: string
  yarnType: string
  kg: number
  bags: number | null
  neededBy: string | null
  note: string
  imageUrl?: string | null
  requestedBy: string
  createdAt: Date | string
  closedBy: string
  closeNote: string
  log: unknown
  lots: number | bigint
  sentBags: number | null
  sentKg: number | null
  receivedKg: number | null
  verifiedLots: number | bigint
  issueLots: number | bigint
}

function toRequest(r: RequestRow): YarnRequest {
  const sentKg = r2(Number(r.sentKg) || 0)
  const sentBags = Number(r.sentBags) || 0
  const kg = r2(r.kg)
  const bags = r.bags == null ? null : Number(r.bags)
  const base = r.status === 'CANCELLED' ? 'CANCELLED' : r.status === 'CLOSED' ? 'CLOSED' : 'OPEN'
  const isComplete =
    base === 'OPEN' && ((kg > 0 && sentKg >= kg) || (kg === 0 && bags != null && bags > 0 && sentBags >= bags))
  return {
    id: r.id,
    status: isComplete ? 'COMPLETE' : base,
    yarnType: r.yarnType,
    kg,
    bags,
    neededBy: r.neededBy,
    note: r.note || '',
    imageUrl: r.imageUrl || null,
    requestedBy: r.requestedBy || '',
    createdAt: iso(r.createdAt) || '',
    closedBy: r.closedBy || '',
    closeNote: r.closeNote || '',
    lots: Number(r.lots) || 0,
    sentBags,
    sentKg,
    receivedKg: r2(Number(r.receivedKg) || 0),
    verifiedLots: Number(r.verifiedLots) || 0,
    issueLots: Number(r.issueLots) || 0,
    log: Array.isArray(r.log) ? (r.log as YarnRequestLog[]) : [],
  }
}

const REQUEST_SELECT = `
  SELECT q.*,
    COUNT(d."id") AS "lots",
    COALESCE(SUM(d."bags"), 0) AS "sentBags",
    COALESCE(SUM(d."weightKg"), 0) AS "sentKg",
    COALESCE(SUM(CASE WHEN d."status" = 'VERIFIED' THEN d."receivedKg" ELSE 0 END), 0) AS "receivedKg",
    COUNT(CASE WHEN d."status" = 'VERIFIED' THEN 1 END) AS "verifiedLots",
    COUNT(CASE WHEN d."status" = 'ISSUE' THEN 1 END) AS "issueLots"
  FROM "floor_yarn_requests" q
  LEFT JOIN "floor_yarn_dispatches" d ON d."requestId" = q."id" AND d."deletedAt" IS NULL`

export async function listYarnRequests(): Promise<YarnRequest[]> {
  await ensureYarnDispatchTable()
  const rows = await prisma.$queryRawUnsafe<RequestRow[]>(
    `${REQUEST_SELECT} GROUP BY q."id"
     ORDER BY CASE q."status" WHEN 'OPEN' THEN 0 ELSE 1 END, q."createdAt" DESC LIMIT 300`
  )
  return rows.map(toRequest)
}

async function mustGetRequest(id: string): Promise<YarnRequest> {
  await ensureYarnDispatchTable()
  const rows = await prisma.$queryRawUnsafe<RequestRow[]>(`${REQUEST_SELECT} WHERE q."id" = $1 GROUP BY q."id"`, id)
  if (!rows[0]) throw new YarnError('This request was not found. Please refresh the page.', 404)
  return toRequest(rows[0])
}

function cleanRequest(p: YarnRequestInput) {
  const yarnType = clip(p?.yarnType, 120)
  if (!yarnType) throw new YarnError('Enter the yarn.')
  const kgRaw = p.kg == null || String(p.kg).trim() === '' ? 0 : r2(Number(p.kg))
  if (!Number.isFinite(kgRaw) || kgRaw < 0 || kgRaw > 1e7) throw new YarnError('Enter a valid quantity in kg.')
  const bagsRaw = p.bags == null || String(p.bags).trim() === '' ? null : Math.round(Number(p.bags))
  if (bagsRaw != null && (!Number.isFinite(bagsRaw) || bagsRaw < 0 || bagsRaw > 10000)) throw new YarnError('Enter a valid count.')
  if (kgRaw <= 0 && (!bagsRaw || bagsRaw <= 0)) throw new YarnError('Enter a count greater than 0.')
  const neededBy = p.neededBy ? String(p.neededBy) : null
  if (neededBy && !isYmd(neededBy)) throw new YarnError('Pick a valid needed-by date.')
  const rawImg = typeof p.imageUrl === 'string' ? p.imageUrl.trim() : ''
  const imageUrl = rawImg && rawImg.startsWith('/uploads/') ? clip(rawImg, 500) : null
  return { yarnType, kg: kgRaw, bags: bagsRaw || null, neededBy, note: clip(p.note, 500), imageUrl }
}

const reqLog = (by: string, action: YarnRequestLog['action'], note?: string): YarnRequestLog => ({
  at: new Date().toISOString(),
  by,
  action,
  ...(note ? { note } : {}),
})

/** Mill: ask the supplier for yarn. */
export async function createYarnRequest(p: YarnRequestInput, by: { id: string; name: string }): Promise<YarnRequest> {
  await ensureYarnDispatchTable()
  const c = cleanRequest(p)
  const id = `ysr-${Date.now()}-${randomUUID().slice(0, 8)}`
  await prisma.$executeRawUnsafe(
    `INSERT INTO "floor_yarn_requests" ("id","yarnType","kg","bags","neededBy","note","imageUrl","requestedBy","requestedById","log")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    id,
    c.yarnType,
    c.kg,
    c.bags,
    c.neededBy,
    c.note,
    c.imageUrl,
    by.name,
    by.id,
    JSON.stringify([reqLog(by.name, 'REQUESTED')])
  )
  return mustGetRequest(id)
}

/** Mill: change an open request. */
export async function updateYarnRequest(id: string, p: YarnRequestInput, by: string): Promise<YarnRequest> {
  const before = await mustGetRequest(id)
  if (before.status === 'CLOSED' || before.status === 'CANCELLED') throw new YarnError('This request is closed — reopen it first.', 409)
  const c = cleanRequest(p)
  const changed = [
    before.yarnType !== c.yarnType ? `yarn ${before.yarnType} → ${c.yarnType}` : '',
    before.kg !== c.kg ? `kg ${before.kg} → ${c.kg}` : '',
    (before.bags ?? null) !== c.bags ? `bags ${before.bags ?? '—'} → ${c.bags ?? '—'}` : '',
    (before.neededBy ?? null) !== c.neededBy ? `needed by ${before.neededBy ?? '—'} → ${c.neededBy ?? '—'}` : '',
  ]
    .filter(Boolean)
    .join(', ')
  await prisma.$executeRawUnsafe(
    `UPDATE "floor_yarn_requests" SET "yarnType" = $2, "kg" = $3, "bags" = $4, "neededBy" = $5, "note" = $6, "imageUrl" = $7,
       "updatedAt" = CURRENT_TIMESTAMP, "log" = "log" || $8::jsonb
     WHERE "id" = $1`,
    id,
    c.yarnType,
    c.kg,
    c.bags,
    c.neededBy,
    c.note,
    c.imageUrl,
    JSON.stringify([reqLog(by, 'EDITED', changed || undefined)])
  )
  return mustGetRequest(id)
}

/** Mill: close (done), cancel, or reopen a request. Lots already sent stay as they are. */
export async function setYarnRequestStatus(
  id: string,
  to: 'CLOSED' | 'CANCELLED' | 'OPEN',
  note: string,
  by: string
): Promise<YarnRequest> {
  const before = await mustGetRequest(id)
  const isOpen = before.status === 'OPEN' || before.status === 'COMPLETE'
  if (to === 'OPEN' && isOpen) return before
  if (to !== 'OPEN' && !isOpen) throw new YarnError('This request is already closed.', 409)
  const text = clip(note, 500)
  const action: YarnRequestLog['action'] = to === 'OPEN' ? 'REOPENED' : to === 'CLOSED' ? 'CLOSED' : 'CANCELLED'
  await prisma.$executeRawUnsafe(
    `UPDATE "floor_yarn_requests" SET "status" = $2, "closedBy" = $3, "closeNote" = $4,
       "closedAt" = CASE WHEN $2 = 'OPEN' THEN NULL ELSE CURRENT_TIMESTAMP END,
       "updatedAt" = CURRENT_TIMESTAMP, "log" = "log" || $5::jsonb
     WHERE "id" = $1`,
    id,
    to,
    to === 'OPEN' ? '' : by,
    to === 'OPEN' ? '' : text,
    JSON.stringify([reqLog(by, action, text || undefined)])
  )
  return mustGetRequest(id)
}

// ── Fazal Umer's store: his yarn inventory (added here, taken out by every dispatch) ─────────

type StockRow = {
  id: string
  yarnType: string
  date: string
  bags: number
  kg: number
  note: string
  supplierName: string | null
  bagKg: unknown
  createdBy: string
  createdAt: Date | string
  counts?: boolean | null
  fromTwist?: boolean | null
}

/** A JSONB list of bag weights → numbers (anything else → []). */
function bagList(v: unknown): number[] {
  let arr = v
  if (typeof v === 'string') {
    try {
      arr = JSON.parse(v)
    } catch {
      arr = []
    }
  }
  return Array.isArray(arr) ? arr.map((x) => r2(Number(x) || 0)).filter((x) => x > 0) : []
}

const toStock = (r: StockRow): SupplierStockEntry => ({
  id: r.id,
  yarnType: r.yarnType,
  date: r.date,
  bags: Number(r.bags) || 0,
  kg: r2(r.kg),
  note: r.note || '',
  supplierName: r.supplierName || '',
  bagKg: bagList(r.bagKg),
  createdBy: r.createdBy || '',
  createdAt: iso(r.createdAt) || '',
  beforeReset: r.counts === false,
  fromTwisting: Boolean(r.fromTwist),
})

/** One stock entry with its Balance flags (made before the reset? came back from Twisting?). */
const STOCK_SELECT = `SELECT a.*, ${afterReset('a')} AS "counts",
    EXISTS (SELECT 1 FROM "floor_supplier_twisting" t WHERE t."stockId" = a."id" AND t."deletedAt" IS NULL) AS "fromTwist"
  FROM "floor_supplier_stock" a`

export async function listSupplierStock(): Promise<SupplierStockEntry[]> {
  await ensureYarnDispatchTable()
  const rows = await prisma.$queryRawUnsafe<StockRow[]>(
    `${STOCK_SELECT} WHERE a."deletedAt" IS NULL ORDER BY a."date" DESC, a."createdAt" DESC LIMIT 5000`
  )
  return rows.map(toStock)
}

async function stockById(id: string): Promise<SupplierStockEntry> {
  const rows = await prisma.$queryRawUnsafe<StockRow[]>(`${STOCK_SELECT} WHERE a."id" = $1`, id)
  return toStock(rows[0])
}

const storeKey = (s: string) => s.toLowerCase().replace(/[\s\-_.]+/g, '')

/**
 * Per yarn (only entries after the latest Balance reset): added by hand + back from Twisting
 * − sent to Sara Textile, Sizing / Sectional Warping and Twisting.
 */
export async function supplierStoreBalances(): Promise<SupplierStoreBalance[]> {
  await ensureYarnDispatchTable()
  const ins = await prisma.$queryRawUnsafe<Array<{ yarnType: string; kg: number; bags: number; fromTwist: boolean }>>(
    `SELECT a."yarnType", a."kg", a."bags",
       EXISTS (SELECT 1 FROM "floor_supplier_twisting" t WHERE t."stockId" = a."id" AND t."deletedAt" IS NULL) AS "fromTwist"
     FROM "floor_supplier_stock" a WHERE a."deletedAt" IS NULL AND ${afterReset('a')}`
  )
  const outs = await prisma.$queryRawUnsafe<Array<{ yarnType: string; weightKg: number; bags: number; destination: string | null }>>(
    `SELECT a."yarnType", a."weightKg", a."bags", a."destination" FROM "floor_yarn_dispatches" a
     WHERE a."deletedAt" IS NULL AND ${afterReset('a')}`
  )
  const map = new Map<string, SupplierStoreBalance>()
  const row = (name: string) => {
    const k = storeKey(name)
    let b = map.get(k)
    if (!b) {
      b = {
        yarnType: name.trim(),
        inKg: 0,
        inBags: 0,
        outKg: 0,
        outBags: 0,
        balanceKg: 0,
        balanceBags: 0,
        addedKg: 0,
        addedBags: 0,
        fromTwistKg: 0,
        fromTwistBags: 0,
        toMillKg: 0,
        toMillBags: 0,
        toDeptKg: 0,
        toDeptBags: 0,
        toTwistKg: 0,
        toTwistBags: 0,
      }
      map.set(k, b)
    }
    return b
  }
  for (const r of ins) {
    const b = row(r.yarnType)
    const kg = Number(r.kg) || 0
    const bags = Number(r.bags) || 0
    b.inKg += kg
    b.inBags += bags
    if (r.fromTwist) {
      b.fromTwistKg += kg
      b.fromTwistBags += bags
    } else {
      b.addedKg += kg
      b.addedBags += bags
    }
  }
  for (const r of outs) {
    const b = row(r.yarnType)
    const kg = Number(r.weightKg) || 0
    const bags = Number(r.bags) || 0
    b.outKg += kg
    b.outBags += bags
    const dest = toDestination(r.destination)
    if (dest === 'MILL') {
      b.toMillKg += kg
      b.toMillBags += bags
    } else if (dest === 'TWISTING') {
      b.toTwistKg += kg
      b.toTwistBags += bags
    } else {
      b.toDeptKg += kg
      b.toDeptBags += bags
    }
  }
  return [...map.values()]
    .map((b) => ({
      ...b,
      inKg: r2(b.inKg),
      outKg: r2(b.outKg),
      balanceKg: r2(b.inKg - b.outKg),
      balanceBags: b.inBags - b.outBags,
      addedKg: r2(b.addedKg),
      fromTwistKg: r2(b.fromTwistKg),
      toMillKg: r2(b.toMillKg),
      toDeptKg: r2(b.toDeptKg),
      toTwistKg: r2(b.toTwistKg),
    }))
    .sort((a, b) => a.yarnType.localeCompare(b.yarnType))
}

/** Read only: every movement counted in the Balance (same rows as supplierStoreBalances), with its date. */
export async function supplierStoreMoves(): Promise<SupplierStoreMove[]> {
  await ensureYarnDispatchTable()
  const ins = await prisma.$queryRawUnsafe<Array<{ yarnType: string; date: string; kg: number; bags: number; fromTwist: boolean }>>(
    `SELECT a."yarnType", a."date", a."kg", a."bags",
       EXISTS (SELECT 1 FROM "floor_supplier_twisting" t WHERE t."stockId" = a."id" AND t."deletedAt" IS NULL) AS "fromTwist"
     FROM "floor_supplier_stock" a WHERE a."deletedAt" IS NULL AND ${afterReset('a')}`
  )
  const outs = await prisma.$queryRawUnsafe<Array<{ yarnType: string; sentDate: string; weightKg: number; bags: number; destination: string | null }>>(
    `SELECT a."yarnType", a."sentDate", a."weightKg", a."bags", a."destination" FROM "floor_yarn_dispatches" a
     WHERE a."deletedAt" IS NULL AND ${afterReset('a')}`
  )
  const moves: SupplierStoreMove[] = []
  for (const r of ins) {
    moves.push({ yarnType: r.yarnType.trim(), date: r.date, kg: r2(Number(r.kg) || 0), bags: Number(r.bags) || 0, kind: r.fromTwist ? 'fromTwist' : 'added' })
  }
  for (const r of outs) {
    const dest = toDestination(r.destination)
    moves.push({
      yarnType: r.yarnType.trim(),
      date: r.sentDate,
      kg: r2(Number(r.weightKg) || 0),
      bags: Number(r.bags) || 0,
      kind: dest === 'MILL' ? 'toMill' : dest === 'TWISTING' ? 'toTwist' : 'toDept',
    })
  }
  return moves
}

function cleanStock(p: SupplierStockInput, needSupplier = true) {
  const yarnType = clip(p?.yarnType, 120)
  if (!yarnType) throw new YarnError('Enter the yarn.')
  if (!isYmd(p.date) || p.date > today()) throw new YarnError('Pick a valid date (today or earlier).')
  const kg = r2(Number(p.kg))
  if (!Number.isFinite(kg) || kg <= 0 || kg > 1e7) throw new YarnError('Enter the kg.')
  const bags = Math.round(Number(p.bags) || 0)
  if (bags < 0 || bags > 100000) throw new YarnError('Enter a valid number of bags.')
  const supplierName = clip(p.supplierName, 120)
  if (needSupplier && !supplierName) throw new YarnError('Enter the supplier name (who the yarn came from).')
  return { yarnType, date: p.date, kg, bags, note: clip(p.note, 500), supplierName }
}

/** Adding to the Balance by hand: bags × one bag weight (Twisting moves keep each bag's kg). */
function cleanInventoryStock(p: SupplierStockInput) {
  const bags = Math.round(Number(p?.bags))
  if (!Number.isFinite(bags) || bags < 1 || bags > 100000) throw new YarnError('Enter the number of bags.')
  const w = r2(Number(p?.bagWeightKg))
  if (!Number.isFinite(w) || w <= 0 || w > 10000) throw new YarnError('Enter the weight of one bag.')
  return cleanStock({ ...p, bags, kg: r2(bags * w) })
}

/** Use the store's existing spelling when the yarn is already there. */
async function storeSpelling(name: string): Promise<string> {
  const k = storeKey(name)
  const rows = await prisma.$queryRawUnsafe<Array<{ yarnType: string }>>(
    `SELECT DISTINCT "yarnType" FROM "floor_supplier_stock" WHERE "deletedAt" IS NULL`
  )
  return rows.find((r) => storeKey(r.yarnType) === k)?.yarnType || name
}

export async function addSupplierStock(p: SupplierStockInput, by: { id: string; name: string }): Promise<SupplierStockEntry> {
  await ensureYarnDispatchTable()
  const c = cleanInventoryStock(p)
  const id = `yss-${Date.now()}-${randomUUID().slice(0, 8)}`
  await prisma.$executeRawUnsafe(
    `INSERT INTO "floor_supplier_stock" ("id","yarnType","date","bags","kg","note","createdBy","createdById","supplierName")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    id,
    await storeSpelling(c.yarnType),
    c.date,
    c.bags,
    c.kg,
    c.note,
    by.name,
    by.id,
    c.supplierName
  )
  return stockById(id)
}

/**
 * A Balance entry that came from Twisting is changed only from Twisting; one made before the
 * Balance reset is kept as history (it no longer counts) and cannot be changed.
 */
async function assertNotFromTwisting(stockId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "floor_supplier_twisting" WHERE "stockId" = $1 AND "deletedAt" IS NULL`,
    stockId
  )
  if (rows[0]) throw new YarnError('This entry came back from Twisting — change it on the Twisting page (Edit or Undo).', 409)
  const old = await prisma.$queryRawUnsafe<Array<{ counts: boolean }>>(
    `SELECT ${afterReset('a')} AS "counts" FROM "floor_supplier_stock" a WHERE a."id" = $1 AND a."deletedAt" IS NULL`,
    stockId
  )
  if (old[0] && !old[0].counts) {
    throw new YarnError('This entry is from before the Balance was reset to zero — it is kept as history and cannot be changed.', 409)
  }
}

export async function updateSupplierStock(id: string, p: SupplierStockInput): Promise<SupplierStockEntry> {
  await ensureYarnDispatchTable()
  await assertNotFromTwisting(id)
  const c = cleanInventoryStock(p)
  const name = await storeSpelling(c.yarnType)
  const n = await prisma.$transaction(async (tx) => {
    await lockStore(tx)
    const cur = await tx.$queryRawUnsafe<Array<{ yarnType: string; kg: number }>>(
      `SELECT "yarnType", "kg" FROM "floor_supplier_stock" WHERE "id" = $1 AND "deletedAt" IS NULL`,
      id
    )
    if (cur[0]) {
      const oldKg = Number(cur[0].kg) || 0
      const lost = storeKey(cur[0].yarnType) === storeKey(c.yarnType) ? oldKg - c.kg : oldKg
      await assertInventoryCanLose(tx, cur[0].yarnType, lost)
    }
    return tx.$executeRawUnsafe(
      `UPDATE "floor_supplier_stock" SET "yarnType" = $2, "date" = $3, "bags" = $4, "kg" = $5, "note" = $6, "supplierName" = $7,
         "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1 AND "deletedAt" IS NULL`,
      id,
      name,
      c.date,
      c.bags,
      c.kg,
      c.note,
      c.supplierName
    )
  })
  if (!n) throw new YarnError('This stock entry was not found. Please refresh the page.', 404)
  return stockById(id)
}

export async function deleteSupplierStock(id: string): Promise<void> {
  await ensureYarnDispatchTable()
  await assertNotFromTwisting(id)
  const n = await prisma.$transaction(async (tx) => {
    await lockStore(tx)
    const cur = await tx.$queryRawUnsafe<Array<{ yarnType: string; kg: number }>>(
      `SELECT "yarnType", "kg" FROM "floor_supplier_stock" WHERE "id" = $1 AND "deletedAt" IS NULL`,
      id
    )
    if (cur[0]) await assertInventoryCanLose(tx, cur[0].yarnType, Number(cur[0].kg) || 0)
    return tx.$executeRawUnsafe(`UPDATE "floor_supplier_stock" SET "deletedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "deletedAt" IS NULL`, id)
  })
  if (!n) throw new YarnError('This stock entry was not found. Please refresh the page.', 404)
}

// ── Twisting: yarn issued from the Balance → (done) twisted yarn moved back into the Balance ──────

type TwistRow = {
  id: string
  status: string
  inYarnType: string
  inDate: string
  inBags: number
  inKg: number
  note: string
  outYarnType: string
  outDate: string | null
  outBags: number | null
  outKg: number | null
  outBagKg: unknown
  supplierName: string | null
  stockId: string | null
  dispatchId: string | null
  createdBy: string
  movedBy: string
}

const toTwist = (r: TwistRow): SupplierTwisting => ({
  id: r.id,
  status: r.status === 'DONE' ? 'DONE' : 'IN_TWISTING',
  inYarnType: r.inYarnType,
  inDate: r.inDate,
  inBags: Number(r.inBags) || 0,
  inKg: r2(r.inKg),
  note: r.note || '',
  supplierName: r.supplierName || '',
  outYarnType: r.outYarnType || '',
  outDate: r.outDate,
  outBags: r.outBags == null ? null : Number(r.outBags),
  outKg: r.outKg == null ? null : r2(r.outKg),
  outBagKg: bagList(r.outBagKg),
  dispatchId: r.dispatchId || null,
  createdBy: r.createdBy || '',
  movedBy: r.movedBy || '',
})

export async function listSupplierTwisting(): Promise<SupplierTwisting[]> {
  await ensureYarnDispatchTable()
  const rows = await prisma.$queryRawUnsafe<TwistRow[]>(
    `SELECT * FROM "floor_supplier_twisting" WHERE "deletedAt" IS NULL
     ORDER BY CASE "status" WHEN 'IN_TWISTING' THEN 0 ELSE 1 END, "inDate" DESC, "createdAt" DESC LIMIT 500`
  )
  return rows.map(toTwist)
}

async function mustGetTwist(id: string, db: RawClient = prisma, lock = false): Promise<TwistRow> {
  await ensureYarnDispatchTable()
  const rows = await db.$queryRawUnsafe<TwistRow[]>(
    `SELECT * FROM "floor_supplier_twisting" WHERE "id" = $1 AND "deletedAt" IS NULL${lock ? ' FOR UPDATE' : ''}`,
    id
  )
  if (!rows[0]) throw new YarnError('This twisting lot was not found. Please refresh the page.', 404)
  return rows[0]
}

/** A lot issued from the Balance is changed through its issue (Edit / Delete on the Twisting page). */
function assertNotIssued(t: TwistRow) {
  if (t.dispatchId) throw new YarnError('This lot was issued from the Balance — change or delete it with its Edit / Delete buttons.', 409)
}

/** Old lots only (added straight to Twisting before issuing from the Balance existed). */
export async function addSupplierTwisting(p: SupplierTwistingInput, by: { id: string; name: string }): Promise<SupplierTwisting> {
  await ensureYarnDispatchTable()
  const c = cleanStock(p)
  const id = `yst-${Date.now()}-${randomUUID().slice(0, 8)}`
  await prisma.$executeRawUnsafe(
    `INSERT INTO "floor_supplier_twisting" ("id","inYarnType","inDate","inBags","inKg","note","createdBy","createdById","supplierName")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    id,
    c.yarnType,
    c.date,
    c.bags,
    c.kg,
    c.note,
    by.name,
    by.id,
    c.supplierName
  )
  return toTwist(await mustGetTwist(id))
}

export async function updateSupplierTwisting(id: string, p: SupplierTwistingInput): Promise<SupplierTwisting> {
  const before = await mustGetTwist(id)
  assertNotIssued(before)
  if (before.status === 'DONE') throw new YarnError('Already moved to the Balance — undo that first.', 409)
  const c = cleanStock(p)
  await prisma.$executeRawUnsafe(
    `UPDATE "floor_supplier_twisting" SET "inYarnType" = $2, "inDate" = $3, "inBags" = $4, "inKg" = $5, "note" = $6, "supplierName" = $7,
       "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = $1 AND "status" = 'IN_TWISTING'`,
    id,
    c.yarnType,
    c.date,
    c.bags,
    c.kg,
    c.note,
    c.supplierName
  )
  return toTwist(await mustGetTwist(id))
}

export async function deleteSupplierTwisting(id: string): Promise<void> {
  const before = await mustGetTwist(id)
  assertNotIssued(before)
  if (before.status === 'DONE') throw new YarnError('Already moved to the Balance — undo that first.', 409)
  await prisma.$executeRawUnsafe(
    `UPDATE "floor_supplier_twisting" SET "deletedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "status" = 'IN_TWISTING'`,
    id
  )
}

/** The twisted yarn coming back: each bag's kg (kg = their total), on or after the day it went in. */
function cleanTwistOut(before: TwistRow, out: SupplierTwistingOut) {
  const bagKg = Array.isArray(out?.bagKg) ? out.bagKg.map((w) => r2(Number(w))) : []
  if (bagKg.length < 1 || bagKg.length > 200) throw new YarnError('Enter the bags (1 to 200).')
  if (bagKg.some((w) => !Number.isFinite(w) || w <= 0 || w > 10000)) throw new YarnError('Enter the weight of every bag.')
  // The twisted yarn keeps the supplier of the raw lot.
  const c = cleanStock(
    {
      yarnType: String(out?.yarnType || ''),
      date: String(out?.date || ''),
      bags: bagKg.length,
      kg: r2(bagKg.reduce((a, w) => a + w, 0)),
      supplierName: before.supplierName || '',
    },
    false
  )
  if (c.date < before.inDate) throw new YarnError('The date cannot be before it went into Twisting.')
  return { ...c, bagKg }
}

const twistNote = (t: TwistRow) => `From Twisting (${t.inYarnType}, ${r2(t.inKg)} kg in)`

/** Twisting done: the twisted yarn goes back into the Balance (a stock entry linked to this lot). */
export async function finishSupplierTwisting(id: string, out: SupplierTwistingOut, by: { id: string; name: string }): Promise<SupplierTwisting> {
  const first = await mustGetTwist(id)
  if (first.status === 'DONE') throw new YarnError('Already moved to the Balance.', 409)
  const c = cleanTwistOut(first, out)
  const name = await storeSpelling(c.yarnType)
  const stockId = `yss-${Date.now()}-${randomUUID().slice(0, 8)}`
  await prisma.$transaction(async (tx) => {
    await lockStore(tx)
    const before = await mustGetTwist(id, tx, true)
    if (before.status === 'DONE') throw new YarnError('Already moved to the Balance.', 409)
    await tx.$executeRawUnsafe(
      `INSERT INTO "floor_supplier_stock" ("id","yarnType","date","bags","kg","note","createdBy","createdById","supplierName","bagKg")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      stockId,
      name,
      c.date,
      c.bags,
      c.kg,
      twistNote(before),
      by.name,
      by.id,
      c.supplierName,
      JSON.stringify(c.bagKg)
    )
    await tx.$executeRawUnsafe(
      `UPDATE "floor_supplier_twisting" SET "status" = 'DONE', "outYarnType" = $2, "outDate" = $3, "outBags" = $4, "outKg" = $5,
         "stockId" = $6, "movedBy" = $7, "outBagKg" = $8::jsonb, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1 AND "status" = 'IN_TWISTING'`,
      id,
      name,
      c.date,
      c.bags,
      c.kg,
      stockId,
      by.name,
      JSON.stringify(c.bagKg)
    )
  })
  return toTwist(await mustGetTwist(id))
}

/** Correct a lot already moved back to the Balance: its Balance entry changes with it (never below zero). */
export async function updateFinishedTwisting(id: string, out: SupplierTwistingOut, by: { id: string; name: string }): Promise<SupplierTwisting> {
  const first = await mustGetTwist(id)
  if (first.status !== 'DONE') throw new YarnError('Not moved to the Balance yet — use Move to Balance.', 409)
  const c = cleanTwistOut(first, out)
  const name = await storeSpelling(c.yarnType)
  await prisma.$transaction(async (tx) => {
    await lockStore(tx)
    const before = await mustGetTwist(id, tx, true)
    if (before.status !== 'DONE' || !before.stockId) throw new YarnError('Not moved to the Balance yet — use Move to Balance.', 409)
    if (await countsInBalance(tx, 'floor_supplier_stock', before.stockId)) {
      const oldKg = Number(before.outKg) || 0
      const lost = storeKey(before.outYarnType) === storeKey(name) ? oldKg - c.kg : oldKg
      await assertInventoryCanLose(tx, before.outYarnType, lost)
    }
    await tx.$executeRawUnsafe(
      `UPDATE "floor_supplier_stock" SET "yarnType" = $2, "date" = $3, "bags" = $4, "kg" = $5, "bagKg" = $6::jsonb, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      before.stockId,
      name,
      c.date,
      c.bags,
      c.kg,
      JSON.stringify(c.bagKg)
    )
    await tx.$executeRawUnsafe(
      `UPDATE "floor_supplier_twisting" SET "outYarnType" = $2, "outDate" = $3, "outBags" = $4, "outKg" = $5, "outBagKg" = $6::jsonb,
         "movedBy" = $7, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      id,
      name,
      c.date,
      c.bags,
      c.kg,
      JSON.stringify(c.bagKg),
      by.name
    )
  })
  return toTwist(await mustGetTwist(id))
}

/** Undo "moved to the Balance": its Balance entry is removed and the lot is back in Twisting. */
export async function undoSupplierTwisting(id: string): Promise<SupplierTwisting> {
  const first = await mustGetTwist(id)
  if (first.status !== 'DONE') return toTwist(first)
  await prisma.$transaction(async (tx) => {
    await lockStore(tx)
    const before = await mustGetTwist(id, tx, true)
    if (before.status !== 'DONE') return
    if (before.stockId && (await countsInBalance(tx, 'floor_supplier_stock', before.stockId))) {
      await assertInventoryCanLose(tx, before.outYarnType, Number(before.outKg) || 0)
    }
    await tx.$executeRawUnsafe(`UPDATE "floor_supplier_stock" SET "deletedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, before.stockId || '')
    await tx.$executeRawUnsafe(
      `UPDATE "floor_supplier_twisting" SET "status" = 'IN_TWISTING', "outYarnType" = '', "outDate" = NULL, "outBags" = NULL,
         "outKg" = NULL, "outBagKg" = NULL, "stockId" = NULL, "movedBy" = '', "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      id
    )
  })
  return toTwist(await mustGetTwist(id))
}

// ── Reset the Balance to zero (admin): a fresh start; older entries stay as history ─────────────

type ResetRow = { id: string; at: Date | string; by: string }

/** The reset in force (latest not undone), and whether it can still be undone (nothing entered after it). */
export async function supplierBalanceReset(): Promise<SupplierBalanceReset | null> {
  await ensureYarnDispatchTable()
  const rows = await prisma.$queryRawUnsafe<Array<ResetRow & { later: boolean }>>(
    `SELECT r."id", r."at", r."by",
       (EXISTS (SELECT 1 FROM "floor_supplier_stock" s WHERE s."createdAt" > r."at")
         OR EXISTS (SELECT 1 FROM "floor_yarn_dispatches" d WHERE d."createdAt" > r."at")) AS "later"
     FROM "floor_supplier_balance_resets" r WHERE r."undoneAt" IS NULL ORDER BY r."at" DESC LIMIT 1`
  )
  const r = rows[0]
  return r ? { at: iso(r.at) || '', by: r.by || '', canUndo: !r.later } : null
}

export async function resetSupplierBalance(by: { id: string; name: string }): Promise<SupplierBalanceReset | null> {
  await ensureYarnDispatchTable()
  await prisma.$transaction(async (tx) => {
    await lockStore(tx)
    await tx.$executeRawUnsafe(
      `INSERT INTO "floor_supplier_balance_resets" ("id","by","byId") VALUES ($1,$2,$3)`,
      `ysz-${Date.now()}-${randomUUID().slice(0, 8)}`,
      by.name,
      by.id
    )
  })
  return supplierBalanceReset()
}

/** Undo a reset pressed by mistake — only while nothing has been added or sent after it. */
export async function undoSupplierBalanceReset(by: string): Promise<SupplierBalanceReset | null> {
  await ensureYarnDispatchTable()
  await prisma.$transaction(async (tx) => {
    await lockStore(tx)
    const rows = await tx.$queryRawUnsafe<Array<ResetRow & { later: boolean }>>(
      `SELECT r."id", r."at", r."by",
         (EXISTS (SELECT 1 FROM "floor_supplier_stock" s WHERE s."createdAt" > r."at")
           OR EXISTS (SELECT 1 FROM "floor_yarn_dispatches" d WHERE d."createdAt" > r."at")) AS "later"
       FROM "floor_supplier_balance_resets" r WHERE r."undoneAt" IS NULL ORDER BY r."at" DESC LIMIT 1 FOR UPDATE OF r`
    )
    const r = rows[0]
    if (!r) throw new YarnError('The Balance has not been reset.', 409)
    if (r.later) throw new YarnError('Stock has been added or yarn sent after the reset — the reset can no longer be undone.', 409)
    await tx.$executeRawUnsafe(
      `UPDATE "floor_supplier_balance_resets" SET "undoneAt" = CURRENT_TIMESTAMP, "undoneBy" = $2 WHERE "id" = $1`,
      r.id,
      by
    )
  })
  return supplierBalanceReset()
}
