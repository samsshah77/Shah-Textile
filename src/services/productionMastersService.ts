import { LoomCategory, LoomStatus } from '@/types/loom'
import {
  calculateProductionMetrics,
  DailyLoomProductionEntry,
  type MonthlyMatrixDay,
} from '@/types/production'
import { INITIAL_34_LOOMS_CONFIG } from '@/constants/looms-init'
import { getExcelBeamStock, getExcelWeftStock, getExcelDailyLoomsForDate } from '@/data/productionData'
import {
  PRODUCTION_START,
  PRODUCTION_TODAY,
  PRODUCTION_TODAY_MONTH,
  PRODUCTION_YESTERDAY,
  getCalendarToday,
  getProductionToday,
  shiftProductionDate,
} from '@/constants/productionCalendar'
import { LOOM_STATUS_LABEL, resolveLoomCondition } from '@/constants/loomConditions'

/** 1 kg = 2.2046 lbs → kg = lbs / 2.2046 */
export const LBS_PER_KG = 2.2046

const KEY_LOOMS = 'sara_textile_loom_master_v8'
const KEY_BEAMS = 'sara_textile_beam_master_v9'
const KEY_YARN = 'sara_textile_yarn_master_v8'
const KEY_YARN_ISSUANCE = 'sara_textile_yarn_issuance_v8'
const KEY_QUALITY = 'sara_textile_quality_master_v8'
const KEY_SHEET = 'sara_textile_production_sheet_v8'
const KEY_YARN_MOVEMENTS = 'sara_textile_yarn_movements_v8'

export interface LoomMaster {
  loomNumber: number
  name: string
  model: LoomCategory
  category: LoomCategory
  year: number
  /** Cover / primary picture (first of pictureDataUrls). Kept for older UI. */
  pictureDataUrl: string
  /** All loom photos (data URLs or /media paths). */
  pictureDataUrls: string[]
  defaultRpm: number
  shed: string
  isActive: boolean
  status: LoomStatus
  /** YYYY-MM-DD since when current status has been active (e.g. stopped since) */
  statusSince?: string | null
  qualityId: string | null
  weftYarnId: string | null
}

export interface BeamMaster {
  beamNo: string
  warp: string
  reed: number
  width: number
  totalThreads: number
  length: number
  loomType: string
  fillStatus: 'EMPTY' | 'FULL'
  usedInLoom: string | null
  status: 'EMPTY' | 'FULL' | 'MOUNTED'
  /** 'STORE' | 'SIZING' | loom number string e.g. '1' */
  location?: 'STORE' | 'SIZING' | string
  /** YYYY-MM-DD when beam was mounted on the loom */
  mountedOn?: string | null
  /** YYYY-MM-DD when beam ended today — cleared automatically on next day */
  beamEndedOn: string | null
  /** Loom it ended on (for Beam table note) */
  endedFromLoom: string | null
}

export interface YarnMovementRecord {
  id: string
  type: 'INWARD' | 'OUTWARD'
  yarnId: string
  yarnType: string
  date: string
  weightKg: number
  weightLbs: number
  bags?: number
  loomNumber?: number
  pick?: number
  lotOrSupplier?: string
  createdAt: string
}

export interface YarnLoomIssuance {
  id: string
  yarnId: string
  yarnType: string
  loomNumber: number
  issuedKg: number
  pick: number
  date: string
  createdAt: string
}

export interface YarnMaster {
  id: string
  yarnType: string
  bags: number
  receivedKg: number
  issuedKg: number
  balanceKg: number
  receivedLbs: number
  issuedLbs: number
  balanceLbs: number
}

/** Warp/weft recipe from this date onward. Earlier days keep the previous recipe. */
export interface QualityYarnChange {
  from: string
  warpYarn: string
  weftYarn: string
}

export interface QualityMaster {
  id: string
  name: string
  fabricType: string
  warpYarn: string
  weftYarn: string
  reed: number
  pick: number
  widthInch: number
  gsm: number
  status?: 'ACTIVE' | 'ENDED'
  /** YYYY-MM-DD when quality was ended */
  endedOn?: string | null
  /** Mid-run warp/weft changes. Each row applies from `from` until the next one. */
  yarnHistory?: QualityYarnChange[]
}

function normalizeQuality(q: QualityMaster): QualityMaster {
  const status = q.status === 'ENDED' ? 'ENDED' : 'ACTIVE'
  const yarnHistory = Array.isArray(q.yarnHistory)
    ? q.yarnHistory
        .filter((h) => h && h.from)
        .map((h) => ({
          from: h.from,
          warpYarn: h.warpYarn || '',
          weftYarn: h.weftYarn || '',
        }))
        .sort((a, b) => a.from.localeCompare(b.from))
    : undefined
  return {
    ...q,
    status,
    endedOn: status === 'ACTIVE' ? null : q.endedOn ?? null,
    yarnHistory,
  }
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
function applyMidRunYarnChange(
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

/** Same quality name is allowed when pick differs. */
export function qualityHasDuplicateName(q: QualityMaster, qualities: QualityMaster[]) {
  const key = qualityNameKey(q.name)
  if (!key) return false
  return qualities.filter((item) => qualityNameKey(item.name) === key).length > 1
}

export function qualityDisplayName(q: QualityMaster, qualities: QualityMaster[]) {
  return qualityHasDuplicateName(q, qualities) ? `${q.name} (Pick ${q.pick})` : q.name
}

function matchQualityByNameAndPick(
  qualities: QualityMaster[],
  name: string,
  pick?: number
): QualityMaster | undefined {
  const named = qualities.filter((item) => qualityNameKey(item.name) === qualityNameKey(name))
  if (named.length === 0) return undefined
  if (named.length === 1) return named[0]
  if (pick != null) return named.find((item) => Number(item.pick) === Number(pick))
  return undefined
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

export function kgToLbs(kg: number) {
  return Number((kg * LBS_PER_KG).toFixed(2))
}

export function lbsToKg(lbs: number) {
  return Number((lbs / LBS_PER_KG).toFixed(2))
}

export function calcTotalThreads(reed: number, width: number) {
  return Math.round((reed || 0) * (width || 0))
}

function isClient() {
  return typeof window !== 'undefined'
}

export function withYarnWeights(partial: Partial<YarnMaster> & { yarnType: string; id: string }): YarnMaster {
  const receivedKg = partial.receivedKg ?? (partial.receivedLbs != null ? lbsToKg(partial.receivedLbs) : 0)
  const issuedKg = partial.issuedKg ?? (partial.issuedLbs != null ? lbsToKg(partial.issuedLbs) : 0)
  const balanceKg = Number((receivedKg - issuedKg).toFixed(2))
  return {
    id: partial.id,
    yarnType: partial.yarnType,
    bags: partial.bags ?? 0,
    receivedKg,
    issuedKg,
    balanceKg,
    receivedLbs: kgToLbs(receivedKg),
    issuedLbs: kgToLbs(issuedKg),
    balanceLbs: kgToLbs(balanceKg),
  }
}

function normalizeLoomRef(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null
  return String(value)
}

function beamOnLoom(beam: BeamMaster, loomNumber: number) {
  return normalizeLoomRef(beam.usedInLoom) === String(loomNumber)
}

/** Beam currently mounted on loom — blocks a second mount until first is moved. */
export function findMountedBeamOnLoom(
  beams: BeamMaster[],
  loomNumber: number,
  exceptBeamNo?: string
): BeamMaster | null {
  return (
    beams.find(
      (b) => beamOnLoom(b, loomNumber) && (!exceptBeamNo || b.beamNo !== exceptBeamNo)
    ) || null
  )
}

export type MountBeamResult =
  | { ok: true; beams: BeamMaster[] }
  | {
      ok: false
      beams: BeamMaster[]
      loomNumber: number
      blockingBeamNo?: string
      message: string
    }

export function simplifyWarpName(name?: string | null): string {
  if (!name) return ''
  // Remove supplier bracket codes like (Sw#337), (Sw#339), (S66337)
  let cleaned = name.replace(/\s*\([^)]*\)/g, '').trim()
  // Remove secondary blend parts if excessively long (e.g. "+46/1 Pv China")
  if (cleaned.includes('+')) {
    cleaned = cleaned.split('+')[0].trim()
  }
  // Remove "China" country tag
  cleaned = cleaned.replace(/\bChina\b/gi, '').trim()
  // Standardize PV / PP casing
  cleaned = cleaned.replace(/\bPv\b/gi, 'PV').replace(/\bPp\b/gi, 'PP')
  return cleaned.replace(/\s+/g, ' ').trim()
}

function normalizeBeam(b: Partial<BeamMaster> & { beamNo: string }): BeamMaster {
  const reed = b.reed ?? 0
  const width = b.width ?? 0
  const usedInLoom = normalizeLoomRef(b.usedInLoom as string | number | null | undefined)
  const fillStatus = b.fillStatus || (usedInLoom ? 'FULL' : b.status === 'EMPTY' ? 'EMPTY' : 'FULL')
  const status: BeamMaster['status'] = usedInLoom ? 'MOUNTED' : fillStatus
  const location = usedInLoom ? String(usedInLoom) : (b.location || 'STORE')
  return {
    beamNo: b.beamNo,
    warp: simplifyWarpName(b.warp),
    reed,
    width,
    totalThreads: calcTotalThreads(reed, width),
    length: b.length ?? 0,
    loomType: b.loomType || 'G6200',
    fillStatus,
    usedInLoom,
    status,
    location,
    mountedOn: usedInLoom ? (b.mountedOn || '2026-09-15') : null,
    beamEndedOn: b.beamEndedOn ?? null,
    endedFromLoom: normalizeLoomRef(b.endedFromLoom as string | number | null | undefined),
  }
}

export const DUMMY_LOOM_IMAGES = [
  '/media/modern-loom.jpg',
  '/media/loom-warp.jpg',
  '/media/loom-industrial.jpg',
  '/media/loom-weaving.jpg',
]

export function getDummyLoomImage(loomNumber: number): string {
  const index = Math.abs((loomNumber - 1) % DUMMY_LOOM_IMAGES.length)
  return DUMMY_LOOM_IMAGES[index]
}

/** Max photos stored per loom (base64 in localStorage). */
export const MAX_LOOM_PICTURES = 8

/** Normalize single + multi picture fields from stored loom rows. */
export function normalizeLoomPictures(
  loom: Partial<LoomMaster> & { loomNumber: number }
): Pick<LoomMaster, 'pictureDataUrl' | 'pictureDataUrls'> {
  const fromList = Array.isArray(loom.pictureDataUrls)
    ? loom.pictureDataUrls.filter((u): u is string => typeof u === 'string' && u.length > 0)
    : []
  const primary =
    (typeof loom.pictureDataUrl === 'string' && loom.pictureDataUrl) ||
    fromList[0] ||
    getDummyLoomImage(loom.loomNumber)

  const urls = fromList.length > 0 ? fromList : [primary]
  const unique = Array.from(new Set(urls)).slice(0, MAX_LOOM_PICTURES)

  return {
    pictureDataUrls: unique,
    pictureDataUrl: unique[0] || primary,
  }
}

export function getLoomPictures(loom: LoomMaster): string[] {
  return normalizeLoomPictures(loom).pictureDataUrls
}

/** Mill roster is always Loom 1 … 34, in that order. Missing numbers are filled from the seed. */
function completeLoomRoster(looms: LoomMaster[]): { list: LoomMaster[]; changed: boolean } {
  const seed = seedLooms()
  const byNumber = new Map<number, LoomMaster>()
  for (const loom of looms) {
    if (!byNumber.has(loom.loomNumber)) byNumber.set(loom.loomNumber, loom)
  }
  let changed = looms.length !== byNumber.size
  const list = seed.map((fallback) => {
    const existing = byNumber.get(fallback.loomNumber)
    if (existing) return existing
    changed = true
    return fallback
  })
  const extras = [...byNumber.values()]
    .filter((loom) => loom.loomNumber < 1 || loom.loomNumber > 34)
    .sort((a, b) => a.loomNumber - b.loomNumber)
  if (extras.length) list.push(...extras)
  if (!changed) {
    changed = looms.some((loom, index) => loom.loomNumber !== list[index]?.loomNumber)
  }
  return { list, changed }
}

function seedLooms(): LoomMaster[] {
  return INITIAL_34_LOOMS_CONFIG.map((l) => {
    const pics = normalizeLoomPictures({
      loomNumber: l.loomNumber,
      pictureDataUrl: getDummyLoomImage(l.loomNumber),
    })
    const isStopped = l.loomNumber === 13 || l.loomNumber === 27
    return {
      loomNumber: l.loomNumber,
      name: `Loom ${l.loomNumber}`,
      model: l.category,
      category: l.category,
      year: 2018 + (l.loomNumber % 6),
      ...pics,
      defaultRpm: l.defaultRpm,
      shed: 'Main Floor',
      isActive: true,
      status: (isStopped ? (l.loomNumber === 13 ? 'BEAM_END' : 'STOPPED') : 'RUNNING') as LoomStatus,
      statusSince: l.loomNumber === 13 ? '2026-09-22' : l.loomNumber === 27 ? '2026-09-23' : null,
      qualityId: null,
      weftYarnId: null,
    }
  })
}

function seedBeams(): BeamMaster[] {
  return getExcelBeamStock().map((b) => {
    const parts = String(b.reedWidth || '').split(/[xX/]/)
    const reed = Number(parts[0]) || 60
    const width = Number(parts[1]) || 66
    const loomNum = Number(b.usedInLoom)
    const daysAgo = loomNum > 0 ? ((loomNum * 3) % 12) + 2 : null
    const mountedDate = daysAgo ? `2026-09-${String(24 - daysAgo).padStart(2, '0')}` : null
    return normalizeBeam({
      beamNo: b.beamNo,
      warp: b.warp,
      reed,
      width,
      length: b.length,
      loomType: b.loomType,
      fillStatus: b.usedInLoom ? 'FULL' : 'FULL',
      usedInLoom: b.usedInLoom,
      mountedOn: mountedDate,
      beamEndedOn: b.beamNo === '134' ? '2026-09-22' : null,
      endedFromLoom: b.beamNo === '134' ? '13' : null,
    })
  })
}

function seedYarn(): YarnMaster[] {
  const cols = getExcelWeftStock().yarnColumns || []
  return cols.slice(0, 12).map((yarnType, i) => {
    const receivedKg = 800 + i * 40
    const issuedKg = 120 + i * 15
    return withYarnWeights({
      id: `yarn-${i + 1}`,
      yarnType,
      bags: Math.max(1, Math.round(receivedKg / 25)),
      receivedKg,
      issuedKg,
    })
  })
}

function seedQualities(): QualityMaster[] {
  return [
    {
      id: 'q-everest',
      name: 'Everest',
      fabricType: 'Suiting',
      warpYarn: '20/1 Pv China',
      weftYarn: '20/1 Pv China',
      reed: 120,
      pick: 60,
      widthInch: 66,
      gsm: 1.77,
    },
    {
      id: 'q-parcopv',
      name: 'PARCOPV',
      fabricType: 'Suiting',
      warpYarn: '20/1-Pv-China',
      weftYarn: '20/1-Pv-China',
      reed: 120,
      pick: 60,
      widthInch: 66,
      gsm: 1.77,
    },
    {
      id: 'q-silver',
      name: 'SILVER-SHINE',
      fabricType: 'Gabardine',
      warpYarn: '45/1-Pv-China',
      weftYarn: '45/1-Pv-China',
      reed: 120,
      pick: 95,
      widthInch: 66,
      gsm: 1.26,
    },
  ]
}

function seedYarnIssuances(): YarnLoomIssuance[] {
  return [
    {
      id: 'iss-1',
      yarnId: 'yarn-1',
      yarnType: '20/1 Pv China',
      loomNumber: 1,
      issuedKg: 100,
      pick: 60,
      date: '2026-09-24',
      createdAt: '2026-09-24T06:30:00Z',
    },
    {
      id: 'iss-2',
      yarnId: 'yarn-1',
      yarnType: '20/1 Pv China',
      loomNumber: 2,
      issuedKg: 120,
      pick: 60,
      date: '2026-09-24',
      createdAt: '2026-09-24T07:15:00Z',
    },
    {
      id: 'iss-3',
      yarnId: 'yarn-2',
      yarnType: '45/1-Pv-China',
      loomNumber: 3,
      issuedKg: 85,
      pick: 95,
      date: '2026-09-23',
      createdAt: '2026-09-23T08:00:00Z',
    },
    {
      id: 'iss-4',
      yarnId: 'yarn-2',
      yarnType: '45/1-Pv-China',
      loomNumber: 4,
      issuedKg: 90,
      pick: 95,
      date: '2026-09-23',
      createdAt: '2026-09-23T08:45:00Z',
    },
    {
      id: 'iss-5',
      yarnId: 'yarn-3',
      yarnType: '30/1 Pv China',
      loomNumber: 5,
      issuedKg: 110,
      pick: 68,
      date: '2026-09-23',
      createdAt: '2026-09-23T10:00:00Z',
    },
    {
      id: 'iss-6',
      yarnId: 'yarn-1',
      yarnType: '20/1 Pv China',
      loomNumber: 6,
      issuedKg: 105,
      pick: 60,
      date: '2026-09-22',
      createdAt: '2026-09-22T09:30:00Z',
    },
    {
      id: 'iss-7',
      yarnId: 'yarn-3',
      yarnType: '30/1 Pv China',
      loomNumber: 7,
      issuedKg: 115,
      pick: 68,
      date: '2026-09-22',
      createdAt: '2026-09-22T11:00:00Z',
    },
    {
      id: 'iss-8',
      yarnId: 'yarn-2',
      yarnType: '45/1-Pv-China',
      loomNumber: 8,
      issuedKg: 80,
      pick: 95,
      date: '2026-09-21',
      createdAt: '2026-09-21T07:45:00Z',
    },
    {
      id: 'iss-9',
      yarnId: 'yarn-1',
      yarnType: '20/1 Pv China',
      loomNumber: 9,
      issuedKg: 130,
      pick: 60,
      date: '2026-09-20',
      createdAt: '2026-09-20T08:15:00Z',
    },
    {
      id: 'iss-10',
      yarnId: 'yarn-4',
      yarnType: '24/1 Pv China',
      loomNumber: 10,
      issuedKg: 100,
      pick: 64,
      date: '2026-09-18',
      createdAt: '2026-09-18T10:30:00Z',
    },
    {
      id: 'iss-11',
      yarnId: 'yarn-1',
      yarnType: '20/1 Pv China',
      loomNumber: 11,
      issuedKg: 115,
      pick: 60,
      date: '2026-09-15',
      createdAt: '2026-09-15T09:00:00Z',
    },
    {
      id: 'iss-12',
      yarnId: 'yarn-2',
      yarnType: '45/1-Pv-China',
      loomNumber: 12,
      issuedKg: 85,
      pick: 95,
      date: '2026-09-10',
      createdAt: '2026-09-10T08:00:00Z',
    },
    {
      id: 'iss-13',
      yarnId: 'yarn-3',
      yarnType: '30/1 Pv China',
      loomNumber: 14,
      issuedKg: 125,
      pick: 68,
      date: '2026-09-12',
      createdAt: '2026-09-12T09:15:00Z',
    },
    {
      id: 'iss-14',
      yarnId: 'yarn-1',
      yarnType: '20/1 Pv China',
      loomNumber: 15,
      issuedKg: 100,
      pick: 60,
      date: '2026-09-11',
      createdAt: '2026-09-11T11:00:00Z',
    },
    {
      id: 'iss-15',
      yarnId: 'yarn-2',
      yarnType: '45/1-Pv-China',
      loomNumber: 16,
      issuedKg: 90,
      pick: 95,
      date: '2026-09-09',
      createdAt: '2026-09-09T07:30:00Z',
    },
    {
      id: 'iss-16',
      yarnId: 'yarn-4',
      yarnType: '24/1 Pv China',
      loomNumber: 18,
      issuedKg: 110,
      pick: 64,
      date: '2026-09-05',
      createdAt: '2026-09-05T08:45:00Z',
    },
  ]
}

function seedYarnMovements(): YarnMovementRecord[] {
  const outward: YarnMovementRecord[] = seedYarnIssuances().map((iss) => ({
    id: `mov-${iss.id}`,
    type: 'OUTWARD',
    yarnId: iss.yarnId,
    yarnType: iss.yarnType,
    date: iss.date,
    weightKg: iss.issuedKg,
    weightLbs: kgToLbs(iss.issuedKg),
    loomNumber: iss.loomNumber,
    pick: iss.pick,
    createdAt: iss.createdAt,
  }))

  const inward: YarnMovementRecord[] = [
    {
      id: 'mov-in-1',
      type: 'INWARD',
      yarnId: 'yarn-1',
      yarnType: '20/1 Pv China',
      date: '2026-09-24',
      weightKg: 500,
      weightLbs: kgToLbs(500),
      bags: 20,
      lotOrSupplier: 'Lot #129 · Nishat Mills',
      createdAt: '2026-09-24T05:30:00Z',
    },
    {
      id: 'mov-in-2',
      type: 'INWARD',
      yarnId: 'yarn-3',
      yarnType: '30/1 Pv China',
      date: '2026-09-22',
      weightKg: 625,
      weightLbs: kgToLbs(625),
      bags: 25,
      lotOrSupplier: 'Lot #325 · Crescent',
      createdAt: '2026-09-22T06:15:00Z',
    },
    {
      id: 'mov-in-3',
      type: 'INWARD',
      yarnId: 'yarn-4',
      yarnType: '24/1 Pv China',
      date: '2026-09-20',
      weightKg: 550,
      weightLbs: kgToLbs(550),
      bags: 22,
      lotOrSupplier: 'Lot #412 · Master Spinning',
      createdAt: '2026-09-20T07:00:00Z',
    },
    {
      id: 'mov-in-4',
      type: 'INWARD',
      yarnId: 'yarn-2',
      yarnType: '45/1-Pv-China',
      date: '2026-09-18',
      weightKg: 500,
      weightLbs: kgToLbs(500),
      bags: 20,
      lotOrSupplier: 'Lot #218 · Sapphire',
      createdAt: '2026-09-18T06:45:00Z',
    },
    {
      id: 'mov-in-5',
      type: 'INWARD',
      yarnId: 'yarn-3',
      yarnType: '30/1 Pv China',
      date: '2026-09-15',
      weightKg: 700,
      weightLbs: kgToLbs(700),
      bags: 28,
      lotOrSupplier: 'Lot #320 · Crescent',
      createdAt: '2026-09-15T08:30:00Z',
    },
    {
      id: 'mov-in-6',
      type: 'INWARD',
      yarnId: 'yarn-2',
      yarnType: '45/1-Pv-China',
      date: '2026-09-08',
      weightKg: 500,
      weightLbs: kgToLbs(500),
      bags: 20,
      lotOrSupplier: 'Lot #210 · Sapphire',
      createdAt: '2026-09-08T09:00:00Z',
    },
    {
      id: 'mov-in-7',
      type: 'INWARD',
      yarnId: 'yarn-1',
      yarnType: '20/1 Pv China',
      date: '2026-09-02',
      weightKg: 625,
      weightLbs: kgToLbs(625),
      bags: 25,
      lotOrSupplier: 'Lot #115 · Nishat Mills',
      createdAt: '2026-09-02T07:15:00Z',
    },
    {
      id: 'mov-in-8',
      type: 'INWARD',
      yarnId: 'yarn-4',
      yarnType: '24/1 Pv China',
      date: '2026-09-14',
      weightKg: 750,
      weightLbs: kgToLbs(750),
      bags: 30,
      lotOrSupplier: 'Lot #405 · Master Spinning',
      createdAt: '2026-09-14T10:00:00Z',
    },
    {
      id: 'mov-in-9',
      type: 'INWARD',
      yarnId: 'yarn-3',
      yarnType: '30/1 Pv China',
      date: '2026-09-07',
      weightKg: 875,
      weightLbs: kgToLbs(875),
      bags: 35,
      lotOrSupplier: 'Lot #308 · Crescent',
      createdAt: '2026-09-07T08:00:00Z',
    },
    {
      id: 'mov-in-10',
      type: 'INWARD',
      yarnId: 'yarn-2',
      yarnType: '45/1-Pv-China',
      date: '2026-09-03',
      weightKg: 850,
      weightLbs: kgToLbs(850),
      bags: 34,
      lotOrSupplier: 'Lot #204 · Sapphire',
      createdAt: '2026-09-03T09:30:00Z',
    },
    {
      id: 'mov-in-11',
      type: 'INWARD',
      yarnId: 'yarn-1',
      yarnType: '20/1 Pv China',
      date: '2026-09-01',
      weightKg: 800,
      weightLbs: kgToLbs(800),
      bags: 32,
      lotOrSupplier: 'Lot #101 · Nishat Mills',
      createdAt: '2026-09-01T07:45:00Z',
    },
  ]

  return [...inward, ...outward].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
}

/** In-memory cache hydrated from PostgreSQL via /api/floor/store. */
const memoryStore = new Map<string, string>()
let hydratePromise: Promise<void> | null = null
let hydrated = false

async function persistKey(key: string, value: unknown): Promise<void> {
  if (!isClient()) return
  try {
    await fetch('/api/floor/store', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    })
  } catch (err) {
    console.error('[floor] persist failed', key, err)
  }
}

async function persistLoomEntry(
  dateStr: string,
  loomNumber: number,
  entry: DailyLoomProductionEntry
): Promise<void> {
  if (!isClient()) return
  try {
    await fetch('/api/floor/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updateLoomEntry', date: dateStr, loomNumber, entry }),
    })
  } catch (err) {
    console.error('[floor] persist loom entry failed', loomNumber, err)
  }
}

function loadJson<T>(key: string, fallback: () => T): T {
  try {
    const raw = memoryStore.get(key)
    if (raw) return JSON.parse(raw) as T
  } catch {
    // ignore
  }
  // Legacy localStorage one-time read (migrate into memory if present)
  if (isClient()) {
    try {
      const legacy = localStorage.getItem(key)
      if (legacy) {
        memoryStore.set(key, legacy)
        try {
          const parsed = JSON.parse(legacy) as T
          void persistKey(key, parsed)
          return parsed
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

function saveJson<T>(key: string, value: T) {
  try {
    memoryStore.set(key, JSON.stringify(value))
  } catch {
    // ignore
  }
  void persistKey(key, value)
}

function removeStoreKey(key: string) {
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
        Object.entries(data.store as Record<string, unknown>).forEach(([key, value]) => {
          memoryStore.set(key, JSON.stringify(value))
        })
      }
      hydrated = true
    } catch (err) {
      console.error('[floor] hydrate failed — falling back to seed/local', err)
      hydrated = true
    }
  })()

  return hydratePromise
}

async function loadSheetFromDb(dateStr: string): Promise<DailyLoomProductionEntry[] | null> {
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

/** Load every saved production day into memory so Quality overall is not stuck on the open day. */
export async function preloadAllFloorSheets(): Promise<void> {
  if (!isClient()) return
  try {
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getAllSheets' }),
    })
    const data = await res.json()
    if (!data?.ok || !Array.isArray(data.sheets)) return
    for (const sheet of data.sheets as { date?: string; entries?: DailyLoomProductionEntry[] }[]) {
      if (!sheet?.date || !Array.isArray(sheet.entries) || sheet.entries.length === 0) continue
      const key = `${KEY_SHEET}_${sheet.date}`
      if (!memoryStore.has(key)) memoryStore.set(key, JSON.stringify(sheet.entries))
    }
  } catch (err) {
    console.error('[floor] preload all sheets failed', err)
  }
}

/** Prefetch one day's sheet into memory from DB (call after hydrate). */
export async function preloadFloorSheet(dateStr: string): Promise<void> {
  if (!isClient()) return
  const key = `${KEY_SHEET}_${dateStr}`
  if (memoryStore.has(key)) return
  const entries = await loadSheetFromDb(dateStr)
  if (entries) memoryStore.set(key, JSON.stringify(entries))
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

/** Prefetch every day of a month into memory (DB getSheet per date). */
export async function preloadMonthSheets(monthStr: string = PRODUCTION_TODAY_MONTH): Promise<void> {
  if (!isClient()) return
  const [y, m] = monthStr.split('-').map(Number)
  if (!y || !m) return
  const daysInMonth = new Date(y, m, 0).getDate()
  const todayDay =
    monthStr === PRODUCTION_TODAY_MONTH ? Number(PRODUCTION_TODAY.slice(-2)) : daysInMonth
  const lastDay = Math.min(daysInMonth, Math.max(todayDay, 1))
  await Promise.all(
    Array.from({ length: lastDay }, (_, i) => {
      const day = String(i + 1).padStart(2, '0')
      return preloadFloorSheet(`${monthStr}-${day}`)
    })
  )
}

class ProductionMastersService {
  getLooms(): LoomMaster[] {
    const stored = loadJson(KEY_LOOMS, seedLooms)
    const { list, changed } = completeLoomRoster(stored)
    const looms = list.map((l) => ({
      ...l,
      ...normalizeLoomPictures(l),
    }))
    if (changed && hydrated && isClient()) {
      saveJson(KEY_LOOMS, looms)
    }
    return looms
  }

  saveLooms(looms: LoomMaster[]) {
    saveJson(
      KEY_LOOMS,
      looms.map((l) => ({
        ...l,
        ...normalizeLoomPictures(l),
      }))
    )
  }

  updateLoom(
    loomNumber: number,
    patch: Partial<LoomMaster>,
    dateStr: string = PRODUCTION_TODAY
  ): LoomMaster[] {
    const looms = this.getLooms().map((l) => {
      if (l.loomNumber !== loomNumber) return l
      const statusChanged = patch.status && patch.status !== l.status
      const nextStatusSince = statusChanged
        ? patch.status === 'RUNNING'
          ? null
          : dateStr
        : patch.statusSince !== undefined
          ? patch.statusSince
          : l.statusSince

      const merged = {
        ...l,
        ...patch,
        statusSince: nextStatusSince,
        category: (patch.model || patch.category || l.category) as LoomCategory,
        model: (patch.model || patch.category || l.model) as LoomCategory,
      }
      // Keep pictureDataUrl in sync when pictureDataUrls is patched
      if (patch.pictureDataUrls) {
        Object.assign(merged, normalizeLoomPictures({ ...merged, pictureDataUrls: patch.pictureDataUrls }))
      } else if (patch.pictureDataUrl !== undefined && !patch.pictureDataUrls) {
        const rest = getLoomPictures(l).filter((u) => u !== patch.pictureDataUrl)
        Object.assign(
          merged,
          normalizeLoomPictures({
            ...merged,
            pictureDataUrls: [patch.pictureDataUrl, ...rest].filter(Boolean) as string[],
          })
        )
      } else {
        Object.assign(merged, normalizeLoomPictures(merged))
      }
      return merged
    })
    this.saveLooms(looms)

    // Keep Quality Master list order = loom allotment order (same as production sheet)
    if (patch.qualityId !== undefined) {
      this.saveQualities(orderQualitiesByLoomAllotment(this.getQualities(), looms))
    }

    // Quality / RPM change applies only to the day being edited. Older sheets stay as saved.
    if (patch.qualityId !== undefined || patch.defaultRpm !== undefined) {
      const loom = looms.find((l) => l.loomNumber === loomNumber)
      if (loom && this.peekSheetDay(dateStr)) {
        this.updateSheetEntry(dateStr, loomNumber, this.recipeForLoom(loom, dateStr))
      }
    }

    // Loom condition → Daily Entry from this date forward (each saved day, and any later day opened)
    if (patch.status) {
      const label = LOOM_STATUS_LABEL[patch.status] || patch.status
      const sheetPatch: Partial<DailyLoomProductionEntry> = {
        status: patch.status,
        remarks: patch.status === 'RUNNING' ? '' : label,
      }
      if (patch.status === 'BEAM_END' || patch.status === 'STOPPED' || patch.status === 'BEAM_CUT') {
        sheetPatch.rollerHours = 0
      }
      if (patch.status === 'BEAM_END' || patch.status === 'BEAM_CUT') {
        this.flagBeamEndFromLoom(loomNumber, dateStr)
        this.reconcileBeamEndsWithLooms(dateStr)
      }
      const today = getCalendarToday()
      const dates = new Set<string>([dateStr])
      for (const d of listPersistedSheetDates()) {
        if (d >= dateStr && d <= today) dates.add(d)
      }
      for (const d of [...dates].sort()) {
        const dayPatch =
          d === dateStr ? sheetPatch : { status: sheetPatch.status, remarks: sheetPatch.remarks }
        this.updateSheetEntry(d, loomNumber, dayPatch)
      }
    }

    return looms
  }

  /** Unmount beam on this loom → send to Sizing (empty) for rework. */
  private flagBeamEndFromLoom(loomNumber: number, dateStr: string): void {
    const loomKey = String(loomNumber)
    let changed = false
    const beams = this.getBeams().map((b) => {
      const onThisLoom =
        normalizeLoomRef(b.usedInLoom) === loomKey || Number(b.usedInLoom) === loomNumber
      if (!onThisLoom) return b
      changed = true
      return normalizeBeam({
        ...b,
        usedInLoom: null,
        location: 'SIZING',
        fillStatus: 'EMPTY',
        mountedOn: null,
        beamEndedOn: dateStr,
        endedFromLoom: loomKey,
      })
    })
    if (changed) this.saveBeams(beams)
  }

  /**
   * If any loom is already Beam End but a beam is still mounted on it
   * (legacy data / missed sync), unmount → Sizing + show Ended on Beam table.
   */
  reconcileBeamEndsWithLooms(dateStr: string): BeamMaster[] {
    const looms = this.getLooms().filter((l) => l.status === 'BEAM_END' || l.status === 'BEAM_CUT')
    if (looms.length === 0) return this.getBeams()
    let changed = false
    const beams = this.getBeams().map((b) => {
      const loom = looms.find((l) => beamOnLoom(b, l.loomNumber))
      if (!loom) return b
      changed = true
      return normalizeBeam({
        ...b,
        usedInLoom: null,
        location: 'SIZING',
        fillStatus: 'EMPTY',
        mountedOn: null,
        beamEndedOn: dateStr,
        endedFromLoom: String(loom.loomNumber),
      })
    })
    if (changed) this.saveBeams(beams)
    return this.getBeams()
  }

  addLoom(partial?: Partial<LoomMaster>): LoomMaster[] {
    const looms = this.getLooms()
    const nextNum = looms.reduce((m, l) => Math.max(m, l.loomNumber), 0) + 1
    const model = (partial?.model || 'G6200') as LoomCategory
    const pics = normalizeLoomPictures({
      loomNumber: nextNum,
      pictureDataUrl: partial?.pictureDataUrl,
      pictureDataUrls: partial?.pictureDataUrls,
    })
    looms.push({
      loomNumber: nextNum,
      name: partial?.name || `Loom ${nextNum}`,
      model,
      category: model,
      year: partial?.year ?? new Date().getFullYear(),
      ...pics,
      defaultRpm: partial?.defaultRpm ?? 340,
      shed: partial?.shed || 'Main Floor',
      isActive: partial?.isActive ?? true,
      status: partial?.status || 'RUNNING',
      qualityId: partial?.qualityId ?? null,
      weftYarnId: partial?.weftYarnId ?? null,
    })
    this.saveLooms(looms)
    return looms
  }

  deleteLoom(loomNumber: number): LoomMaster[] {
    const looms = this.getLooms().filter((l) => l.loomNumber !== loomNumber)
    this.saveLooms(looms)
    const beams = this.getBeams().map((b) => {
      if (String(b.usedInLoom) !== String(loomNumber)) return b
      return normalizeBeam({
        ...b,
        usedInLoom: null,
        location: 'STORE',
        mountedOn: null,
      })
    })
    this.saveBeams(beams)
    return looms
  }

  deleteBeam(beamNo: string): BeamMaster[] {
    const beams = this.getBeams().filter((b) => b.beamNo !== beamNo)
    this.saveBeams(beams)
    return beams
  }

  getBeams(): BeamMaster[] {
    return loadJson(KEY_BEAMS, seedBeams).map((b) => normalizeBeam(b))
  }

  saveBeams(beams: BeamMaster[]) {
    saveJson(KEY_BEAMS, beams.map((b) => normalizeBeam(b)))
  }

  updateBeam(beamNo: string, patch: Partial<BeamMaster>): BeamMaster[] {
    const beams = this.getBeams().map((b) => {
      if (b.beamNo !== beamNo) return b
      return normalizeBeam({ ...b, ...patch, beamNo })
    })
    this.saveBeams(beams)
    return beams
  }

  addBeam(partial: Partial<BeamMaster> & { beamNo: string }): BeamMaster[] {
    const beams = this.getBeams()
    if (beams.some((b) => b.beamNo === partial.beamNo)) {
      throw new Error(`Beam ${partial.beamNo} already exists`)
    }

    const loomNum =
      partial.usedInLoom != null && partial.usedInLoom !== ''
        ? Number(partial.usedInLoom)
        : NaN
    if (Number.isFinite(loomNum) && loomNum > 0) {
      const blocking = findMountedBeamOnLoom(beams, loomNum)
      if (blocking) {
        throw new Error(
          `Loom ${loomNum} pe pehle se Beam "${blocking.beamNo}" laga hai. Pehle us beam ko Store / Sizing pe shift karein, phir naya beam lagaen.`
        )
      }
    }

    beams.push(
      normalizeBeam({
        beamNo: partial.beamNo,
        warp: partial.warp || '',
        reed: partial.reed ?? 60,
        width: partial.width ?? 66,
        length: partial.length ?? 0,
        loomType: partial.loomType || 'G6200',
        fillStatus: partial.fillStatus || 'FULL',
        usedInLoom: partial.usedInLoom ?? null,
        location: partial.location,
        mountedOn: partial.mountedOn,
      })
    )
    this.saveBeams(beams)
    return this.getBeams()
  }

  /**
   * Mount beam on loom. Blocked only if another beam is already on that loom.
   * Loom status aap Looms tab se khud change kar sakte ho.
   */
  mountBeam(beamNo: string, loomNumber: number, dateStr: string = PRODUCTION_TODAY): MountBeamResult {
    const current = this.getBeams()
    const beam = current.find((b) => b.beamNo === beamNo)
    if (!beam) {
      return {
        ok: false,
        beams: current,
        loomNumber,
        message: `Beam "${beamNo}" nahi mila.`,
      }
    }

    const blocking = findMountedBeamOnLoom(current, loomNumber, beamNo)
    if (blocking) {
      return {
        ok: false,
        beams: current,
        loomNumber,
        blockingBeamNo: blocking.beamNo,
        message: `Loom ${loomNumber} pe pehle se Beam "${blocking.beamNo}" laga hai.\n\nPehle us beam ki location Store ya Sizing pe change karein, phir ye beam lagaen.`,
      }
    }

    const beams = current.map((b) => {
      if (b.beamNo === beamNo) {
        return normalizeBeam({
          ...b,
          usedInLoom: String(loomNumber),
          location: String(loomNumber),
          fillStatus: 'FULL',
          mountedOn: dateStr,
          beamEndedOn: null,
          endedFromLoom: null,
        })
      }
      return b
    })
    this.saveBeams(beams)
    return { ok: true, beams }
  }

  /** Beam wapas sizing se store me (FULL) — ab loom pe laga sakte ho. */
  receiveBeamFromSizing(beamNo: string): BeamMaster[] {
    return this.updateBeam(beamNo, {
      location: 'STORE',
      usedInLoom: null,
      fillStatus: 'FULL',
      mountedOn: null,
      beamEndedOn: null,
      endedFromLoom: null,
    })
  }

  /** Send beam to sizing (not on loom). */
  sendBeamToSizing(beamNo: string, dateStr?: string): BeamMaster[] {
    return this.updateBeam(beamNo, {
      usedInLoom: null,
      location: 'SIZING',
      mountedOn: null,
      fillStatus: 'EMPTY',
      beamEndedOn: dateStr || null,
    })
  }

  unmountBeam(beamNo: string, location: 'STORE' | 'SIZING' = 'STORE', dateStr?: string): BeamMaster[] {
    const patch: Partial<BeamMaster> = {
      usedInLoom: null,
      location,
      mountedOn: null,
      beamEndedOn: dateStr || null,
    }
    if (location === 'SIZING') patch.fillStatus = 'EMPTY'
    return this.updateBeam(beamNo, patch)
  }

  /**
   * Declare beam EMPTY: unmount + send to Sizing for rework.
   */
  declareBeamEmpty(beamNo: string, dateStr?: string): BeamMaster[] {
    const today = dateStr || PRODUCTION_TODAY
    return this.updateBeam(beamNo, {
      usedInLoom: null,
      location: 'SIZING',
      fillStatus: 'EMPTY',
      mountedOn: null,
      beamEndedOn: today,
      endedFromLoom: undefined,
    })
  }

  /** Clear "ended today" notes from previous days (keeps EMPTY / mounts as-is). */
  clearExpiredBeamEnds(asOfDate: string): BeamMaster[] {
    const beams = this.getBeams()
    let changed = false
    const next = beams.map((b) => {
      if (b.beamEndedOn && b.beamEndedOn < asOfDate) {
        changed = true
        return normalizeBeam({
          ...b,
          beamEndedOn: null,
          endedFromLoom: null,
        })
      }
      return b
    })
    if (changed) this.saveBeams(next)
    return next
  }

  getYarn(): YarnMaster[] {
    return loadJson(KEY_YARN, seedYarn).map((y) => withYarnWeights(y))
  }

  saveYarn(yarn: YarnMaster[]) {
    saveJson(KEY_YARN, yarn.map((y) => withYarnWeights(y)))
  }

  updateYarn(id: string, patch: Partial<YarnMaster>): YarnMaster[] {
    const yarn = this.getYarn().map((y) => {
      if (y.id !== id) return y
      const merged = { ...y, ...patch }
      if (patch.receivedLbs != null && patch.receivedKg == null) {
        merged.receivedKg = lbsToKg(patch.receivedLbs)
      }
      if (patch.issuedLbs != null && patch.issuedKg == null) {
        merged.issuedKg = lbsToKg(patch.issuedLbs)
      }
      if (patch.receivedKg != null) {
        merged.receivedLbs = kgToLbs(patch.receivedKg)
      }
      if (patch.issuedKg != null) {
        merged.issuedLbs = kgToLbs(patch.issuedKg)
      }
      return withYarnWeights(merged)
    })
    this.saveYarn(yarn)
    return yarn
  }

  addYarn(partial?: Partial<YarnMaster>): YarnMaster[] {
    const yarn = this.getYarn()
    yarn.unshift(
      withYarnWeights({
        id: `yarn-${Date.now()}`,
        yarnType: partial?.yarnType || 'New Yarn',
        bags: partial?.bags ?? 0,
        receivedKg: partial?.receivedKg ?? 0,
        issuedKg: partial?.issuedKg ?? 0,
      })
    )
    this.saveYarn(yarn)
    return yarn
  }

  deleteYarn(id: string): YarnMaster[] {
    const yarn = this.getYarn().filter((y) => y.id !== id)
    this.saveYarn(yarn)
    return yarn
  }

  getYarnIssuances(yarnId?: string): YarnLoomIssuance[] {
    const list = loadJson(KEY_YARN_ISSUANCE, seedYarnIssuances)
    if (yarnId) {
      return list.filter((i) => i.yarnId === yarnId)
    }
    return list
  }

  saveYarnIssuances(list: YarnLoomIssuance[]) {
    saveJson(KEY_YARN_ISSUANCE, list)
  }

  issueYarnToLoom(params: {
    yarnId: string
    loomNumber: number
    issuedKg: number
    pick: number
    dateStr?: string
  }): { yarn: YarnMaster[]; issuances: YarnLoomIssuance[] } {
    const { yarnId, loomNumber, issuedKg, pick, dateStr = PRODUCTION_TODAY } = params
    const yarns = this.getYarn()
    const targetYarn = yarns.find((y) => y.id === yarnId)
    if (!targetYarn) throw new Error('Yarn not found')

    const updatedIssued = Number(((targetYarn.issuedKg || 0) + issuedKg).toFixed(2))
    this.updateYarn(yarnId, { issuedKg: updatedIssued })

    const issuances = this.getYarnIssuances()
    const newIssuance: YarnLoomIssuance = {
      id: `iss-${Date.now()}`,
      yarnId,
      yarnType: targetYarn.yarnType,
      loomNumber,
      issuedKg,
      pick,
      date: dateStr,
      createdAt: new Date().toISOString(),
    }
    issuances.unshift(newIssuance)
    this.saveYarnIssuances(issuances)

    // Also record in complete movements ledger
    const movements = this.getYarnMovements()
    movements.unshift({
      id: `mov-iss-${Date.now()}`,
      type: 'OUTWARD',
      yarnId,
      yarnType: targetYarn.yarnType,
      date: dateStr,
      weightKg: issuedKg,
      weightLbs: kgToLbs(issuedKg),
      loomNumber,
      pick,
      createdAt: new Date().toISOString(),
    })
    this.saveYarnMovements(movements)

    this.updateLoom(loomNumber, { weftYarnId: yarnId }, dateStr)

    return {
      yarn: this.getYarn(),
      issuances,
    }
  }

  getYarnMovements(yarnId?: string): YarnMovementRecord[] {
    const list = loadJson(KEY_YARN_MOVEMENTS, seedYarnMovements)
    if (yarnId) {
      return list.filter((i) => i.yarnId === yarnId)
    }
    return list
  }

  saveYarnMovements(list: YarnMovementRecord[]) {
    saveJson(KEY_YARN_MOVEMENTS, list)
  }

  recordYarnInward(params: {
    yarnId?: string
    yarnType: string
    bags: number
    weightKg: number
    dateStr?: string
    lotOrSupplier?: string
  }): { yarn: YarnMaster[]; movements: YarnMovementRecord[] } {
    const { yarnType, bags, weightKg, dateStr = PRODUCTION_TODAY, lotOrSupplier } = params
    const yarns = this.getYarn()
    let target = yarns.find(
      (y) => (params.yarnId ? y.id === params.yarnId : y.yarnType.toLowerCase() === yarnType.toLowerCase())
    )

    if (target) {
      const updatedRec = Number(((target.receivedKg || 0) + weightKg).toFixed(2))
      const updatedBags = (target.bags || 0) + bags
      this.updateYarn(target.id, { receivedKg: updatedRec, bags: updatedBags })
    } else {
      const newYarn = withYarnWeights({
        id: `yarn-${Date.now()}`,
        yarnType,
        bags,
        receivedKg: weightKg,
        issuedKg: 0,
      })
      yarns.push(newYarn)
      this.saveYarn(yarns)
      target = newYarn
    }

    const movements = this.getYarnMovements()
    const newMov: YarnMovementRecord = {
      id: `mov-in-${Date.now()}`,
      type: 'INWARD',
      yarnId: target.id,
      yarnType: target.yarnType,
      date: dateStr,
      weightKg,
      weightLbs: kgToLbs(weightKg),
      bags,
      lotOrSupplier: lotOrSupplier || 'Warehouse Inward',
      createdAt: new Date().toISOString(),
    }
    movements.unshift(newMov)
    this.saveYarnMovements(movements)

    return {
      yarn: this.getYarn(),
      movements,
    }
  }

  getQualities(): QualityMaster[] {
    return loadJson(KEY_QUALITY, seedQualities).map(normalizeQuality)
  }

  /** Qualities ordered by loom allotment (Loom 1 → N). */
  getQualitiesOrdered(entries?: DailyLoomProductionEntry[]): QualityMaster[] {
    return orderQualitiesByLoomAllotment(this.getQualities(), this.getLooms(), entries)
  }

  saveQualities(qualities: QualityMaster[]) {
    saveJson(KEY_QUALITY, qualities)
  }

  updateQuality(
    id: string,
    patch: Partial<QualityMaster>,
    fromDate: string = getProductionToday()
  ): QualityMaster[] {
    const qualities = this.getQualities().map((q) => {
      if (q.id !== id) return q
      return normalizeQuality(applyMidRunYarnChange(q, patch, fromDate))
    })
    this.saveQualities(qualities)
    const recipeTouched =
      patch.name !== undefined ||
      patch.fabricType !== undefined ||
      patch.warpYarn !== undefined ||
      patch.weftYarn !== undefined ||
      patch.reed !== undefined ||
      patch.pick !== undefined ||
      patch.widthInch !== undefined ||
      patch.gsm !== undefined
    if (recipeTouched && this.peekSheetDay(fromDate)) {
      for (const loom of this.getLooms()) {
        if (loom.qualityId !== id) continue
        this.updateSheetEntry(fromDate, loom.loomNumber, this.recipeForLoom(loom, fromDate))
      }
    }
    return qualities
  }

  addQuality(partial?: Partial<QualityMaster>): QualityMaster[] {
    const qualities = this.getQualities()
    qualities.push(
      normalizeQuality({
        id: `q-${Date.now()}`,
        name: partial?.name || 'New Quality',
        fabricType: partial?.fabricType || 'Suiting',
        warpYarn: partial?.warpYarn != null ? partial.warpYarn : '20/1',
        weftYarn: partial?.weftYarn != null ? partial.weftYarn : '20/1',
        reed: partial?.reed ?? 120,
        pick: partial?.pick ?? 60,
        widthInch: partial?.widthInch ?? 66,
        gsm: partial?.gsm !== undefined ? Number(Number(partial.gsm).toFixed(2)) : 0,
        status: partial?.status ?? 'ACTIVE',
        endedOn: partial?.endedOn ?? null,
      })
    )
    this.saveQualities(qualities)
    return qualities
  }

  endQuality(id: string, endedOn: string): QualityMaster[] {
    return this.updateQuality(id, { status: 'ENDED', endedOn })
  }

  restartQuality(id: string): QualityMaster[] {
    return this.updateQuality(id, { status: 'ACTIVE', endedOn: null })
  }

  deleteQuality(id: string): QualityMaster[] {
    const qualities = this.getQualities().filter((q) => q.id !== id)
    this.saveQualities(qualities)
    return qualities
  }

  private sheetKey(dateStr: string) {
    return `${KEY_SHEET}_${dateStr}`
  }

  /** True when a production sheet was explicitly saved/seeded for this date (not a view-only rebuild). */
  hasPersistedSheet(dateStr: string): boolean {
    return this.peekSheetDay(dateStr) != null
  }

  private peekSheetDay(dateStr: string): DailyLoomProductionEntry[] | null {
    const key = this.sheetKey(dateStr)
    try {
      const raw = memoryStore.get(key)
      if (raw) return JSON.parse(raw) as DailyLoomProductionEntry[]
    } catch {
      // ignore
    }
    return null
  }

  /**
   * Load saved meters for a day. Prefer persisted sheet; for past dates without a DB sheet,
   * fall back to Excel history. Never invent a blank "today" file just by opening the date.
   */
  private loadSheetDay(dateStr: string): DailyLoomProductionEntry[] {
    const peeked = this.peekSheetDay(dateStr)
    if (peeked) return peeked
    if (dateStr < PRODUCTION_TODAY) {
      return getExcelDailyLoomsForDate(dateStr)
    }
    return []
  }

  /** Latest saved lot for this loom before `dateStr`. Empty string is kept; missing day returns null. */
  private carriedLot(dateStr: string, loomNumber: number): string | null {
    const priorDates = listPersistedSheetDates().filter((d) => d < dateStr)
    const priorDate = priorDates.length ? priorDates[priorDates.length - 1] : shiftProductionDate(dateStr, -1)
    const rows =
      this.peekSheetDay(priorDate) ??
      (priorDate < getProductionToday() ? getExcelDailyLoomsForDate(priorDate) : null)
    const row = rows?.find((e) => e.loomNumber === loomNumber)
    if (!row) return null
    return row.lot || ''
  }

  /** Quality recipe as it is right now on the loom. Used only for the day being edited or a brand-new day. */
  private recipeForLoom(loom: LoomMaster, dateStr: string): Partial<DailyLoomProductionEntry> {
    const quality = this.getQualities().find((q) => q.id === loom.qualityId) || null
    const beam = this.getBeams().find((b) => beamOnLoom(b, loom.loomNumber))
    const yarns = this.getYarn()
    const issuances = this.getYarnIssuances()
    const loomIss = issuances.find((iss) => iss.loomNumber === loom.loomNumber)
    const weft =
      (loomIss ? yarns.find((y) => y.id === loomIss.yarnId) : null) ||
      yarns.find((y) => y.id === loom.weftYarnId)
    const yarnRecipe = yarnRecipeForDate(quality, dateStr)
    return {
      qualityName: quality?.name || '—',
      fabricType: quality?.fabricType || '',
      warpYarn: yarnRecipe?.warpYarn || beam?.warp || '',
      weftYarn: yarnRecipe?.weftYarn || weft?.yarnType || '',
      rpm: loom.defaultRpm,
      reed: quality?.reed || beam?.reed || 60,
      pick: quality?.pick || loomIss?.pick || 60,
      widthInch: quality?.widthInch || beam?.width || 66,
      gsm: quality?.gsm ?? 0,
    }
  }

  /**
   * Build sheet from masters + preserved Actual A/B & Roller Hours.
   * Excel formulas:
   *   100% Running = RPM/Pick * 60/39.38 * RollerHours
   *   A+B = ActualA + ActualB
   *   Eff Running = (A+B) / 100%Running * 100
   *   Loss Running = 100%Running - (A+B)
   *   100% 24h = RPM/Pick * 60/39.38 * 24
   *   Eff 24h = (A+B) / 100%24h * 100
   *   Loss 24h = 100%24h - (A+B)
   *
   * Viewing a date does NOT create a blank DB/local sheet. Persist only when:
   * - a sheet already exists for that date, or
   * - `{ persist: true }` (Start New Day / first edit).
   */
  buildSheetForDate(
    dateStr: string = PRODUCTION_TODAY,
    opts?: { persist?: boolean; skipPersist?: boolean }
  ): DailyLoomProductionEntry[] {
    const looms = this.getLooms()
    const beams = this.getBeams()
    const hadPersisted = this.peekSheetDay(dateStr) != null
    const prevByLoom = new Map(this.loadSheetDay(dateStr).map((e) => [e.loomNumber, e]))

    const entries = looms.map((loom) => {
      const prev = prevByLoom.get(loom.loomNumber)
      const beam = beams.find((b) => beamOnLoom(b, loom.loomNumber))
      const live = this.recipeForLoom(loom, dateStr)
      // A saved day keeps its own quality and lot. A new day copies yesterday's lot and uses today's quality.
      const pick = prev ? prev.pick || live.pick || 60 : live.pick || 60
      const reed = prev ? prev.reed || live.reed || 60 : live.reed || 60
      const rpm = prev ? prev.rpm || live.rpm || loom.defaultRpm : live.rpm || loom.defaultRpm
      const masterStatus = (loom.status || 'RUNNING') as LoomStatus
      const since = loom.statusSince || null
      const masterApplies = since ? dateStr >= since : masterStatus !== 'RUNNING'
      const masterLabel =
        masterStatus === 'RUNNING' ? '' : LOOM_STATUS_LABEL[masterStatus] || masterStatus
      const prevRemarks = prev?.remarks || ''
      const prevIsStatusLabel =
        !prevRemarks.trim() ||
        (Object.values(LOOM_STATUS_LABEL) as string[]).some(
          (label) => label.toLowerCase() === prevRemarks.trim().toLowerCase()
        )
      // From statusSince onward the Looms table is the source; earlier days keep their own remarks
      const remarks = masterApplies
        ? prevIsStatusLabel
          ? masterLabel
          : prevRemarks
        : prevRemarks
      const status = masterApplies
        ? masterStatus
        : resolveLoomCondition(prev?.status, prevRemarks)

      const rollerHours =
        prev?.rollerHours != null
          ? prev.rollerHours
          : status === 'BEAM_END' || status === 'STOPPED' || dateStr >= PRODUCTION_TODAY
            ? 0
            : 24
      const shiftA = prev?.shiftAMeters ?? 0
      const shiftB = prev?.shiftBMeters ?? 0

      const metrics = calculateProductionMetrics({
        rpm,
        runningHours: rollerHours,
        pick,
        shiftAMeters: shiftA,
        shiftBMeters: shiftB,
      })
      const carriedLot = this.carriedLot(dateStr, loom.loomNumber)

      return {
        id: `PROD-${dateStr}-${loom.loomNumber}`,
        date: dateStr,
        loomNumber: loom.loomNumber,
        category: prev?.category || loom.category,
        model: prev?.model || loom.model,
        qualityName: prev ? prev.qualityName || '—' : live.qualityName || '—',
        fabricType: prev ? prev.fabricType || '' : live.fabricType || '',
        warpYarn: prev ? prev.warpYarn || '' : live.warpYarn || '',
        weftYarn: prev ? prev.weftYarn || '' : live.weftYarn || '',
        rpm,
        reed,
        pick,
        widthInch: prev ? prev.widthInch || live.widthInch || 66 : live.widthInch || 66,
        gsm: prev ? (prev.gsm ?? 0) : (live.gsm ?? 0),
        rollerHours,
        runningHours: rollerHours,
        runningTheoretical: metrics.theoreticalMeters,
        shiftAMeters: shiftA,
        shiftBMeters: shiftB,
        totalMeters: metrics.totalMeters,
        efficiencyPercentage: metrics.efficiencyPercentage,
        stopLossMeters: metrics.stopLossMeters,
        theoretical24h: metrics.theoretical24h,
        efficiency24h: metrics.efficiency24h,
        loss24h: metrics.loss24h,
        status,
        remarks,
        lot: prev ? prev.lot || '' : carriedLot != null ? carriedLot : beam?.beamNo || '',
      } satisfies DailyLoomProductionEntry
    })

    entries.sort((a, b) => a.loomNumber - b.loomNumber)
    if (!opts?.skipPersist && (opts?.persist || hadPersisted)) {
      saveJson(this.sheetKey(dateStr), entries)
    }
    return entries
  }

  updateSheetEntry(
    dateStr: string,
    loomNumber: number,
    patch: Partial<DailyLoomProductionEntry>,
    editorName?: string
  ): DailyLoomProductionEntry[] {
    const current = this.buildSheetForDate(dateStr, { skipPersist: true })
    let updatedLoom: DailyLoomProductionEntry | null = null
    const next = current.map((e) => {
      if (e.loomNumber !== loomNumber) return e
      const merged = {
        ...e,
        ...patch,
        lastEditedBy: editorName || e.lastEditedBy || 'Floor Operator',
        lastEditedAt: new Date().toISOString(),
      }
      const rollerHours = merged.rollerHours ?? merged.runningHours ?? 0
      const metrics = calculateProductionMetrics({
        rpm: merged.rpm,
        runningHours: rollerHours,
        pick: merged.pick || 60,
        shiftAMeters: merged.shiftAMeters || 0,
        shiftBMeters: merged.shiftBMeters || 0,
      })
      const result: DailyLoomProductionEntry = {
        ...merged,
        rollerHours,
        runningHours: rollerHours,
        runningTheoretical: metrics.theoreticalMeters,
        totalMeters: metrics.totalMeters,
        efficiencyPercentage: metrics.efficiencyPercentage,
        stopLossMeters: metrics.stopLossMeters,
        theoretical24h: metrics.theoretical24h,
        efficiency24h: metrics.efficiency24h,
        loss24h: metrics.loss24h,
      }
      updatedLoom = result
      return result
    })

    // Save the patched day once, so an older rebuild cannot put today's quality onto another day.
    saveJson(this.sheetKey(dateStr), next)

    // Row-level persist to DB (prevents overwriting other looms)
    if (updatedLoom) {
      void persistLoomEntry(dateStr, loomNumber, updatedLoom)
    }

    return next
  }

  async submitSheetForApproval(dateStr: string): Promise<DailyLoomProductionEntry[]> {
    if (!isClient()) return this.buildSheetForDate(dateStr)
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submitForApproval', date: dateStr }),
    })
    const data = await res.json()
    if (data.ok && Array.isArray(data.entries)) {
      memoryStore.set(this.sheetKey(dateStr), JSON.stringify(data.entries))
      return data.entries
    }
    return this.buildSheetForDate(dateStr)
  }

  async approveSheet(dateStr: string): Promise<DailyLoomProductionEntry[]> {
    if (!isClient()) return this.buildSheetForDate(dateStr)
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approveSheet', date: dateStr }),
    })
    const data = await res.json()
    if (data.ok && Array.isArray(data.entries)) {
      memoryStore.set(this.sheetKey(dateStr), JSON.stringify(data.entries))
      return data.entries
    }
    if (!data.ok) {
      throw new Error(data.error || 'Approval failed')
    }
    return this.buildSheetForDate(dateStr)
  }

  async unlockSheet(dateStr: string): Promise<DailyLoomProductionEntry[]> {
    if (!isClient()) return this.buildSheetForDate(dateStr)
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unlockSheet', date: dateStr }),
    })
    const data = await res.json()
    if (data.ok && Array.isArray(data.entries)) {
      memoryStore.set(this.sheetKey(dateStr), JSON.stringify(data.entries))
      return data.entries
    }
    if (!data.ok) {
      throw new Error(data.error || 'Unlock failed')
    }
    return this.buildSheetForDate(dateStr)
  }

  startNewDay(dateStr: string): DailyLoomProductionEntry[] {
    // Clear yesterday's "beam ended today" notes; blank Actual A/B for new day
    this.clearExpiredBeamEnds(dateStr)
    if (isClient()) {
      try {
        removeStoreKey(this.sheetKey(dateStr))
      } catch {
        // ignore
      }
    }
    return this.buildSheetForDate(dateStr, { persist: true })
  }

  /**
   * Loom × day meters for Total tracking — only real floor sheets (seeded / started days).
   * Days without a persisted sheet stay empty (UI shows —).
   */
  buildMonthlyMatrix(monthStr: string = PRODUCTION_TODAY_MONTH): {
    days: MonthlyMatrixDay[]
    loomTotals: Record<number, number>
    grandTotalMeters: number
    avgPerDay: number
  } {
    const [y, m] = monthStr.split('-').map(Number)
    const daysInMonth = y && m ? new Date(y, m, 0).getDate() : 30
    const todayDay =
      monthStr === PRODUCTION_TODAY_MONTH ? Number(PRODUCTION_TODAY.slice(-2)) : daysInMonth
    const lastDay = Math.min(daysInMonth, Math.max(todayDay || 1, 1))

    const loomNumbers = this.getLooms()
      .filter((l) => l.isActive)
      .map((l) => l.loomNumber)
      .sort((a, b) => a - b)

    const loomTotals: Record<number, number> = {}
    loomNumbers.forEach((n) => {
      loomTotals[n] = 0
    })

    const days: MonthlyMatrixDay[] = []
    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`
      const peeked = this.peekSheetDay(dateStr)
      const loomMeters: Record<number, number> = {}
      loomNumbers.forEach((n) => {
        loomMeters[n] = 0
      })
      let totalMeters = 0
      let entries = peeked
      let hasSheet = peeked != null && peeked.length > 0

      // Seeded yesterday sheet: allow Excel dailyHistory if DB sheet not hydrated yet
      if (!hasSheet && dateStr === PRODUCTION_YESTERDAY) {
        const excel = getExcelDailyLoomsForDate(dateStr)
        const anyMeters = excel.some(
          (e) =>
            (Number(e.totalMeters) || 0) > 0 ||
            (Number(e.shiftAMeters) || 0) + (Number(e.shiftBMeters) || 0) > 0
        )
        if (anyMeters) {
          entries = excel
          hasSheet = true
        }
      }

      if (hasSheet && entries) {
        for (const e of entries) {
          const meters =
            e.totalMeters != null
              ? Number(e.totalMeters) || 0
              : (Number(e.shiftAMeters) || 0) + (Number(e.shiftBMeters) || 0)
          loomMeters[e.loomNumber] = meters
          loomTotals[e.loomNumber] = (loomTotals[e.loomNumber] || 0) + meters
          totalMeters += meters
        }
      }

      days.push({ day, date: dateStr, totalMeters, loomMeters, hasSheet })
    }

    const daysWithSheet = days.filter((d) => d.hasSheet).length
    const grandTotalMeters = days.reduce((s, d) => s + (d.totalMeters || 0), 0)
    return {
      days,
      loomTotals,
      grandTotalMeters,
      avgPerDay: daysWithSheet > 0 ? grandTotalMeters / daysWithSheet : 0,
    }
  }
}

export const productionMastersService = new ProductionMastersService()
