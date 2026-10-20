import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import type {
  Bill,
  BillLine,
  CostBucket,
  CostInputs,
  MonthLock,
  Party,
  PartyKind,
  PayAccount,
  Payment,
  PaymentKind,
  PaymentMode,
  PettyCashEntry,
  PettyCashKind,
} from '@/lib/accounts/types'
import { lineAmount, monthOfDate, slugifyPartyName } from '@/lib/accounts/util'
import { AccountsError, lockedError, staleError } from '@/server/accounts/errors'
import { ensureAccountsTables } from '@/server/accounts/schema'

/**
 * Accounts data access. Plain SQL (like the production ledger) so the tables need no
 * generated Prisma models. Works on `prisma` or on a transaction client.
 */
export type Db = {
  $queryRawUnsafe: typeof prisma.$queryRawUnsafe
  $executeRawUnsafe: typeof prisma.$executeRawUnsafe
}

type Row = Record<string, unknown>
const n = (v: unknown) => (v == null ? 0 : Number(v))
const s = (v: unknown) => (v == null ? '' : String(v))

/** Run `fn` in one transaction after the tables exist. */
export async function inTx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  await ensureAccountsTables()
  return prisma.$transaction((tx) => fn(tx as unknown as Db), { timeout: 20000 })
}

export async function db(): Promise<Db> {
  await ensureAccountsTables()
  return prisma as unknown as Db
}

// ---------------------------------------------------------------- mappers

const PARTY_COLS = `"id","name","slug","kind","category","costBucket","remarks","active","account","version"`
function toParty(r: Row): Party {
  return {
    id: s(r.id),
    name: s(r.name),
    slug: s(r.slug),
    kind: s(r.kind) as PartyKind,
    category: s(r.category),
    costBucket: s(r.costBucket) as CostBucket,
    remarks: s(r.remarks),
    active: Boolean(r.active),
    account: s(r.account) === 'FOI' ? 'FOI' : 'SARA',
    version: n(r.version),
  }
}

const BILL_COLS = `b."id", b."partyId", b."month", to_char(b."date",'YYYY-MM-DD') AS "date", b."billNo", b."inwardNo",
  b."remarks", b."sortOrder", b."version"`
const LINE_COLS = `l."id", l."billId", l."lineNo", l."description", l."machine",
  l."quantity"::float8 AS "quantity", l."rate"::float8 AS "rate", l."amount"::float8 AS "amount"`

function toLine(r: Row): BillLine {
  return {
    id: s(r.id),
    lineNo: n(r.lineNo),
    description: s(r.description),
    machine: s(r.machine),
    quantity: n(r.quantity),
    rate: n(r.rate),
    amount: n(r.amount),
  }
}

function assemble(bills: Row[], lines: Row[]): Bill[] {
  const byBill = new Map<string, BillLine[]>()
  for (const l of lines) {
    const id = s(l.billId)
    const list = byBill.get(id) || []
    list.push(toLine(l))
    byBill.set(id, list)
  }
  return bills.map((b) => {
    const ls = (byBill.get(s(b.id)) || []).sort((a, c) => a.lineNo - c.lineNo)
    return {
      id: s(b.id),
      partyId: s(b.partyId),
      month: s(b.month),
      date: s(b.date),
      billNo: s(b.billNo),
      inwardNo: s(b.inwardNo),
      remarks: s(b.remarks),
      sortOrder: n(b.sortOrder),
      version: n(b.version),
      lines: ls,
      total: ls.reduce((t, l) => t + l.amount, 0),
    }
  })
}

// ---------------------------------------------------------------- month locks

export async function getLock(dbc: Db, month: string): Promise<MonthLock> {
  const rows = await dbc.$queryRawUnsafe<Row[]>(
    `SELECT "month","locked","lockedBy",to_char("lockedAt",'YYYY-MM-DD"T"HH24:MI:SS') AS "lockedAt"
     FROM "acc_month_locks" WHERE "month" = $1`,
    month
  )
  const r = rows[0]
  return r
    ? { month, locked: Boolean(r.locked), lockedBy: (r.lockedBy as string) ?? null, lockedAt: (r.lockedAt as string) ?? null }
    : { month, locked: false }
}

export async function assertUnlocked(dbc: Db, ...months: string[]): Promise<void> {
  for (const m of [...new Set(months.filter(Boolean))]) {
    if ((await getLock(dbc, m)).locked) throw lockedError(m)
  }
}

export async function setLock(dbc: Db, month: string, locked: boolean, by: string | null): Promise<MonthLock> {
  await dbc.$executeRawUnsafe(
    `INSERT INTO "acc_month_locks" ("month","locked","lockedBy","lockedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)
     ON CONFLICT ("month") DO UPDATE SET "locked" = EXCLUDED."locked", "lockedBy" = EXCLUDED."lockedBy", "lockedAt" = CURRENT_TIMESTAMP`,
    month,
    locked,
    by
  )
  return getLock(dbc, month)
}

// ---------------------------------------------------------------- parties

export async function listParties(dbc: Db, includeInactive = true): Promise<Party[]> {
  const rows = await dbc.$queryRawUnsafe<Row[]>(
    `SELECT ${PARTY_COLS} FROM "acc_parties" ${includeInactive ? '' : 'WHERE "active"'} ORDER BY lower("name")`
  )
  return rows.map(toParty)
}

export async function getParty(dbc: Db, idOrSlug: string): Promise<Party | null> {
  const rows = await dbc.$queryRawUnsafe<Row[]>(
    `SELECT ${PARTY_COLS} FROM "acc_parties" WHERE "id" = $1 OR "slug" = $1 LIMIT 1`,
    idOrSlug
  )
  return rows[0] ? toParty(rows[0]) : null
}

/** Default Cost Statement block for a new party (the accountant can change it). */
export function defaultCostBucket(name: string, kind: PartyKind, category = ''): CostBucket {
  // Same split as the Excel Cost Statement: electronics → Electric / Maintenance,
  // workshops and repairers → Repair, everyone else → Machinery Parts.
  const n = `${name} ${category}`.toLowerCase()
  if (/\b(smd|jab)\b|electronic|textile engineering/.test(n)) return 'ELECTRIC'
  if (kind === 'WORKSHOP' || /marhaba|repair/.test(n)) return 'REPAIR'
  return 'MACHINERY'
}

export async function createParty(
  dbc: Db,
  input: { name: string; kind: PartyKind; category?: string; costBucket?: CostBucket; remarks?: string; account?: PayAccount }
): Promise<Party> {
  const name = input.name.trim().replace(/\s+/g, ' ')
  const slug = slugifyPartyName(name)
  if (!slug) throw new AccountsError(400, 'Party name is empty.')
  const existing = await getParty(dbc, slug)
  if (existing) {
    if (existing.active) throw new AccountsError(409, `"${existing.name}" pehle se maujood hai.`, 'CONFLICT')
    // Re-adding a removed party brings it back with its history.
    await dbc.$executeRawUnsafe(
      `UPDATE "acc_parties" SET "active" = TRUE, "name" = $2, "kind" = $3, "category" = $4, "remarks" = $5,
         "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
      existing.id,
      name,
      input.kind,
      input.category ?? existing.category,
      input.remarks ?? existing.remarks
    )
    return (await getParty(dbc, existing.id))!
  }
  const id = randomUUID()
  await dbc.$executeRawUnsafe(
    `INSERT INTO "acc_parties" ("id","name","slug","kind","category","costBucket","remarks","account") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    id,
    name,
    slug,
    input.kind,
    input.category || '',
    input.costBucket || defaultCostBucket(name, input.kind, input.category),
    input.remarks || '',
    input.account || 'SARA'
  )
  return (await getParty(dbc, id))!
}

/** Find a party by name (any spelling that slugs the same) or create it. */
export async function findOrCreateParty(dbc: Db, name: string, kind: PartyKind): Promise<Party> {
  const found = await getParty(dbc, slugifyPartyName(name))
  if (found) {
    if (!found.active) {
      await dbc.$executeRawUnsafe(
        `UPDATE "acc_parties" SET "active" = TRUE, "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        found.id
      )
      return { ...found, active: true, version: found.version + 1 }
    }
    return found
  }
  return createParty(dbc, { name, kind })
}

export async function updateParty(
  dbc: Db,
  id: string,
  baseVersion: number,
  patch: Partial<Pick<Party, 'name' | 'kind' | 'category' | 'costBucket' | 'remarks' | 'active' | 'account'>>
): Promise<Party> {
  const cur = await getParty(dbc, id)
  if (!cur) throw new AccountsError(404, 'Party not found.', 'NOT_FOUND')
  if (cur.version !== baseVersion) throw staleError()
  const name = patch.name?.trim().replace(/\s+/g, ' ') ?? cur.name
  const slug = slugifyPartyName(name)
  if (slug !== cur.slug) {
    const clash = await getParty(dbc, slug)
    if (clash && clash.id !== id) throw new AccountsError(409, `"${clash.name}" naam pehle se maujood hai.`, 'CONFLICT')
  }
  await dbc.$executeRawUnsafe(
    `UPDATE "acc_parties" SET "name"=$2,"slug"=$3,"kind"=$4,"category"=$5,"costBucket"=$6,"remarks"=$7,"active"=$8,
       "account"=$9,"version"="version"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`,
    id,
    name,
    slug,
    patch.kind ?? cur.kind,
    patch.category ?? cur.category,
    patch.costBucket ?? cur.costBucket,
    patch.remarks ?? cur.remarks,
    patch.active ?? cur.active,
    patch.account ?? cur.account
  )
  return (await getParty(dbc, id))!
}

// ---------------------------------------------------------------- bills

export async function listBills(dbc: Db, where: { month?: string; partyId?: string }): Promise<Bill[]> {
  const cond: string[] = []
  const params: unknown[] = []
  if (where.month) {
    params.push(where.month)
    cond.push(`b."month" = $${params.length}`)
  }
  if (where.partyId) {
    params.push(where.partyId)
    cond.push(`b."partyId" = $${params.length}`)
  }
  const whereSql = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
  const bills = await dbc.$queryRawUnsafe<Row[]>(
    `SELECT ${BILL_COLS} FROM "acc_bills" b ${whereSql} ORDER BY b."month", b."sortOrder", b."createdAt", b."id"`,
    ...params
  )
  if (!bills.length) return []
  const lines = await dbc.$queryRawUnsafe<Row[]>(
    `SELECT ${LINE_COLS} FROM "acc_bill_lines" l WHERE l."billId" = ANY($1::text[])`,
    bills.map((b) => s(b.id))
  )
  return assemble(bills, lines)
}

export async function getBill(dbc: Db, id: string): Promise<Bill | null> {
  const bills = await dbc.$queryRawUnsafe<Row[]>(`SELECT ${BILL_COLS} FROM "acc_bills" b WHERE b."id" = $1`, id)
  if (!bills.length) return null
  const lines = await dbc.$queryRawUnsafe<Row[]>(`SELECT ${LINE_COLS} FROM "acc_bill_lines" l WHERE l."billId" = $1`, id)
  return assemble(bills, lines)[0]
}

type LineInput = { id?: string; description: string; machine?: string; quantity: number; rate: number }

async function insertLines(dbc: Db, billId: string, lines: LineInput[]): Promise<void> {
  let no = 1
  for (const l of lines) {
    await dbc.$executeRawUnsafe(
      `INSERT INTO "acc_bill_lines" ("id","billId","lineNo","description","machine","quantity","rate","amount")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      l.id && /^[\w-]{6,64}$/.test(l.id) ? l.id : randomUUID(),
      billId,
      no++,
      l.description.trim(),
      (l.machine || '').trim(),
      Number(l.quantity) || 0,
      Number(l.rate) || 0,
      lineAmount(l.quantity, l.rate)
    )
  }
}

export async function createBill(
  dbc: Db,
  input: {
    month: string
    date: string
    billNo: string
    inwardNo: string
    partyId: string
    remarks: string
    lines: LineInput[]
    afterBillId?: string
    createdBy?: string | null
    id?: string
  }
): Promise<Bill> {
  await assertUnlocked(dbc, input.month)
  let sortOrder: number
  const after = input.afterBillId ? await getBill(dbc, input.afterBillId) : null
  if (after && after.month === input.month) {
    sortOrder = after.sortOrder + 1
    await dbc.$executeRawUnsafe(
      `UPDATE "acc_bills" SET "sortOrder" = "sortOrder" + 1 WHERE "month" = $1 AND "sortOrder" >= $2`,
      input.month,
      sortOrder
    )
  } else {
    const r = await dbc.$queryRawUnsafe<Row[]>(
      `SELECT COALESCE(max("sortOrder"), 0) + 1 AS next FROM "acc_bills" WHERE "month" = $1`,
      input.month
    )
    sortOrder = n(r[0]?.next) || 1
  }
  const id = input.id || randomUUID()
  await dbc.$executeRawUnsafe(
    `INSERT INTO "acc_bills" ("id","partyId","month","date","billNo","inwardNo","remarks","sortOrder","createdBy")
     VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9)`,
    id,
    input.partyId,
    input.month,
    input.date,
    input.billNo.trim(),
    input.inwardNo.trim(),
    input.remarks.trim(),
    sortOrder,
    input.createdBy ?? null
  )
  await insertLines(dbc, id, input.lines)
  return (await getBill(dbc, id))!
}

/** Bump a bill's version only if the caller saw the latest one (else 409). */
async function claimBill(dbc: Db, id: string, baseVersion: number): Promise<Bill> {
  const cur = await getBill(dbc, id)
  if (!cur) throw new AccountsError(404, 'Bill not found (shayad delete ho chuka hai).', 'NOT_FOUND')
  await assertUnlocked(dbc, cur.month)
  const done = await dbc.$executeRawUnsafe(
    `UPDATE "acc_bills" SET "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "version" = $2`,
    id,
    baseVersion
  )
  if (!done) throw staleError()
  return cur
}

export async function updateBill(
  dbc: Db,
  id: string,
  baseVersion: number,
  patch: {
    date?: string
    month?: string
    billNo?: string
    inwardNo?: string
    partyId?: string
    remarks?: string
    lines?: LineInput[]
  }
): Promise<{ before: Bill; after: Bill }> {
  const before = await claimBill(dbc, id, baseVersion)
  // The sheet month only changes when asked; a 28 Feb bill may stay in the March sheet.
  const month = patch.month ?? before.month
  if (month !== before.month) await assertUnlocked(dbc, month)
  await dbc.$executeRawUnsafe(
    `UPDATE "acc_bills" SET "date"=$2::date,"month"=$3,"billNo"=$4,"inwardNo"=$5,"partyId"=$6,"remarks"=$7 WHERE "id"=$1`,
    id,
    patch.date ?? before.date,
    month,
    (patch.billNo ?? before.billNo).trim(),
    (patch.inwardNo ?? before.inwardNo).trim(),
    patch.partyId ?? before.partyId,
    (patch.remarks ?? before.remarks).trim()
  )
  if (patch.lines) {
    await dbc.$executeRawUnsafe(`DELETE FROM "acc_bill_lines" WHERE "billId" = $1`, id)
    await insertLines(dbc, id, patch.lines)
  }
  return { before, after: (await getBill(dbc, id))! }
}

export async function deleteBill(dbc: Db, id: string, baseVersion: number): Promise<Bill> {
  const before = await claimBill(dbc, id, baseVersion)
  await dbc.$executeRawUnsafe(`DELETE FROM "acc_bills" WHERE "id" = $1`, id)
  return before
}

export async function updateLine(
  dbc: Db,
  billId: string,
  lineId: string,
  baseVersion: number,
  patch: { description?: string; machine?: string; quantity?: number; rate?: number }
): Promise<{ before: Bill; after: Bill }> {
  const before = await claimBill(dbc, billId, baseVersion)
  const line = before.lines.find((l) => l.id === lineId)
  if (!line) throw new AccountsError(404, 'Line not found.', 'NOT_FOUND')
  const quantity = patch.quantity ?? line.quantity
  const rate = patch.rate ?? line.rate
  await dbc.$executeRawUnsafe(
    `UPDATE "acc_bill_lines" SET "description"=$2,"machine"=$3,"quantity"=$4,"rate"=$5,"amount"=$6 WHERE "id"=$1`,
    lineId,
    (patch.description ?? line.description).trim(),
    (patch.machine ?? line.machine).trim(),
    quantity,
    rate,
    lineAmount(quantity, rate)
  )
  return { before, after: (await getBill(dbc, billId))! }
}

export async function addLine(
  dbc: Db,
  billId: string,
  baseVersion: number,
  line: LineInput,
  afterLineId?: string
): Promise<{ before: Bill; after: Bill }> {
  const before = await claimBill(dbc, billId, baseVersion)
  const lines: LineInput[] = before.lines.map((l) => ({ ...l }))
  const at = afterLineId ? lines.findIndex((l) => l.id === afterLineId) : -1
  lines.splice(at >= 0 ? at + 1 : lines.length, 0, { ...line, id: undefined })
  await dbc.$executeRawUnsafe(`DELETE FROM "acc_bill_lines" WHERE "billId" = $1`, billId)
  await insertLines(dbc, billId, lines)
  return { before, after: (await getBill(dbc, billId))! }
}

/** Removing the last line removes the bill. */
export async function deleteLine(
  dbc: Db,
  billId: string,
  lineId: string,
  baseVersion: number
): Promise<{ before: Bill; after: Bill | null }> {
  const before = await claimBill(dbc, billId, baseVersion)
  if (!before.lines.some((l) => l.id === lineId)) throw new AccountsError(404, 'Line not found.', 'NOT_FOUND')
  const rest = before.lines.filter((l) => l.id !== lineId)
  if (!rest.length) {
    await dbc.$executeRawUnsafe(`DELETE FROM "acc_bills" WHERE "id" = $1`, billId)
    return { before, after: null }
  }
  await dbc.$executeRawUnsafe(`DELETE FROM "acc_bill_lines" WHERE "billId" = $1`, billId)
  await insertLines(dbc, billId, rest)
  return { before, after: (await getBill(dbc, billId))! }
}

/** Highest inward number used so far (numeric part), to suggest the next one. */
export async function lastInwardNo(dbc: Db): Promise<number> {
  const r = await dbc.$queryRawUnsafe<Row[]>(
    `SELECT max(("inwardNo")::bigint) AS m FROM "acc_bills" WHERE "inwardNo" ~ '^[0-9]{1,12}$'`
  )
  return n(r[0]?.m)
}

/** Months that have anything in them, newest first. */
export async function listMonths(dbc: Db): Promise<string[]> {
  const r = await dbc.$queryRawUnsafe<Row[]>(
    `SELECT "month" FROM "acc_bills" UNION SELECT "month" FROM "acc_petty_cash"
     UNION SELECT "month" FROM "acc_cost_inputs" UNION SELECT "month" FROM "acc_payments"
     ORDER BY 1 DESC`
  )
  return r.map((x) => s(x.month))
}

// ---------------------------------------------------------------- payments

const PAY_COLS = `"id","partyId","month",to_char("date",'YYYY-MM-DD') AS "date","amount"::float8 AS "amount","kind","mode","paidFrom","reference","remarks","version"`
function toPayment(r: Row): Payment {
  return {
    id: s(r.id),
    partyId: s(r.partyId),
    month: s(r.month),
    date: s(r.date),
    amount: n(r.amount),
    kind: (['OPENING', 'ADJUSTMENT'].includes(s(r.kind)) ? s(r.kind) : 'PAYMENT') as PaymentKind,
    mode: s(r.mode) as PaymentMode,
    paidFrom: s(r.paidFrom) === 'FOI' ? 'FOI' : 'SARA',
    reference: s(r.reference),
    remarks: s(r.remarks),
    version: n(r.version),
  }
}

export async function listPayments(dbc: Db, where: { partyId?: string; month?: string } = {}): Promise<Payment[]> {
  const cond: string[] = []
  const params: unknown[] = []
  if (where.partyId) {
    params.push(where.partyId)
    cond.push(`"partyId" = $${params.length}`)
  }
  if (where.month) {
    params.push(where.month)
    cond.push(`"month" = $${params.length}`)
  }
  const rows = await dbc.$queryRawUnsafe<Row[]>(
    `SELECT ${PAY_COLS} FROM "acc_payments" ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''} ORDER BY "date", "createdAt"`,
    ...params
  )
  return rows.map(toPayment)
}

export async function createPayment(
  dbc: Db,
  p: {
    partyId: string
    date: string
    month?: string
    amount: number
    kind?: PaymentKind
    mode: PaymentMode
    paidFrom?: PayAccount
    reference: string
    remarks: string
    id?: string
  }
): Promise<Payment> {
  const month = p.month || monthOfDate(p.date)
  await assertUnlocked(dbc, month)
  if (!(await getParty(dbc, p.partyId))) throw new AccountsError(404, 'Party not found.', 'NOT_FOUND')
  const id = p.id || randomUUID()
  await dbc.$executeRawUnsafe(
    `INSERT INTO "acc_payments" ("id","partyId","month","date","amount","kind","mode","paidFrom","reference","remarks")
     VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10)`,
    id,
    p.partyId,
    month,
    p.date,
    p.amount,
    p.kind || 'PAYMENT',
    p.mode,
    p.paidFrom || 'SARA',
    p.reference,
    p.remarks
  )
  const rows = await dbc.$queryRawUnsafe<Row[]>(`SELECT ${PAY_COLS} FROM "acc_payments" WHERE "id" = $1`, id)
  return toPayment(rows[0])
}

export async function deletePayment(dbc: Db, id: string, baseVersion: number): Promise<Payment> {
  const rows = await dbc.$queryRawUnsafe<Row[]>(`SELECT ${PAY_COLS} FROM "acc_payments" WHERE "id" = $1`, id)
  if (!rows[0]) throw new AccountsError(404, 'Payment not found.', 'NOT_FOUND')
  const p = toPayment(rows[0])
  await assertUnlocked(dbc, p.month)
  const done = await dbc.$executeRawUnsafe(`DELETE FROM "acc_payments" WHERE "id" = $1 AND "version" = $2`, id, baseVersion)
  if (!done) throw staleError()
  return p
}

// ---------------------------------------------------------------- petty cash

const PC_COLS = `"id","month",to_char("date",'YYYY-MM-DD') AS "date","description","kind","debit"::float8 AS "debit",
  "credit"::float8 AS "credit","sortOrder","version"`
function toPetty(r: Row): PettyCashEntry {
  return {
    id: s(r.id),
    month: s(r.month),
    date: s(r.date),
    description: s(r.description),
    kind: s(r.kind) as PettyCashKind,
    debit: n(r.debit),
    credit: n(r.credit),
    sortOrder: n(r.sortOrder),
    version: n(r.version),
  }
}

/** Cash in kinds go to Dr, cash out kinds to Cr. */
export function pettySides(kind: PettyCashKind, amount: number): { debit: number; credit: number } {
  return kind === 'OPENING' || kind === 'CASH_IN' ? { debit: amount, credit: 0 } : { debit: 0, credit: amount }
}

export async function listPetty(dbc: Db, month?: string): Promise<PettyCashEntry[]> {
  const rows = await dbc.$queryRawUnsafe<Row[]>(
    `SELECT ${PC_COLS} FROM "acc_petty_cash" ${month ? 'WHERE "month" = $1' : ''} ORDER BY "month", "sortOrder", "createdAt"`,
    ...(month ? [month] : [])
  )
  return rows.map(toPetty)
}

/** Net cash of all months before `month` (the "Balance b/f"). */
export async function pettyBalanceBefore(dbc: Db, month: string): Promise<number> {
  const r = await dbc.$queryRawUnsafe<Row[]>(
    `SELECT COALESCE(sum("debit") - sum("credit"), 0)::float8 AS bal FROM "acc_petty_cash" WHERE "month" < $1`,
    month
  )
  return n(r[0]?.bal)
}

async function getPetty(dbc: Db, id: string): Promise<PettyCashEntry | null> {
  const rows = await dbc.$queryRawUnsafe<Row[]>(`SELECT ${PC_COLS} FROM "acc_petty_cash" WHERE "id" = $1`, id)
  return rows[0] ? toPetty(rows[0]) : null
}

export async function createPetty(
  dbc: Db,
  p: { date: string; month?: string; description: string; kind: PettyCashKind; amount: number; id?: string; sortOrder?: number }
): Promise<PettyCashEntry> {
  const month = p.month || monthOfDate(p.date)
  await assertUnlocked(dbc, month)
  if (p.kind === 'OPENING') {
    const before = await dbc.$queryRawUnsafe<Row[]>(`SELECT 1 FROM "acc_petty_cash" WHERE "month" < $1 LIMIT 1`, month)
    if (before.length)
      throw new AccountsError(400, 'Balance b/f pichle mahine se khud aata hai — opening sirf pehle mahine mein di ja sakti hai.')
  }
  let sortOrder = p.sortOrder
  if (sortOrder == null) {
    const r = await dbc.$queryRawUnsafe<Row[]>(
      `SELECT COALESCE(max("sortOrder"), 0) + 1 AS next FROM "acc_petty_cash" WHERE "month" = $1`,
      month
    )
    sortOrder = n(r[0]?.next) || 1
  }
  const id = p.id || randomUUID()
  const { debit, credit } = pettySides(p.kind, p.amount)
  await dbc.$executeRawUnsafe(
    `INSERT INTO "acc_petty_cash" ("id","month","date","description","kind","debit","credit","sortOrder") VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8)`,
    id,
    month,
    p.date,
    p.description.trim(),
    p.kind,
    debit,
    credit,
    sortOrder
  )
  return (await getPetty(dbc, id))!
}

export async function updatePetty(
  dbc: Db,
  id: string,
  baseVersion: number,
  patch: { date?: string; description?: string; kind?: PettyCashKind; amount?: number }
): Promise<{ before: PettyCashEntry; after: PettyCashEntry }> {
  const before = await getPetty(dbc, id)
  if (!before) throw new AccountsError(404, 'Entry not found.', 'NOT_FOUND')
  await assertUnlocked(dbc, before.month)
  const kind = patch.kind ?? before.kind
  const amount = patch.amount ?? (before.debit || before.credit)
  const { debit, credit } = pettySides(kind, amount)
  const done = await dbc.$executeRawUnsafe(
    `UPDATE "acc_petty_cash" SET "date"=$3::date,"description"=$4,"kind"=$5,"debit"=$6,"credit"=$7,
       "version"="version"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "version"=$2`,
    id,
    baseVersion,
    patch.date ?? before.date,
    (patch.description ?? before.description).trim(),
    kind,
    debit,
    credit
  )
  if (!done) throw staleError()
  return { before, after: (await getPetty(dbc, id))! }
}

export async function deletePetty(dbc: Db, id: string, baseVersion: number): Promise<PettyCashEntry> {
  const before = await getPetty(dbc, id)
  if (!before) throw new AccountsError(404, 'Entry not found.', 'NOT_FOUND')
  await assertUnlocked(dbc, before.month)
  const done = await dbc.$executeRawUnsafe(`DELETE FROM "acc_petty_cash" WHERE "id" = $1 AND "version" = $2`, id, baseVersion)
  if (!done) throw staleError()
  return before
}

// ---------------------------------------------------------------- cost inputs

export async function getCostInputs(dbc: Db, month: string): Promise<{ inputs: CostInputs; version: number } | null> {
  const r = await dbc.$queryRawUnsafe<Row[]>(`SELECT "inputs","version" FROM "acc_cost_inputs" WHERE "month" = $1`, month)
  return r[0] ? { inputs: (r[0].inputs as CostInputs) || {}, version: n(r[0].version) } : null
}

/** Latest month before `month` that has saved inputs. */
export async function previousCostInputs(dbc: Db, month: string): Promise<{ month: string; inputs: CostInputs } | null> {
  const r = await dbc.$queryRawUnsafe<Row[]>(
    `SELECT "month","inputs" FROM "acc_cost_inputs" WHERE "month" < $1 ORDER BY "month" DESC LIMIT 1`,
    month
  )
  return r[0] ? { month: s(r[0].month), inputs: (r[0].inputs as CostInputs) || {} } : null
}

export async function saveCostInputs(
  dbc: Db,
  month: string,
  baseVersion: number,
  inputs: CostInputs,
  by: string | null
): Promise<{ before: CostInputs | null; version: number }> {
  await assertUnlocked(dbc, month)
  const cur = await getCostInputs(dbc, month)
  if ((cur?.version ?? 0) !== baseVersion) throw staleError()
  if (!cur) {
    await dbc.$executeRawUnsafe(
      `INSERT INTO "acc_cost_inputs" ("month","inputs","version","updatedBy") VALUES ($1,$2::jsonb,1,$3)`,
      month,
      JSON.stringify(inputs),
      by
    )
    return { before: null, version: 1 }
  }
  await dbc.$executeRawUnsafe(
    `UPDATE "acc_cost_inputs" SET "inputs"=$2::jsonb,"version"="version"+1,"updatedBy"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "month"=$1`,
    month,
    JSON.stringify(inputs),
    by
  )
  return { before: cur.inputs, version: cur.version + 1 }
}

export async function deleteCostInputs(dbc: Db, month: string, baseVersion: number): Promise<CostInputs | null> {
  await assertUnlocked(dbc, month)
  const cur = await getCostInputs(dbc, month)
  if (!cur) return null
  if (cur.version !== baseVersion) throw staleError()
  await dbc.$executeRawUnsafe(`DELETE FROM "acc_cost_inputs" WHERE "month" = $1`, month)
  return cur.inputs
}
