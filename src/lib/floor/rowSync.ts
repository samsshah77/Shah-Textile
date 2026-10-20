/**
 * Row-level saving for the production floor (shared by browser and server).
 *
 * The browser used to send whole lists (all looms, all beams, the whole day sheet) and
 * the server replaced what it had. Two open tabs / computers therefore overwrote each
 * other silently. Now:
 *
 *  - every row read from the server comes with a `hash` of its stored content;
 *  - the browser sends only the rows it changed, each with the hash it started from;
 *  - the server refuses the save (409) when a row's stored hash is no longer that hash,
 *    i.e. someone else changed the same row in the meantime. Nothing is half-saved.
 *
 * Rows nobody else touched always save, so two people working on different looms of
 * the same day do not disturb each other.
 */

export const FLOOR_KEYS = {
  LOOMS: 'sara_textile_loom_master_v8',
  BEAMS: 'sara_textile_beam_master_v9',
  YARN: 'sara_textile_yarn_master_v8',
  YARN_ISSUANCE: 'sara_textile_yarn_issuance_v8',
  QUALITY: 'sara_textile_quality_master_v8',
  YARN_MOVEMENTS: 'sara_textile_yarn_movements_v8',
} as const

export const SHEET_KEY_PREFIX = 'sara_textile_production_sheet_v8_'

/** Lists saved row-by-row through `applyListChanges`. Yarn has its own actions. */
export type RowListKey = typeof FLOOR_KEYS.LOOMS | typeof FLOOR_KEYS.BEAMS | typeof FLOOR_KEYS.QUALITY
export const ROW_LIST_KEYS: RowListKey[] = [FLOOR_KEYS.LOOMS, FLOOR_KEYS.BEAMS, FLOOR_KEYS.QUALITY]

export function isRowListKey(key: string): key is RowListKey {
  return (ROW_LIST_KEYS as string[]).includes(key)
}

/** The id of a row in one of the lists. */
export function rowIdOf(key: RowListKey, row: Record<string, unknown>): string {
  if (key === FLOOR_KEYS.LOOMS) return String(row.loomNumber ?? '')
  if (key === FLOOR_KEYS.BEAMS) return String(row.beamNo ?? '').trim()
  return String(row.id ?? '')
}

/** A day-sheet row is one loom + part (segment) on one date. */
export function sheetRowId(row: { loomNumber?: unknown; segmentIndex?: unknown }): string {
  const seg = Math.max(1, Math.floor(Number(row.segmentIndex) || 1))
  return `${Number(row.loomNumber)}:${seg}`
}

/**
 * JSON with sorted keys and without null / undefined object fields, so the same row
 * compares equal however it was built (JSONB loses key order; the browser drops nulls).
 */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(v).sort()) {
        const x = (v as Record<string, unknown>)[k]
        if (x === null || x === undefined) continue
        out[k] = x
      }
      return out
    }
    if (typeof v === 'number' && Object.is(v, -0)) return 0
    return v
  })
}

export type RowHashes = Record<string, string>

export type RowUpsert<T = Record<string, unknown>> = {
  row: T
  /** Hash the browser started from; null = a row the browser created. */
  base: string | null
}
export type RowDelete = { id: string; base: string | null }

export type ListChangeSet = { key: RowListKey; upserts: RowUpsert[]; deletes: RowDelete[] }

export type SheetRowChange = {
  entry: Record<string, unknown>
  base: string | null
  /** The user cleared the quality on purpose (Hold / End). */
  clearQuality?: boolean
  /** Edited by hand (a cell, reset meters) rather than produced by rebuilding the day. */
  explicit?: boolean
}

export type RowConflict = { id: string; reason: 'changed' | 'deleted' | 'exists' }

/** What the server returns after a save: the stored rows and their new hashes. */
export type RowSyncResult<T = Record<string, unknown>> = {
  rows: T[]
  hashes: RowHashes
  deleted: string[]
}

/**
 * Rows that differ from the version the browser started from.
 * `baseCanon` holds canonical(normalize(serverRow)) per id; `normalize` is the same
 * function the browser applies when it reads the list, so untouched rows compare equal.
 */
export function diffRows<T extends Record<string, unknown>>(
  next: T[],
  idOf: (row: T) => string,
  baseCanon: Map<string, string>,
  baseHash: Map<string, string>,
  normalize: (row: T) => unknown = (r) => r,
  opts: { allowDeletes?: boolean } = {}
): { upserts: RowUpsert<T>[]; deletes: RowDelete[] } {
  const upserts: RowUpsert<T>[] = []
  const seen = new Set<string>()
  for (const row of next) {
    const id = idOf(row)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const before = baseCanon.get(id)
    if (before !== undefined && before === canonical(normalize(row))) continue
    upserts.push({ row, base: baseHash.get(id) ?? null })
  }
  const deletes: RowDelete[] = []
  if (opts.allowDeletes) {
    for (const id of baseCanon.keys()) {
      if (!seen.has(id)) deletes.push({ id, base: baseHash.get(id) ?? null })
    }
  }
  return { upserts, deletes }
}

/** Compare one change against what is stored now. Pure — shared by tests and server. */
export function checkRowBase(
  id: string,
  base: string | null,
  storedHash: string | null,
  mode: 'upsert' | 'delete'
): RowConflict | null {
  if (base === storedHash) return null
  if (mode === 'delete' && storedHash === null) return null // already gone
  if (base === null) return { id, reason: 'exists' }
  if (storedHash === null) return { id, reason: 'deleted' }
  return { id, reason: 'changed' }
}

export const CONFLICT_MESSAGE =
  'Ye tabdeeli save nahi hui: isi dauran kisi aur computer / tab se yehi row badli gayi. ' +
  'Taaza data load kar diya gaya hai — apni tabdeeli dobara karein.'

export const STALE_PAGE_MESSAGE =
  'Ye page purana hai (system update ho chuka hai). Page refresh karein, phir dobara save karein.'
