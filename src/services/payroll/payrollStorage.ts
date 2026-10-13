// src/services/payroll/payrollStorage.ts
import { STORAGE_KEYS, NAME_ALIASES } from './payrollConstants'
import type { EmployeeProfile } from '@/types/payroll'

/** In-memory cache hydrated from PostgreSQL via /api/payroll/store. */
export const memoryStore = new Map<string, string>()
export let hydrated = false
export let hydratePromise: Promise<void> | null = null
export let allowServerSheetWrite = false

export function setAllowServerSheetWrite(val: boolean): void {
  allowServerSheetWrite = val
}

export function setHydrated(val: boolean): void {
  hydrated = val
}

/** Writes that happened before hydrate finished — must not be wiped by DB snapshot. */
export const pendingPersists = new Map<string, unknown>()

export const LOCAL_MIRROR_KEYS = new Set<string>([
  STORAGE_KEYS.EMPLOYEES,
  STORAGE_KEYS.STAFF,
  STORAGE_KEYS.CONTRACT,
  STORAGE_KEYS.HR_META,
  STORAGE_KEYS.ADVANCES,
  STORAGE_KEYS.EFFICIENCY,
  STORAGE_KEYS.WEAVERS,
  STORAGE_KEYS.HELPERS,
  STORAGE_KEYS.CONTRACTORS,
  STORAGE_KEYS.PETTY_CASH,
])

export const ARRAY_MERGE_KEYS = new Set<string>([
  STORAGE_KEYS.STAFF,
  STORAGE_KEYS.CONTRACT,
  STORAGE_KEYS.ADVANCES,
  STORAGE_KEYS.EFFICIENCY,
  STORAGE_KEYS.WEAVERS,
  STORAGE_KEYS.HELPERS,
  STORAGE_KEYS.CONTRACTORS,
  STORAGE_KEYS.PETTY_CASH,
])

export function isPayrollHydrated(): boolean {
  return hydrated
}

/** Force next hydratePayrollFromDb() to re-fetch from Postgres. */
export function resetPayrollHydration(): void {
  hydrated = false
  hydratePromise = null
}

export function localMirrorKey(key: string): string {
  return `sara_payroll_mirror_${key}`
}

export function isPayrollClient(): boolean {
  return typeof window !== 'undefined'
}

export function writeLocalMirror(key: string, value: unknown): void {
  if (!isPayrollClient() || !LOCAL_MIRROR_KEYS.has(key)) return
  try {
    localStorage.setItem(localMirrorKey(key), JSON.stringify(value))
  } catch {
    // ignore quota / private mode
  }
}

export function readLocalMirror(key: string): unknown | null {
  if (!isPayrollClient() || !LOCAL_MIRROR_KEYS.has(key)) return null
  try {
    const raw = localStorage.getItem(localMirrorKey(key))
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function persistPayrollKey(key: string, value: unknown): Promise<boolean> {
  if (!isPayrollClient()) return false
  writeLocalMirror(key, value)
  try {
    const res = await fetch('/api/payroll/store', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ key, value }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('[payroll] persist rejected', key, res.status, body)
      return false
    }
    return true
  } catch (err) {
    console.error('[payroll] persist failed', key, err)
    return false
  }
}

export function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = memoryStore.get(key)
    if (raw) return JSON.parse(raw) as T
  } catch {
    // ignore
  }
  if (isPayrollClient()) {
    try {
      const legacy = localStorage.getItem(key)
      if (legacy) {
        memoryStore.set(key, legacy)
        const parsed = JSON.parse(legacy) as T
        void persistPayrollKey(key, parsed)
        return parsed
      }
    } catch {
      // ignore
    }
    const mirrored = readLocalMirror(key)
    if (mirrored != null) {
      return mirrored as T
    }
  }
  return fallback
}

export function writeStore(key: string, value: unknown): void {
  try {
    memoryStore.set(key, JSON.stringify(value))
  } catch {
    // ignore
  }
  writeLocalMirror(key, value)
  // Wait until the DB snapshot is loaded, otherwise a first paint can overwrite Postgres.
  if (!hydrated) {
    if (ARRAY_MERGE_KEYS.has(key) && Array.isArray(value)) {
      const prev = pendingPersists.get(key)
      if (Array.isArray(prev)) {
        pendingPersists.set(
          key,
          mergeRowsById(prev as { id?: string }[], value as { id?: string }[])
        )
      } else {
        pendingPersists.set(key, value)
      }
    } else if (key === STORAGE_KEYS.HR_META && value && typeof value === 'object') {
      const prev = pendingPersists.get(key)
      const prevObj =
        prev && typeof prev === 'object' ? (prev as Record<string, unknown>) : {}
      const incoming = value as { pettyCashInflowOverrides?: Record<string, number> }
      const prevOverrides =
        prevObj.pettyCashInflowOverrides && typeof prevObj.pettyCashInflowOverrides === 'object'
          ? (prevObj.pettyCashInflowOverrides as Record<string, number>)
          : {}
      pendingPersists.set(key, {
        ...prevObj,
        ...incoming,
        pettyCashInflowOverrides: {
          ...prevOverrides,
          ...(incoming.pettyCashInflowOverrides || {}),
        },
      })
    } else {
      pendingPersists.set(key, value)
    }
    return
  }
  void persistPayrollKey(key, value)
}

export async function writeStoreAndWait(key: string, value: unknown): Promise<boolean> {
  try {
    memoryStore.set(key, JSON.stringify(value))
  } catch {
    // ignore
  }
  writeLocalMirror(key, value)
  if (!hydrated) {
    if (ARRAY_MERGE_KEYS.has(key) && Array.isArray(value)) {
      const prev = pendingPersists.get(key)
      pendingPersists.set(
        key,
        Array.isArray(prev)
          ? mergeRowsById(prev as { id?: string }[], value as { id?: string }[])
          : value
      )
    } else if (key === STORAGE_KEYS.HR_META && value && typeof value === 'object') {
      const prev = pendingPersists.get(key)
      const prevObj =
        prev && typeof prev === 'object' ? (prev as Record<string, unknown>) : {}
      const incoming = value as { pettyCashInflowOverrides?: Record<string, number> }
      const prevOverrides =
        prevObj.pettyCashInflowOverrides && typeof prevObj.pettyCashInflowOverrides === 'object'
          ? (prevObj.pettyCashInflowOverrides as Record<string, number>)
          : {}
      pendingPersists.set(key, {
        ...prevObj,
        ...incoming,
        pettyCashInflowOverrides: {
          ...prevOverrides,
          ...(incoming.pettyCashInflowOverrides || {}),
        },
      })
    } else {
      pendingPersists.set(key, value)
    }
    await hydratePayrollFromDb()
    // After hydrate, memory has DB+mirrors; still force-write our value merged in
    if (ARRAY_MERGE_KEYS.has(key) && Array.isArray(value)) {
      let current: { id?: string }[] = []
      try {
        current = JSON.parse(memoryStore.get(key) || '[]')
      } catch {
        current = []
      }
      const merged = mergeRowsById(current, value as { id?: string }[])
      memoryStore.set(key, JSON.stringify(merged))
      writeLocalMirror(key, merged)
      return persistPayrollKey(key, merged)
    }
    if (key === STORAGE_KEYS.HR_META && value && typeof value === 'object') {
      let current: Record<string, unknown> = {}
      try {
        current = JSON.parse(memoryStore.get(key) || '{}')
      } catch {
        current = {}
      }
      const incoming = value as { pettyCashInflowOverrides?: Record<string, number> }
      const curOverrides =
        current.pettyCashInflowOverrides && typeof current.pettyCashInflowOverrides === 'object'
          ? (current.pettyCashInflowOverrides as Record<string, number>)
          : {}
      const merged = {
        ...current,
        ...incoming,
        pettyCashInflowOverrides: {
          ...curOverrides,
          ...(incoming.pettyCashInflowOverrides || {}),
        },
      }
      memoryStore.set(key, JSON.stringify(merged))
      writeLocalMirror(key, merged)
      return persistPayrollKey(key, merged)
    }
  }
  return persistPayrollKey(key, value)
}

/** Prefer DB rows for periods already saved; only add mirror rows for brand-new month/fortnight. */
export function mergeMirrorPreferDbPeriods<
  T extends { id?: string; month?: string; fortnight?: string },
>(dbRows: T[], mirrorRows: T[]): T[] {
  const db = Array.isArray(dbRows) ? dbRows : []
  const mirror = Array.isArray(mirrorRows) ? mirrorRows : []
  if (db.length === 0) return mergeRowsById(db, mirror)
  const periodsInDb = new Set(
    db.map((r) => `${r.month || ''}|${r.fortnight || ''}`)
  )
  const extras = mirror.filter(
    (r) => !periodsInDb.has(`${r.month || ''}|${r.fortnight || ''}`)
  )
  return extras.length ? mergeRowsById(db, extras) : [...db]
}

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
  deletedEmployeeIds?: string[]
  deletedEmployeeNames?: string[]
}): void {
  const raw = readHrMetaRaw()
  writeStore(STORAGE_KEYS.HR_META, {
    ...custom,
    pettyCashInflowOverrides:
      custom.pettyCashInflowOverrides ?? raw.pettyCashInflowOverrides,
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
  if (isPayrollClient()) {
    try {
      const legacy = localStorage.getItem(STORAGE_KEYS.HR_META)
      if (legacy) {
        memoryStore.set(STORAGE_KEYS.HR_META, legacy)
        const parsed = JSON.parse(legacy)
        void persistPayrollKey(STORAGE_KEYS.HR_META, parsed)
        return parsed
      }
    } catch {
      // ignore
    }
    const mirrored = readLocalMirror(STORAGE_KEYS.HR_META)
    if (mirrored && typeof mirrored === 'object') {
      return mirrored as HrMetaShape
    }
  }
  return {}
}

export function isTombstonedEmployee(id?: string, name?: string): boolean {
  const raw = readHrMetaRaw()
  const ids = raw.deletedEmployeeIds || []
  const names = raw.deletedEmployeeNames || []
  if (id && ids.includes(id)) return true
  const key = normalizeNameLocal(name)
  return Boolean(key && names.includes(key))
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

let postHydrateHook: (() => void) | null = null

export function registerPostHydrateHook(fn: () => void): void {
  postHydrateHook = fn
}

/** Load payroll store from DB (seeds DB if empty). Call once when entering Payroll module. */
export async function hydratePayrollFromDb(): Promise<void> {
  if (!isPayrollClient()) return
  if (hydrated) return
  if (hydratePromise) return hydratePromise

  hydratePromise = (async () => {
    try {
      const res = await fetch('/api/payroll/store', { method: 'GET', cache: 'no-store' })
      const data = await res.json()
      if (data?.ok && data.store && typeof data.store === 'object') {
        Object.entries(data.store as Record<string, unknown>).forEach(([key, value]) => {
          memoryStore.set(key, JSON.stringify(value))
        })
      }

      // Merge local mirrors (e.g. September generated before PUT finished / offline).
      for (const key of LOCAL_MIRROR_KEYS) {
        const mirrored = readLocalMirror(key)
        if (mirrored == null) continue
        if (key === STORAGE_KEYS.HR_META && typeof mirrored === 'object') {
          const dbMeta = (() => {
            try {
              return JSON.parse(memoryStore.get(key) || '{}')
            } catch {
              return {}
            }
          })() as HrMetaShape
          const localMeta = mirrored as HrMetaShape
          const merged = {
            categories: localMeta.categories?.length ? localMeta.categories : dbMeta.categories || [],
            designations: localMeta.designations?.length
              ? localMeta.designations
              : dbMeta.designations || [],
            activeSalariedMonth: (() => {
              const local = localMeta.activeSalariedMonth || ''
              const db = dbMeta.activeSalariedMonth || ''
              if (local && db) return local >= db ? local : db
              return local || db || undefined
            })(),
            activeFortnightMonth:
              localMeta.activeFortnightMonth || dbMeta.activeFortnightMonth || undefined,
            activeFortnight: localMeta.activeFortnight || dbMeta.activeFortnight || undefined,
            pettyCashInflowOverrides: {
              ...(dbMeta.pettyCashInflowOverrides || {}),
              ...(localMeta.pettyCashInflowOverrides || {}),
            },
            deletedEmployeeIds: localMeta.deletedEmployeeIds || dbMeta.deletedEmployeeIds || [],
            deletedEmployeeNames: localMeta.deletedEmployeeNames || dbMeta.deletedEmployeeNames || [],
          }
          memoryStore.set(key, JSON.stringify(merged))
          pendingPersists.set(key, merged)
          continue
        }
        if (Array.isArray(mirrored)) {
          let dbRows: { id?: string; month?: string; fortnight?: string }[] = []
          try {
            dbRows = JSON.parse(memoryStore.get(key) || '[]')
          } catch {
            dbRows = []
          }
          const merged =
            key === STORAGE_KEYS.EMPLOYEES && dbRows.length > 0
              ? [...dbRows]
              : mergeMirrorPreferDbPeriods(
                  dbRows,
                  mirrored as { id?: string; month?: string; fortnight?: string }[]
                )
          memoryStore.set(key, JSON.stringify(merged))
          if (JSON.stringify(merged) !== JSON.stringify(dbRows)) {
            pendingPersists.set(key, merged)
          }
        }
      }

      // Merge any in-flight pending writes into memory
      for (const [key, value] of pendingPersists) {
        if (key === STORAGE_KEYS.EMPLOYEES && Array.isArray(value)) {
          memoryStore.set(key, JSON.stringify(value))
          writeLocalMirror(key, value)
        } else if (ARRAY_MERGE_KEYS.has(key) && Array.isArray(value)) {
          let current: { id?: string }[] = []
          try {
            current = JSON.parse(memoryStore.get(key) || '[]')
          } catch {
            current = []
          }
          const merged = mergeRowsById(current, value as { id?: string }[])
          memoryStore.set(key, JSON.stringify(merged))
          pendingPersists.set(key, merged)
          writeLocalMirror(key, merged)
        } else if (key === STORAGE_KEYS.HR_META && value && typeof value === 'object') {
          let current: Record<string, unknown> = {}
          try {
            current = JSON.parse(memoryStore.get(key) || '{}')
          } catch {
            current = {}
          }
          const incoming = value as { pettyCashInflowOverrides?: Record<string, number> }
          const curOverrides =
            current.pettyCashInflowOverrides &&
            typeof current.pettyCashInflowOverrides === 'object'
              ? (current.pettyCashInflowOverrides as Record<string, number>)
              : {}
          const merged = {
            ...current,
            ...incoming,
            pettyCashInflowOverrides: {
              ...curOverrides,
              ...(incoming.pettyCashInflowOverrides || {}),
            },
          }
          memoryStore.set(key, JSON.stringify(merged))
          pendingPersists.set(key, merged)
          writeLocalMirror(key, merged)
        }
      }

      hydrated = true

      const toFlush = [...pendingPersists.entries()]
      pendingPersists.clear()
      await Promise.all(
        toFlush.map(async ([key, value]) => {
          if (key === STORAGE_KEYS.EMPLOYEES && Array.isArray(value)) {
            memoryStore.set(key, JSON.stringify(value))
            writeLocalMirror(key, value)
            return persistPayrollKey(key, value)
          } else if (ARRAY_MERGE_KEYS.has(key) && Array.isArray(value)) {
            let current: { id?: string }[] = []
            try {
              current = JSON.parse(memoryStore.get(key) || '[]')
            } catch {
              current = []
            }
            const merged = mergeRowsById(current, value as { id?: string }[])
            memoryStore.set(key, JSON.stringify(merged))
            writeLocalMirror(key, merged)
            return persistPayrollKey(key, merged)
          }
          return persistPayrollKey(key, value)
        })
      )

      // Post-hydrate self-healing callbacks (repairs corrupted historical rates, duplicates, etc.)
      try {
        postHydrateHook?.()
      } catch (hookErr) {
        console.error('[payroll] post-hydrate hook error', hookErr)
      }
    } catch (err) {
      console.error('[payroll] hydrate failed — falling back to seed/local', err)
      hydrated = true
      const toFlush = [...pendingPersists.entries()]
      pendingPersists.clear()
      await Promise.all(toFlush.map(([key, value]) => persistPayrollKey(key, value)))
    }
  })()

  return hydratePromise
}
