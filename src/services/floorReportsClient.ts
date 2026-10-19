import type { ProductionReport } from '@/server/productionLedger'
import { PRODUCTION_START, getProductionTodayMonth } from '@/constants/productionCalendar'

export type { ProductionReport }

/** Server-computed production totals (from the floor_production ledger). */
export async function fetchProductionReport(from: string, to: string): Promise<ProductionReport> {
  const res = await fetch(
    `/api/floor/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { cache: 'no-store', credentials: 'include' }
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Report failed (${res.status})`)
  }
  return data.report as ProductionReport
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

export function monthOptions(): { value: string; label: string }[] {
  const end = getProductionTodayMonth()
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

/** Factory weeks inside a month: 1–7, 8–14, 15–21, 22–28, 29–end. */
export function monthWeeks(month: string): { label: string; from: string; to: string }[] {
  const { to } = monthRange(month)
  const lastDay = Number(to.slice(8, 10))
  const weeks: { label: string; from: string; to: string }[] = []
  for (let start = 1; start <= lastDay; start += 7) {
    const end = Math.min(start + 6, lastDay)
    const d = (n: number) => `${month}-${String(n).padStart(2, '0')}`
    weeks.push({ label: `${start}–${end}`, from: d(start), to: d(end) })
  }
  return weeks
}

/** True when the report found something that needs checking. */
export function reportNeedsAttention(r: ProductionReport): boolean {
  return r.mismatches.length > 0 || r.unlinked.length > 0 || r.outsideRun.length > 0
}
