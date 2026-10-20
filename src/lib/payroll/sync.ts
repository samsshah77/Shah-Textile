/**
 * Payroll row sync — the one contract between the browser and the server.
 *
 * The salary screens still work on whole sheets (an array of rows per storage key, plus
 * one HR settings object). What travels to the server is only the difference against
 * the last copy the server confirmed: rows added / changed / removed, each carrying the
 * version it was based on. The server applies a whole change set in one transaction or
 * not at all (see src/server/payroll/rows.ts).
 *
 * Pure functions only — used by the browser, by the server (month generation) and by
 * the tests.
 */
import { stableJson } from '@/server/stableJson'

export const PAYROLL_KEYS = {
  EMPLOYEES: 'sara_payroll_employees_v9',
  ADVANCES: 'sara_payroll_advances_v7',
  STAFF: 'sara_payroll_staff_v6',
  CONTRACT: 'sara_payroll_contract_v7',
  EFFICIENCY: 'sara_payroll_efficiency_v6',
  WEAVERS: 'sara_payroll_weavers_v6',
  HELPERS: 'sara_payroll_helpers_v6',
  CONTRACTORS: 'sara_payroll_contractors_v6',
  PETTY_CASH: 'sara_payroll_petty_cash_v6',
  HR_META: 'sara_payroll_hr_meta_v1',
} as const

/** Settings object (one stored row per field). Every other key is a sheet of rows. */
export const META_SHEET = PAYROLL_KEYS.HR_META
export const ROW_SHEETS: readonly string[] = Object.values(PAYROLL_KEYS).filter((k) => k !== META_SHEET)
export const ALL_SHEETS: readonly string[] = Object.values(PAYROLL_KEYS)
/** Sheets whose rows belong to a month (and so obey month locks). */
export const MONTH_SHEETS: readonly string[] = ROW_SHEETS.filter((k) => k !== PAYROLL_KEYS.EMPLOYEES)

export const MONTH_RE = /^\d{4}-\d{2}$/

export type PayrollRow = Record<string, unknown> & { id?: string; month?: string }

/** Put a row (insert when base = 0, else update the row at version `base`). */
export type PutOp = { op: 'put'; sheet: string; id: string; base: number; row: unknown }
/** Remove the row that is at version `base`. */
export type DelOp = { op: 'del'; sheet: string; id: string; base: number }
export type PayrollOp = PutOp | DelOp

export type ChangeSet = {
  ops: PayrollOp[]
  /** New row order of a sheet (complete list of its ids), only when the order changed. */
  order?: Record<string, string[]>
}

/** What the browser last got from the server for one row. */
export type Confirmed = { json: string; version: number }
export type SheetState = { rows: Map<string, Confirmed>; order: string[] }

export function emptySheetState(): SheetState {
  return { rows: new Map(), order: [] }
}

export function rowMonth(row: unknown): string | null {
  const m = row && typeof row === 'object' ? (row as PayrollRow).month : null
  return typeof m === 'string' && MONTH_RE.test(m.trim()) ? m.trim() : null
}

let idSeq = 0
function freshId(base: string): string {
  idSeq += 1
  return `${base || 'row'}-${Date.now().toString(36)}${idSeq.toString(36)}`
}

/**
 * Rows a sheet must be able to track: every row needs a unique string id.
 * Missing / duplicate ids get a new one (the row object is updated in place so the
 * next comparison sees the same id).
 */
export function ensureRowIds(rows: unknown[]): { rows: PayrollRow[]; fixed: number } {
  const seen = new Set<string>()
  let fixed = 0
  const out: PayrollRow[] = []
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const row = raw as PayrollRow
    let id = typeof row.id === 'string' ? row.id.trim() : row.id != null ? String(row.id) : ''
    if (!id || seen.has(id)) {
      id = freshId(id)
      fixed += 1
    }
    if (row.id !== id) row.id = id
    seen.add(id)
    out.push(row)
  }
  return { rows: out, fixed }
}

/** Changes that turn the confirmed copy of a row sheet into `next`. */
export function diffRowSheet(sheet: string, state: SheetState, next: unknown): ChangeSet {
  const list = Array.isArray(next) ? ensureRowIds(next).rows : []
  const ops: PayrollOp[] = []
  const ids: string[] = []
  for (const row of list) {
    const id = row.id as string
    ids.push(id)
    const json = stableJson(row)
    const had = state.rows.get(id)
    if (!had) ops.push({ op: 'put', sheet, id, base: 0, row })
    else if (had.json !== json) ops.push({ op: 'put', sheet, id, base: had.version, row })
  }
  const keep = new Set(ids)
  for (const [id, had] of state.rows) {
    if (!keep.has(id)) ops.push({ op: 'del', sheet, id, base: had.version })
  }
  // Order: surviving rows must keep their old sequence, and new rows must come last
  // (the server appends new rows). Anything else sends the full new order.
  const oldSurvivors = state.order.filter((id) => keep.has(id))
  const existing = ids.filter((id) => state.rows.has(id))
  const newAtEnd = ids.slice(existing.length).every((id) => !state.rows.has(id))
  const sameOrder = newAtEnd && oldSurvivors.length === existing.length && oldSurvivors.every((id, i) => existing[i] === id)
  const out: ChangeSet = { ops }
  if (!sameOrder) out.order = { [sheet]: ids }
  return out
}

/**
 * Changes for the HR settings object. A field that is absent (or undefined) means
 * "unchanged" — never "delete". Old code often wrote a partial settings object, and
 * that used to wipe month locks and delete-markers.
 */
export function diffMetaSheet(sheet: string, state: SheetState, next: unknown): ChangeSet {
  const ops: PayrollOp[] = []
  if (!next || typeof next !== 'object' || Array.isArray(next)) return { ops }
  for (const [field, value] of Object.entries(next as Record<string, unknown>)) {
    if (value === undefined) continue
    const json = stableJson(value)
    const had = state.rows.get(field)
    if (!had) ops.push({ op: 'put', sheet, id: field, base: 0, row: value })
    else if (had.json !== json) ops.push({ op: 'put', sheet, id: field, base: had.version, row: value })
  }
  return { ops }
}

export function diffSheet(sheet: string, state: SheetState, next: unknown): ChangeSet {
  return sheet === META_SHEET ? diffMetaSheet(sheet, state, next) : diffRowSheet(sheet, state, next)
}

export function mergeChangeSets(sets: ChangeSet[]): ChangeSet {
  const out: ChangeSet = { ops: [] }
  for (const s of sets) {
    out.ops.push(...s.ops)
    if (s.order) out.order = { ...(out.order || {}), ...s.order }
  }
  return out
}

export function isEmptyChange(c: ChangeSet): boolean {
  return c.ops.length === 0 && Object.keys(c.order || {}).length === 0
}

/** Build the confirmed state of one sheet from the server's value and versions. */
export function sheetStateFrom(sheet: string, value: unknown, versions: Record<string, number> | undefined): SheetState {
  const state = emptySheetState()
  const v = versions || {}
  if (sheet === META_SHEET) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [field, fieldValue] of Object.entries(value as Record<string, unknown>)) {
        state.rows.set(field, { json: stableJson(fieldValue), version: v[field] || 1 })
      }
    }
    return state
  }
  for (const row of Array.isArray(value) ? (value as PayrollRow[]) : []) {
    const id = typeof row?.id === 'string' ? row.id : ''
    if (!id) continue
    state.rows.set(id, { json: stableJson(row), version: v[id] || 1 })
    state.order.push(id)
  }
  return state
}

/** Server reply for an accepted change set. */
export type ApplyResult = {
  /** New version of every row written (null = removed). */
  versions: Record<string, Record<string, number | null>>
  /**
   * Rows of locked months that were NOT changed: the server's copy (null = no row),
   * so the browser can put it back on screen.
   */
  kept: Array<{ sheet: string; id: string; row: unknown | null; version: number }>
  keptMonths: string[]
}

/** Rows that another tab / computer changed after this browser loaded them. */
export type Conflict = { sheet: string; id: string; base: number; current: number }
