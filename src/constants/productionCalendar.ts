/** Production floor calendar — Asia/Karachi.
 * Default open day is always wall-clock Today.
 * Yesterday / other days: user selects manually (date picker or quick buttons).
 */

const MILL_TZ = 'Asia/Karachi'

function formatLocalIso(d: Date, timeZone: string = MILL_TZ): string {
  // en-CA → YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Earliest day the floor calendar allows (seed / Excel start). */
export const PRODUCTION_START = '2026-09-01'

/**
 * Optional local/test override: set NEXT_PUBLIC_PRODUCTION_TODAY=YYYY-MM-DD
 * in .env.local so seeded future days (e.g. 14 Oct) show everywhere as Today.
 * Leave unset on live.
 */
function productionTodayOverride(): string | null {
  const raw =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_PRODUCTION_TODAY) || ''
  const day = String(raw).trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day
  // Shah Textile demo: default Today to 2026-11-24 so Yesterday is 2026-11-23 (23 full entered days in Nov)
  return '2026-11-24'
}

/** Real wall-clock date in mill timezone (or local override). */
export function getCalendarToday(): string {
  return productionTodayOverride() || formatLocalIso(new Date())
}

/**
 * Active production “Today” — mill wall-clock date
 * (Daily Entry / Production Sheet open on aaj), unless overridden locally.
 */
export function getProductionToday(): string {
  return getCalendarToday()
}

/** Completed production day before active Today (calendar yesterday). */
export function getProductionYesterday(): string {
  return shiftProductionDate(getProductionToday(), -1)
}

/** YYYY-MM for active production today. */
export function getProductionTodayMonth(): string {
  return getProductionToday().slice(0, 7)
}

/**
 * Snapshot aliases for default-parameter / seed call sites.
 * Prefer getProductionToday() / getProductionYesterday() in UI so labels stay live.
 */
export const PRODUCTION_TODAY = getProductionToday()
export const PRODUCTION_YESTERDAY = getProductionYesterday()
export const PRODUCTION_TODAY_MONTH = getProductionTodayMonth()

export function shiftProductionDate(dateStr: string, deltaDays: number): string {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`)
  d.setDate(d.getDate() + deltaDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Factory accounting month: starts on the 2nd, closes on the 1st of next month.
 * On the 1st, the open period is still the previous month’s 2 → this 1.
 */
export function productionAccountingMonthBounds(dateStr: string): { from: string; to: string } {
  const day = String(dateStr || '').slice(0, 10)
  const dom = Number(day.slice(8, 10)) || 1
  const anchor = dom === 1 ? shiftProductionDate(day, -1) : day
  const y = Number(anchor.slice(0, 4))
  const m = Number(anchor.slice(5, 7))
  const from = `${y}-${String(m).padStart(2, '0')}-02`
  const close = new Date(y, m, 1) // next calendar month, day 1
  const to = `${close.getFullYear()}-${String(close.getMonth() + 1).padStart(2, '0')}-01`
  return { from, to }
}

/**
 * Production month of a day. A month runs from the 2nd to the 1st of the next month: what is
 * entered on the 1st is the previous day's production, so it closes the previous month
 * (1 November → October). The first month starts on PRODUCTION_START (1 September).
 */
export function productionMonthOf(dateStr: string): string {
  const day = String(dateStr || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day.slice(0, 7)
  if (day.slice(8, 10) !== '01' || day <= PRODUCTION_START) return day.slice(0, 7)
  return shiftProductionDate(day, -1).slice(0, 7)
}

/** First and last day of a production month (YYYY-MM): the 2nd → the 1st of the next month. */
export function productionMonthBounds(month: string): { from: string; to: string } {
  const [y, m] = String(month).split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  // The very first month also takes its 1st (production started on PRODUCTION_START).
  const from = month === PRODUCTION_START.slice(0, 7) ? PRODUCTION_START : `${month}-02`
  return { from, to: `${next}-01` }
}

/** Every day of a production month up to `until` (default: today), in order. */
export function productionMonthDates(month: string, until: string = getCalendarToday()): string[] {
  const { from, to } = productionMonthBounds(month)
  const last = until < to ? until : to
  const out: string[] = []
  for (let d = from; d <= last; d = shiftProductionDate(d, 1)) out.push(d)
  return out
}

/** Production month that is open today (on the 1st it is still the previous month). */
export function getProductionCurrentMonth(): string {
  return productionMonthOf(getProductionToday())
}

export function formatProductionDayLabel(dateStr: string): string {
  try {
    return new Date(`${String(dateStr).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return String(dateStr)
  }
}

export function productionDayName(dateStr: string): string {
  try {
    return new Date(`${String(dateStr).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'long',
    })
  } catch {
    return ''
  }
}

export function formatProductionMonthLabel(monthStr: string): string {
  try {
    const [y, m] = String(monthStr).split('-').map(Number)
    if (!y || !m) return String(monthStr)
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  } catch {
    return String(monthStr)
  }
}
