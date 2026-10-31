/** Dates on paper / PDF are written out: "31 October 2026" (never 31/10/2026). */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** 31 October 2026 */
export function longDate(d: Date): string {
  if (isNaN(d.getTime())) return ''
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "2026-10-31" → 31 October 2026 (the day as written, no time-zone shift). */
export function longDateFromYmd(ymd: string): string {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ymd
  return longDate(new Date(y, m - 1, d, 12))
}

/** "2026-10-31" → Saturday, 31 October 2026 */
export function longDayDateFromYmd(ymd: string): string {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ymd
  const date = new Date(y, m - 1, d, 12)
  return `${date.toLocaleDateString('en-US', { weekday: 'long' })}, ${longDate(date)}`
}

/** 31 October 2026, 10:02 am */
export function longDateTime(d: Date): string {
  if (isNaN(d.getTime())) return ''
  const h = d.getHours() % 12 || 12
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${longDate(d)}, ${h}:${min} ${d.getHours() < 12 ? 'am' : 'pm'}`
}
