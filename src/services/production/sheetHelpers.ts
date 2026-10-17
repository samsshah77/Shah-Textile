import { DailyLoomProductionEntry } from '@/types/production'
import { LoomStatus } from '@/types/loom'
import { resolveLoomCondition } from '@/constants/loomConditions'
import { getCalendarToday } from '@/constants/productionCalendar'
import { LoomMaster } from './productionTypes'

/** Same-day dual quality segment (1 = primary). Legacy rows without the field = 1. */
export function sheetSegmentIndex(entry?: { segmentIndex?: number | null } | null): number {
  const n = Number(entry?.segmentIndex)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

export function sheetRowKey(loomNumber: number, segmentIndex: number = 1): string {
  return `${loomNumber}:${sheetSegmentIndex({ segmentIndex })}`
}

export function sheetEntryId(dateStr: string, loomNumber: number, segmentIndex: number = 1): string {
  const seg = sheetSegmentIndex({ segmentIndex })
  return seg <= 1 ? `PROD-${dateStr}-${loomNumber}` : `PROD-${dateStr}-${loomNumber}-s${seg}`
}

export function sortSheetEntries(entries: DailyLoomProductionEntry[]): DailyLoomProductionEntry[] {
  return [...entries].sort((a, b) =>
    a.loomNumber === b.loomNumber
      ? sheetSegmentIndex(a) - sheetSegmentIndex(b)
      : a.loomNumber - b.loomNumber
  )
}

export function normalizeSheetEntry(entry: DailyLoomProductionEntry): DailyLoomProductionEntry {
  const segmentIndex = sheetSegmentIndex(entry)
  return {
    ...entry,
    segmentIndex,
    id: entry.id || sheetEntryId(entry.date, entry.loomNumber, segmentIndex),
  }
}

/** Day-wise RPM on a loom: sheet row for that date, else master default. */
export function rpmOnLoomForDate(
  loom: LoomMaster,
  dayRows: DailyLoomProductionEntry[]
): number {
  const row = dayRows.find((e) => e.loomNumber === loom.loomNumber)
  if (row && row.rpm != null && Number(row.rpm) > 0) return Number(row.rpm)
  return loom.defaultRpm || 0
}

/** Day-wise loom status: sheet row for that date, else master. */
export function statusOnLoomForDate(
  loom: LoomMaster,
  dayRows: DailyLoomProductionEntry[]
): LoomStatus {
  const row = dayRows.find((e) => e.loomNumber === loom.loomNumber)
  if (row) return resolveLoomCondition(row.status, row.remarks)
  return (loom.status || 'RUNNING') as LoomStatus
}

export function monthLastEnteredDay(monthStr: string): number {
  const [y, m] = monthStr.split('-').map(Number)
  const daysInMonth = y && m ? new Date(y, m, 0).getDate() : 30
  const cal = getCalendarToday()
  const cap = monthStr === cal.slice(0, 7) ? Number(cal.slice(-2)) : daysInMonth
  return Math.min(daysInMonth, Math.max(cap || 1, 1))
}
