/** Read models for the accounts pages (repo rows → report shapes). */
import { prisma } from '@/lib/prisma'
import type { CostStatement, MonthBook, PartyKind, PartyLedger, PartySummary, PayablesReport, PettyCashStatement } from '@/lib/accounts/types'
import { payableEffect } from '@/lib/accounts/util'

import { productionAccountingMonthBounds, getProductionTodayMonth } from '@/constants/productionCalendar'
import { loadSalaryStore } from '@/server/payroll/api'
import { AccountsError } from '@/server/accounts/errors'
import * as repo from '@/server/accounts/repo'
import {
  buildCostStatement,
  partyLedger,
  billClearance,
  partySummaries,
  payablesReport,
  payrollTotals,
  pettyStatement,
  resolveCostInputs,
} from '@/server/accounts/reports'

export async function months(): Promise<{ months: string[]; current: string }> {
  const dbc = await repo.db()
  const current = getProductionTodayMonth()
  const set = new Set(await repo.listMonths(dbc))
  set.add(current)
  return { months: [...set].sort().reverse(), current }
}

export async function book(month: string): Promise<MonthBook & { nextInwardNo: string }> {
  const dbc = await repo.db()
  const [bills, parties, lock, lastInw] = await Promise.all([
    repo.listBills(dbc, { month }),
    repo.listParties(dbc),
    repo.getLock(dbc, month),
    repo.lastInwardNo(dbc),
  ])
  return {
    month,
    bills,
    parties,
    lock,
    total: bills.reduce((t, b) => t + b.total, 0),
    nextInwardNo: lastInw ? String(lastInw + 1) : '',
  }
}

/** Directory: every party of a kind with its totals for `month` (or all months). */
export async function directory(kind: PartyKind | null, month: string | null): Promise<{ rows: PartySummary[] }> {
  const dbc = await repo.db()
  const parties = (await repo.listParties(dbc)).filter((p) => !kind || p.kind === kind)
  const bills = await repo.listBills(dbc, month ? { month } : {})
  const payments = await repo.listPayments(dbc, month ? { month } : {})
  const rows = partySummaries(parties, bills, payments).filter((r) => r.party.active || r.purchases || r.paid || r.opening || r.adjusted)
  return { rows }
}

export async function ledger(idOrSlug: string, month: string | null): Promise<PartyLedger> {
  const dbc = await repo.db()
  const party = await repo.getParty(dbc, idOrSlug)
  if (!party) throw new AccountsError(404, 'Party not found.', 'NOT_FOUND')
  const allBills = await repo.listBills(dbc, { partyId: party.id })
  const allPay = await repo.listPayments(dbc, { partyId: party.id })
  if (!month) return partyLedger(party, allBills, allPay, 0)
  const before =
    allBills.filter((b) => b.month < month).reduce((t, b) => t + b.total, 0) +
    allPay.filter((p) => p.month < month).reduce((t, p) => t + payableEffect(p), 0)
  return partyLedger(
    party,
    allBills.filter((b) => b.month === month),
    allPay.filter((p) => p.month === month),
    before,
    billClearance(allBills, allPay)
  )
}

export async function petty(month: string): Promise<PettyCashStatement> {
  const dbc = await repo.db()
  const [entries, opening, lock] = await Promise.all([
    repo.listPetty(dbc, month),
    repo.pettyBalanceBefore(dbc, month),
    repo.getLock(dbc, month),
  ])
  return pettyStatement(month, entries, opening, lock)
}

/** Month-by-month petty cash summary (newest first). */
export async function pettyMonths(): Promise<{ rows: Omit<PettyCashStatement, 'entries' | 'lock'>[] }> {
  const dbc = await repo.db()
  const all = await repo.listPetty(dbc)
  const byMonth = new Map<string, typeof all>()
  for (const e of all) byMonth.set(e.month, [...(byMonth.get(e.month) || []), e])
  let opening = 0
  const rows = [...byMonth.keys()].sort().map((m) => {
    const s = pettyStatement(m, byMonth.get(m)!, opening, { month: m, locked: false })
    opening = s.closing
    return { month: m, opening: s.opening, totalIn: s.totalIn, totalOut: s.totalOut, closing: s.closing, expenseOut: s.expenseOut }
  })
  return { rows: rows.reverse() }
}

/** Meters woven in the production month (2nd → 1st), from the production ledger. */
export async function productionMeters(month: string): Promise<number> {
  try {
    const { from, to } = productionAccountingMonthBounds(`${month}-15`)
    const r = await prisma.$queryRawUnsafe<{ m: number | null }[]>(
      `SELECT sum("totalMeters")::float8 AS m FROM "floor_production" WHERE "date" BETWEEN $1::date AND $2::date`,
      from,
      to
    )
    return Number(r[0]?.m) || 0
  } catch {
    return 0 // ledger not built yet on this server
  }
}

export async function costStatement(month: string): Promise<CostStatement> {
  const dbc = await repo.db()
  const [saved, previous, parties, bills, pettyRows, opening, lock, payrollStore, meters] = await Promise.all([
    repo.getCostInputs(dbc, month),
    repo.previousCostInputs(dbc, month),
    repo.listParties(dbc),
    repo.listBills(dbc, { month }),
    repo.listPetty(dbc, month),
    repo.pettyBalanceBefore(dbc, month),
    repo.getLock(dbc, month),
    loadSalaryStore(),
    productionMeters(month),
  ])
  const resolved = resolveCostInputs(saved?.inputs ?? null, previous)
  return buildCostStatement({
    month,
    payroll: payrollTotals(payrollStore, month),
    parties,
    monthBills: bills,
    pettyExpense: pettyStatement(month, pettyRows, opening, lock).expenseOut,
    inputs: resolved.inputs,
    inputsFrom: resolved.from,
    inputsFromMonth: resolved.fromMonth,
    inputsVersion: saved?.version ?? 0,
    productionMeters: meters,
    lock,
  })
}


/** A/P Synopsis — every supplier's payable balance on `asOf` (YYYY-MM-DD). */
export async function payables(asOf: string): Promise<PayablesReport> {
  const dbc = await repo.db()
  const [parties, bills, payments] = await Promise.all([repo.listParties(dbc), repo.listBills(dbc, {}), repo.listPayments(dbc)])
  return payablesReport(asOf, parties, bills, payments)
}
