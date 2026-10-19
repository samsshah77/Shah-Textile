/** Which months the Accounts pages can show, and a default date inside a month. */
import { accountsRead } from '@/services/accountsStore'
import { ACCOUNTS_KEYS } from '@/lib/accountsKeys'

const MONTH_ORDER_MAP: Record<string, number> = {
  january: 1,
  february: 2,
  febraury: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

const MONTH_NUMBER_MAP: Record<string, string> = {
  january: '01',
  february: '02',
  febraury: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
}

export function getAccountsAvailableMonths(): string[] {
  const inventoryMonths = accountsRead<Record<string, unknown> | null>(
    ACCOUNTS_KEYS.INVENTORY_CONTROL,
    null
  )
  const defaultList = [
    'October',
    'September',
    'August',
    'July',
    'June',
    'May',
    'April',
    'March',
    'Febraury',
    'January',
  ]
  const keys = inventoryMonths ? Object.keys(inventoryMonths) : []
  const combined = Array.from(new Set([...keys, ...defaultList]))

  return combined.sort((a, b) => {
    const aClean = a.replace(/20\d{2}/, '').trim().toLowerCase()
    const bClean = b.replace(/20\d{2}/, '').trim().toLowerCase()
    const aOrder = MONTH_ORDER_MAP[aClean] || 99
    const bOrder = MONTH_ORDER_MAP[bClean] || 99
    return bOrder - aOrder
  })
}

export function getDefaultDateForMonth(monthStr: string): string {
  const now = new Date()
  const todayDay = String(now.getDate()).padStart(2, '0')
  const todayYear = String(now.getFullYear())

  if (!monthStr || monthStr === 'ALL') {
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    return `${todayYear}-${mm}-${todayDay}`
  }

  const isoMatch = monthStr.match(/^(\d{4})-(\d{2})/)
  if (isoMatch) {
    const year = isoMatch[1]
    const mm = isoMatch[2]
    const maxDays = new Date(Number(year), Number(mm), 0).getDate()
    const day = Math.min(now.getDate(), maxDays)
    return `${year}-${mm}-${String(day).padStart(2, '0')}`
  }

  const yearMatch = monthStr.match(/\b(20\d{2})\b/)
  const year = yearMatch ? yearMatch[1] : '2026'

  const cleanMonth = monthStr.replace(/20\d{2}/, '').trim().toLowerCase()
  const monthNum = MONTH_NUMBER_MAP[cleanMonth] || String(now.getMonth() + 1).padStart(2, '0')

  const maxDays = new Date(Number(year), Number(monthNum), 0).getDate()
  const day = Math.min(now.getDate(), maxDays)
  const dayStr = String(day).padStart(2, '0')

  return `${year}-${monthNum}-${dayStr}`
}
