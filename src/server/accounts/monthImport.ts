/**
 * One-time import of a month's Excel sheets (Daily Expense: bills + petty cash) that were
 * kept outside the ERP. Built so the live data can never be damaged:
 *
 *  - Preview first: nothing is written until "Import" is pressed (Tufail only).
 *  - Only what is missing is added. A bill already in the ERP (same party + bill no., or
 *    same party + date + total, or every line already present) is left alone; a bill
 *    whose number exists with different lines is reported, not added.
 *  - A petty cash entry already in the ERP (same side, same amount, dated within 5 days —
 *    each existing entry counts once) is not added again. "Balance b/f" is never imported:
 *    the ERP carries the balance forward itself.
 *  - Nothing in the ERP is changed or deleted. A locked month is refused.
 *  - Runs once (logged in acc_import_log as `file:<month>`), inside one transaction.
 */
import { createHash } from 'crypto'
import sept2026 from '@/data/accountsImports/2026-09.json'
import type { PartyKind, PettyCashKind } from '@/lib/accounts/types'
import { lineAmount, slugifyPartyName } from '@/lib/accounts/util'
import { AccountsError } from '@/server/accounts/errors'
import {
  type Db,
  createBill,
  createParty,
  createPetty,
  getLock,
  listBills,
  listParties,
  listPetty,
  pettyBalanceBefore,
} from '@/server/accounts/repo'

export interface MonthFileLine {
  description: string
  machine: string
  quantity: number
  rate: number
}
export interface MonthFileBill {
  date: string
  billNo: string
  inwardNo: string
  partyName: string
  lines: MonthFileLine[]
}
export interface MonthFilePetty {
  date: string
  description: string
  kind: PettyCashKind
  amount: number
}
export interface MonthFile {
  month: string
  source: string
  expected: { billsTotal: number; pettyOpening: number | null; pettyClosing: number | null }
  partyAliases?: Record<string, string>
  partyKinds?: Record<string, PartyKind>
  bills: MonthFileBill[]
  petty: MonthFilePetty[]
}

/** The month files this build carries. */
export const MONTH_FILES: Record<string, MonthFile> = {
  '2026-09': sept2026 as MonthFile,
}

export type BillStatus = 'new' | 'exists' | 'differs'
export interface PreviewBill extends MonthFileBill {
  total: number
  party: { name: string; id: string | null; isNew: boolean }
  status: BillStatus
  note: string
}
export interface PreviewPetty extends MonthFilePetty {
  status: 'new' | 'exists'
  note: string
}
export interface MonthImportPreview {
  month: string
  source: string
  locked: boolean
  imported: { at: string; summary: unknown } | null
  bills: PreviewBill[]
  petty: PreviewPetty[]
  newParties: string[]
  /** ERP bills of the month that are not in the file (shown, never touched). */
  extraInErp: Array<{ partyName: string; billNo: string; date: string; total: number }>
  totals: {
    fileBills: number
    erpBillsBefore: number
    billsToAdd: number
    linesToAdd: number
    amountToAdd: number
    erpBillsAfter: number
    pettyToAdd: number
    pettyOpeningFile: number | null
    pettyOpeningErp: number
    pettyClosingFile: number | null
    pettyClosingErpAfter: number
  }
  warnings: string[]
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const r2 = (n: number) => Math.round(n * 100) / 100
/** "Marhaba Engineering" ~ "Marhaba Engineering Works", "JAB Electronic" ~ "JAB Electronics". */
export function partyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\b(works|work|company|co|pvt|ltd)\b/g, '')
    .replace(/\s+/g, '')
    .replace(/s$/, '')
}
const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000
const sourceOf = (month: string) => `file:${month}`
const hashOf = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16)

export async function previewMonthImport(dbc: Db, file: MonthFile): Promise<MonthImportPreview> {
  const month = file.month
  const warnings: string[] = []
  const lock = await getLock(dbc, month)
  const log = await dbc.$queryRawUnsafe<Array<{ at: string; summary: unknown }>>(
    `SELECT to_char("importedAt",'YYYY-MM-DD HH24:MI') AS at, "summary" FROM "acc_import_log" WHERE "source" = $1`,
    sourceOf(month)
  )

  // ---- parties
  const parties = await listParties(dbc, true)
  const bySlug = new Map(parties.map((p) => [p.slug, p]))
  const byKey = new Map<string, (typeof parties)[number]>()
  for (const p of parties) if (!byKey.has(partyKey(p.name)) || p.active) byKey.set(partyKey(p.name), p)
  const resolve = (raw: string) => {
    const name = (file.partyAliases?.[raw] || raw).trim()
    const p = bySlug.get(slugifyPartyName(name)) || byKey.get(partyKey(name)) || byKey.get(partyKey(raw))
    return p ? { name: p.name, id: p.id, isNew: false } : { name, id: null, isNew: true }
  }

  // ---- what the ERP already has
  const erpBills = await listBills(dbc, { month })
  const allBills = await listBills(dbc, {})
  const slugById = new Map(parties.map((p) => [p.id, p.slug]))
  const nameById = new Map(parties.map((p) => [p.id, p.name]))
  const linePrint = (partyId: string, billNo: string, l: { description: string; quantity: number; rate: number }) =>
    [partyId, norm(billNo), norm(l.description), lineAmount(l.quantity, l.rate)].join('|')
  const printsAnywhere = new Set<string>()
  for (const b of allBills) for (const l of b.lines) printsAnywhere.add(linePrint(b.partyId, b.billNo, l))
  const used = new Set<string>()

  const bills: PreviewBill[] = file.bills.map((fb) => {
    const party = resolve(fb.partyName)
    const total = fb.lines.reduce((t, l) => t + lineAmount(l.quantity, l.rate), 0)
    const base = { ...fb, total, party }
    if (!party.id) return { ...base, status: 'new' as const, note: 'Nayi party banegi' }
    const pid = party.id
    const sameNo = erpBills.find((b) => !used.has(b.id) && b.partyId === pid && fb.billNo && norm(b.billNo) === norm(fb.billNo))
    if (sameNo) {
      used.add(sameNo.id)
      const same = Math.round(sameNo.total) === Math.round(total) && sameNo.lines.length === fb.lines.length
      return same
        ? { ...base, status: 'exists' as const, note: `ERP mein pehle se (bill ${sameNo.billNo})` }
        : {
            ...base,
            status: 'differs' as const,
            note: `Bill ${sameNo.billNo} ERP mein mukhtalif hai (ERP ${Math.round(sameNo.total)} / file ${total}) — add nahi hoga, ERP mein khud dekh lein`,
          }
    }
    const sameDayTotal = erpBills.find(
      (b) => !used.has(b.id) && b.partyId === pid && b.date === fb.date && Math.round(b.total) === Math.round(total)
    )
    if (sameDayTotal) {
      used.add(sameDayTotal.id)
      return { ...base, status: 'exists' as const, note: `ERP mein pehle se (isi tareekh, isi raqam ka bill ${sameDayTotal.billNo || '-'})` }
    }
    const present = fb.lines.filter((l) => printsAnywhere.has(linePrint(pid, fb.billNo, l))).length
    if (present === fb.lines.length) return { ...base, status: 'exists' as const, note: 'Saari lines ERP mein pehle se' }
    if (present > 0)
      return { ...base, status: 'differs' as const, note: `${present} line(s) ERP mein pehle se — add nahi hoga, ERP mein khud dekh lein` }
    return { ...base, status: 'new' as const, note: '' }
  })
  const extraInErp = erpBills
    .filter((b) => !used.has(b.id))
    .map((b) => ({ partyName: nameById.get(b.partyId) || slugById.get(b.partyId) || '', billNo: b.billNo, date: b.date, total: b.total }))

  // ---- petty cash
  const erpPetty = await listPetty(dbc, month)
  const taken = new Set<string>()
  const petty: PreviewPetty[] = file.petty.map((fp) => {
    const isIn = fp.kind === 'CASH_IN' || fp.kind === 'OPENING'
    const hit = erpPetty.find(
      (e) =>
        !taken.has(e.id) &&
        e.kind !== 'OPENING' &&
        r2(isIn ? e.debit : e.credit) === r2(fp.amount) &&
        r2(isIn ? e.credit : e.debit) === 0 &&
        daysApart(e.date, fp.date) <= 5
    )
    if (hit) {
      taken.add(hit.id)
      return { ...fp, status: 'exists' as const, note: `ERP mein pehle se: ${hit.date} "${hit.description}"` }
    }
    return { ...fp, status: 'new' as const, note: '' }
  })
  const opening = await pettyBalanceBefore(dbc, month)
  const erpNet = erpPetty.reduce((t, e) => t + e.debit - e.credit, 0)
  const addNet = petty.filter((p) => p.status === 'new').reduce((t, p) => t + (p.kind === 'CASH_IN' ? p.amount : -p.amount), 0)

  const toAdd = bills.filter((b) => b.status === 'new')
  const erpBefore = erpBills.reduce((t, b) => t + b.total, 0)
  const amountToAdd = toAdd.reduce((t, b) => t + b.total, 0)
  const fileTotal = bills.reduce((t, b) => t + b.total, 0)
  if (Math.round(fileTotal) !== Math.round(file.expected.billsTotal))
    warnings.push(`File ka total ${file.expected.billsTotal} hai lekin lines ka jor ${fileTotal} — import se pehle file check karein.`)
  if (file.expected.pettyOpening != null && Math.round(opening) !== Math.round(file.expected.pettyOpening))
    warnings.push(
      `Petty cash: file mein Balance b/f ${file.expected.pettyOpening} hai, ERP mein pichle mahinon se ${Math.round(opening)} aata hai. Import ke baad closing bhi itna hi mukhtalif hoga.`
    )
  if (bills.some((b) => b.status === 'differs'))
    warnings.push('Kuch bills ERP mein mukhtalif hain — wo add nahi honge; neeche list dekh kar ERP mein khud theek karein.')
  if (extraInErp.length)
    warnings.push(`ERP mein ${extraInErp.length} bill aise hain jo file mein nahi — wo waise hi rahenge (koi cheez delete nahi hoti).`)

  return {
    month,
    source: file.source,
    locked: lock.locked,
    imported: log[0] ? { at: log[0].at, summary: log[0].summary } : null,
    bills,
    petty,
    newParties: [...new Set(bills.filter((b) => b.party.isNew && b.status === 'new').map((b) => b.party.name))],
    extraInErp,
    totals: {
      fileBills: r2(fileTotal),
      erpBillsBefore: r2(erpBefore),
      billsToAdd: toAdd.length,
      linesToAdd: toAdd.reduce((t, b) => t + b.lines.length, 0),
      amountToAdd: r2(amountToAdd),
      erpBillsAfter: r2(erpBefore + amountToAdd),
      pettyToAdd: petty.filter((p) => p.status === 'new').length,
      pettyOpeningFile: file.expected.pettyOpening,
      pettyOpeningErp: r2(opening),
      pettyClosingFile: file.expected.pettyClosing,
      pettyClosingErpAfter: r2(opening + erpNet + addNet),
    },
    warnings,
  }
}

export interface MonthImportResult {
  bills: number
  lines: number
  amount: number
  petty: number
  parties: string[]
  skipped: number
}

/** Adds only the "new" rows of the preview, in one transaction (the caller's). */
export async function applyMonthImport(dbc: Db, file: MonthFile, by: string): Promise<MonthImportResult> {
  await dbc.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(7712002)`)
  const preview = await previewMonthImport(dbc, file)
  if (preview.imported) throw new AccountsError(409, `${file.month} ka import ${preview.imported.at} ko ho chuka hai — dobara nahi hoga.`, 'CONFLICT')
  if (preview.locked) throw new AccountsError(423, `${file.month} locked hai — pehle unlock karein, phir import.`, 'LOCKED')

  const createdParties = new Map<string, string>()
  const res: MonthImportResult = { bills: 0, lines: 0, amount: 0, petty: 0, parties: [], skipped: 0 }
  for (const b of preview.bills) {
    if (b.status !== 'new') {
      res.skipped += 1
      continue
    }
    let partyId = b.party.id || createdParties.get(b.party.name) || null
    if (!partyId) {
      const p = await createParty(dbc, { name: b.party.name, kind: file.partyKinds?.[b.party.name] || 'TRADER' })
      partyId = p.id
      createdParties.set(b.party.name, p.id)
      res.parties.push(p.name)
    }
    await createBill(dbc, {
      month: file.month,
      date: b.date,
      billNo: b.billNo,
      inwardNo: b.inwardNo,
      partyId,
      remarks: '',
      lines: b.lines.map((l) => ({ description: l.description, machine: l.machine, quantity: l.quantity, rate: l.rate })),
      createdBy: `import:${by}`,
    })
    res.bills += 1
    res.lines += b.lines.length
    res.amount += b.total
  }
  for (const p of preview.petty) {
    if (p.status !== 'new') continue
    await createPetty(dbc, { date: p.date, month: file.month, description: p.description, kind: p.kind, amount: p.amount })
    res.petty += 1
  }
  await dbc.$executeRawUnsafe(
    `INSERT INTO "acc_import_log" ("source","hash","summary") VALUES ($1,$2,$3::jsonb)`,
    sourceOf(file.month),
    hashOf(file),
    JSON.stringify({ ...res, by })
  )
  return res
}
