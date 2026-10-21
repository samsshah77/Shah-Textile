/**
 * One-time reset of Accounts to the July, August and September 2026 Excel files
 * (Daily Expense: bills + petty cash), as decided by the accountant:
 *
 *  - Everything before July 2026 goes: bills, payments, petty cash, Cost Statement lines.
 *  - July–September bills and petty cash are replaced by exactly what the files have.
 *    July's petty cash "Balance b/f" (3,473) becomes the opening entry.
 *  - The old "FOI paid (copied …)" lump sums from the first data copy go too (they were
 *    totals of all old history, which is no longer in the ERP).
 *  - October onwards is not touched. Parties are kept; a name not in the ERP is added.
 *  - Payments / opening balances entered by hand dated July–September are kept.
 *
 * Safety: a preview first (nothing written); refused while any month up to September is
 * locked; a database snapshot is taken right before; everything else runs in ONE
 * transaction and only once (acc_import_log `reset:2026-07..09`). Tufail only.
 */
import jul2026 from '@/data/accountsImports/2026-07.json'
import aug2026 from '@/data/accountsImports/2026-08.json'
import sep2026 from '@/data/accountsImports/2026-09.json'
import { lineAmount, slugifyPartyName } from '@/lib/accounts/util'
import { AccountsError } from '@/server/accounts/errors'
import { createBill, createParty, createPetty, listParties, type Db } from '@/server/accounts/repo'
import { partyKey, type MonthFile } from '@/server/accounts/monthImport'

export const RESET_FILES: MonthFile[] = [jul2026 as MonthFile, aug2026 as MonthFile, sep2026 as MonthFile]
export const RESET_FIRST_MONTH = '2026-07'
/** First month that is left exactly as it is. */
export const RESET_KEEP_FROM = '2026-10'
const SOURCE = 'reset:2026-07..09'
const COPIED_FOI = 'FOI paid (copied%'

type Num = { count: number; amount: number }
export interface ResetPreview {
  done: { at: string } | null
  lockedMonths: string[]
  remove: {
    billsByMonth: Array<{ month: string; bills: number; amount: number }>
    payments: Num & { copiedFoi: number; beforeJuly: number }
    petty: { count: number; months: string[] }
    costMonths: string[]
  }
  add: Array<{ month: string; source: string; bills: number; lines: number; amount: number; petty: number; pettyOpening: number | null; pettyClosing: number | null }>
  newParties: string[]
  renamed: Array<{ file: string; erp: string }>
  keptLater: { bills: number; amount: number; petty: number }
}

const r2 = (n: number) => Math.round(n * 100) / 100

async function partyResolver(dbc: Db) {
  const parties = await listParties(dbc, true)
  const bySlug = new Map(parties.map((p) => [p.slug, p]))
  const byKey = new Map<string, (typeof parties)[number]>()
  for (const p of parties) if (!byKey.has(partyKey(p.name)) || p.active) byKey.set(partyKey(p.name), p)
  return (raw: string, aliases?: Record<string, string>) => {
    const name = (aliases?.[raw] || raw).trim()
    const p = bySlug.get(slugifyPartyName(name)) || byKey.get(partyKey(name)) || byKey.get(partyKey(raw))
    return p ? { id: p.id as string | null, name: p.name } : { id: null, name }
  }
}

export async function previewReset(dbc: Db): Promise<ResetPreview> {
  const done = await dbc.$queryRawUnsafe<Array<{ at: string }>>(
    `SELECT to_char("importedAt",'YYYY-MM-DD HH24:MI') AS at FROM "acc_import_log" WHERE "source" = $1`,
    SOURCE
  )
  const locked = await dbc.$queryRawUnsafe<Array<{ month: string }>>(
    `SELECT "month" FROM "acc_month_locks" WHERE "locked" AND "month" < $1 ORDER BY 1`,
    RESET_KEEP_FROM
  )
  const billsByMonth = await dbc.$queryRawUnsafe<Array<{ month: string; bills: number; amount: number }>>(
    `SELECT b."month", count(DISTINCT b."id")::int AS bills, COALESCE(sum(l."amount"),0)::float8 AS amount
     FROM "acc_bills" b LEFT JOIN "acc_bill_lines" l ON l."billId" = b."id"
     WHERE b."month" < $1 GROUP BY b."month" ORDER BY 1`,
    RESET_KEEP_FROM
  )
  const pay = await dbc.$queryRawUnsafe<Array<{ n: number; amount: number; copied: number; before: number }>>(
    `SELECT count(*)::int AS n, COALESCE(sum("amount"),0)::float8 AS amount,
            count(*) FILTER (WHERE "remarks" LIKE $2)::int AS copied,
            count(*) FILTER (WHERE "date" < $1::date)::int AS before
     FROM "acc_payments" WHERE "date" < $1::date OR "remarks" LIKE $2`,
    `${RESET_FIRST_MONTH}-01`,
    COPIED_FOI
  )
  const petty = await dbc.$queryRawUnsafe<Array<{ month: string; n: number }>>(
    `SELECT "month", count(*)::int AS n FROM "acc_petty_cash" WHERE "month" < $1 GROUP BY 1 ORDER BY 1`,
    RESET_KEEP_FROM
  )
  const cost = await dbc.$queryRawUnsafe<Array<{ month: string }>>(
    `SELECT "month" FROM "acc_cost_inputs" WHERE "month" < $1 ORDER BY 1`,
    RESET_FIRST_MONTH
  )
  const later = await dbc.$queryRawUnsafe<Array<{ bills: number; amount: number; petty: number }>>(
    `SELECT (SELECT count(*) FROM "acc_bills" WHERE "month" >= $1)::int AS bills,
            (SELECT COALESCE(sum(l."amount"),0) FROM "acc_bill_lines" l JOIN "acc_bills" b ON b."id" = l."billId" WHERE b."month" >= $1)::float8 AS amount,
            (SELECT count(*) FROM "acc_petty_cash" WHERE "month" >= $1)::int AS petty`,
    RESET_KEEP_FROM
  )

  const resolve = await partyResolver(dbc)
  const newParties = new Set<string>()
  const renamed = new Map<string, string>()
  const add = RESET_FILES.map((f) => {
    for (const b of f.bills) {
      const p = resolve(b.partyName, f.partyAliases)
      if (!p.id) newParties.add(p.name)
      else if (p.name !== b.partyName) renamed.set(b.partyName, p.name)
    }
    return {
      month: f.month,
      source: f.source,
      bills: f.bills.length,
      lines: f.bills.reduce((t, b) => t + b.lines.length, 0),
      amount: r2(f.bills.reduce((t, b) => t + b.lines.reduce((s, l) => s + lineAmount(l.quantity, l.rate), 0), 0)),
      petty: f.petty.length + (f.month === RESET_FIRST_MONTH && f.expected.pettyOpening ? 1 : 0),
      pettyOpening: f.expected.pettyOpening,
      pettyClosing: f.expected.pettyClosing,
    }
  })
  return {
    done: done[0] ? { at: done[0].at } : null,
    lockedMonths: locked.map((l) => l.month),
    remove: {
      billsByMonth: billsByMonth.map((b) => ({ month: b.month, bills: Number(b.bills), amount: r2(Number(b.amount)) })),
      payments: { count: Number(pay[0]?.n || 0), amount: r2(Number(pay[0]?.amount || 0)), copiedFoi: Number(pay[0]?.copied || 0), beforeJuly: Number(pay[0]?.before || 0) },
      petty: { count: petty.reduce((t, p) => t + Number(p.n), 0), months: petty.map((p) => p.month) },
      costMonths: cost.map((c) => c.month),
    },
    add,
    newParties: [...newParties].sort(),
    renamed: [...renamed].map(([file, erp]) => ({ file, erp })),
    keptLater: { bills: Number(later[0]?.bills || 0), amount: r2(Number(later[0]?.amount || 0)), petty: Number(later[0]?.petty || 0) },
  }
}

export interface ResetResult {
  deleted: { bills: number; payments: number; petty: number; costMonths: number }
  added: { bills: number; lines: number; amount: number; petty: number; parties: string[] }
}

/** Runs inside the caller's transaction. Take a snapshot before calling. */
export async function applyReset(dbc: Db, by: string): Promise<ResetResult> {
  await dbc.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(7712003)`)
  const pre = await previewReset(dbc)
  if (pre.done) throw new AccountsError(409, `Ye reset ${pre.done.at} ko ho chuka hai — dobara nahi hoga.`, 'CONFLICT')
  if (pre.lockedMonths.length)
    throw new AccountsError(423, `In mahinon ka lock pehle kholein: ${pre.lockedMonths.join(', ')}.`, 'LOCKED')

  const bills = await dbc.$executeRawUnsafe(`DELETE FROM "acc_bills" WHERE "month" < $1`, RESET_KEEP_FROM)
  const payments = await dbc.$executeRawUnsafe(
    `DELETE FROM "acc_payments" WHERE "date" < $1::date OR "remarks" LIKE $2`,
    `${RESET_FIRST_MONTH}-01`,
    COPIED_FOI
  )
  const petty = await dbc.$executeRawUnsafe(`DELETE FROM "acc_petty_cash" WHERE "month" < $1`, RESET_KEEP_FROM)
  const costMonths = await dbc.$executeRawUnsafe(`DELETE FROM "acc_cost_inputs" WHERE "month" < $1`, RESET_FIRST_MONTH)

  const resolve = await partyResolver(dbc)
  const created = new Map<string, string>()
  const res: ResetResult = { deleted: { bills, payments, petty, costMonths }, added: { bills: 0, lines: 0, amount: 0, petty: 0, parties: [] } }
  for (const f of RESET_FILES) {
    for (const b of f.bills) {
      const p = resolve(b.partyName, f.partyAliases)
      let partyId = p.id || created.get(p.name) || null
      if (!partyId) {
        const np = await createParty(dbc, { name: p.name, kind: f.partyKinds?.[p.name] || 'TRADER' })
        partyId = np.id
        created.set(p.name, np.id)
        res.added.parties.push(np.name)
      }
      const bill = await createBill(dbc, {
        month: f.month,
        date: b.date,
        billNo: b.billNo,
        inwardNo: b.inwardNo,
        partyId,
        remarks: '',
        lines: b.lines.map((l) => ({ description: l.description, machine: l.machine, quantity: l.quantity, rate: l.rate })),
        createdBy: `reset:${by}`,
      })
      res.added.bills += 1
      res.added.lines += bill.lines.length
      res.added.amount += bill.total
    }
    if (f.month === RESET_FIRST_MONTH && f.expected.pettyOpening) {
      await createPetty(dbc, { date: `${f.month}-01`, month: f.month, description: 'Balance b/f (Excel)', kind: 'OPENING', amount: f.expected.pettyOpening })
      res.added.petty += 1
    }
    for (const e of f.petty) {
      await createPetty(dbc, { date: e.date, month: f.month, description: e.description, kind: e.kind, amount: e.amount })
      res.added.petty += 1
    }
  }
  res.added.amount = r2(res.added.amount)
  const log = async (source: string) =>
    dbc.$executeRawUnsafe(
      `INSERT INTO "acc_import_log" ("source","hash","summary") VALUES ($1,$2,$3::jsonb) ON CONFLICT ("source") DO NOTHING`,
      source,
      'reset',
      JSON.stringify({ ...res, by })
    )
  await log(SOURCE)
  // The separate September import is covered by this reset.
  await log('file:2026-09')
  return res
}
