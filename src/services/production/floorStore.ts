/**
 * Floor data in the browser: the in-memory copy of the server data, loading it
 * (hydrate / preload), persisting targeted changes, and the production month locks.
 * Split out of productionMastersService.ts (no behaviour change).
 */
import {
  DailyLoomProductionEntry,
} from '@/types/production'
import {
  PRODUCTION_TODAY_MONTH,
  getCalendarToday,
  productionMonthDates,
} from '@/constants/productionCalendar'
import { isClient } from '@/services/production/loomBeamHelpers'
import type {
  BeamMaster,
  QualityLifecycleStatus,
  QualityMaster,
} from '@/services/production/masterTypes'
import {
  normalizeQuality,
} from '@/services/production/masterTypes'
import {
  normalizeSheetEntry,
  sheetSegmentIndex,
  sortSheetEntries,
  sheetRowKey,
} from '@/services/production/qualityRuns'
import { LEGACY_LOCAL_COPY_KEYS } from '@/services/production/floorLocalCache'
import {
  memoryStore,
  notifyFloorSaveProblem,
  schedulePersist,
  setListFromServer,
  setSheetFromServer,
  markExplicitSheetRow,
  runAction,
  enqueue,
  clearBase,
  isBusy,
  reloadFromServer,
} from '@/services/production/floorSync'
import type {
  RowHashes,
} from '@/lib/floor/rowSync'
import { handleSessionExpired, isSessionExpired } from '@/lib/authGuard'

export const KEY_LOOMS = 'sara_textile_loom_master_v8'
export const KEY_BEAMS = 'sara_textile_beam_master_v9'
export const KEY_YARN = 'sara_textile_yarn_master_v8'
export const KEY_YARN_ISSUANCE = 'sara_textile_yarn_issuance_v8'
export const KEY_QUALITY = 'sara_textile_quality_master_v8'
export const KEY_SHEET = 'sara_textile_production_sheet_v8'
export const KEY_YARN_MOVEMENTS = 'sara_textile_yarn_movements_v8'
export let hydratePromise: Promise<void> | null = null
export let hydrated = false

export const ROW_SAVED_KEYS = new Set<string>([KEY_LOOMS, KEY_BEAMS, KEY_QUALITY])

/**
 * Save a list / day: only the rows that changed since the server copy are sent
 * (src/services/production/floorSync.ts). Yarn lists are never saved this way —
 * yarn changes go through the yarn actions.
 */
export async function persistKey(key: string, value: unknown): Promise<boolean> {
  if (!isClient()) return false
  const isSheet = key.startsWith(`${KEY_SHEET}_`)
  if (!isSheet && !ROW_SAVED_KEYS.has(key)) return false
  // A locked production month is read-only: rebuilding one of its days is not saved.
  if (isSheet && isFloorMonthLocked(key.slice(`${KEY_SHEET}_`.length, `${KEY_SHEET}_`.length + 7))) return false
  // Never push seed/fallback masters before DB hydrate — that wiped swLot on refresh.
  if (!hydrated && !isSheet) {
    console.warn('[floor] skip persist before hydrate', key)
    return false
  }
  try {
    memoryStore.set(key, JSON.stringify(value))
  } catch {
    return false
  }
  return schedulePersist(key)
}

/** Run one floor action in the save order of `key`; tell the user if it is refused. */
export async function floorAction(key: string, body: Record<string, unknown>, label: string): Promise<Record<string, unknown> | null> {
  if (!isClient()) return null
  const { status, data } = await runAction(key, body)
  if (status === 200 && data?.ok) return data
  if (status !== 0) notifyFloorSaveProblem(status, data)
  console.error(`[floor] ${label} failed`, status, data)
  return null
}

export async function persistBeamPatch(
  beamNo: string,
  patch: Partial<
    Pick<
      BeamMaster,
      'swLot' | 'qualityId' | 'beamRepeat' | 'warp' | 'reed' | 'width' | 'length' | 'loomType' | 'totalThreads' | 'parkedNearLoom'
    >
  >
): Promise<boolean> {
  if (!isClient() || !beamNo) return false
  return Boolean(await floorAction(KEY_BEAMS, { action: 'patchBeam', beamNo, patch }, `patchBeam ${beamNo}`))
}

/** Persist one full beam row (Add Beam) — does not rewrite/delete sibling beams. */
export async function persistBeamUpsert(beam: BeamMaster): Promise<boolean> {
  if (!isClient() || !beam?.beamNo) return false
  if (hydratePromise) {
    try {
      await hydratePromise
    } catch {
      // still try upsert
    }
  }
  return Boolean(await floorAction(KEY_BEAMS, { action: 'upsertBeam', beam }, `upsertBeam ${beam.beamNo}`))
}

export async function persistBeamDelete(beamNo: string): Promise<boolean> {
  if (!isClient() || !beamNo) return false
  return Boolean(await floorAction(KEY_BEAMS, { action: 'deleteBeam', beamNo }, `deleteBeam ${beamNo}`))
}

/** Patch one quality ENDED/ACTIVE in DB so refresh keeps the record. */
export async function persistQualityStatus(
  id: string,
  status: QualityLifecycleStatus,
  endedOn: string | null
): Promise<boolean> {
  if (!isClient()) return false
  return Boolean(await floorAction(KEY_QUALITY, { action: 'patchQualityStatus', id, status, endedOn }, `patchQualityStatus ${id}`))
}

/** Insert/update one quality row — reuse fork must hit DB or refresh drops Active. */
export async function persistQualityUpsert(quality: QualityMaster): Promise<boolean> {
  if (!isClient()) return false
  return Boolean(await floorAction(KEY_QUALITY, { action: 'upsertQuality', quality }, `upsertQuality ${quality.id}`))
}

/** Server-atomic reuse: keep ENDED + insert Active in one request. */
export async function persistQualityReuse(
  endedId: string,
  createdOn: string,
  newQuality: QualityMaster
): Promise<{ ok: boolean; active: QualityMaster | null; ended: QualityMaster | null }> {
  if (!isClient()) return { ok: false, active: null, ended: null }
  const data = await floorAction(KEY_QUALITY, { action: 'reuseQuality', endedId, createdOn, newQuality }, `reuseQuality ${endedId}`)
  if (!data) return { ok: false, active: null, ended: null }
  return {
    ok: true,
    active: data.active ? normalizeQuality(data.active as QualityMaster) : newQuality,
    ended: data.ended ? normalizeQuality(data.ended as QualityMaster) : null,
  }
}

/**
 * A row edited by hand: mark it so the server applies the hand-edit rules
 * (keep the quality name unless cleared on purpose), then save the day's changed rows.
 */
export function persistLoomEntry(
  dateStr: string,
  loomNumber: number,
  entry: DailyLoomProductionEntry & { _clearQuality?: boolean }
): void {
  if (!isClient()) return
  markExplicitSheetRow(dateStr, { loomNumber, segmentIndex: sheetSegmentIndex(entry) }, Boolean(entry._clearQuality))
  void schedulePersist(`${KEY_SHEET}_${dateStr}`)
}

export async function persistDeleteLoomSegment(
  dateStr: string,
  loomNumber: number,
  segmentIndex: number
): Promise<void> {
  if (!isClient()) return
  const seg = sheetSegmentIndex({ segmentIndex })
  if (seg <= 1) return
  await floorAction(
    `${KEY_SHEET}_${dateStr}`,
    { action: 'deleteLoomSegment', date: dateStr, loomNumber, segmentIndex: seg },
    `deleteLoomSegment ${loomNumber}:${seg}`
  )
}

export function clearLegacyFloorLocalStorage() {
  if (!isClient()) return
  const keys = [
    KEY_LOOMS,
    KEY_BEAMS,
    KEY_YARN,
    KEY_YARN_ISSUANCE,
    KEY_YARN_MOVEMENTS,
    KEY_QUALITY,
    // Old browser-only copies of unsent quality ends / new qualities / beams / Sw#.
    // The server is the only record now; these were re-sent on load and could undo
    // what someone else saved.
    ...LEGACY_LOCAL_COPY_KEYS,
  ]
  try {
    for (const key of keys) localStorage.removeItem(key)
    // Old sheet snapshots in localStorage must not fight the DB.
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(KEY_SHEET)) toRemove.push(k)
    }
    for (const k of toRemove) localStorage.removeItem(k)
  } catch {
    // ignore
  }
}

export function loadJson<T>(key: string, fallback: () => T): T {
  try {
    const raw = memoryStore.get(key)
    if (raw) return JSON.parse(raw) as T
  } catch {
    // ignore
  }
  // Legacy localStorage: read once into memory only. Never push to DB from here —
  // that was wiping live qualities/sheets with stale browser seed data.
  if (isClient()) {
    try {
      const legacy = localStorage.getItem(key)
      if (legacy) {
        memoryStore.set(key, legacy)
        try {
          localStorage.removeItem(key)
        } catch {
          // ignore
        }
        try {
          return JSON.parse(legacy) as T
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }
  return fallback()
}

export function saveJson<T>(key: string, value: T) {
  try {
    memoryStore.set(key, JSON.stringify(value))
  } catch {
    // ignore
  }
  void persistKey(key, value)
}

export function removeStoreKey(key: string) {
  memoryStore.delete(key)
  if (isClient()) {
    try {
      localStorage.removeItem(key)
    } catch {
      // ignore
    }
  }
  if (!isClient()) return
  // In the day's save order: the rebuild that follows must not race the delete.
  void enqueue(key, async () => {
    try {
      const res = await fetch('/api/floor/store', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteSheet', date: key.replace(`${KEY_SHEET}_`, '') }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.ok) {
        clearBase(key)
        return
      }
      notifyFloorSaveProblem(res.status, data)
    } catch {
      // network — the next save compares against the old copy, which is safe
    }
    await reloadFromServer(key)
  })
}

export type FloorMonthLock = { month: string; locked: boolean; lockedBy: string | null; lockedAt: string | null }
export let floorMonthLocks: FloorMonthLock[] = []

export function rememberMonthLocks(list: unknown) {
  if (!Array.isArray(list)) return
  floorMonthLocks = list as FloorMonthLock[]
  if (isClient()) {
    try {
      window.dispatchEvent(new CustomEvent('floor:month-locks', { detail: floorMonthLocks }))
    } catch {
      // ignore
    }
  }
}

/** Locked production months (from the last server read). */
export function getFloorMonthLocks(): FloorMonthLock[] {
  return floorMonthLocks
}

export function isFloorMonthLocked(month: string): boolean {
  return floorMonthLocks.some((l) => l.month === month && l.locked)
}

/** Admin only: lock / unlock a production month. Throws the server's message when refused. */
export async function setFloorMonthLock(month: string, locked: boolean): Promise<FloorMonthLock[]> {
  const res = await fetch('/api/floor/store', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'setMonthLock', month, locked }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.ok) throw new Error(data?.error || 'Month lock save nahi hua.')
  rememberMonthLocks(data.monthLocks)
  return floorMonthLocks
}

/** Load floor masters from DB (seeds DB if empty). Call once before using the grid. */
export async function hydrateFloorFromDb(): Promise<void> {
  if (!isClient()) return
  if (hydrated) return
  if (hydratePromise) return hydratePromise

  hydratePromise = (async () => {
    try {
      const res = await fetch('/api/floor/store', { method: 'GET', cache: 'no-store' })
      const data = await res.json()
      if (data?.ok && data.store && typeof data.store === 'object') {
        const hashes = (data.hashes || {}) as Record<string, RowHashes>
        Object.entries(data.store as Record<string, unknown>).forEach(([key, value]) => {
          setListFromServer(key, value, hashes[key], { force: true })
        })
        rememberMonthLocks(data.monthLocks)
        clearLegacyFloorLocalStorage()
      }
      hydrated = true
    } catch (err) {
      console.error('[floor] hydrate failed — falling back to seed/local', err)
      hydrated = true
    }
  })()

  return hydratePromise
}

/** Re-pull beams/looms/qualities from DB (Track needs fresh swLot after seed). */
export async function refreshFloorMastersFromDb(): Promise<void> {
  if (!isClient()) return
  try {
    const res = await fetch('/api/floor/store', { method: 'GET', cache: 'no-store', credentials: 'include' })
    const data = await res.json()
    if (!data?.ok || !data.store || typeof data.store !== 'object') return
    const store = data.store as Record<string, unknown>
    const hashes = (data.hashes || {}) as Record<string, RowHashes>
    for (const key of [KEY_BEAMS, KEY_LOOMS, KEY_QUALITY, KEY_YARN, KEY_YARN_ISSUANCE, KEY_YARN_MOVEMENTS]) {
      // A list with edits still on their way to the server keeps the browser copy.
      if (key in store) setListFromServer(key, store[key], hashes[key])
    }
    rememberMonthLocks(data.monthLocks)
  } catch (err) {
    console.error('[floor] refresh masters failed', err)
  }
}

export async function loadSheetFromDb(
  dateStr: string
): Promise<{ entries: DailyLoomProductionEntry[]; hashes: RowHashes } | null> {
  if (!isClient() || isSessionExpired()) return null
  try {
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getSheet', date: dateStr }),
    })
    if (res.status === 401 || (res.redirected && res.url.includes('/login'))) {
      handleSessionExpired()
      return null
    }
    const data = await res.json()
    if (data?.ok && Array.isArray(data.entries)) return { entries: data.entries, hashes: data.hashes || {} }
  } catch {
    // ignore
  }
  return null
}

/** Load every saved production day into memory so Quality overall / Beam Track see all days. */
export async function preloadAllFloorSheets(): Promise<void> {
  if (!isClient() || isSessionExpired()) return
  try {
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getAllSheets' }),
    })
    if (res.status === 401 || (res.redirected && res.url.includes('/login'))) {
      handleSessionExpired()
      return
    }
    const data = await res.json()
    if (!data?.ok || !Array.isArray(data.sheets)) return
    for (const sheet of data.sheets as { date?: string; entries?: DailyLoomProductionEntry[]; hashes?: RowHashes }[]) {
      if (!sheet?.date || !Array.isArray(sheet.entries) || sheet.entries.length === 0) continue
      // Always take DB truth — stale in-memory sheets (wrong lot / 0 meters) were blocking Track.
      // (A day with edits still on their way to the server keeps the browser copy.)
      setSheetFromServer(sheet.date, sheet.entries, sheet.hashes)
    }
  } catch (err) {
    console.error('[floor] preload all sheets failed', err)
  }
}

/** Prefetch one day's sheet into memory from DB (call after hydrate). */
export async function preloadFloorSheet(
  dateStr: string,
  opts?: { force?: boolean }
): Promise<void> {
  if (!isClient()) return
  const key = `${KEY_SHEET}_${dateStr}`
  // Always prefer DB when forcing (date change / after seed) — stale memory was
  // wiping named dual-quality rows (e.g. DUM DUM seg1 → "—") on rebuild+persist.
  if (!opts?.force && memoryStore.has(key)) return
  if (opts?.force && isBusy(key)) return
  const loaded = await loadSheetFromDb(dateStr)
  if (loaded && loaded.entries.length) setSheetFromServer(dateStr, loaded.entries, loaded.hashes)
}

/** Dates that have a saved production sheet in memory (after hydrate). */
export function listPersistedSheetDates(): string[] {
  const dates: string[] = []
  const prefix = `${KEY_SHEET}_`
  for (const key of memoryStore.keys()) {
    if (key.startsWith(prefix)) {
      dates.push(key.slice(prefix.length))
    }
  }
  return dates.sort()
}

/** Every saved loom-day row, across all production dates. */
export function listPersistedSheetEntries(): DailyLoomProductionEntry[] {
  const rows: DailyLoomProductionEntry[] = []
  const prefix = `${KEY_SHEET}_`
  for (const key of memoryStore.keys()) {
    if (!key.startsWith(prefix)) continue
    try {
      const parsed = JSON.parse(memoryStore.get(key) || '[]') as DailyLoomProductionEntry[]
      if (Array.isArray(parsed)) rows.push(...parsed)
    } catch {
      // ignore a bad sheet
    }
  }
  return rows
}

/** Saved sheet rows for one date with live editor rows overlaid by loom + segment. */
export function mergeSheetEntriesForDate(
  dateStr: string,
  live: DailyLoomProductionEntry[] = []
): DailyLoomProductionEntry[] {
  const saved = listPersistedSheetEntries()
    .filter((e) => e.date === dateStr)
    .map(normalizeSheetEntry)
  const liveForDate = live
    .filter((e) => !e.date || e.date === dateStr)
    .map((e) => normalizeSheetEntry({ ...e, date: dateStr }))
  if (liveForDate.length === 0) return sortSheetEntries(saved)
  const byKey = new Map<string, DailyLoomProductionEntry>()
  for (const e of saved) byKey.set(sheetRowKey(e.loomNumber, sheetSegmentIndex(e)), e)
  for (const e of liveForDate) {
    byKey.set(sheetRowKey(e.loomNumber, sheetSegmentIndex(e)), e)
  }
  return sortSheetEntries([...byKey.values()])
}

/**
 * Production days for Quality Overall / Track gate, as-of `sheetDate`.
 * Includes all persisted days up to and including the selected day (today = full run;
 * past day = cut later days so yesterday does not still show today's meters).
 * Selected day is replaced by saved + live merge.
 */
export function mergedSheetEntriesForTotals(
  sheetDate: string,
  live: DailyLoomProductionEntry[] = []
): DailyLoomProductionEntry[] {
  const day = String(sheetDate || '').slice(0, 10)
  const otherDays = listPersistedSheetEntries().filter((e) => {
    const d = String(e.date || '').slice(0, 10)
    if (!d || d === day) return false
    // Cap at selected date — no future days in Overall.
    if (day && d > day) return false
    return true
  })
  return [...otherDays, ...mergeSheetEntriesForDate(sheetDate, live)]
}

export function monthLastEnteredDay(monthStr: string) {
  const [y, m] = monthStr.split('-').map(Number)
  const daysInMonth = y && m ? new Date(y, m, 0).getDate() : 30
  const cal = getCalendarToday()
  const cap = monthStr === cal.slice(0, 7) ? Number(cal.slice(-2)) : daysInMonth
  return Math.min(daysInMonth, Math.max(cap || 1, 1))
}

/** Prefetch every day of a month into memory (DB getSheet per date). */
export async function preloadMonthSheets(monthStr: string = PRODUCTION_TODAY_MONTH): Promise<void> {
  if (!isClient()) return
  const [y, m] = monthStr.split('-').map(Number)
  if (!y || !m) return
  // Production month: the 2nd → the 1st of the next month, up to today.
  await Promise.all(productionMonthDates(monthStr).map((d) => preloadFloorSheet(d)))
}
