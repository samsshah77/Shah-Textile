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

/** Real wall-clock date in mill timezone. */
export function getCalendarToday(): string {
  return formatLocalIso(new Date())
}

/**
 * Active production “Today” — same as mill wall-clock date
 * (Daily Entry / Production Sheet open on aaj).
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
