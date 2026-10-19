/**
 * Server-side protection against destructive floor writes.
 *
 * Background (Oct 2026): a read-side filter made some saved sheets look empty to the
 * browser, which then rebuilt those days from scratch and saved them back — silently
 * replacing real meters. Every check below exists so that a future client bug of the
 * same kind is REFUSED by the server instead of being written to the database.
 *
 * All functions here are pure (no DB access) so they can be unit-tested.
 */

import type { DailyLoomProductionEntry } from '@/types/production'

export class FloorGuardError extends Error {
  readonly status = 409
  readonly code = 'FLOOR_GUARD'
  constructor(message: string) {
    super(message)
    this.name = 'FloorGuardError'
  }
}

export function rowMeters(e: Partial<DailyLoomProductionEntry> | null | undefined): number {
  if (!e) return 0
  const total = Number((e as { totalMeters?: unknown }).totalMeters)
  if (Number.isFinite(total) && total > 0) return total
  return (Number(e.shiftAMeters) || 0) + (Number(e.shiftBMeters) || 0)
}

function hasQualityName(e: Partial<DailyLoomProductionEntry> | null | undefined): boolean {
  const n = String(e?.qualityName ?? '').trim()
  return Boolean(n) && n !== '—' && n !== '-'
}

function rowKey(e: { loomNumber?: number; segmentIndex?: number }): string {
  return `${Number(e.loomNumber)}:${Math.max(1, Math.floor(Number(e.segmentIndex) || 1))}`
}

/** A whole-sheet save may not wipe production that is already stored. */
export const SHEET_GUARD = {
  /** Refuse if this many (or more) rows would go from meters > 0 to 0 in one save. */
  maxZeroedRows: 2,
  /** Refuse if this many (or more) named rows with meters would lose their quality name. */
  maxNameWipes: 2,
  /** Refuse if the day's total meters would drop below this fraction of what is stored. */
  minTotalRatio: 0.5,
} as const

export type SheetGuardReport = {
  zeroedRows: string[]
  nameWipedRows: string[]
  storedTotal: number
  resultingTotal: number
}

/**
 * Compare a full-sheet save against what is stored for that date.
 * Rows not included in the payload keep their stored values (dbSaveSheet only upserts).
 */
export function analyzeSheetOverwrite(
  stored: DailyLoomProductionEntry[] | null | undefined,
  incoming: DailyLoomProductionEntry[]
): SheetGuardReport {
  const storedRows = stored || []
  const byKey = new Map(storedRows.map((e) => [rowKey(e), e]))
  const incomingByKey = new Map(incoming.map((e) => [rowKey(e), e]))

  const zeroedRows: string[] = []
  const nameWipedRows: string[] = []
  for (const [key, next] of incomingByKey) {
    const prev = byKey.get(key)
    if (!prev) continue
    const prevMeters = rowMeters(prev)
    if (prevMeters > 0 && rowMeters(next) === 0) zeroedRows.push(key)
    const intentionalClear = Boolean((next as { _clearQuality?: boolean })._clearQuality)
    if (prevMeters > 0 && hasQualityName(prev) && !hasQualityName(next) && !intentionalClear) {
      nameWipedRows.push(key)
    }
  }

  const storedTotal = storedRows.reduce((s, e) => s + rowMeters(e), 0)
  let resultingTotal = 0
  for (const [key, prev] of byKey) {
    resultingTotal += rowMeters(incomingByKey.get(key) ?? prev)
  }
  for (const [key, next] of incomingByKey) if (!byKey.has(key)) resultingTotal += rowMeters(next)

  return { zeroedRows, nameWipedRows, storedTotal, resultingTotal }
}

export function assertSafeSheetOverwrite(
  dateStr: string,
  stored: DailyLoomProductionEntry[] | null | undefined,
  incoming: DailyLoomProductionEntry[]
): void {
  const r = analyzeSheetOverwrite(stored, incoming)
  const problems: string[] = []
  if (r.zeroedRows.length >= SHEET_GUARD.maxZeroedRows) {
    problems.push(`${r.zeroedRows.length} looms would lose their meters`)
  }
  if (r.nameWipedRows.length >= SHEET_GUARD.maxNameWipes) {
    problems.push(`${r.nameWipedRows.length} looms would lose their quality`)
  }
  if (r.storedTotal > 0 && r.resultingTotal < r.storedTotal * SHEET_GUARD.minTotalRatio) {
    problems.push(
      `day total would drop from ${Math.round(r.storedTotal)} m to ${Math.round(r.resultingTotal)} m`
    )
  }
  if (problems.length > 0) {
    throw new FloorGuardError(
      `Save blocked to protect ${dateStr}: ${problems.join('; ')}. ` +
        'Nothing was changed. Refresh the page; to correct a loom, edit that row only.'
    )
  }
}

/**
 * Full-list replaces (yarn ledger, issuances, yarn master, beams) may add and edit
 * freely, but may not drop many existing records in one save.
 */
export const LIST_GUARD = {
  /** Removing up to this many records in one save is always allowed (normal deletes). */
  freeRemovals: 2,
  /** Above that, refuse when more than this fraction of stored records would vanish. */
  maxRemovedRatio: 0.1,
} as const

export function assertSafeListReplace(
  label: string,
  storedIds: Iterable<string>,
  incomingIds: Iterable<string>
): void {
  const stored = new Set(storedIds)
  const incoming = new Set(incomingIds)
  if (stored.size === 0) return
  if (incoming.size === 0) {
    throw new FloorGuardError(
      `Save blocked: ${label} would be emptied (${stored.size} records stored). Nothing was changed.`
    )
  }
  let removed = 0
  for (const id of stored) if (!incoming.has(id)) removed++
  if (removed > LIST_GUARD.freeRemovals && removed > stored.size * LIST_GUARD.maxRemovedRatio) {
    throw new FloorGuardError(
      `Save blocked: ${removed} of ${stored.size} ${label} records would be deleted in one save. ` +
        'Nothing was changed. Refresh the page and delete records one at a time if intended.'
    )
  }
}

// ---------------------------------------------------------------------------
// Approval fields: only approve/unlock/submit actions may change them.
// ---------------------------------------------------------------------------

export const APPROVAL_FIELDS = [
  'approvalStatus',
  'approvedBy',
  'approvedAt',
  'submittedBy',
  'submittedAt',
] as const

export function keepStoredApproval(
  incoming: DailyLoomProductionEntry,
  stored: DailyLoomProductionEntry | undefined
): DailyLoomProductionEntry {
  const next = { ...incoming } as Record<string, unknown>
  for (const f of APPROVAL_FIELDS) {
    const prev = stored ? (stored as unknown as Record<string, unknown>)[f] : undefined
    if (prev === undefined) delete next[f]
    else next[f] = prev
  }
  return next as unknown as DailyLoomProductionEntry
}

export function keepStoredApprovalForSheet(
  incoming: DailyLoomProductionEntry[],
  stored: DailyLoomProductionEntry[] | null | undefined
): DailyLoomProductionEntry[] {
  const byKey = new Map((stored || []).map((e) => [rowKey(e), e]))
  return incoming.map((e) => keepStoredApproval(e, byKey.get(rowKey(e))))
}

export function sheetIsApproved(entries: DailyLoomProductionEntry[] | null | undefined): boolean {
  return Boolean(entries?.some((e) => e.approvalStatus === 'APPROVED'))
}
