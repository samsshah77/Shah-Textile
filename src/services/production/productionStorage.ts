import { DailyLoomProductionEntry } from '@/types/production'
import { PRODUCTION_TODAY_MONTH } from '@/constants/productionCalendar'
import {
  BeamMaster,
  QualityMaster,
  QualityLifecycleStatus,
  LocalQualityEnd,
} from './productionTypes'
import {
  KEY_LOOMS,
  KEY_BEAMS,
  KEY_YARN,
  KEY_YARN_ISSUANCE,
  KEY_YARN_MOVEMENTS,
  KEY_QUALITY,
  KEY_SHEET,
  KEY_QUALITY_ENDS_LOCAL,
  KEY_QUALITY_PENDING_LOCAL,
  KEY_BEAM_SWLOT_LOCAL,
  KEY_BEAM_PENDING_LOCAL,
} from './productionConstants'
import { isClient, normalizeBeam } from './yarnBeamHelpers'
import {
  normalizeQuality,
  normalizeQualityStatus,
  mergeLoomEndLists,
} from './qualityHelpers'
import {
  sheetSegmentIndex,
  sheetRowKey,
  normalizeSheetEntry,
  sortSheetEntries,
  monthLastEnteredDay,
} from './sheetHelpers'

// ==========================================
// Local Storage Backup & Recovery
// ==========================================

export function readLocalBeamSwLots(): Record<string, string> {
  if (!isClient()) return {}
  try {
    const raw = localStorage.getItem(KEY_BEAM_SWLOT_LOCAL)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed || {})) {
      const s = String(v || '').trim()
      if (k && s) out[k] = s
    }
    return out
  } catch {
    return {}
  }
}

export function writeLocalBeamSwLot(beamNo: string, swLot: string | null | undefined) {
  if (!isClient() || !beamNo) return
  try {
    const map = readLocalBeamSwLots()
    const next = swLot != null && String(swLot).trim() !== '' ? String(swLot).trim() : ''
    if (next) map[beamNo] = next
    else delete map[beamNo]
    localStorage.setItem(KEY_BEAM_SWLOT_LOCAL, JSON.stringify(map))
  } catch {
    // ignore
  }
}

export function applyLocalBeamSwLots(beams: BeamMaster[]): BeamMaster[] {
  const map = readLocalBeamSwLots()
  if (!Object.keys(map).length) return beams
  let changed = false
  const next = beams.map((b) => {
    if (b.swLot && String(b.swLot).trim()) return b
    const local = map[b.beamNo]
    if (!local) return b
    changed = true
    return { ...b, swLot: local }
  })
  return changed ? next : beams
}

export function readLocalPendingBeams(): BeamMaster[] {
  if (!isClient()) return []
  try {
    const raw = localStorage.getItem(KEY_BEAM_PENDING_LOCAL)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((b) => b && typeof b === 'object' && typeof (b as BeamMaster).beamNo === 'string')
      .map((b) => normalizeBeam(b as BeamMaster))
  } catch {
    return []
  }
}

export function writeLocalPendingBeam(beam: BeamMaster) {
  if (!isClient() || !beam?.beamNo) return
  try {
    const list = readLocalPendingBeams().filter((b) => b.beamNo !== beam.beamNo)
    list.push(normalizeBeam(beam))
    localStorage.setItem(KEY_BEAM_PENDING_LOCAL, JSON.stringify(list))
  } catch {
    // ignore
  }
}

export function forgetLocalPendingBeam(beamNo: string) {
  if (!isClient() || !beamNo) return
  try {
    const list = readLocalPendingBeams().filter((b) => b.beamNo !== beamNo)
    if (list.length) localStorage.setItem(KEY_BEAM_PENDING_LOCAL, JSON.stringify(list))
    else localStorage.removeItem(KEY_BEAM_PENDING_LOCAL)
  } catch {
    // ignore
  }
}

export function applyLocalPendingBeams(beams: BeamMaster[]): BeamMaster[] {
  const pending = readLocalPendingBeams()
  if (!pending.length) return beams
  const byNo = new Map(beams.map((b) => [b.beamNo, b]))
  for (const p of pending) {
    if (!byNo.has(p.beamNo)) byNo.set(p.beamNo, p)
  }
  return [...byNo.values()]
}

export function readLocalQualityEnds(): LocalQualityEnd[] {
  if (!isClient()) return []
  try {
    const raw = localStorage.getItem(KEY_QUALITY_ENDS_LOCAL)
    if (!raw) return []
    const parsed = JSON.parse(raw) as LocalQualityEnd[]
    return Array.isArray(parsed)
      ? parsed.filter((e) => e && e.id && e.endedOn)
      : []
  } catch {
    return []
  }
}

export function writeLocalQualityEnds(rows: LocalQualityEnd[]) {
  if (!isClient()) return
  try {
    localStorage.setItem(KEY_QUALITY_ENDS_LOCAL, JSON.stringify(rows))
  } catch {
    // ignore quota
  }
}

export function readLocalPendingQualities(): QualityMaster[] {
  if (!isClient()) return []
  try {
    const raw = localStorage.getItem(KEY_QUALITY_PENDING_LOCAL)
    if (!raw) return []
    const parsed = JSON.parse(raw) as QualityMaster[]
    return Array.isArray(parsed) ? parsed.map(normalizeQuality).filter((q) => q.id && q.name) : []
  } catch {
    return []
  }
}

export function writeLocalPendingQualities(rows: QualityMaster[]) {
  if (!isClient()) return
  try {
    localStorage.setItem(KEY_QUALITY_PENDING_LOCAL, JSON.stringify(rows))
  } catch {
    // ignore quota
  }
}

export function rememberLocalPendingQuality(q: QualityMaster) {
  const next = readLocalPendingQualities().filter((e) => e.id !== q.id)
  next.push(normalizeQuality(q))
  writeLocalPendingQualities(next)
}

export function forgetLocalPendingQuality(id: string) {
  writeLocalPendingQualities(readLocalPendingQualities().filter((e) => e.id !== id))
}

export function applyLocalPendingQualities(qualities: QualityMaster[]): QualityMaster[] {
  const pending = readLocalPendingQualities()
  if (pending.length === 0) return qualities
  const byId = new Map(qualities.map((q) => [q.id, q]))
  let changed = false
  for (const p of pending) {
    const existing = byId.get(p.id)
    const pStatus = normalizeQualityStatus(p.status)
    if (!existing) {
      byId.set(p.id, normalizeQuality(p))
      changed = true
      continue
    }
    const eStatus = normalizeQualityStatus(existing.status)
    if (pStatus === 'ACTIVE' && eStatus !== 'ACTIVE') {
      forgetLocalQualityEnd(p.id)
      byId.set(
        p.id,
        normalizeQuality({
          ...existing,
          ...p,
          status: 'ACTIVE',
          endedOn: null,
          loomEnds: [],
          createdOn: p.createdOn || existing.createdOn,
        })
      )
      changed = true
      continue
    }
    if (pStatus === 'ACTIVE' && eStatus === 'ACTIVE') {
      if (p.createdOn && p.createdOn !== existing.createdOn) {
        byId.set(
          p.id,
          normalizeQuality({
            ...existing,
            createdOn: p.createdOn,
            endedOn: null,
            loomEnds: [],
          })
        )
        changed = true
      }
      continue
    }
    if (pStatus === eStatus) {
      forgetLocalPendingQuality(p.id)
      continue
    }
    byId.set(p.id, normalizeQuality({ ...existing, ...p }))
    changed = true
  }
  return changed ? [...byId.values()] : qualities
}

export function rememberLocalQualityEnd(
  id: string,
  endedOn: string,
  name?: string,
  newLoomEnds?: QualityMaster['loomEnds']
) {
  const existing = readLocalQualityEnds().find((e) => e.id === id)
  const next = readLocalQualityEnds().filter((e) => e.id !== id)
  next.push({
    id,
    endedOn,
    name,
    loomEnds: mergeLoomEndLists(existing?.loomEnds, newLoomEnds),
  })
  writeLocalQualityEnds(next)
}

export function forgetLocalQualityEnd(id: string) {
  const next = readLocalQualityEnds().filter((e) => e.id !== id)
  writeLocalQualityEnds(next)
}

export function applyLocalQualityEnds(qualities: QualityMaster[]): QualityMaster[] {
  const ends = readLocalQualityEnds()
  if (ends.length === 0) return qualities
  const pendingActiveIds = new Set(
    readLocalPendingQualities()
      .filter((p) => normalizeQualityStatus(p.status) === 'ACTIVE')
      .map((p) => p.id)
  )
  const byId = new Map(ends.map((e) => [e.id, e]))
  return qualities.map((q) => {
    if (pendingActiveIds.has(q.id)) return q
    const local = byId.get(q.id)
    if (!local) return q
    const loomEnds = mergeLoomEndLists(q.loomEnds, local.loomEnds)
    if (q.status === 'ENDED' && q.endedOn) {
      return normalizeQuality({ ...q, loomEnds })
    }
    return normalizeQuality({
      ...q,
      status: 'ENDED',
      endedOn: local.endedOn,
      loomEnds,
    })
  })
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
  ]
  try {
    for (const key of keys) localStorage.removeItem(key)
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

// ==========================================
// In-Memory Cache & Storage Utilities
// ==========================================

export const memoryStore = new Map<string, string>()
let hydratePromise: Promise<void> | null = null
let hydrated = false

export function isFloorHydrated(): boolean {
  return hydrated
}

export async function persistKey(key: string, value: unknown): Promise<boolean> {
  if (!isClient()) return false
  if (
    !hydrated &&
    (key === KEY_BEAMS ||
      key === KEY_LOOMS ||
      key === KEY_QUALITY ||
      key === KEY_YARN ||
      key === KEY_YARN_ISSUANCE ||
      key === KEY_YARN_MOVEMENTS)
  ) {
    console.warn('[floor] skip persist before hydrate', key)
    return false
  }
  try {
    const res = await fetch('/api/floor/store', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('[floor] persist failed', key, res.status, data)
      return false
    }
    return true
  } catch (err) {
    console.error('[floor] persist failed', key, err)
    return false
  }
}

export function loadJson<T>(key: string, fallback: () => T): T {
  try {
    const raw = memoryStore.get(key)
    if (raw) return JSON.parse(raw) as T
  } catch {
    // ignore
  }
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
  void fetch('/api/floor/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'deleteSheet',
      date: key.replace(`${KEY_SHEET}_`, ''),
    }),
  }).catch(() => {})
}

// ==========================================
// API Persistence Functions
// ==========================================

export async function persistBeamPatch(
  beamNo: string,
  patch: Partial<
    Pick<
      BeamMaster,
      'swLot' | 'qualityId' | 'beamRepeat' | 'warp' | 'reed' | 'width' | 'length' | 'loomType' | 'totalThreads'
    >
  >
): Promise<boolean> {
  if (!isClient() || !beamNo) return false
  try {
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'patchBeam', beamNo, patch }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('[floor] patchBeam failed', beamNo, res.status, data)
      return false
    }
    return true
  } catch (err) {
    console.error('[floor] patchBeam failed', beamNo, err)
    return false
  }
}

export async function persistBeamUpsert(beam: BeamMaster): Promise<boolean> {
  if (!isClient() || !beam?.beamNo) return false
  if (hydratePromise) {
    try {
      await hydratePromise
    } catch {
      // still try upsert
    }
  }
  try {
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsertBeam', beam }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('[floor] upsertBeam failed', beam.beamNo, res.status, data)
      return false
    }
    return true
  } catch (err) {
    console.error('[floor] upsertBeam failed', beam.beamNo, err)
    return false
  }
}

export async function persistBeamDelete(beamNo: string): Promise<boolean> {
  if (!isClient() || !beamNo) return false
  try {
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteBeam', beamNo }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('[floor] deleteBeam failed', beamNo, res.status, data)
      return false
    }
    return true
  } catch (err) {
    console.error('[floor] deleteBeam failed', beamNo, err)
    return false
  }
}

export async function persistQualityStatus(
  id: string,
  status: QualityLifecycleStatus,
  endedOn: string | null
): Promise<boolean> {
  if (!isClient()) return false
  try {
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'patchQualityStatus', id, status, endedOn }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('[floor] patchQualityStatus failed', id, res.status, data)
      return false
    }
    return true
  } catch (err) {
    console.error('[floor] patchQualityStatus failed', id, err)
    return false
  }
}

export async function persistQualityUpsert(quality: QualityMaster): Promise<boolean> {
  if (!isClient()) return false
  try {
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsertQuality', quality }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('[floor] upsertQuality failed', quality.id, res.status, data)
      return false
    }
    return true
  } catch (err) {
    console.error('[floor] upsertQuality failed', quality.id, err)
    return false
  }
}

export async function persistQualityReuse(
  endedId: string,
  createdOn: string,
  newQuality: QualityMaster
): Promise<{ ok: boolean; active: QualityMaster | null; ended: QualityMaster | null }> {
  if (!isClient()) return { ok: false, active: null, ended: null }
  try {
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reuseQuality',
        endedId,
        createdOn,
        newQuality,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.ok) {
      console.error('[floor] reuseQuality failed', endedId, res.status, data)
      return { ok: false, active: null, ended: null }
    }
    return {
      ok: true,
      active: data.active ? normalizeQuality(data.active) : newQuality,
      ended: data.ended ? normalizeQuality(data.ended) : null,
    }
  } catch (err) {
    console.error('[floor] reuseQuality failed', endedId, err)
    return { ok: false, active: null, ended: null }
  }
}

export async function persistLoomEntry(
  dateStr: string,
  loomNumber: number,
  entry: DailyLoomProductionEntry
): Promise<void> {
  if (!isClient()) return
  invalidateMonthCache(dateStr)
  const stamped = normalizeSheetEntry({ ...entry, date: dateStr, loomNumber })
  try {
    await fetch('/api/floor/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updateLoomEntry',
        date: dateStr,
        loomNumber,
        segmentIndex: sheetSegmentIndex(stamped),
        entry: stamped,
      }),
    })
  } catch (err) {
    console.error('[floor] persist loom entry failed', loomNumber, err)
  }
}

export async function persistDeleteLoomSegment(
  dateStr: string,
  loomNumber: number,
  segmentIndex: number
): Promise<void> {
  if (!isClient()) return
  const seg = sheetSegmentIndex({ segmentIndex })
  if (seg <= 1) return
  invalidateMonthCache(dateStr)
  try {
    await fetch('/api/floor/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'deleteLoomSegment',
        date: dateStr,
        loomNumber,
        segmentIndex: seg,
      }),
    })
  } catch (err) {
    console.error('[floor] delete loom segment failed', loomNumber, seg, err)
  }
}

// ==========================================
// Database Hydration & Preloading
// ==========================================

export async function hydrateFloorFromDb(): Promise<void> {
  if (!isClient()) return
  if (hydrated) return
  if (hydratePromise) return hydratePromise

  hydratePromise = (async () => {
    try {
      const res = await fetch('/api/floor/store', { method: 'GET', cache: 'no-store' })
      const data = await res.json()
      if (data?.ok && data.store && typeof data.store === 'object') {
        Object.entries(data.store as Record<string, unknown>).forEach(([key, value]) => {
          memoryStore.set(key, JSON.stringify(value))
        })
        try {
          const raw = memoryStore.get(KEY_QUALITY)
          if (raw) {
            const pendingSnapshot = readLocalPendingQualities()
            const pendingActiveIds = new Set(
              pendingSnapshot
                .filter((p) => normalizeQualityStatus(p.status) === 'ACTIVE')
                .map((p) => p.id)
            )
            const fromDb = (JSON.parse(raw) as QualityMaster[]).map(normalizeQuality)
            const withEnds = applyLocalQualityEnds(fromDb)
            const merged = applyLocalPendingQualities(withEnds)
            memoryStore.set(KEY_QUALITY, JSON.stringify(merged))
            for (const q of merged) {
              if (q.status === 'ENDED' && q.endedOn && !pendingActiveIds.has(q.id)) {
                void persistQualityStatus(q.id, 'ENDED', q.endedOn)
              }
            }
            for (const p of readLocalPendingQualities()) {
              const alreadyInDb = fromDb.some((q) => q.id === p.id)
              void (async () => {
                const okUpsert = await persistQualityUpsert(p)
                const status = normalizeQualityStatus(p.status)
                const okPatch =
                  status === 'ACTIVE'
                    ? await persistQualityStatus(p.id, 'ACTIVE', null)
                    : status === 'ENDED' || status === 'HOLD'
                      ? await persistQualityStatus(p.id, status, p.endedOn ?? null)
                      : false
                if (alreadyInDb || okUpsert || okPatch) forgetLocalPendingQuality(p.id)
              })()
            }
          }
        } catch {
          // ignore merge errors
        }
        clearLegacyFloorLocalStorage()
        try {
          const rawBeams = memoryStore.get(KEY_BEAMS)
          if (rawBeams) {
            const fromDb = (JSON.parse(rawBeams) as BeamMaster[]).map((b) => normalizeBeam(b))
            const withPending = applyLocalPendingBeams(fromDb)
            const merged = applyLocalBeamSwLots(withPending)
            memoryStore.set(KEY_BEAMS, JSON.stringify(merged.map((b) => normalizeBeam(b))))
            for (const b of merged) {
              if (b.swLot) void persistBeamPatch(b.beamNo, { swLot: b.swLot })
            }
            for (const p of readLocalPendingBeams()) {
              const alreadyInDb = fromDb.some((b) => b.beamNo === p.beamNo)
              void persistBeamUpsert(p).then((ok) => {
                if (ok || alreadyInDb) forgetLocalPendingBeam(p.beamNo)
              })
            }
          }
        } catch {
          // ignore
        }
      }
      hydrated = true
    } catch (err) {
      console.error('[floor] hydrate failed — falling back to seed/local', err)
      hydrated = true
    }
  })()

  return hydratePromise
}

export async function refreshFloorMastersFromDb(): Promise<void> {
  if (!isClient()) return
  try {
    const res = await fetch('/api/floor/store', { method: 'GET', cache: 'no-store', credentials: 'include' })
    const data = await res.json()
    if (!data?.ok || !data.store || typeof data.store !== 'object') return
    const store = data.store as Record<string, unknown>
    for (const key of [KEY_BEAMS, KEY_LOOMS, KEY_QUALITY, KEY_YARN, KEY_YARN_ISSUANCE, KEY_YARN_MOVEMENTS]) {
      if (key in store) memoryStore.set(key, JSON.stringify(store[key]))
    }
    try {
      const rawBeams = memoryStore.get(KEY_BEAMS)
      if (rawBeams) {
        const fromDb = (JSON.parse(rawBeams) as BeamMaster[]).map((b) => normalizeBeam(b))
        const withPending = applyLocalPendingBeams(fromDb)
        const merged = applyLocalBeamSwLots(withPending)
        memoryStore.set(KEY_BEAMS, JSON.stringify(merged.map((b) => normalizeBeam(b))))
        for (const b of merged) {
          if (b.swLot && !(fromDb.find((x) => x.beamNo === b.beamNo)?.swLot)) {
            void persistBeamPatch(b.beamNo, { swLot: b.swLot })
          }
        }
        for (const p of readLocalPendingBeams()) {
          const alreadyInDb = fromDb.some((b) => b.beamNo === p.beamNo)
          void persistBeamUpsert(p).then((ok) => {
            if (ok || alreadyInDb) forgetLocalPendingBeam(p.beamNo)
          })
        }
      }
    } catch {
      // ignore
    }
  } catch (err) {
    console.error('[floor] refresh masters failed', err)
  }
}

export async function loadSheetFromDb(dateStr: string): Promise<DailyLoomProductionEntry[] | null> {
  if (!isClient()) return null
  try {
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getSheet', date: dateStr }),
    })
    const data = await res.json()
    if (data?.ok && Array.isArray(data.entries)) return data.entries
    if (data?.ok && data.entries === null) return null
  } catch {
    // ignore
  }
  return null
}

const loadedMonthsSet = new Set<string>()
const monthPreloadPromises = new Map<string, Promise<void>>()
let lastAllSheetsPreloadedAt = 0

export function invalidateMonthCache(dateOrMonth?: string): void {
  if (!dateOrMonth) {
    loadedMonthsSet.clear()
    monthPreloadPromises.clear()
    lastAllSheetsPreloadedAt = 0
    return
  }
  const month = dateOrMonth.slice(0, 7)
  loadedMonthsSet.delete(month)
  lastAllSheetsPreloadedAt = 0
}

export async function preloadAllFloorSheets(opts?: { force?: boolean }): Promise<void> {
  if (!isClient()) return
  // Debounce/cache: skip redundant full table downloads within 60s unless forced
  const now = Date.now()
  if (!opts?.force && lastAllSheetsPreloadedAt > 0 && now - lastAllSheetsPreloadedAt < 60000) {
    return
  }
  try {
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getAllSheets' }),
    })
    const data = await res.json()
    if (!data?.ok || !Array.isArray(data.sheets)) return
    for (const sheet of data.sheets as { date?: string; entries?: DailyLoomProductionEntry[] }[]) {
      if (!sheet?.date || !Array.isArray(sheet.entries) || sheet.entries.length === 0) continue
      const key = `${KEY_SHEET}_${sheet.date}`
      memoryStore.set(key, JSON.stringify(sheet.entries.map(normalizeSheetEntry)))
      loadedMonthsSet.add(sheet.date.slice(0, 7))
    }
    lastAllSheetsPreloadedAt = now
  } catch (err) {
    console.error('[floor] preload all sheets failed', err)
  }
}

export async function preloadFloorSheet(
  dateStr: string,
  opts?: { force?: boolean }
): Promise<void> {
  if (!isClient()) return
  const key = `${KEY_SHEET}_${dateStr}`
  if (!opts?.force && memoryStore.has(key)) return
  const entries = await loadSheetFromDb(dateStr)
  if (entries) memoryStore.set(key, JSON.stringify(entries.map(normalizeSheetEntry)))
}

/**
 * Optimized single-request batch month preload.
 * Instead of firing 31 HTTP requests, this sends 1 single call to fetch the month
 * and caches it in loadedMonthsSet.
 */
export function preloadMonthSheets(
  monthStr: string = PRODUCTION_TODAY_MONTH,
  opts?: { force?: boolean }
): Promise<void> {
  if (!isClient()) return Promise.resolve()
  const cleanMonth = String(monthStr || '').trim().slice(0, 7)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(cleanMonth)) return Promise.resolve()
  if (!opts?.force && loadedMonthsSet.has(cleanMonth)) return Promise.resolve()
  const inFlight = monthPreloadPromises.get(cleanMonth)
  if (inFlight) return inFlight

  const task = preloadMonthSheetsRequest(cleanMonth, opts)
  monthPreloadPromises.set(cleanMonth, task)
  void task.finally(() => monthPreloadPromises.delete(cleanMonth))
  return task
}

async function preloadMonthSheetsRequest(
  cleanMonth: string,
  opts?: { force?: boolean }
): Promise<void> {
  try {
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getMonthSheets', month: cleanMonth }),
    })
    const data = await res.json()
    if (data?.ok && Array.isArray(data.sheets)) {
      for (const sheet of data.sheets as { date?: string; entries?: DailyLoomProductionEntry[] }[]) {
        if (!sheet?.date || !Array.isArray(sheet.entries) || sheet.entries.length === 0) continue
        const key = `${KEY_SHEET}_${sheet.date}`
        memoryStore.set(key, JSON.stringify(sheet.entries.map(normalizeSheetEntry)))
      }
      loadedMonthsSet.add(cleanMonth)
      return
    }
  } catch (err) {
    console.warn('[floor] getMonthSheets failed, falling back to per-day preload', err)
  }

  // Graceful fallback to per-day if getMonthSheets fails
  const [y, m] = cleanMonth.split('-').map(Number)
  if (!y || !m) return
  const lastDay = monthLastEnteredDay(cleanMonth)
  await Promise.all(
    Array.from({ length: lastDay }, (_, i) => {
      const day = String(i + 1).padStart(2, '0')
      return preloadFloorSheet(`${cleanMonth}-${day}`, opts)
    })
  )
  loadedMonthsSet.add(cleanMonth)
}

/** Preload all entries for a single beam lot across any date in 1 query. */
export async function preloadBeamSheets(beamNo: string): Promise<void> {
  if (!isClient()) return
  const trimmed = String(beamNo || '').trim()
  if (!trimmed) return
  try {
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getBeamSheets', beamNo: trimmed }),
    })
    const data = await res.json()
    if (data?.ok && Array.isArray(data.entries)) {
      const byDate = new Map<string, DailyLoomProductionEntry[]>()
      for (const entry of data.entries as DailyLoomProductionEntry[]) {
        if (!entry.date) continue
        const list = byDate.get(entry.date) || []
        list.push(entry)
        byDate.set(entry.date, list)
      }
      for (const [date, entries] of byDate.entries()) {
        const key = `${KEY_SHEET}_${date}`
        const existingRaw = memoryStore.get(key)
        if (existingRaw) {
          try {
            const existing = JSON.parse(existingRaw) as DailyLoomProductionEntry[]
            const mergedMap = new Map<string, DailyLoomProductionEntry>()
            existing.forEach((e) => mergedMap.set(`${e.loomNumber}_${sheetSegmentIndex(e)}`, e))
            entries.forEach((e) => mergedMap.set(`${e.loomNumber}_${sheetSegmentIndex(e)}`, normalizeSheetEntry(e)))
            memoryStore.set(key, JSON.stringify([...mergedMap.values()]))
          } catch {
            memoryStore.set(key, JSON.stringify(entries.map(normalizeSheetEntry)))
          }
        } else {
          memoryStore.set(key, JSON.stringify(entries.map(normalizeSheetEntry)))
        }
      }
    }
  } catch (err) {
    console.error('[floor] preload beam sheets failed', err)
  }
}

export interface FloorMonthSummary {
  month: string
  grandTotalMeters: number
  shiftATotalMeters: number
  shiftBTotalMeters: number
  avgPerDay: number
  daysWithProduction: number
  totalDaysRecorded: number
  loomTotals: Record<number, number>
  qualityTotals: Record<string, number>
  dayTotals: Array<{
    date: string
    day: number
    totalMeters: number
    shiftAMeters: number
    shiftBMeters: number
    activeLooms: number
  }>
}

/** Fetch pre-aggregated monthly summary directly from DB. */
export async function fetchMonthSummary(
  monthStr: string,
  qualityId?: string
): Promise<FloorMonthSummary | null> {
  if (!isClient()) return null
  try {
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getMonthSummary', month: monthStr, qualityId }),
    })
    const data = await res.json()
    if (data?.ok && data.summary) return data.summary as FloorMonthSummary
  } catch (err) {
    console.error('[floor] fetchMonthSummary failed', err)
  }
  return null
}

// ==========================================
// Persisted Sheet Queries & Aggregations
// ==========================================

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

export function listPersistedSheetEntries(): DailyLoomProductionEntry[] {
  const rows: DailyLoomProductionEntry[] = []
  const prefix = `${KEY_SHEET}_`
  for (const key of memoryStore.keys()) {
    if (!key.startsWith(prefix)) continue
    try {
      const parsed = JSON.parse(memoryStore.get(key) || '[]') as DailyLoomProductionEntry[]
      if (Array.isArray(parsed)) rows.push(...parsed)
    } catch {
      // ignore
    }
  }
  return rows
}

export function mergeSheetEntriesForDate(
  dateStr: string,
  live: DailyLoomProductionEntry[] = []
): DailyLoomProductionEntry[] {
  let saved: DailyLoomProductionEntry[] = []
  const key = `${KEY_SHEET}_${dateStr}`
  const raw = memoryStore.get(key)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DailyLoomProductionEntry[]
      if (Array.isArray(parsed)) saved = parsed.map(normalizeSheetEntry)
    } catch {
      // ignore
    }
  }
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

export function mergedSheetEntriesForTotals(
  sheetDate: string,
  live: DailyLoomProductionEntry[] = []
): DailyLoomProductionEntry[] {
  const day = String(sheetDate || '').slice(0, 10)
  const otherDays = listPersistedSheetEntries().filter((e) => {
    const d = String(e.date || '').slice(0, 10)
    if (!d || d === day) return false
    if (day && d > day) return false
    return true
  })
  return [...otherDays, ...mergeSheetEntriesForDate(sheetDate, live)]
}
