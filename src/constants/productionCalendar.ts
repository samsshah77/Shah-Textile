/** Production floor demo calendar — seed history stops at “today”. */
export const PRODUCTION_START = '2026-08-01'

/** Active production day for manager testing (Aug 1 → this date seeded). */
export const PRODUCTION_TODAY = '2026-09-21'

export const PRODUCTION_YESTERDAY = '2026-09-20'

export const PRODUCTION_TODAY_MONTH = PRODUCTION_TODAY.slice(0, 7)

export function shiftProductionDate(dateStr: string, deltaDays: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + deltaDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatProductionDayLabel(dateStr: string): string {
  try {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export function productionDayName(dateStr: string): string {
  try {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
  } catch {
    return ''
  }
}
