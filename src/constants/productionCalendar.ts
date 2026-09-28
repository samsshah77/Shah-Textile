/** Production floor calendar — Asia/Karachi.
 * Daily Entry and Production Sheet are dated the wall-clock day (28 banegi 28 ki).
 * Dashboard shows the previous calendar day, because that cloth is already off the roller.
 * wall-clock 28 → sheet Today = 28, dashboard = 27.
 */

const MILL_TZ = 'Asia/Karachi'

/** Production day lags wall-clock by this many days (sheet = pichla din). */
const PRODUCTION_DAY_LAG = 1

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

/** Real wall-clock date in mill timezone (not used as sheet date). */
export function getCalendarToday(): string {
  return formatLocalIso(new Date())
}

/**
 * Active production “Today” — always yesterday’s calendar date
 * (sheet hamesha pichle din ki banti hai).
 */
export function getProductionToday(): string {
  return shiftProductionDate(getCalendarToday(), -PRODUCTION_DAY_LAG)
}

/** Completed production day before active Today (calendar today − 2). */
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
