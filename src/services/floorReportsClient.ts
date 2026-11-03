import type { ProductionReport } from '@/server/productionLedger'
import { PRODUCTION_START, getProductionCurrentMonth, productionMonthBounds } from '@/constants/productionCalendar'

export type { ProductionReport }

/** Server-computed production totals (from the floor_production ledger). */
export async function fetchProductionReport(
  from: string,
  to: string,
  options?: { summaryOnly?: boolean }
): Promise<ProductionReport> {
  const summaryPart = options?.summaryOnly ? '&summary=1' : ''
  const res = await fetch(
    `/api/floor/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${summaryPart}`,
    { cache: 'no-store', credentials: 'include' }
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Report failed (${res.status})`)
  }
  return data.report as ProductionReport
}

/** Production month: the 2nd → the 1st of the next month (the 1st closes the previous month). */
export function monthRange(month: string): { from: string; to: string } {
  return productionMonthBounds(month)
}

export function monthOptions(): { value: string; label: string }[] {
  const end = getProductionCurrentMonth()
  const out: { value: string; label: string }[] = []
  let cursor = PRODUCTION_START.slice(0, 7)
  while (cursor <= end) {
    const [y, m] = cursor.split('-').map(Number)
    out.push({
      value: cursor,
      label: new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    })
    cursor = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  }
  return out.reverse()
}

/**
 * Factory weeks inside a production month: 2–8, 9–15, 16–22, 23–1 (the last week runs to
 * the 1st of the next month, which closes the month).
 */
export function monthWeeks(month: string): { label: string; from: string; to: string }[] {
  const { from, to } = monthRange(month)
  const d = (n: number) => `${month}-${String(n).padStart(2, '0')}`
  const cuts = [d(8), d(15), d(22), to]
  const weeks: { label: string; from: string; to: string }[] = []
  let start = from
  for (const end of cuts) {
    weeks.push({ label: `${Number(start.slice(8, 10))}–${Number(end.slice(8, 10))}`, from: start, to: end })
    const [y, m, dd] = end.split('-').map(Number)
    const next = new Date(Date.UTC(y, m - 1, dd + 1))
    start = next.toISOString().slice(0, 10)
  }
  return weeks
}

/** True when the report found something that needs checking. */
export function reportNeedsAttention(r: ProductionReport): boolean {
  return r.mismatches.length > 0 || r.unlinked.length > 0 || r.outsideRun.length > 0
}
