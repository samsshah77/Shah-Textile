/**
 * Simple per-person access, set by Javed Sir on Administration → Permissions.
 * Every area is Hide / View / Edit (some only Hide / View). One place for the browser and
 * the server; the server is what really enforces it.
 */
export type AccessLevel = 'hide' | 'view' | 'edit'

export const ACCESS_AREAS = [
  { key: 'accounts', label: 'Accounts', group: 'Modules', edit: true },
  { key: 'payroll', label: 'Salary & Wages', group: 'Modules', edit: true },
  { key: 'prod_entry', label: 'Daily Entry', group: 'Production', edit: true },
  { key: 'prod_sheet', label: 'Production Sheet', group: 'Production', edit: true },
  { key: 'prod_fabric_fault', label: 'Fabric Fault', group: 'Production', edit: true },
  { key: 'prod_looms', label: 'Looms', group: 'Production', edit: true },
  { key: 'prod_beams', label: 'Beams', group: 'Production', edit: true },
  { key: 'prod_yarn', label: 'Yarn Stock', group: 'Production', edit: true },
  { key: 'prod_quality', label: 'Quality', group: 'Production', edit: true },
  { key: 'fault_reports', label: 'Kamran Fault', group: 'Production', edit: true },
  { key: 'tracking', label: 'Tracking (Dashboard)', group: 'Production', edit: false },
  { key: 'quality_archive', label: 'Quality Archive', group: 'System', edit: false },
] as const

export type AccessArea = (typeof ACCESS_AREAS)[number]['key']
export type AccessMap = Record<AccessArea, AccessLevel>

export const AREA_KEYS = ACCESS_AREAS.map((a) => a.key) as AccessArea[]

/** The production page tabs and the area each one belongs to. */
export const PRODUCTION_TAB_AREA: Record<string, AccessArea> = {
  entry: 'prod_entry',
  sheet: 'prod_sheet',
  'fabric-fault': 'prod_fabric_fault',
  looms: 'prod_looms',
  beams: 'prod_beams',
  yarn: 'prod_yarn',
  quality: 'prod_quality',
}

export const PRODUCTION_AREAS: AccessArea[] = Object.values(PRODUCTION_TAB_AREA)

const RANK: Record<AccessLevel, number> = { hide: 0, view: 1, edit: 2 }

export function isAccessArea(v: unknown): v is AccessArea {
  return typeof v === 'string' && (AREA_KEYS as string[]).includes(v)
}

export function isAccessLevel(v: unknown): v is AccessLevel {
  return v === 'hide' || v === 'view' || v === 'edit'
}

/** Levels offered for an area (View-only areas have no Edit). */
export function levelsFor(area: AccessArea): AccessLevel[] {
  const def = ACCESS_AREAS.find((a) => a.key === area)
  return def?.edit ? ['hide', 'view', 'edit'] : ['hide', 'view']
}

/** Never above what the area offers (an old "edit" on a view-only area reads as "view"). */
export function clampLevel(area: AccessArea, level: AccessLevel): AccessLevel {
  const allowed = levelsFor(area)
  return allowed.includes(level) ? level : allowed[allowed.length - 1]
}

export function allows(map: Partial<AccessMap> | null | undefined, area: AccessArea, need: 'view' | 'edit'): boolean {
  const level = map?.[area] ?? 'hide'
  return RANK[level] >= RANK[need]
}

export function allowsAny(map: Partial<AccessMap> | null | undefined, areas: AccessArea[], need: 'view' | 'edit'): boolean {
  return areas.some((a) => allows(map, a, need))
}

/** Everything hidden — used while nothing is known yet. */
export function noAccess(): AccessMap {
  return Object.fromEntries(AREA_KEYS.map((k) => [k, 'hide'])) as AccessMap
}
