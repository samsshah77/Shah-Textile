/** Small pure helpers shared by the accounts server code and pages. */

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export function isMonth(v: unknown): v is string {
  return typeof v === 'string' && MONTH_RE.test(v)
}

/** A real calendar date "YYYY-MM-DD" (rejects 2026-02-30). */
export function isDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export function monthOfDate(date: string): string {
  return date.slice(0, 7)
}

/** "2026-10" → "October 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** "2026-08" → "For The Month of Aug 2026" (Excel heading). */
export function costPeriodTitle(month: string): string {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return `For The Month of ${month}`
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return `For The Month of ${label}`
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${month}-${String(last).padStart(2, '0')}`
}

/** Same slug rule the old pages used, so old links (/accounts/traders/<slug>) keep working. */
export function slugifyPartyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
}

/** Line amount: quantity × rate, rounded to whole rupees (as the sheets always did). */
export function lineAmount(quantity: number, rate: number): number {
  const q = Number(quantity) || 0
  const r = Number(rate) || 0
  return Math.round(q * r)
}

export function sum<T>(rows: T[], pick: (r: T) => number): number {
  let s = 0
  for (const r of rows) s += Number(pick(r)) || 0
  return s
}

/** Rupees for display: whole numbers with thousands separators ("61,500"). */
export function rs(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))
}

/** Quantity / rate for display: no ".00" on whole numbers, up to 3 decimals otherwise. */
export function qty(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(n) || 0)
}

/** How a ledger entry changes what we owe (OPENING adds; PAYMENT / ADJUSTMENT reduce). */
export function payableEffect(p: { kind?: string; amount: number }): number {
  return p.kind === 'OPENING' ? p.amount : -p.amount
}
