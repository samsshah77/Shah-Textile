/**
 * Browser side of row-level floor saving (see src/lib/floor/rowSync.ts).
 *
 * The floor screens keep working on whole lists in memory (`memoryStore`). Whenever a
 * list or a day sheet is "saved", this module sends only the rows that differ from the
 * version last received from the server, each with the hash it started from. Saves of
 * one list / day run one after another (never two at once), so a quick second edit
 * cannot trip over the first one.
 *
 * If the server says someone else changed the same row (409), the user is told, the
 * list / day is reloaded from the server and the screen refreshes — nothing is
 * overwritten silently.
 */
import {
  CONFLICT_MESSAGE,
  FLOOR_KEYS,
  SHEET_KEY_PREFIX,
  canonical,
  diffRows,
  isRowListKey,
  rowIdOf,
  sheetRowId,
  type RowHashes,
  type RowListKey,
  type SheetRowChange,
} from '@/lib/floor/rowSync'
import { isClient, normalizeBeam, normalizeLoomPictures } from '@/services/production/loomBeamHelpers'
import { normalizeQuality, type BeamMaster, type LoomMaster, type QualityMaster } from '@/services/production/masterTypes'
import { normalizeSheetEntry } from '@/services/production/qualityRuns'
import type { DailyLoomProductionEntry } from '@/types/production'

/** In-memory cache hydrated from PostgreSQL via /api/floor/store. */
export const memoryStore = new Map<string, string>()

export const SHEET_KEY = SHEET_KEY_PREFIX.slice(0, -1) // 'sara_textile_production_sheet_v8'
export const sheetKeyOf = (date: string) => `${SHEET_KEY_PREFIX}${date}`
const dateOfSheetKey = (key: string) => (key.startsWith(SHEET_KEY_PREFIX) ? key.slice(SHEET_KEY_PREFIX.length) : null)

type AnyRow = Record<string, unknown>

/** Same normalizers the screens apply when they read each list. */
function normalizerFor(key: string): (row: AnyRow) => unknown {
  if (key === FLOOR_KEYS.LOOMS)
    return (l) => ({ ...(l as unknown as LoomMaster), ...normalizeLoomPictures(l as unknown as LoomMaster) })
  if (key === FLOOR_KEYS.BEAMS) return (b) => normalizeBeam(b as unknown as BeamMaster)
  if (key === FLOOR_KEYS.QUALITY) return (q) => normalizeQuality(q as unknown as QualityMaster)
  return (e) => sheetDataOnly(normalizeSheetEntry(e as unknown as DailyLoomProductionEntry) as unknown as AnyRow)
}

/**
 * Fields the server owns on a day row (approval, who edited last, the quality run id).
 * They are left out when deciding whether a row changed, so rebuilding the day does not
 * re-send rows nobody touched (the server keeps its values for these fields anyway).
 */
export const SHEET_SERVER_FIELDS = [
  'approvalStatus',
  'approvedBy',
  'approvedAt',
  'submittedBy',
  'submittedAt',
  'lastEditedBy',
  'lastEditedAt',
  'qualityId',
] as const

function sheetDataOnly(row: AnyRow): AnyRow {
  const out = { ...row }
  for (const f of SHEET_SERVER_FIELDS) delete out[f]
  return out
}

function idFor(key: string): (row: AnyRow) => string {
  if (isRowListKey(key)) return (r) => rowIdOf(key, r)
  return (r) => sheetRowId(r)
}

// What the browser last received from the server, per list / day.
const baseCanon = new Map<string, Map<string, string>>()
const baseHash = new Map<string, Map<string, string>>()

function setBase(key: string, rows: AnyRow[], hashes: RowHashes | undefined) {
  const norm = normalizerFor(key)
  const idOf = idFor(key)
  const canon = new Map<string, string>()
  const hash = new Map<string, string>()
  for (const r of rows) {
    const id = idOf(r)
    if (!id) continue
    canon.set(id, canonical(norm(r)))
    const h = hashes?.[id]
    if (h) hash.set(id, h)
  }
  baseCanon.set(key, canon)
  baseHash.set(key, hash)
}

function mergeBase(key: string, rows: AnyRow[], hashes: RowHashes, deleted: string[] = []) {
  const norm = normalizerFor(key)
  const idOf = idFor(key)
  const canon = baseCanon.get(key) || new Map<string, string>()
  const hash = baseHash.get(key) || new Map<string, string>()
  for (const r of rows) {
    const id = idOf(r)
    if (!id) continue
    canon.set(id, canonical(norm(r)))
    if (hashes[id]) hash.set(id, hashes[id])
  }
  for (const id of deleted) {
    canon.delete(id)
    hash.delete(id)
  }
  baseCanon.set(key, canon)
  baseHash.set(key, hash)
}

export function clearBase(key: string) {
  baseCanon.delete(key)
  baseHash.delete(key)
}

/** Memory + base from a server read (lists). Skipped while that list has unsent edits. */
export function setListFromServer(key: string, rows: unknown, hashes?: RowHashes, opts: { force?: boolean } = {}) {
  if (!opts.force && isBusy(key)) return
  memoryStore.set(key, JSON.stringify(rows))
  if (isRowListKey(key) && Array.isArray(rows)) setBase(key, rows as AnyRow[], hashes)
}

/** Memory + base from a server read (one day sheet). */
export function setSheetFromServer(
  date: string,
  entries: DailyLoomProductionEntry[] | null,
  hashes: RowHashes | undefined,
  opts: { force?: boolean } = {}
) {
  const key = sheetKeyOf(date)
  if (!opts.force && isBusy(key)) return
  if (!entries || entries.length === 0) {
    clearBase(key)
    return
  }
  const normalized = entries.map(normalizeSheetEntry)
  memoryStore.set(key, JSON.stringify(normalized))
  setBase(key, entries as unknown as AnyRow[], hashes)
}

/** After a targeted action (patch beam, upsert quality …) the server sends the stored rows. */
export function applyServerSync(sync: unknown) {
  if (!sync || typeof sync !== 'object') return
  const s = sync as { key?: string; date?: string; rows?: AnyRow[]; hashes?: RowHashes; deleted?: string[] }
  const key = s.key || (s.date ? sheetKeyOf(s.date) : '')
  if (!key) return
  mergeBase(key, s.rows || [], s.hashes || {}, s.deleted || [])
}

// ---------------------------------------------------------------------------
// One save at a time per list / day.
// ---------------------------------------------------------------------------

const chains = new Map<string, Promise<unknown>>()
const running = new Map<string, number>()
const flushQueued = new Map<string, Promise<boolean>>()
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function isBusy(key: string): boolean {
  return (running.get(key) || 0) > 0 || flushQueued.has(key)
}

/** Run `fn` after every earlier save of the same list / day has finished. */
export function enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
  running.set(key, (running.get(key) || 0) + 1)
  const prev = chains.get(key) || Promise.resolve()
  const p = prev.then(fn, fn).finally(() => running.set(key, (running.get(key) || 1) - 1))
  chains.set(
    key,
    p.catch(() => undefined)
  )
  return p
}

// Rows edited by hand on a day (cell edits, reset meters) and whether the quality was cleared on purpose.
const explicitRows = new Map<string, Map<string, { clearQuality: boolean }>>()

export function markExplicitSheetRow(date: string, entry: { loomNumber: number; segmentIndex?: number }, clearQuality = false) {
  const key = sheetKeyOf(date)
  const m = explicitRows.get(key) || new Map<string, { clearQuality: boolean }>()
  const id = sheetRowId(entry)
  m.set(id, { clearQuality: clearQuality || Boolean(m.get(id)?.clearQuality) })
  explicitRows.set(key, m)
}

/** Ask for the list / day in memory to be saved. Resolves true when it is saved. */
export function schedulePersist(key: string): Promise<boolean> {
  if (!isClient()) return Promise.resolve(false)
  if (batchKeys && (dateOfSheetKey(key) || isRowListKey(key))) {
    batchKeys.add(key)
    return Promise.resolve(true)
  }
  const queued = flushQueued.get(key)
  if (queued) return queued
  const p = enqueue(key, async () => {
    flushQueued.delete(key)
    return flushKey(key)
  })
  flushQueued.set(key, p)
  return p
}

export function notifyFloorSaveProblem(status: number, data: unknown) {
  if (!isClient()) return
  if (status !== 403 && status !== 409 && status !== 423 && status !== 400) return
  const message =
    (data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : '') || 'This change was not saved.'
  try {
    window.dispatchEvent(new CustomEvent('floor:save-problem', { detail: { status, message } }))
  } catch {
    // ignore
  }
}

export function announceReload(key: string) {
  try {
    window.dispatchEvent(new CustomEvent('floor:data-reloaded', { detail: { key } }))
  } catch {
    // ignore
  }
}

export async function post(body: unknown): Promise<{ status: number; data: Record<string, unknown> | null }> {
  try {
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { status: res.status, data }
  } catch {
    return { status: 0, data: null }
  }
}

// Lists / days whose refused save could not be followed by a reload (network). Nothing
// is sent for them until a reload succeeds, so a stale copy is never pushed again.
const needsReload = new Set<string>()

/** Reload one list / day from the server (after a refused save). True when it worked. */
export async function reloadFromServer(key: string): Promise<boolean> {
  let done = false
  const date = dateOfSheetKey(key)
  if (date) {
    const { data } = await post({ action: 'getSheet', date })
    if (data?.ok) {
      const entries = (data.entries as DailyLoomProductionEntry[] | null) || null
      if (entries && entries.length) setSheetFromServer(date, entries, data.hashes as RowHashes, { force: true })
      else {
        memoryStore.delete(key)
        clearBase(key)
      }
      done = true
    }
  } else {
    try {
      const res = await fetch('/api/floor/store', { method: 'GET', cache: 'no-store', credentials: 'include' })
      const data = await res.json()
      if (data?.ok && data.store) {
        const hashes = (data.hashes || {}) as Record<string, RowHashes>
        if (key in data.store) setListFromServer(key, data.store[key], hashes[key], { force: true })
        done = true
      }
    } catch {
      // keep memory; nothing is sent until a reload works
    }
  }
  explicitRows.delete(key)
  if (done) {
    needsReload.delete(key)
    announceReload(key)
  } else {
    needsReload.add(key)
    scheduleRetry(key)
  }
  return done
}

function scheduleRetry(key: string) {
  if (retryTimers.has(key)) return
  retryTimers.set(
    key,
    setTimeout(() => {
      retryTimers.delete(key)
      void schedulePersist(key)
    }, 5000)
  )
}

type Prepared =
  | { kind: 'none' }
  | { kind: 'day'; key: string; date: string; part: { date: string; rows: SheetRowChange[] }; sent: Map<string, string>; explicitSnapshot?: Map<string, { clearQuality: boolean }> }
  | { kind: 'list'; key: string; part: { key: RowListKey; upserts: unknown[]; deletes: unknown[] }; sent: Map<string, string> }

/** What would be sent for one list / day right now (rows changed since the server copy). */
function prepareKey(key: string): Prepared | null {
  const raw = memoryStore.get(key)
  if (!raw) return { kind: 'none' }
  let rows: AnyRow[]
  try {
    rows = JSON.parse(raw) as AnyRow[]
  } catch {
    return null
  }
  if (!Array.isArray(rows)) return { kind: 'none' }
  const canon = baseCanon.get(key) || new Map<string, string>()
  const hash = baseHash.get(key) || new Map<string, string>()
  const date = dateOfSheetKey(key)
  if (date) {
    const { upserts } = diffRows(rows, (r) => sheetRowId(r), canon, hash, normalizerFor(key))
    const explicitSnapshot = explicitRows.get(key)
    explicitRows.delete(key)
    if (upserts.length === 0) return { kind: 'none' }
    const changes: SheetRowChange[] = upserts.map((u) => {
      const id = sheetRowId(u.row)
      const ex = explicitSnapshot?.get(id)
      const entry = { ...u.row, date } as AnyRow
      delete entry._clearQuality
      return { entry, base: u.base, ...(ex ? { explicit: true, clearQuality: ex.clearQuality } : {}) }
    })
    const sent = new Map(upserts.map((u) => [sheetRowId(u.row), canonical(normalizerFor(key)(u.row))]))
    return { kind: 'day', key, date, part: { date, rows: changes }, sent, explicitSnapshot }
  }
  if (isRowListKey(key)) {
    const { upserts, deletes } = diffRows(rows, idFor(key), canon, hash, normalizerFor(key), {
      allowDeletes: key !== FLOOR_KEYS.QUALITY && canon.size > 0,
    })
    if (upserts.length === 0 && deletes.length === 0) return { kind: 'none' }
    const sent = new Map(upserts.map((u) => [rowIdOf(key, u.row), canonical(normalizerFor(key)(u.row))]))
    return { kind: 'list', key, part: { key: key as RowListKey, upserts, deletes }, sent }
  }
  return { kind: 'none' } // yarn lists are saved by the yarn actions
}

/** Put back the "edited by hand" marks of a day whose save did not reach the server. */
function restoreExplicit(p: Prepared) {
  if (p.kind !== 'day' || !p.explicitSnapshot) return
  const m = explicitRows.get(p.key) || new Map()
  for (const [id, v] of p.explicitSnapshot) if (!m.has(id)) m.set(id, v)
  explicitRows.set(p.key, m)
}

function applySaved(p: Prepared, sync: { rows?: AnyRow[]; hashes?: RowHashes; deleted?: string[] }) {
  if (p.kind === 'none') return
  mergeBase(p.key, sync.rows || [], sync.hashes || {}, sync.deleted || [])
  if (p.kind === 'day') mergeStoredRowsIntoMemory(p.key, sync.rows || [], p.sent)
}

async function flushKey(key: string): Promise<boolean> {
  if (needsReload.has(key)) {
    // The last save was refused and the fresh copy never arrived: get it first.
    await reloadFromServer(key)
    return false
  }
  const prepared = prepareKey(key)
  if (!prepared) return false
  if (prepared.kind === 'none') return true
  const body =
    prepared.kind === 'day'
      ? { action: 'saveSheetRows', ...prepared.part }
      : { action: 'saveRows', ...prepared.part }

  const { status, data } = await post(body)
  if (status === 200 && data?.ok) {
    applySaved(prepared, data.sync as { rows: AnyRow[]; hashes: RowHashes; deleted: string[] })
    return true
  }
  if (status === 0 || status >= 500) {
    // Network / server trouble: keep the edits and try again shortly.
    restoreExplicit(prepared)
    notifyFloorSaveProblem(409, { error: 'Server se raabta nahi ho saka — tabdeeli abhi save nahi hui, thodi der mein dobara koshish hogi.' })
    scheduleRetry(key)
    return false
  }
  // Refused (someone else changed the row, month / day locked, guard, no access, bad data):
  // tell the user and show what is really saved.
  notifyFloorSaveProblem(status === 400 ? 409 : status, data?.conflict ? { error: CONFLICT_MESSAGE } : data)
  console.error('[floor] save refused', key, status, data)
  await reloadFromServer(key)
  return false
}

// ---------------------------------------------------------------------------
// One change that touches several lists / days (quality on a loom from a date to today,
// Quality End …) is sent as ONE all-or-nothing save.
// ---------------------------------------------------------------------------

let batchKeys: Set<string> | null = null
let batchDepth = 0

/** Start collecting saves; they go to the server together at `endFloorBatch()`. */
export function beginFloorBatch() {
  if (!isClient()) return
  batchDepth += 1
  if (!batchKeys) batchKeys = new Set()
}

/** True while a multi-list change is being collected. */
export function isFloorBatchOpen(): boolean {
  return batchKeys !== null
}

/** Send everything collected since `beginFloorBatch()` as one change. */
export function endFloorBatch(): Promise<boolean> {
  if (!isClient() || batchDepth === 0) return Promise.resolve(true)
  batchDepth -= 1
  if (batchDepth > 0) return Promise.resolve(true)
  const keys = [...(batchKeys || [])]
  batchKeys = null
  if (!keys.length) return Promise.resolve(true)
  if (keys.length === 1) return schedulePersist(keys[0])
  return flushBatch(keys)
}

async function flushBatch(keys: string[]): Promise<boolean> {
  // Wait for earlier saves of the same lists / days, and hold them while this one runs.
  for (const k of keys) running.set(k, (running.get(k) || 0) + 1)
  const done = () => {
    for (const k of keys) running.set(k, (running.get(k) || 1) - 1)
  }
  let release: () => void = () => undefined
  const gate = new Promise<void>((r) => (release = r))
  const waits = keys.map((k) => chains.get(k) || Promise.resolve())
  for (const k of keys) chains.set(k, gate)
  try {
    await Promise.all(waits.map((w) => w.catch(() => undefined)))
    const stale = keys.filter((k) => needsReload.has(k))
    if (stale.length) {
      for (const k of keys) await reloadFromServer(k)
      notifyFloorSaveProblem(409, { error: CONFLICT_MESSAGE })
      return false
    }
    const prepared = keys.map((k) => prepareKey(k))
    if (prepared.some((p) => p === null)) return false
    const real = prepared.filter((p): p is Exclude<Prepared, { kind: 'none' }> => p !== null && p.kind !== 'none')
    if (!real.length) return true
    const body = {
      action: 'saveBatch',
      lists: real.filter((p) => p.kind === 'list').map((p) => p.part),
      days: real.filter((p) => p.kind === 'day').map((p) => p.part),
    }
    const { status, data } = await post(body)
    if (status === 200 && data?.ok) {
      const lists = (data.lists || []) as Array<{ key: string; rows: AnyRow[]; hashes: RowHashes; deleted: string[] }>
      const days = (data.days || []) as Array<{ date: string; rows: AnyRow[]; hashes: RowHashes; deleted: string[] }>
      for (const p of real) {
        const sync = p.kind === 'list' ? lists.find((l) => l.key === p.key) : days.find((d) => d.date === p.date)
        if (sync) applySaved(p, sync)
      }
      return true
    }
    if (status === 0 || status >= 500) {
      // Network trouble: keep the edits; they go again (list by list / day by day) shortly.
      for (const p of real) restoreExplicit(p)
      notifyFloorSaveProblem(409, { error: 'Server se raabta nahi ho saka — tabdeeli abhi save nahi hui, thodi der mein dobara koshish hogi.' })
      for (const p of real) scheduleRetry(p.key)
      return false
    }
    // Refused: nothing was saved anywhere — show what is really stored.
    notifyFloorSaveProblem(status === 400 ? 409 : status, data?.conflict ? { error: CONFLICT_MESSAGE } : data)
    console.error('[floor] batch save refused', keys, status, data)
    for (const k of keys) await reloadFromServer(k)
    return false
  } finally {
    done()
    release()
  }
}

/** Put the server's stored version of rows we just saved back into memory (ids, stamps). */
function mergeStoredRowsIntoMemory(key: string, stored: AnyRow[], sent: Map<string, string>) {
  if (!stored.length) return
  try {
    const list = JSON.parse(memoryStore.get(key) || '[]') as AnyRow[]
    const norm = normalizerFor(key)
    const byId = new Map(stored.map((r) => [sheetRowId(r), r]))
    let changed = false
    const next = list.map((r) => {
      const id = sheetRowId(r)
      const s = byId.get(id)
      // Only when the row was not edited again while the save was on its way.
      if (s && sent.get(id) === canonical(norm(r))) {
        changed = true
        return normalizeSheetEntry(s as unknown as DailyLoomProductionEntry) as unknown as AnyRow
      }
      return r
    })
    if (changed) memoryStore.set(key, JSON.stringify(next))
  } catch {
    // ignore
  }
}

/** Run a targeted action (patch beam, delete part …) in the list's / day's save order. */
export async function runAction(key: string, body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> | null }> {
  return enqueue(key, async () => {
    const r = await post(body)
    if (r.status === 200 && r.data?.ok && r.data.sync) applyServerSync(r.data.sync)
    return r
  })
}
