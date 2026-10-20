/**
 * Petty cash is kept in Accounts only. The salary module used to have its own petty cash
 * register (sheet `sara_payroll_petty_cash_v6`); its entries are copied into
 * Accounts › Petty Cash once (logged in acc_import_log as `payroll:petty-cash`).
 *
 *  - "Dr" (money into petty cash) → Cash in;  "Cr" (money out) → Expense, or Salary when
 *    the description says salary.
 *  - "Balance b/f" lines are not copied — Accounts carries the balance forward itself.
 *  - An entry already present in Accounts (same date, description and amount) is skipped.
 *  - Months locked in Accounts are skipped (reported).
 * The salary rows stay in the database untouched.
 */
import { createPetty, type Db } from '@/server/accounts/repo'
import { AccountsError } from '@/server/accounts/errors'
import type { PettyCashKind } from '@/lib/accounts/types'

const SOURCE = 'payroll:petty-cash'
const SHEET = 'sara_payroll_petty_cash_v6'

type OldRow = {
  id?: string
  date?: string
  description?: string
  drAmount?: number | null
  crAmount?: number | null
  fortnight?: string
  month?: string
}

export type PettyCopyPlanItem = { date: string; description: string; kind: PettyCashKind; amount: number }

const isoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))

/** What would be copied (pure — tested). */
export function planPayrollPettyCopy(rows: OldRow[]): { items: PettyCopyPlanItem[]; skipped: string[] } {
  const items: PettyCopyPlanItem[] = []
  const skipped: string[] = []
  for (const r of rows) {
    const month = /^\d{4}-\d{2}$/.test(r.month || '') ? (r.month as string) : ''
    const description = String(r.description || '').trim()
    if (/balance\s*b\s*\/?\s*f/i.test(description)) {
      skipped.push(`${month} ${r.fortnight || ''}: "${description}" (balance Accounts khud aage le jata hai)`)
      continue
    }
    const raw = String(r.date || '').slice(0, 10)
    const date = isoDate(raw) ? raw : month ? `${month}-${r.fortnight === '16-31' ? '16' : '01'}` : ''
    if (!date) {
      skipped.push(`"${description}" (tareekh / mahina nahi)`)
      continue
    }
    const dr = Math.round((Number(r.drAmount) || 0) * 100) / 100
    const cr = Math.round((Number(r.crAmount) || 0) * 100) / 100
    const text = description || 'Petty cash (salary sheet)'
    if (dr > 0) items.push({ date, description: text, kind: 'CASH_IN', amount: dr })
    if (cr > 0) items.push({ date, description: text, kind: /salar/i.test(text) ? 'SALARY' : 'EXPENSE', amount: cr })
  }
  items.sort((a, b) => a.date.localeCompare(b.date))
  return { items, skipped }
}

const fingerprint = (date: string, description: string, debit: number, credit: number) =>
  `${date}|${description.trim().toLowerCase()}|${Math.round(debit * 100)}|${Math.round(credit * 100)}`

/** Copy once. Runs inside the accounts import transaction. */
export async function copyPayrollPettyCash(dbc: Db): Promise<{ ran: boolean; copied: number; skipped: string[] }> {
  const done = await dbc.$queryRawUnsafe<Array<{ source: string }>>(`SELECT "source" FROM "acc_import_log" WHERE "source" = $1`, SOURCE)
  if (done.length) return { ran: false, copied: 0, skipped: [] }
  const exists = await dbc.$queryRawUnsafe<Array<{ r: string | null }>>(`SELECT to_regclass('public.payroll_rows')::text AS r`)
  const rows = exists[0]?.r
    ? (
        await dbc.$queryRawUnsafe<Array<{ payload: OldRow }>>(
          `SELECT "payload" FROM "payroll_rows" WHERE "sheet" = $1 ORDER BY "month", "position", "id"`,
          SHEET
        )
      ).map((r) => r.payload)
    : []
  const { items, skipped } = planPayrollPettyCopy(rows)
  const have = new Set(
    (
      await dbc.$queryRawUnsafe<Array<{ date: string; description: string; debit: number; credit: number }>>(
        `SELECT to_char("date", 'YYYY-MM-DD') AS date, "description", "debit"::float8 AS debit, "credit"::float8 AS credit FROM "acc_petty_cash"`
      )
    ).map((e) => fingerprint(e.date, e.description, Number(e.debit), Number(e.credit)))
  )
  let copied = 0
  for (const it of items) {
    const debit = it.kind === 'CASH_IN' ? it.amount : 0
    const credit = it.kind === 'CASH_IN' ? 0 : it.amount
    const fp = fingerprint(it.date, it.description, debit, credit)
    if (have.has(fp)) {
      skipped.push(`${it.date} "${it.description}" ${it.amount} (Accounts mein pehle se hai)`)
      continue
    }
    try {
      await createPetty(dbc, { date: it.date, description: it.description, kind: it.kind, amount: it.amount })
      have.add(fp)
      copied += 1
    } catch (err) {
      if (err instanceof AccountsError) skipped.push(`${it.date} "${it.description}" ${it.amount} (${err.message})`)
      else throw err
    }
  }
  await dbc.$executeRawUnsafe(
    `INSERT INTO "acc_import_log" ("source","hash","summary") VALUES ($1,$2,$3::jsonb)`,
    SOURCE,
    String(rows.length),
    JSON.stringify({ copied, skipped })
  )
  if (copied || skipped.length) console.log('[accounts] salary petty cash copied into Accounts', JSON.stringify({ copied, skipped }))
  return { ran: true, copied, skipped }
}
