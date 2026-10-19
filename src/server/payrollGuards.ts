/**
 * Server-side protection for salary data (pure functions — unit tested).
 *
 * 1. Month Lock: once a month is locked (HR meta `monthLocks[month].locked`), saves cannot
 *    add, change or remove rows of that month — those rows stay as stored. Unlock first.
 * 2. Stale save: each sheet key holds ALL months, so a save from an old tab/computer would
 *    overwrite newer work. The client sends the version it loaded; older → refused.
 */
import { stableJson } from '@/server/stableJson'

type Row = { id?: string; month?: string } & Record<string, unknown>
type MonthLocks = Record<string, { locked?: boolean } | undefined>

export class PayrollGuardError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'PayrollGuardError'
  }
}

export function lockedMonthsFromMeta(meta: unknown): Set<string> {
  const locks = (meta && typeof meta === 'object' ? (meta as { monthLocks?: MonthLocks }).monthLocks : null) || {}
  return new Set(Object.entries(locks).filter(([, v]) => Boolean(v?.locked)).map(([m]) => m))
}

/** Months whose rows differ between `before` and `after` (only array sheets are checked). */
export function changedLockedMonths(before: unknown, after: unknown, locked: Set<string>): string[] {
  if (locked.size === 0 || !Array.isArray(after)) return []
  const rowsOf = (list: unknown) =>
    (Array.isArray(list) ? (list as Row[]) : []).filter((r) => r && locked.has(String(r.month || '')))
  const sig = (rows: Row[]) => {
    const byMonth = new Map<string, string[]>()
    for (const r of rows) {
      const m = String(r.month)
      const list = byMonth.get(m) || []
      list.push(stableJson(r))
      byMonth.set(m, list)
    }
    for (const list of byMonth.values()) list.sort()
    return byMonth
  }
  const a = sig(rowsOf(before))
  const b = sig(rowsOf(after))
  const out: string[] = []
  for (const m of locked) {
    const x = (a.get(m) || []).join('\n')
    const y = (b.get(m) || []).join('\n')
    if (x !== y) out.push(m)
  }
  return out.sort()
}

/**
 * Keep locked months exactly as stored: incoming rows of a locked month are ignored and
 * the stored rows are kept, everything else is saved as sent. This protects locked months
 * without blocking today's work (e.g. a name change that touches every month's rows).
 * Returns the value to store and the locked months whose incoming changes were ignored.
 */
export function keepLockedMonths(
  before: unknown,
  after: unknown,
  meta: unknown,
  isMetaKey: boolean
): { value: unknown; keptMonths: string[] } {
  if (isMetaKey || !Array.isArray(after)) return { value: after, keptMonths: [] }
  const locked = lockedMonthsFromMeta(meta)
  const keptMonths = changedLockedMonths(before, after, locked)
  if (keptMonths.length === 0) return { value: after, keptMonths }
  const keep = new Set(keptMonths)
  const stored = (Array.isArray(before) ? (before as Row[]) : []).filter((r) => keep.has(String(r?.month || '')))
  const incoming = (after as Row[]).filter((r) => !keep.has(String(r?.month || '')))
  return { value: [...stored, ...incoming], keptMonths }
}

/** Refuse a save built on an older copy than what the database now has. */
export function assertFreshVersion(baseVersion: unknown, currentVersion: string | null) {
  if (typeof baseVersion !== 'string' || !baseVersion || !currentVersion) return
  if (new Date(currentVersion).getTime() > new Date(baseVersion).getTime()) {
    throw new PayrollGuardError(
      'Yeh sheet kisi aur tab ya computer se pehle hi save ho chuki hai — aap ka save rok diya gaya taake ' +
        'naya kaam na mite. Page refresh karein, phir dobara tabdeeli karein.',
      409
    )
  }
}
