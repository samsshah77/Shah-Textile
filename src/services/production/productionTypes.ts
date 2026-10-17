import { LoomCategory, LoomStatus } from '@/types/loom'
export {
  normalizeBeamLotKey,
  buildBeamTrackFromEntries,
  beamDailyEntryLot,
  formatSwLotForDailyEntry,
  displaySwLotPlain,
  parseLotKind,
  composeLot,
} from '@/services/beamTrack'
export type { BeamTrackResult, BeamTrackDay, LotKind } from '@/services/beamTrack'

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
  /** YYYY-MM-DD when current qualityId was assigned on this loom */
  qualityAssignedOn?: string | null
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

/** Date-bound specification history (pick, reed, width, gsm, yarn) from this date onward. Earlier days keep previous specs. */
export interface QualitySpecChange {
  from: string // YYYY-MM-DD
  pick: number
  reed: number
  widthInch: number
  gsm: number
  warpYarn?: string
  weftYarn?: string
  weavePlan?: string
  note?: string
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

export type QualityLifecycleStatus = 'ACTIVE' | 'HOLD' | 'ENDED'

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
  /** Per-loom end history (which loom ended on which date). Persisted with the quality. */
  loomEnds?: QualityLoomEnd[]
  /** Mid-run warp/weft changes. Kept for legacy rows; new changes are also recorded in specHistory. */
  yarnHistory?: QualityYarnChange[]
  /** Mid-run specification changes (pick, reed, width, gsm, yarn). Each row applies from `from` until the next. */
  specHistory?: QualitySpecChange[]
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

export type LocalQualityEnd = {
  id: string
  endedOn: string
  name?: string
  loomEnds?: QualityLoomEnd[]
}
