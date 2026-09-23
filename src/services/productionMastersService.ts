import { LoomCategory, LoomStatus } from '@/types/loom'
import { calculateProductionMetrics, DailyLoomProductionEntry } from '@/types/production'
import { INITIAL_34_LOOMS_CONFIG } from '@/constants/looms-init'
import { getExcelBeamStock, getExcelWeftStock, getExcelDailyLoomsForDate } from '@/data/productionData'
import { PRODUCTION_TODAY } from '@/constants/productionCalendar'
import { LOOM_STATUS_LABEL } from '@/constants/loomConditions'

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

function withYarnWeights(partial: Partial<YarnMaster> & { yarnType: string; id: string }): YarnMaster {
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
      date: '2026-08-30',
      createdAt: '2026-08-30T09:15:00Z',
    },
    {
      id: 'iss-14',
      yarnId: 'yarn-1',
      yarnType: '20/1 Pv China',
      loomNumber: 15,
      issuedKg: 100,
      pick: 60,
      date: '2026-08-25',
      createdAt: '2026-08-25T11:00:00Z',
    },
    {
      id: 'iss-15',
      yarnId: 'yarn-2',
      yarnType: '45/1-Pv-China',
      loomNumber: 16,
      issuedKg: 90,
      pick: 95,
      date: '2026-08-20',
      createdAt: '2026-08-20T07:30:00Z',
    },
    {
      id: 'iss-16',
      yarnId: 'yarn-4',
      yarnType: '24/1 Pv China',
      loomNumber: 18,
      issuedKg: 110,
      pick: 64,
      date: '2026-08-15',
      createdAt: '2026-08-15T08:45:00Z',
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
      date: '2026-08-28',
      weightKg: 750,
      weightLbs: kgToLbs(750),
      bags: 30,
      lotOrSupplier: 'Lot #405 · Master Spinning',
      createdAt: '2026-08-28T10:00:00Z',
    },
    {
      id: 'mov-in-9',
      type: 'INWARD',
      yarnId: 'yarn-3',
      yarnType: '30/1 Pv China',
      date: '2026-08-18',
      weightKg: 875,
      weightLbs: kgToLbs(875),
      bags: 35,
      lotOrSupplier: 'Lot #308 · Crescent',
      createdAt: '2026-08-18T08:00:00Z',
    },
    {
      id: 'mov-in-10',
      type: 'INWARD',
      yarnId: 'yarn-2',
      yarnType: '45/1-Pv-China',
      date: '2026-08-10',
      weightKg: 850,
      weightLbs: kgToLbs(850),
      bags: 34,
      lotOrSupplier: 'Lot #204 · Sapphire',
      createdAt: '2026-08-10T09:30:00Z',
    },
    {
      id: 'mov-in-11',
      type: 'INWARD',
      yarnId: 'yarn-1',
      yarnType: '20/1 Pv China',
      date: '2026-08-02',
      weightKg: 800,
      weightLbs: kgToLbs(800),
      bags: 32,
      lotOrSupplier: 'Lot #101 · Nishat Mills',
      createdAt: '2026-08-02T07:45:00Z',
    },
  ]

  return [...inward, ...outward].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
}

function loadJson<T>(key: string, fallback: () => T): T {
  if (isClient()) {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw) as T
    } catch {
      // ignore
    }
  }
  return fallback()
}

function saveJson<T>(key: string, value: T) {
  if (!isClient()) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

class ProductionMastersService {
  getLooms(): LoomMaster[] {
    const looms = loadJson(KEY_LOOMS, seedLooms)
    return looms.map((l) => ({
      ...l,
      ...normalizeLoomPictures(l),
    }))
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

    // Loom condition → today's Production Sheet (row color via status + remarks)
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
      this.updateSheetEntry(dateStr, loomNumber, sheetPatch)
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
    return loadJson(KEY_QUALITY, seedQualities)
  }

  saveQualities(qualities: QualityMaster[]) {
    saveJson(KEY_QUALITY, qualities)
  }

  updateQuality(id: string, patch: Partial<QualityMaster>): QualityMaster[] {
    const qualities = this.getQualities().map((q) => (q.id === id ? { ...q, ...patch } : q))
    this.saveQualities(qualities)
    return qualities
  }

  addQuality(partial?: Partial<QualityMaster>): QualityMaster[] {
    const qualities = this.getQualities()
    qualities.push({
      id: `q-${Date.now()}`,
      name: partial?.name || 'New Quality',
      fabricType: partial?.fabricType || 'Suiting',
      warpYarn: partial?.warpYarn || '20/1',
      weftYarn: partial?.weftYarn || '20/1',
      reed: partial?.reed ?? 120,
      pick: partial?.pick ?? 60,
      widthInch: partial?.widthInch ?? 66,
      gsm: partial?.gsm ?? 0,
    })
    this.saveQualities(qualities)
    return qualities
  }

  private sheetKey(dateStr: string) {
    return `${KEY_SHEET}_${dateStr}`
  }

  private loadSheetDay(dateStr: string): DailyLoomProductionEntry[] {
    return loadJson(this.sheetKey(dateStr), () => getExcelDailyLoomsForDate(dateStr))
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
   */
  buildSheetForDate(dateStr: string = PRODUCTION_TODAY): DailyLoomProductionEntry[] {
    const looms = this.getLooms().filter((l) => l.isActive)
    const beams = this.getBeams()
    const yarns = this.getYarn()
    const qualities = this.getQualities()
    const issuances = this.getYarnIssuances()
    const prevByLoom = new Map(this.loadSheetDay(dateStr).map((e) => [e.loomNumber, e]))

    // Find the latest yarn issuance for each loom
    const latestIssuanceByLoom = new Map<number, YarnLoomIssuance>()
    for (const iss of issuances) {
      if (!latestIssuanceByLoom.has(iss.loomNumber)) {
        latestIssuanceByLoom.set(iss.loomNumber, iss)
      }
    }

    const entries = looms.map((loom) => {
      const prev = prevByLoom.get(loom.loomNumber)
      const beam = beams.find((b) => beamOnLoom(b, loom.loomNumber))
      const quality = qualities.find((q) => q.id === loom.qualityId) || null
      const loomIss = latestIssuanceByLoom.get(loom.loomNumber)
      const weft = (loomIss ? yarns.find((y) => y.id === loomIss.yarnId) : null) || yarns.find((y) => y.id === loom.weftYarnId)
      const pick = loomIss?.pick || quality?.pick || 60
      const reed = beam?.reed || quality?.reed || 60
      const rpm = loom.defaultRpm
      const status = loom.status as LoomStatus

      const rollerHours =
        prev?.rollerHours != null
          ? prev.rollerHours
          : status === 'BEAM_END' || status === 'STOPPED'
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

      return {
        id: `PROD-${dateStr}-${loom.loomNumber}`,
        date: dateStr,
        loomNumber: loom.loomNumber,
        category: loom.category,
        model: loom.model,
        qualityName: quality?.name || '—',
        fabricType: quality?.fabricType || '',
        warpYarn: beam?.warp || quality?.warpYarn || '',
        weftYarn: weft?.yarnType || quality?.weftYarn || '',
        rpm,
        reed,
        pick,
        widthInch: beam?.width || quality?.widthInch || 66,
        gsm: quality?.gsm ?? prev?.gsm ?? 0,
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
        remarks:
          prev?.remarks ||
          (status && status !== 'RUNNING' ? LOOM_STATUS_LABEL[status] || '' : ''),
        lot: prev?.lot || beam?.beamNo || '',
      } satisfies DailyLoomProductionEntry
    })

    saveJson(this.sheetKey(dateStr), entries)
    return entries
  }

  updateSheetEntry(
    dateStr: string,
    loomNumber: number,
    patch: Partial<DailyLoomProductionEntry>
  ): DailyLoomProductionEntry[] {
    const current = this.buildSheetForDate(dateStr)
    const next = current.map((e) => {
      if (e.loomNumber !== loomNumber) return e
      const merged = { ...e, ...patch }
      const rollerHours = merged.rollerHours ?? merged.runningHours ?? 0
      const metrics = calculateProductionMetrics({
        rpm: merged.rpm,
        runningHours: rollerHours,
        pick: merged.pick || 60,
        shiftAMeters: merged.shiftAMeters || 0,
        shiftBMeters: merged.shiftBMeters || 0,
      })
      return {
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
    })
    saveJson(this.sheetKey(dateStr), next)
    return next
  }

  startNewDay(dateStr: string): DailyLoomProductionEntry[] {
    // Clear yesterday's "beam ended today" notes; blank Actual A/B for new day
    this.clearExpiredBeamEnds(dateStr)
    if (isClient()) {
      try {
        localStorage.removeItem(this.sheetKey(dateStr))
      } catch {
        // ignore
      }
    }
    return this.buildSheetForDate(dateStr)
  }
}

export const productionMastersService = new ProductionMastersService()
