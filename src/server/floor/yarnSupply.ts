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
} from '@/lib/floor/yarnSupply'

export type { YarnDispatch, YarnDispatchInput, YarnReceiveInput, YarnRequest, YarnRequestInput }

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
    "requestedBy" TEXT NOT NULL DEFAULT '',
    "requestedById" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" TEXT NOT NULL DEFAULT '',
    "closeNote" TEXT NOT NULL DEFAULT '',
    "closedAt" TIMESTAMP(3),
    "log" JSONB NOT NULL DEFAULT '[]'::jsonb
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

function toDispatch(r: Row): YarnDispatch {
  const status: YarnDispatchStatus = r.status === 'VERIFIED' ? 'VERIFIED' : r.status === 'ISSUE' ? 'ISSUE' : 'PENDING'
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
    requestId: p.requestId ? clip(p.requestId, 80) : null,
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
  if (rows[0].status !== 'OPEN') throw new YarnError('That request is closed by the mill — send without it, or ask the mill.', 409)
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
    `SELECT * FROM "floor_yarn_dispatches" WHERE "deletedAt" IS NULL
     ORDER BY CASE "status" WHEN 'VERIFIED' THEN 1 ELSE 0 END, "sentDate" DESC, "createdAt" DESC LIMIT 500`
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

/** Supplier: a new lot sent. */
export async function createYarnDispatch(p: YarnDispatchInput, by: { id: string; name: string }): Promise<YarnDispatch> {
  await ensureYarnDispatchTable()
  const c = cleanInput(p)
  await checkRequestLink(c.requestId)
  const id = `ysd-${Date.now()}-${randomUUID().slice(0, 8)}`
  await prisma.$executeRawUnsafe(
    `INSERT INTO "floor_yarn_dispatches"
      ("id","status","yarnType","sentDate","bags","bagKg","weightKg","challanNo","lotNo","vehicleNo","remarks","createdBy","createdById","log","requestId")
     VALUES ($1,'PENDING',$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)`,
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
    JSON.stringify([logEntry(by.name, 'SENT')]),
    c.requestId
  )
  return mustGet(id)
}

/** Supplier: correct an entry the mill has not verified yet (after an issue it goes back for checking). */
export async function updateYarnDispatch(id: string, p: YarnDispatchInput, by: string): Promise<YarnDispatch> {
  const before = await mustGet(id)
  if (before.status === 'VERIFIED') throw new YarnError('Already verified by the mill — it can no longer be changed here.', 409)
  const c = cleanInput(p)
  await checkRequestLink(c.requestId, before.requestId)
  const note = before.status === 'ISSUE' ? `Corrected after: ${before.issueNote}` : undefined
  await prisma.$executeRawUnsafe(
    `UPDATE "floor_yarn_dispatches" SET
       "status" = 'PENDING', "yarnType" = $2, "sentDate" = $3, "bags" = $4, "bagKg" = $5::jsonb, "weightKg" = $6,
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
    c.requestId
  )
  return mustGet(id)
}

/** Supplier: remove an entry sent by mistake (not once verified). */
export async function deleteYarnDispatch(id: string): Promise<YarnDispatch> {
  const before = await mustGet(id)
  if (before.status === 'VERIFIED') throw new YarnError('Already verified by the mill — it cannot be deleted.', 409)
  await prisma.$executeRawUnsafe(
    `UPDATE "floor_yarn_dispatches" SET "deletedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "status" <> 'VERIFIED'`,
    id
  )
  return before
}

/** Mill: something is wrong — the supplier sees the note and corrects the entry. */
export async function reportYarnDispatchIssue(id: string, note: string, by: string): Promise<YarnDispatch> {
  const before = await mustGet(id)
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
  requestedBy: string
  createdAt: Date | string
  closedBy: string
  closeNote: string
  log: unknown
  lots: number | bigint
  sentKg: number | null
  receivedKg: number | null
}

function toRequest(r: RequestRow): YarnRequest {
  const sentKg = r2(Number(r.sentKg) || 0)
  const kg = r2(r.kg)
  const base = r.status === 'CANCELLED' ? 'CANCELLED' : r.status === 'CLOSED' ? 'CLOSED' : 'OPEN'
  return {
    id: r.id,
    status: base === 'OPEN' && kg > 0 && sentKg >= kg ? 'COMPLETE' : base,
    yarnType: r.yarnType,
    kg,
    bags: r.bags == null ? null : Number(r.bags),
    neededBy: r.neededBy,
    note: r.note || '',
    requestedBy: r.requestedBy || '',
    createdAt: iso(r.createdAt) || '',
    closedBy: r.closedBy || '',
    closeNote: r.closeNote || '',
    lots: Number(r.lots) || 0,
    sentKg,
    receivedKg: r2(Number(r.receivedKg) || 0),
    log: Array.isArray(r.log) ? (r.log as YarnRequestLog[]) : [],
  }
}

const REQUEST_SELECT = `
  SELECT q.*,
    COUNT(d."id") AS "lots",
    COALESCE(SUM(d."weightKg"), 0) AS "sentKg",
    COALESCE(SUM(CASE WHEN d."status" = 'VERIFIED' THEN d."receivedKg" ELSE 0 END), 0) AS "receivedKg"
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
  const kg = r2(Number(p.kg))
  if (!Number.isFinite(kg) || kg <= 0 || kg > 1e7) throw new YarnError('Enter the quantity in kg.')
  const bagsRaw = p.bags == null || String(p.bags).trim() === '' ? null : Math.round(Number(p.bags))
  if (bagsRaw != null && (!Number.isFinite(bagsRaw) || bagsRaw < 0 || bagsRaw > 10000)) throw new YarnError('Enter a valid number of bags.')
  const neededBy = p.neededBy ? String(p.neededBy) : null
  if (neededBy && !isYmd(neededBy)) throw new YarnError('Pick a valid needed-by date.')
  return { yarnType, kg, bags: bagsRaw || null, neededBy, note: clip(p.note, 500) }
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
    `INSERT INTO "floor_yarn_requests" ("id","yarnType","kg","bags","neededBy","note","requestedBy","requestedById","log")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    id,
    c.yarnType,
    c.kg,
    c.bags,
    c.neededBy,
    c.note,
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
    `UPDATE "floor_yarn_requests" SET "yarnType" = $2, "kg" = $3, "bags" = $4, "neededBy" = $5, "note" = $6,
       "updatedAt" = CURRENT_TIMESTAMP, "log" = "log" || $7::jsonb
     WHERE "id" = $1`,
    id,
    c.yarnType,
    c.kg,
    c.bags,
    c.neededBy,
    c.note,
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
