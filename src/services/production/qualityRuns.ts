/** Which quality runs on which loom on which day: ends, holds, segments, yarn changes, sheet row rules. */
import { LoomStatus } from '@/types/loom'
import { DailyLoomProductionEntry } from '@/types/production'
import {
  PRODUCTION_START,
  getProductionToday,
  shiftProductionDate,
  productionAccountingMonthBounds,
} from '@/constants/productionCalendar'
import { resolveLoomCondition } from '@/constants/loomConditions'
import type {
  QualityMaster,
  QualityYarnChange,
  LoomMaster,
} from '@/services/production/masterTypes'
import { normalizeQualityStatus, normalizeQuality } from '@/services/production/masterTypes'

/** Loom numbers ended for this quality on a given date (or any date if date omitted). */
export function qualityLoomEndsOnDate(q: QualityMaster, dateStr?: string): number[] {
  const day = dateStr ? String(dateStr).slice(0, 10) : ''
  const rows = q.loomEnds || []
  const nums = rows
    .filter((e) => !day || e.date === day)
    .map((e) => e.loomNumber)
  return [...new Set(nums)].sort((a, b) => a - b)
}

/** If this loom's quality was ended/held on `dateStr`, return a short note for Looms UI. */
export function loomRecentQualityClearNote(
  loomNumber: number,
  qualities: QualityMaster[],
  dateStr: string
): { status: 'ENDED' | 'HOLD'; name: string } | null {
  const day = String(dateStr || '').slice(0, 10)
  if (!day) return null
  for (const q of qualities) {
    const status = normalizeQualityStatus(q.status)
    if (status !== 'ENDED' && status !== 'HOLD') continue
    const stamp = String(q.endedOn || '').slice(0, 10)
    if (!stamp) continue
    const visible =
      status === 'ENDED'
        ? qualityEndedVisibleOnDate(q, day)
        : stamp === day
    if (!visible) continue
    const onLoom =
      (q.loomEnds || []).some(
        (e) => e.loomNumber === loomNumber && (e.date === stamp || e.date === day)
      ) ||
      qualityLoomEndsOnDate(q, stamp).includes(loomNumber) ||
      qualityLoomEndsOnDate(q, day).includes(loomNumber)
    if (!onLoom) continue
    return { status, name: qualityDisplayName(q, qualities) }
  }
  return null
}

/** True if this loom already has an end recorded for the quality (any date). */
export function qualityLoomAlreadyEnded(q: QualityMaster, loomNumber: number): boolean {
  return (q.loomEnds || []).some((e) => e.loomNumber === loomNumber)
}

/** Recipe in force on a production day. History wins; otherwise the current quality yarn. */
export function yarnRecipeForDate(
  quality: QualityMaster | null | undefined,
  dateStr: string
): { warpYarn: string; weftYarn: string } | null {
  if (!quality) return null
  let hit: QualityYarnChange | null = null
  for (const h of quality.yarnHistory || []) {
    if (h.from <= dateStr && (!hit || h.from >= hit.from)) hit = h
  }
  if (hit) return { warpYarn: hit.warpYarn, weftYarn: hit.weftYarn }
  return { warpYarn: quality.warpYarn || '', weftYarn: quality.weftYarn || '' }
}

/** Keep the old warp/weft for days before `fromDate`, and the new pair from that day on. */
export function applyMidRunYarnChange(
  q: QualityMaster,
  patch: Partial<QualityMaster>,
  fromDate: string
): QualityMaster {
  const nextWarp = patch.warpYarn !== undefined ? patch.warpYarn : q.warpYarn
  const nextWeft = patch.weftYarn !== undefined ? patch.weftYarn : q.weftYarn
  const yarnTouched = patch.warpYarn !== undefined || patch.weftYarn !== undefined
  const yarnChanged =
    yarnTouched && ((nextWarp || '') !== (q.warpYarn || '') || (nextWeft || '') !== (q.weftYarn || ''))
  let yarnHistory = q.yarnHistory
  if (yarnChanged) {
    const prior = [...(q.yarnHistory || [])]
    if (prior.length === 0) {
      prior.push({
        from: PRODUCTION_START,
        warpYarn: q.warpYarn || '',
        weftYarn: q.weftYarn || '',
      })
    }
    const kept = prior.filter((h) => h.from < fromDate)
    kept.push({ from: fromDate, warpYarn: nextWarp || '', weftYarn: nextWeft || '' })
    kept.sort((a, b) => a.from.localeCompare(b.from))
    yarnHistory = kept
  }
  return {
    ...q,
    ...patch,
    warpYarn: nextWarp,
    weftYarn: nextWeft,
    yarnHistory,
    gsm: patch.gsm !== undefined ? Number(Number(patch.gsm).toFixed(2)) : q.gsm,
  }
}

/** Same group order as the Production Sheet: G6200, then PU, then G6300, then loom number. */
const SHEET_MODEL_RANK: Record<string, number> = { G6200: 0, PU: 1, G6300: 2 }

export function compareLoomsLikeProductionSheet(
  a: { loomNumber: number; category?: string; model?: string },
  b: { loomNumber: number; category?: string; model?: string }
) {
  const ra = SHEET_MODEL_RANK[a.category || a.model || 'G6200'] ?? 0
  const rb = SHEET_MODEL_RANK[b.category || b.model || 'G6200'] ?? 0
  if (ra !== rb) return ra - rb
  return a.loomNumber - b.loomNumber
}

export function qualityNameKey(name: string) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Same quality name is allowed when pick differs (Active runs only). */
export function qualityHasDuplicateName(q: QualityMaster, qualities: QualityMaster[]) {
  const key = qualityNameKey(q.name)
  if (!key) return false
  const activeSame = qualities.filter(
    (item) =>
      qualityNameKey(item.name) === key && normalizeQualityStatus(item.status) === 'ACTIVE'
  )
  if (activeSame.length <= 1) return false
  const picks = new Set(activeSame.map((item) => Number(item.pick)))
  return picks.size > 1
}

/** Live Active/Hold row with the same cleaned name (exclude one id). */
export function findLiveQualityByName(
  qualities: QualityMaster[],
  name: string,
  excludeId?: string
): QualityMaster | undefined {
  const key = qualityNameKey(name)
  if (!key) return undefined
  return qualities.find((item) => {
    if (excludeId && item.id === excludeId) return false
    const status = normalizeQualityStatus(item.status)
    if (status !== 'ACTIVE' && status !== 'HOLD') return false
    return qualityNameKey(item.name) === key
  })
}

/**
 * At most one Active per quality name. Older duplicates become ENDED
 * so Reuse / Continue never leave two SILVER-SHINE on Active.
 * Returns { qualities, remaps } where remaps maps demotedId → kept Active id.
 */
export function collapseDuplicateActiveQualities(
  list: QualityMaster[],
  endDay: string = getProductionToday()
): QualityMaster[] {
  const day = String(endDay || getProductionToday()).slice(0, 10)
  const byName = new Map<string, QualityMaster[]>()
  for (const q of list) {
    if (normalizeQualityStatus(q.status) !== 'ACTIVE') continue
    const key = qualityNameKey(q.name)
    if (!key) continue
    const arr = byName.get(key) || []
    arr.push(q)
    byName.set(key, arr)
  }
  const demote = new Map<string, string>() // demotedId → keptId
  for (const arr of byName.values()) {
    if (arr.length <= 1) continue
    const sorted = [...arr].sort((a, b) => {
      const ca = a.createdOn ? String(a.createdOn).slice(0, 10) : '1970-01-01'
      const cb = b.createdOn ? String(b.createdOn).slice(0, 10) : '1970-01-01'
      if (ca !== cb) return cb.localeCompare(ca)
      return b.id.localeCompare(a.id)
    })
    const kept = sorted[0]
    for (const older of sorted.slice(1)) demote.set(older.id, kept.id)
  }
  if (demote.size === 0) return list
  return list.map((q) =>
    demote.has(q.id)
      ? normalizeQuality({
          ...q,
          status: 'ENDED',
          endedOn: q.endedOn ? String(q.endedOn).slice(0, 10) : day,
        })
      : q
  )
}

/** Remap loom.qualityId after duplicate Active collapse (demoted → kept). */
export function remapLoomQualityIdsAfterCollapse(
  looms: LoomMaster[],
  before: QualityMaster[],
  after: QualityMaster[]
): LoomMaster[] {
  const beforeActive = before.filter((q) => normalizeQualityStatus(q.status) === 'ACTIVE')
  const afterByName = new Map<string, string>()
  for (const q of after) {
    if (normalizeQualityStatus(q.status) !== 'ACTIVE') continue
    afterByName.set(qualityNameKey(q.name), q.id)
  }
  let changed = false
  const next = looms.map((l) => {
    if (!l.qualityId) return l
    const stillActive = after.some(
      (q) => q.id === l.qualityId && normalizeQualityStatus(q.status) === 'ACTIVE'
    )
    if (stillActive) return l
    const was = beforeActive.find((q) => q.id === l.qualityId)
    if (!was) return l
    const keptId = afterByName.get(qualityNameKey(was.name))
    if (!keptId || keptId === l.qualityId) return l
    changed = true
    return { ...l, qualityId: keptId }
  })
  return changed ? next : looms
}

/** Display name on cards / looms — plain name only (Pick is shown in its own column). */
export function qualityDisplayName(q: QualityMaster, _qualities?: QualityMaster[]) {
  return q.name
}

export function matchQualityByNameAndPick(
  qualities: QualityMaster[],
  name: string,
  pick?: number
): QualityMaster | undefined {
  const named = qualities.filter((item) => qualityNameKey(item.name) === qualityNameKey(name))
  if (named.length === 0) return undefined

  const rank = (q: QualityMaster) => {
    const status = normalizeQualityStatus(q.status)
    if (status === 'ACTIVE') return 3
    if (status === 'HOLD') return 2
    return 1
  }
  const byPick =
    pick != null && named.length > 1
      ? named.filter((item) => Number(item.pick) === Number(pick))
      : named
  const pool = byPick.length > 0 ? byPick : named
  return [...pool].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return rb - ra
    const ca = a.createdOn ? String(a.createdOn).slice(0, 10) : '1970-01-01'
    const cb = b.createdOn ? String(b.createdOn).slice(0, 10) : '1970-01-01'
    if (ca !== cb) return cb.localeCompare(ca)
    return b.id.localeCompare(a.id)
  })[0]
}

/** Max same-day quality parts per loom (Part 1 + Part 2). */
export const MAX_SAME_DAY_QUALITY_SEGMENTS = 2

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

export function namedQualityOnRow(name?: string | null): boolean {
  const n = (name || '').trim()
  return n !== '' && n !== '—' && n !== '-'
}

/** Sheet remark when quality ended and loom has no new pose yet. */
export const QUALITY_ENDED_REMARK = 'Quality Ended'

export function isQualityEndedSheetRow(entry: { remarks?: string } | null | undefined): boolean {
  return /quality\s*ended/i.test(String(entry?.remarks || '').trim())
}

/**
 * True when this sheet row's quality run was ENDED before `day`
 * (next day must not keep pick/meters unless a new quality is assigned).
 * Uses name/pick match — does not rely on ownership "through end+1" window,
 * so seeded days after End still zero out.
 */
export function qualityPoseEndedBeforeDay(
  entry: { qualityName?: string; pick?: number; date?: string; loomNumber?: number } | null | undefined,
  catalog: QualityMaster[],
  day: string
): boolean {
  if (!entry || !namedQualityOnRow(entry.qualityName)) return false
  const dayStr = String(day || '').slice(0, 10)
  if (!dayStr) return false

  const owner = qualityRunThatOwnsSheetEntry(
    { ...entry, date: entry.date || dayStr },
    catalog,
    dayStr
  )
  if (owner) {
    if (normalizeQualityStatus(owner.status) === 'ENDED') {
      const stamp = owner.endedOn ? String(owner.endedOn).slice(0, 10) : ''
      if (stamp && stamp < dayStr) return true
    } else {
      // A live run (Active / Hold) of this quality owns the row — e.g. the same quality
      // restarted from zero after an earlier End: an older ENDED run of the name does not count.
      return false
    }
  }

  // Fallback: ENDED catalog row same name (pick if duplicate names) closed before day.
  // Needed when ownership window drops the run after end+1, or loom still holds ended id.
  const eClean = qualityNameKey(entry.qualityName || '')
  if (!eClean) return false
  const nameCounts = new Map<string, number>()
  for (const q of catalog) {
    const key = qualityNameKey(q.name)
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1)
  }
  const entryPick = Number(entry.pick) || 0
  return catalog.some((q) => {
    if (normalizeQualityStatus(q.status) !== 'ENDED') return false
    if (qualityNameKey(q.name) !== eClean) return false
    if ((nameCounts.get(eClean) || 0) > 1 && entryPick > 0 && entryPick !== Number(q.pick)) {
      return false
    }
    const stamp = q.endedOn ? String(q.endedOn).slice(0, 10) : ''
    if (!(stamp && stamp < dayStr)) return false
    // Superseded: the same quality was started again after this End (and by this day).
    const restarted = catalog.some((r) => {
      if (r.id === q.id || qualityNameKey(r.name) !== eClean) return false
      const start = r.createdOn ? String(r.createdOn).slice(0, 10) : ''
      return Boolean(start && start > stamp && start <= dayStr)
    })
    return !restarted
  })
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

/** All quality run ids present on a loom for a day (every segment). */
export function qualityIdsOnLoomForDate(
  loom: LoomMaster,
  qualities: QualityMaster[],
  dayRows: DailyLoomProductionEntry[],
  sheetDate?: string
): string[] {
  const day = String(sheetDate || '').slice(0, 10)
  const isPastDay = Boolean(day && day !== getProductionToday())
  const rows = dayRows.filter((e) => e.loomNumber === loom.loomNumber)
  const ids: string[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    if (!namedQualityOnRow(row.qualityName)) continue
    const id =
      qualityRunThatOwnsSheetEntry({ ...row, date: day || row.date }, qualities, day || row.date)
        ?.id ??
      matchQualityByNameAndPick(qualities, row.qualityName, row.pick)?.id ??
      null
    if (id && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }

  if (ids.length > 0) return ids
  if (rows.length > 0 && isPastDay) return []
  if (isPastDay) return []

  if (loom.qualityId) {
    const masterQ = qualities.find((q) => q.id === loom.qualityId)
    const masterStatus = masterQ ? normalizeQualityStatus(masterQ.status) : null
    if (masterQ && (masterStatus === 'ACTIVE' || masterStatus === 'HOLD')) {
      return [loom.qualityId]
    }
  }
  return loom.qualityId ? [loom.qualityId] : []
}

/** Day-wise primary quality on a loom: segment 1 sheet row, else master (today only). */
export function qualityIdOnLoomForDate(
  loom: LoomMaster,
  qualities: QualityMaster[],
  dayRows: DailyLoomProductionEntry[],
  sheetDate?: string
): string | null {
  const ids = qualityIdsOnLoomForDate(loom, qualities, dayRows, sheetDate)
  return ids[0] ?? null
}

/** True when any segment on that loom/day belongs to this quality. */
export function loomHasQualityOnDate(
  loom: LoomMaster,
  qualityId: string,
  qualities: QualityMaster[],
  dayRows: DailyLoomProductionEntry[],
  sheetDate?: string
): boolean {
  return qualityIdsOnLoomForDate(loom, qualities, dayRows, sheetDate).includes(qualityId)
}

/**
 * Which quality *run* owns a sheet row when the same name is re-added / reassigned.
 * Latest `createdOn` that still covers that day wins — so Track/Overall start at 0 for new runs.
 *
 * End/Hold clears `qualityName` to "—" but keeps meters. Those rows still belong to the
 * closed run via `loomEnds` (date + loom) so Ends totals match pre-End / Continue meters.
 */
export function qualityRunThatOwnsSheetEntry(
  entry: { qualityName?: string; pick?: number; date?: string; loomNumber?: number; qualityId?: string },
  catalog: QualityMaster[],
  fallbackDate?: string
): QualityMaster | null {
  const day = String(entry.date || fallbackDate || '').slice(0, 10)
  if (!day) return null

  // Server-stamped id wins (exact run), as long as the row still carries that quality's name.
  if (entry.qualityId && entry.qualityName && entry.qualityName !== '—') {
    const byId = catalog.find((q) => q.id === entry.qualityId)
    if (byId && qualityNameKey(byId.name) === qualityNameKey(entry.qualityName)) return byId
  }

  // Cleared end-day rows: meters stay, name wiped — credit via loomEnds stamp.
  if (!entry.qualityName || entry.qualityName === '—') {
    const loomNumber = Number(entry.loomNumber)
    if (!Number.isFinite(loomNumber) || loomNumber <= 0) return null
    const stamped = catalog.filter((q) => {
      const status = normalizeQualityStatus(q.status)
      if (status !== 'ENDED' && status !== 'HOLD') return false
      return (q.loomEnds || []).some((e) => e.loomNumber === loomNumber && e.date === day)
    })
    if (stamped.length === 0) return null
    if (stamped.length === 1) return stamped[0]
    return [...stamped].sort((a, b) => {
      const ea = a.endedOn ? String(a.endedOn).slice(0, 10) : ''
      const eb = b.endedOn ? String(b.endedOn).slice(0, 10) : ''
      if (ea !== eb) return eb.localeCompare(ea)
      return b.id.localeCompare(a.id)
    })[0]
  }

  const eClean = qualityNameKey(entry.qualityName || '')
  if (!eClean) return null

  const nameCounts = new Map<string, number>()
  for (const q of catalog) {
    const key = qualityNameKey(q.name)
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1)
  }

  const candidates = catalog.filter((q) => {
    const qClean = qualityNameKey(q.name)
    // Exact cleaned name only — "PARCO" must not steal "PARCO PU" meters (substring false friends).
    if (eClean !== qClean) return false
    if ((nameCounts.get(qClean) || 0) > 1 && Number(entry.pick) !== Number(q.pick)) return false

    const status = normalizeQualityStatus(q.status)
    // Undated Active must not steal full history after reuse (zero-start).
    const createdOn = q.createdOn
      ? String(q.createdOn).slice(0, 10)
      : status === 'ACTIVE'
        ? day
        : '1970-01-01'
    if (day < createdOn) return false

    const stamp = q.endedOn ? String(q.endedOn).slice(0, 10) : null
    // ENDED runs stay on the next production day too (factory month 2→1 hisab).
    if (status === 'ENDED' && stamp) {
      const through = shiftProductionDate(stamp, 1)
      if (day > through) return false
    } else if (status === 'HOLD' && stamp && day > stamp) {
      return false
    }
    // Same quality restarted from zero after this run closed: from the restart day the
    // new run owns the rows (each restart in a month keeps its own hisab).
    if ((status === 'ENDED' || status === 'HOLD') && stamp) {
      const restarted = catalog.some((r) => {
        if (r.id === q.id || qualityNameKey(r.name) !== qClean) return false
        if ((nameCounts.get(qClean) || 0) > 1 && Number(r.pick) !== Number(q.pick)) return false
        const start = r.createdOn ? String(r.createdOn).slice(0, 10) : ''
        return Boolean(start && start > stamp && start <= day)
      })
      if (restarted) return false
    }
    return true
  })

  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]
  return [...candidates].sort((a, b) => {
    const statusA = normalizeQualityStatus(a.status)
    const statusB = normalizeQualityStatus(b.status)
    // Prefer ENDED history over new Active — Reuse Track starts at zero same day.
    if (statusA === 'ENDED' && statusB === 'ACTIVE') return -1
    if (statusB === 'ENDED' && statusA === 'ACTIVE') return 1
    if (statusA === 'ACTIVE' && statusB !== 'ACTIVE') return -1
    if (statusB === 'ACTIVE' && statusA !== 'ACTIVE') return 1
    const ca = a.createdOn ? String(a.createdOn).slice(0, 10) : '1970-01-01'
    const cb = b.createdOn ? String(b.createdOn).slice(0, 10) : '1970-01-01'
    if (ca !== cb) return cb.localeCompare(ca)
    return b.id.localeCompare(a.id)
  })[0]
}

/**
 * Ends tab: keep closed qualities for the whole factory month (2 → next 1)
 * so month PDF / hisab can still list them after reuse.
 */
export function qualityEndedVisibleOnDate(
  q: Pick<QualityMaster, 'status' | 'endedOn'>,
  sheetDate: string
): boolean {
  if (normalizeQualityStatus(q.status) !== 'ENDED') return false
  const day = String(sheetDate || '').slice(0, 10)
  const stamp = q.endedOn ? String(q.endedOn).slice(0, 10) : ''
  if (!day || !stamp) return false
  const { from, to } = productionAccountingMonthBounds(day)
  return stamp >= from && stamp <= to
}

export function qualityRunOwnsSheetEntry(
  quality: QualityMaster,
  entry: { qualityName?: string; pick?: number; date?: string; loomNumber?: number },
  catalog: QualityMaster[],
  fallbackDate?: string
): boolean {
  const owner = qualityRunThatOwnsSheetEntry(entry, catalog, fallbackDate)
  return Boolean(owner && owner.id === quality.id)
}

/**
 * True when a HOLD quality should still appear on Active for a *past* day
 * (it was running that day; Hold day onward → Hold tab only).
 * History rows are read-only (H badge + orange BG) — Resume only from Hold tab
 * on hold date or any later day.
 */
export function qualityHeldButVisibleOnPastDay(
  q: QualityMaster,
  sheetDate: string
): boolean {
  if (normalizeQualityStatus(q.status) !== 'HOLD') return false
  const day = String(sheetDate || '').slice(0, 10)
  const stamp = q.endedOn ? String(q.endedOn).slice(0, 10) : ''
  if (!day || !stamp) return false
  // Hold day and after → Hold tab only. Before hold → history on Active.
  return day < stamp
}

/**
 * True when an ENDED quality should still appear on Active for a day it ran
 * (any day up to and including its End day; after that → Ends tab only).
 * History rows are read-only (E badge + muted BG).
 */
export function qualityEndedButVisibleOnPastDay(
  q: QualityMaster,
  sheetDate: string
): boolean {
  if (normalizeQualityStatus(q.status) !== 'ENDED') return false
  const day = String(sheetDate || '').slice(0, 10)
  const stamp = q.endedOn ? String(q.endedOn).slice(0, 10) : ''
  if (!day || !stamp) return false
  // Up to and including the End day it was running → stays on Active as read-only
  // history (E badge, muted BG). Only after the End day does it leave Active.
  return day <= stamp
}

/** HOLD or ENDED history row on Active for a past sheet date (read-only). */
export function qualityHistoryOnActivePastDay(
  q: QualityMaster,
  sheetDate: string
): boolean {
  return (
    qualityHeldButVisibleOnPastDay(q, sheetDate) ||
    qualityEndedButVisibleOnPastDay(q, sheetDate)
  )
}

/** Active tab on `sheetDate`: live Active, plus HOLD/ENDED history before stamp day. */
export function qualityActiveOnSheetDate(
  q: QualityMaster,
  sheetDate: string,
  dayRows: DailyLoomProductionEntry[],
  catalog: QualityMaster[]
): boolean {
  const day = String(sheetDate || '').slice(0, 10)
  const createdOn = q.createdOn ? String(q.createdOn).slice(0, 10) : null
  // New qualities do not appear on dates before they were created.
  if (createdOn && day && day < createdOn) {
    // Exception: already on that day's sheet (legacy / imported allotment) — but not when
    // that row belongs to another run of the same name (the run ended before this restart),
    // or the restarted quality would show on the old run's days as "not assigned".
    const onSheet = dayRows.some((e) => {
      if (!sheetRowShowsQuality(e, q, catalog)) return false
      const owner = qualityRunThatOwnsSheetEntry({ ...e, date: day }, catalog, day)
      return !owner || owner.id === q.id
    })
    if (!onSheet) return false
  }
  const status = normalizeQualityStatus(q.status)
  if (status === 'ENDED') {
    return qualityEndedButVisibleOnPastDay(q, day)
  }
  if (status === 'HOLD') {
    return qualityHeldButVisibleOnPastDay(q, day)
  }
  return true
}

/** True when this quality is on at least one loom master row or today's sheet. */
export function qualityAssignedOnDay(
  q: QualityMaster,
  looms: LoomMaster[],
  dayRows: DailyLoomProductionEntry[],
  catalog: QualityMaster[]
): boolean {
  if (looms.some((l) => l.qualityId === q.id)) return true
  return dayRows.some((e) => sheetRowShowsQuality(e, q, catalog))
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

export function sheetRowShowsQuality(
  row: DailyLoomProductionEntry,
  quality: QualityMaster,
  catalog: QualityMaster[]
): boolean {
  const qClean = qualityNameKey(quality.name)
  const eClean = qualityNameKey(row.qualityName || '')
  if (!qClean || !eClean || row.qualityName === '—') return false
  // Exact cleaned name only — "PARCO" ≠ "PARCO PU".
  if (eClean !== qClean) return false
  const shared = catalog.filter((item) => qualityNameKey(item.name) === qClean).length > 1
  if (shared) return Number(row.pick) === Number(quality.pick)
  return true
}

/** Loom numbers running this quality, in production-sheet order. Same name + different pick stay separate. */
export function loomsAllottedToQuality(
  q: QualityMaster,
  looms: LoomMaster[],
  qualities: QualityMaster[],
  entries?: { loomNumber: number; qualityName: string; pick?: number }[]
): number[] {
  const byId = looms.filter((l) => l.qualityId === q.id)
  const fromMaster = byId.length
    ? byId
    : (entries || [])
        .filter((e) => matchQualityByNameAndPick(qualities, e.qualityName, e.pick)?.id === q.id)
        .map((e) => looms.find((l) => l.loomNumber === e.loomNumber))
        .filter((l): l is LoomMaster => Boolean(l))
  const unique = new Map<number, LoomMaster>()
  for (const loom of fromMaster) unique.set(loom.loomNumber, loom)
  return [...unique.values()]
    .sort(compareLoomsLikeProductionSheet)
    .map((l) => l.loomNumber)
}

/** Order quality master rows to match the Production Sheet (model groups, then loom number). */
export function orderQualitiesByLoomAllotment(
  qualities: QualityMaster[],
  looms: LoomMaster[],
  entries?: { loomNumber: number; qualityName: string; pick?: number }[]
): QualityMaster[] {
  const ordered: QualityMaster[] = []
  const seen = new Set<string>()
  const sortedLooms = [...looms].sort(compareLoomsLikeProductionSheet)

  for (const l of sortedLooms) {
    let q = l.qualityId ? qualities.find((item) => item.id === l.qualityId) : undefined
    if (!q && entries?.length) {
      const entry = entries.find((e) => e.loomNumber === l.loomNumber)
      if (entry?.qualityName) {
        q = matchQualityByNameAndPick(qualities, entry.qualityName, entry.pick)
      }
    }
    if (q && !seen.has(q.id)) {
      seen.add(q.id)
      ordered.push(q)
    }
  }

  if (entries?.length) {
    const entryLooms = [...entries].sort((a, b) => {
      const la = looms.find((l) => l.loomNumber === a.loomNumber)
      const lb = looms.find((l) => l.loomNumber === b.loomNumber)
      if (la && lb) return compareLoomsLikeProductionSheet(la, lb)
      return a.loomNumber - b.loomNumber
    })
    for (const e of entryLooms) {
      const q = matchQualityByNameAndPick(qualities, e.qualityName, e.pick)
      if (q && !seen.has(q.id)) {
        seen.add(q.id)
        ordered.push(q)
      }
    }
  }

  for (const q of qualities) {
    if (!seen.has(q.id)) {
      seen.add(q.id)
      ordered.push(q)
    }
  }
  return ordered
}
