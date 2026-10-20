// src/services/payroll/payrollStorage.ts
/**
 * Browser copy of the salary data, and how changes reach the server.
 *
 * - The server (Postgres, table payroll_rows) is the only source of truth. Nothing is kept
 *   in localStorage any more: an old copy on some computer can never bring back old data.
 * - Screens keep reading/writing whole sheets (readStore / writeStore). Each write is
 *   compared with the last copy the server confirmed, and only the changed rows are sent
 *   (src/lib/payroll/sync.ts). Writes made together are sent together, in one transaction.
 * - If someone else changed the same rows meanwhile, the server refuses the save; the
 *   browser then reloads the fresh data and shows a red message.
 * - Nothing is written before the data has loaded, and opening a page never writes.
 */
import { STORAGE_KEYS, NAME_ALIASES } from './payrollConstants'
import type { EmployeeProfile, MonthLockInfo } from '@/types/payroll'
import { stableJson } from '@/server/stableJson'
import {
  ALL_SHEETS,
  META_SHEET,
  diffSheet,
  isEmptyChange,
  mergeChangeSets,
  sheetStateFrom,
  type ApplyResult,
  type ChangeSet,
  type PayrollRow,
  type SheetState,
} from '@/lib/payroll/sync'

/** In-memory copy of the salary data (JSON per storage key). */
export const memoryStore = new Map<string, string>()
export let hydrated = false
export let hydratePromise: Promise<void> | null = null
/** Server-side helpers (month generation) may write into memoryStore while this is on. */
export let allowServerSheetWrite = false

export function setAllowServerSheetWrite(val: boolean): void {
  allowServerSheetWrite = val
}

export function setHydrated(val: boolean): void {
  hydrated = val
}

export function isPayrollHydrated(): boolean {
  return hydrated
}

export function isPayrollClient(): boolean {
  return typeof window !== 'undefined'
}

export const PAYROLL_SAVE_PROBLEM_EVENT = 'payroll:save-problem'
export const PAYROLL_LOAD_EVENT = 'payroll:load-state'

function notifyPayrollSaveProblem(message: string, status: number): void {
  if (!isPayrollClient()) return
  try {
    window.dispatchEvent(new CustomEvent(PAYROLL_SAVE_PROBLEM_EVENT, { detail: { status, message } }))
  } catch {
    // ignore
  }
}

function emit(name: string, detail?: unknown): void {
  if (!isPayrollClient()) return
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }))
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------- read / write

export function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = memoryStore.get(key)
    if (raw) return JSON.parse(raw) as T
  } catch {
    // ignore
  }
  return fallback
}

/** Settings writes: a field that is left out (or undefined) keeps its current value. */
function mergeMeta(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  let current: Record<string, unknown> = {}
  try {
    current = JSON.parse(memoryStore.get(META_SHEET) || '{}') as Record<string, unknown>
  } catch {
    current = {}
  }
  const merged: Record<string, unknown> = { ...current }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== undefined) merged[k] = v
  }
  return merged
}

export function writeStore(key: string, value: unknown): void {
  if (key === META_SHEET) value = mergeMeta(value)
  if (!isPayrollClient()) {
    // Server-side helpers work on a private in-memory copy and return a patch.
    memoryStore.set(key, JSON.stringify(value))
    return
  }
  if (!hydrated) {
    // Never save anything built before the real data arrived (it would be seed data).
    console.warn('[payroll] write ignored — data not loaded yet', key)
    return
  }
  memoryStore.set(key, JSON.stringify(value))
  dirty.add(key)
  scheduleFlush()
}

export async function writeStoreAndWait(key: string, value: unknown): Promise<boolean> {
  if (!isPayrollClient()) {
    writeStore(key, value)
    return false
  }
  if (!hydrated) await hydratePayrollFromDb()
  if (!hydrated) return false
  const done = nextFlushResult()
  writeStore(key, value)
  return done
}

/** Resolves when every change made so far has reached the server (true) or failed (false). */
export function flushPayrollSaves(): Promise<boolean> {
  if (!isPayrollClient() || (!dirty.size && !inFlight)) return Promise.resolve(true)
  const done = nextFlushResult()
  scheduleFlush()
  return done
}

export function hasUnsavedPayrollChanges(): boolean {
  return dirty.size > 0 || inFlight
}

// ---------------------------------------------------------------- save engine

/** What the server last confirmed, per storage key. */
const confirmed = new Map<string, SheetState>()
const dirty = new Set<string>()
let inFlight = false
let flushQueued = false
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryDelay = 0
let failedRequest: { id: string; body: string } | null = null
let waiters: Array<(ok: boolean) => void> = []

function nextFlushResult(): Promise<boolean> {
  return new Promise((resolve) => waiters.push(resolve))
}

function scheduleFlush(): void {
  if (flushQueued) return
  flushQueued = true
  // Let one user action finish all its writes, then send them as one change set.
  setTimeout(() => {
    flushQueued = false
    void flush()
  }, 0)
}

function requestId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

type Snapshot = { key: string; value: unknown }

async function flush(): Promise<void> {
  if (inFlight || !hydrated) return
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  const keys = [...dirty]
  dirty.clear()
  const myWaiters = waiters
  waiters = []
  const settle = (ok: boolean) => myWaiters.forEach((w) => w(ok))

  const snapshots: Snapshot[] = []
  const sets: ChangeSet[] = []
  for (const key of keys) {
    let value: unknown
    try {
      value = JSON.parse(memoryStore.get(key) || 'null')
    } catch {
      continue
    }
    const state = confirmed.get(key) || sheetStateFrom(key, key === META_SHEET ? {} : [], {})
    const cs = diffSheet(key, state, value)
    // ids may have been added to rows that had none — keep memory in step.
    memoryStore.set(key, JSON.stringify(value))
    snapshots.push({ key, value })
    sets.push(cs)
  }
  const cs = mergeChangeSets(sets)
  if (isEmptyChange(cs)) {
    settle(true)
    return
  }

  inFlight = true
  const body = JSON.stringify({ ops: cs.ops, order: cs.order })
  const id = failedRequest && failedRequest.body === body ? failedRequest.id : requestId()
  let status = 0
  let reply: (Partial<ApplyResult> & { error?: string; lockedNote?: string }) | null = null
  try {
    const res = await fetch('/api/payroll/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ requestId: id, ops: cs.ops, order: cs.order }),
    })
    status = res.status
    reply = await res.json().catch(() => null)
  } catch (err) {
    console.error('[payroll] save failed (network)', err)
  }
  inFlight = false

  if (status === 200 && reply) {
    failedRequest = null
    retryDelay = 0
    confirmSaved(snapshots, cs, reply as ApplyResult)
    if (reply.kept?.length) {
      putBackKeptRows(reply.kept)
      emit('payroll_synced', { lockedRowsKept: true })
    }
    if (reply.lockedNote) notifyPayrollSaveProblem(reply.lockedNote, 200)
    settle(true)
  } else if (status === 0 || status >= 500) {
    // Server not reached / failed: keep the changes and try again.
    for (const s of snapshots) dirty.add(s.key)
    failedRequest = { id, body }
    retryDelay = Math.min(retryDelay ? retryDelay * 2 : 3000, 30000)
    notifyPayrollSaveProblem(
      'Salary save nahi hua — internet / server check karein. Dobara koshish ho rahi hai; page band na karein.',
      status || 503
    )
    retryTimer = setTimeout(() => void flush(), retryDelay)
    settle(false)
    return
  } else {
    // Refused (stale data, no permission, bad input): load the server's data again so
    // the screen never shows something that is not saved.
    failedRequest = null
    notifyPayrollSaveProblem(String(reply?.error || 'Save nahi hua.'), status)
    settle(false)
    await reloadFromServer()
    releaseWaiters(false)
    return
  }
  if (dirty.size) scheduleFlush()
  else releaseWaiters(true)
}

function releaseWaiters(ok: boolean): void {
  const w = waiters
  waiters = []
  w.forEach((f) => f(ok))
}

function confirmSaved(snapshots: Snapshot[], cs: ChangeSet, reply: ApplyResult): void {
  const versions = reply.versions || {}
  const keptIds = new Set((reply.kept || []).map((k) => `${k.sheet}\u0000${k.id}`))
  for (const { key, value } of snapshots) {
    const before = confirmed.get(key) || sheetStateFrom(key, key === META_SHEET ? {} : [], {})
    const v = versions[key] || {}
    const next: SheetState = { rows: new Map(), order: [] }
    if (key === META_SHEET) {
      for (const [field, had] of before.rows) next.rows.set(field, had)
      for (const [field, fieldValue] of Object.entries((value || {}) as Record<string, unknown>)) {
        if (fieldValue === undefined || keptIds.has(`${key}\u0000${field}`)) continue
        const ver = v[field]
        if (typeof ver === 'number') next.rows.set(field, { json: stableJson(fieldValue), version: ver })
      }
    } else {
      for (const row of (Array.isArray(value) ? value : []) as PayrollRow[]) {
        const id = String(row.id)
        if (keptIds.has(`${key}\u0000${id}`)) {
          const had = before.rows.get(id)
          if (had) {
            next.rows.set(id, had)
            next.order.push(id)
          }
          continue
        }
        const ver = v[id]
        const had = before.rows.get(id)
        if (typeof ver === 'number') next.rows.set(id, { json: stableJson(row), version: ver })
        else if (had) next.rows.set(id, had)
        else continue
        next.order.push(id)
      }
      // Rows the server kept (locked month) that this browser had removed stay confirmed.
      for (const [id, had] of before.rows) {
        if (!next.rows.has(id) && keptIds.has(`${key}\u0000${id}`)) {
          next.rows.set(id, had)
          next.order.push(id)
        }
      }
    }
    confirmed.set(key, next)
  }
  void cs
}

/** Locked-month rows the server did not change: show the stored version again. */
function putBackKeptRows(kept: ApplyResult['kept']): void {
  const bySheet = new Map<string, ApplyResult['kept']>()
  for (const k of kept) bySheet.set(k.sheet, [...(bySheet.get(k.sheet) || []), k])
  for (const [sheet, list] of bySheet) {
    const state = confirmed.get(sheet) || sheetStateFrom(sheet, sheet === META_SHEET ? {} : [], {})
    if (sheet === META_SHEET) {
      const meta = readStore<Record<string, unknown>>(sheet, {})
      for (const k of list) {
        if (k.row == null) delete meta[k.id]
        else meta[k.id] = k.row
        if (k.row == null) state.rows.delete(k.id)
        else state.rows.set(k.id, { json: stableJson(k.row), version: k.version })
      }
      memoryStore.set(sheet, JSON.stringify(meta))
    } else {
      let rows = readStore<PayrollRow[]>(sheet, [])
      for (const k of list) {
        const at = rows.findIndex((r) => r?.id === k.id)
        if (k.row == null) {
          if (at >= 0) rows = rows.filter((_, i) => i !== at)
          state.rows.delete(k.id)
          state.order = state.order.filter((x) => x !== k.id)
        } else {
          if (at >= 0) rows[at] = k.row as PayrollRow
          else rows.push(k.row as PayrollRow)
          state.rows.set(k.id, { json: stableJson(k.row), version: k.version })
          if (!state.order.includes(k.id)) state.order.push(k.id)
        }
      }
      memoryStore.set(sheet, JSON.stringify(rows))
    }
    confirmed.set(sheet, state)
  }
}

async function reloadFromServer(): Promise<void> {
  resetPayrollHydration()
  await hydratePayrollFromDb()
  emit('payroll_synced', { reloaded: true })
}

// ---------------------------------------------------------------- load

/** Force the next hydratePayrollFromDb() to fetch from the server again. */
export function resetPayrollHydration(): void {
  hydrated = false
  hydratePromise = null
}

let unloadGuardAdded = false
function addUnloadGuard(): void {
  if (unloadGuardAdded || !isPayrollClient()) return
  unloadGuardAdded = true
  window.addEventListener('beforeunload', (e) => {
    if (!hasUnsavedPayrollChanges()) return
    e.preventDefault()
    e.returnValue = ''
  })
}

/** Salary data used to be copied into every browser; remove those old copies. */
function clearOldBrowserCopies(): void {
  try {
    const drop: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i) || ''
      if (k.startsWith('sara_payroll_mirror_') || (ALL_SHEETS as readonly string[]).includes(k)) drop.push(k)
    }
    for (const k of drop) localStorage.removeItem(k)
  } catch {
    // ignore (private mode)
  }
}

export type PayrollLoadState = { status: 'loading' | 'ready' | 'error'; message?: string }
let loadState: PayrollLoadState = { status: 'loading' }
export function getPayrollLoadState(): PayrollLoadState {
  return loadState
}
function setLoadState(s: PayrollLoadState): void {
  loadState = s
  emit(PAYROLL_LOAD_EVENT, s)
}

/** Load the salary data from the server (once; again after resetPayrollHydration). */
export async function hydratePayrollFromDb(): Promise<void> {
  if (!isPayrollClient()) return
  if (hydrated) return
  if (hydratePromise) return hydratePromise

  hydratePromise = (async () => {
    // Finish sending what is already queued before replacing the local copy.
    while (inFlight) await new Promise((r) => setTimeout(r, 50))
    if (!hydrated && loadState.status !== 'ready') setLoadState({ status: 'loading' })
    try {
      const res = await fetch('/api/payroll/data', { method: 'GET', cache: 'no-store', credentials: 'include' })
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        store?: Record<string, unknown>
        versions?: Record<string, Record<string, number>>
      } | null
      if (!res.ok || !data?.ok || !data.store) {
        throw new Error(data?.error || `Salary data load nahi hua (${res.status}).`)
      }
      memoryStore.clear()
      confirmed.clear()
      dirty.clear()
      for (const key of ALL_SHEETS) {
        const value = data.store[key] ?? (key === META_SHEET ? {} : [])
        memoryStore.set(key, JSON.stringify(value))
        confirmed.set(key, sheetStateFrom(key, value, data.versions?.[key]))
      }
      hydrated = true
      setLoadState({ status: 'ready' })
      clearOldBrowserCopies()
      addUnloadGuard()
    } catch (err) {
      console.error('[payroll] load failed', err)
      hydratePromise = null
      setLoadState({ status: 'error', message: err instanceof Error ? err.message : 'Salary data load nahi hua.' })
    }
  })()

  return hydratePromise
}

// ---------------------------------------------------------------- shared helpers

/** Union salary-sheet rows by id so that a local September isn't lost, with overrides taking precedence over base rows. */
export function mergeRowsById<T extends { id?: string }>(baseRows: T[], overrides: T[]): T[] {
  const map = new Map<string, T>()
  for (const row of baseRows || []) {
    if (row?.id) map.set(row.id, row)
  }
  for (const row of overrides || []) {
    if (row?.id) map.set(row.id, row)
  }
  return [...map.values()]
}

export function preferPayrollDuplicateRow<
  T extends {
    id?: string
    employeeId?: string
    amount?: number
    salary?: number
    serialNo?: number
  },
>(a: T, b: T): T {
  const score = (r: T) => {
    let s = 0
    if (r.employeeId) s += 40
    const id = r.id || ''
    if (/^(adv-sep-|adv-\d+$|st-|ct-|staff-|cnt-)/.test(id)) s += 25
    if (!id.includes('Date.now') && !/-\d{13}-/.test(id)) s += 5
    s += Math.min(20, Math.abs(Number(r.amount ?? r.salary) || 0) / 5000)
    s += Math.max(0, 15 - (Number(r.serialNo) || 99))
    return s
  }
  return score(a) >= score(b) ? a : b
}

export function dedupeRowsByKey<T extends { id?: string }>(
  rows: T[],
  keyOf: (row: T) => string,
  prefer: (a: T, b: T) => T = preferPayrollDuplicateRow
): { list: T[]; removed: number } {
  const map = new Map<string, T>()
  let removed = 0
  for (const row of rows || []) {
    const key = keyOf(row)
    if (!key) {
      map.set(`__noid__${row.id || Math.random()}`, row)
      continue
    }
    const prev = map.get(key)
    if (!prev) {
      map.set(key, row)
      continue
    }
    removed += 1
    map.set(key, prefer(prev, row))
  }
  return { list: [...map.values()], removed }
}

function normalizeNameLocal(name?: string): string {
  if (!name) return ''
  const trimmed = name.trim().toLowerCase().replace(/\s+/g, ' ')
  return NAME_ALIASES[trimmed] || trimmed
}

export function sheetMonthKeyLocal(rowMonth?: string | null, fallback = '2026-08'): string {
  const m = (rowMonth || '').trim()
  return /^\d{4}-\d{2}$/.test(m) ? m : fallback
}

export function advancePersonMonthKey(a: {
  month?: string
  employeeId?: string
  employeeName?: string
}): string {
  const month = sheetMonthKeyLocal(a.month)
  const person = (a.employeeId || '').trim() || normalizeNameLocal(a.employeeName)
  if (!person) return ''
  return `${month}|${person}`
}

export function salariedPersonMonthKey(row: {
  month?: string
  employeeId?: string
  employeeName?: string
  name?: string
}): string {
  const month = sheetMonthKeyLocal(row.month)
  const person =
    (row.employeeId || '').trim() ||
    normalizeNameLocal(row.employeeName || row.name)
  if (!person) return ''
  return `${month}|${person}`
}

export function fortnightPersonMonthKey(row: {
  month?: string
  fortnight?: string
  employeeId?: string
  employeeName?: string
  name?: string
}): string {
  const base = salariedPersonMonthKey(row)
  if (!base) return ''
  return `${base}|${row.fortnight || '1-15'}`
}

export function defaultPettyCashInflow(fortnight: '1-15' | '16-31'): number {
  return fortnight === '1-15' ? 86930 : 86570
}

export function pettyCashInflowMetaKey(month: string, fortnight: '1-15' | '16-31'): string {
  return `${month}|${fortnight}`
}

export type HrMetaShape = {
  categories?: string[]
  designations?: string[]
  activeSalariedMonth?: string
  activeFortnightMonth?: string
  activeFortnight?: '1-15' | '16-31'
  pettyCashInflowOverrides?: Record<string, number>
  /** Month lock & finalization state */
  monthLocks?: Record<string, MonthLockInfo>
  /** Profiles permanently removed — repairRoster must not resurrect from seed. */
  deletedEmployeeIds?: string[]
  deletedEmployeeNames?: string[]
}

export function writeHrMeta(custom: {
  categories: string[]
  designations: string[]
  activeSalariedMonth?: string
  activeFortnightMonth?: string
  activeFortnight?: '1-15' | '16-31'
  pettyCashInflowOverrides?: Record<string, number>
  monthLocks?: Record<string, MonthLockInfo>
  deletedEmployeeIds?: string[]
  deletedEmployeeNames?: string[]
}): void {
  const raw = readHrMetaRaw()
  writeStore(STORAGE_KEYS.HR_META, {
    ...custom,
    pettyCashInflowOverrides:
      custom.pettyCashInflowOverrides ?? raw.pettyCashInflowOverrides,
    monthLocks: custom.monthLocks ?? raw.monthLocks,
    deletedEmployeeIds: custom.deletedEmployeeIds ?? raw.deletedEmployeeIds,
    deletedEmployeeNames: custom.deletedEmployeeNames ?? raw.deletedEmployeeNames,
  })
}

export function readHrMetaRaw(): HrMetaShape {
  try {
    const raw = memoryStore.get(STORAGE_KEYS.HR_META)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return {}
}

/**
 * Permanently deleted? By id when known — deleting one "Dawood" must never hide another
 * person who has the same name. The name list only covers very old rows without an id.
 */
export function isTombstonedEmployee(id?: string, name?: string): boolean {
  const raw = readHrMetaRaw()
  if (id) return (raw.deletedEmployeeIds || []).includes(id)
  const key = normalizeNameLocal(name)
  return Boolean(key && (raw.deletedEmployeeNames || []).includes(key))
}

export function rememberDeletedEmployee(emp: EmployeeProfile): void {
  const raw = readHrMetaRaw()
  const ids = new Set(raw.deletedEmployeeIds || [])
  if (emp.id) ids.add(emp.id)
  const names = new Set(raw.deletedEmployeeNames || [])
  const key = normalizeNameLocal(emp.name)
  if (key) names.add(key)
  writeHrMeta({
    categories: raw.categories || [],
    designations: raw.designations || [],
    activeSalariedMonth: raw.activeSalariedMonth,
    activeFortnightMonth: raw.activeFortnightMonth,
    activeFortnight: raw.activeFortnight,
    pettyCashInflowOverrides: raw.pettyCashInflowOverrides,
    deletedEmployeeIds: [...ids],
    deletedEmployeeNames: [...names],
  })
}

/** Re-hire after permanent delete: allow this name again (keep other tombstones). */
export function clearDeletedEmployeeTombstone(id?: string, name?: string): void {
  const raw = readHrMetaRaw()
  const ids = new Set(raw.deletedEmployeeIds || [])
  const names = new Set(raw.deletedEmployeeNames || [])
  if (id) ids.delete(id)
  const key = normalizeNameLocal(name)
  if (key) names.delete(key)
  writeHrMeta({
    categories: raw.categories || [],
    designations: raw.designations || [],
    activeSalariedMonth: raw.activeSalariedMonth,
    activeFortnightMonth: raw.activeFortnightMonth,
    activeFortnight: raw.activeFortnight,
    pettyCashInflowOverrides: raw.pettyCashInflowOverrides,
    deletedEmployeeIds: [...ids],
    deletedEmployeeNames: [...names],
  })
}

export function readMonthLock(month: string): MonthLockInfo | null {
  const meta = readHrMetaRaw()
  return meta.monthLocks?.[month] ?? null
}

export function isMonthLocked(month: string): boolean {
  const lock = readMonthLock(month)
  return Boolean(lock?.locked)
}

export async function writeMonthLockAsync(
  month: string,
  lockInfo: MonthLockInfo
): Promise<boolean> {
  const meta = readHrMetaRaw()
  const nextLocks: Record<string, MonthLockInfo> = {
    ...(meta.monthLocks || {}),
    [month]: lockInfo,
  }
  const payload: HrMetaShape = {
    ...meta,
    monthLocks: nextLocks,
  }
  const ok = await writeStoreAndWait(STORAGE_KEYS.HR_META, payload)
  if (isPayrollClient()) {
    window.dispatchEvent(
      new CustomEvent('payroll_synced', { detail: { month, lockChanged: true } })
    )
  }
  return ok
}
