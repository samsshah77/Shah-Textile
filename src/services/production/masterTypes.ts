/** Floor master records (looms, beams, yarn, qualities) and their normalizers. */
import { LoomCategory, LoomStatus } from '@/types/loom'

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
  /** Twin Beam loom: supports mounting up to 2 beams simultaneously */
  isTwinBeam?: boolean
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
  /** Linked Quality (warp recipe). Null = manual warp only. */
  qualityId?: string | null
  /** Sw# — links Daily Entry SW # column + Beam Track consumption (Excel). */
  swLot?: string | null
  /** Optional beam repeat (empty = OK). */
  beamRepeat?: string | null
  /** In the store: the loom it is kept behind (typed by the floor in-charge). Cleared once it leaves the store. */
  parkedNearLoom?: string | null
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
  /** NORMAL = arrival / issue; OPENING = carried-over stock; CORRECTION = a fixed total. */
  kind?: 'NORMAL' | 'OPENING' | 'CORRECTION'
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

export interface QualityLoomEnd {
  date: string
  loomNumber: number
}

export const QUALITY_FABRIC_TYPES = ['Suiting', 'Shirting'] as const
export type QualityFabricType = (typeof QUALITY_FABRIC_TYPES)[number]

export function normalizeFabricType(value?: string | null): QualityFabricType {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'shirting' || raw.includes('shirt')) return 'Shirting'
  return 'Suiting'
}

export interface QualityMaster {
  id: string
  name: string
  fabricType: string
  /** Weave plan text entered on quality (before reed). */
  weavePlan?: string
  /** Weft plan text (separate from weave plan / weft yarn). */
  weftPlan?: string
  warpYarn: string
  weftYarn: string
  reed: number
  pick: number
  widthInch: number
  gsm: number
  status?: 'ACTIVE' | 'HOLD' | 'ENDED'
  /** YYYY-MM-DD when quality was first added — hidden on earlier dates; meters count from this day. */
  createdOn?: string | null
  /** YYYY-MM-DD when quality was ended or put on hold (latest stamp) */
  endedOn?: string | null
  /** Per-loom end history (which loom ended on which date). */
  loomEnds?: QualityLoomEnd[]
  /** Mid-run warp/weft changes. Each row applies from `from` until the next one. */
  yarnHistory?: QualityYarnChange[]
}

function normalizeLoomEnds(raw: unknown): QualityLoomEnd[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const rows = raw
    .filter((e): e is QualityLoomEnd => Boolean(e && e.date && Number.isFinite(Number(e.loomNumber))))
    .map((e) => ({ date: String(e.date).slice(0, 10), loomNumber: Number(e.loomNumber) }))
  return rows.length ? rows : undefined
}

export type QualityLifecycleStatus = 'ACTIVE' | 'HOLD' | 'ENDED'

export function normalizeQualityStatus(status?: string | null): QualityLifecycleStatus {
  if (status === 'ENDED') return 'ENDED'
  if (status === 'HOLD') return 'HOLD'
  return 'ACTIVE'
}

export function normalizeQuality(q: QualityMaster): QualityMaster {
  const status = normalizeQualityStatus(q.status)
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
    fabricType: q.fabricType ? String(q.fabricType) : 'Suiting',
    weavePlan: q.weavePlan != null ? String(q.weavePlan) : '',
    weftPlan: q.weftPlan != null ? String(q.weftPlan) : '',
    status,
    createdOn: q.createdOn ? String(q.createdOn).slice(0, 10) : null,
    endedOn: status === 'ACTIVE' ? null : q.endedOn ?? null,
    loomEnds: normalizeLoomEnds(q.loomEnds),
    yarnHistory,
  }
}
