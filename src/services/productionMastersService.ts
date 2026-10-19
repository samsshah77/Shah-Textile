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
  productionAccountingMonthBounds,
} from '@/constants/productionCalendar'
import { LOOM_STATUS_LABEL, resolveLoomCondition } from '@/constants/loomConditions'
import {
  beamDailyEntryLot,
  buildBeamTrackFromEntries,
  type BeamTrackResult,
} from '@/services/beamTrack'

export { normalizeBeamLotKey, buildBeamTrackFromEntries, beamDailyEntryLot, formatSwLotForDailyEntry, displaySwLotPlain, parseLotKind, composeLot } from '@/services/beamTrack'
export type { BeamTrackResult, BeamTrackDay } from '@/services/beamTrack'
export type { LotKind } from '@/services/beamTrack'

/** 1 kg = 2.2046 lbs → kg = lbs / 2.2046 */
export const LBS_PER_KG = 2.2046

const KEY_LOOMS = 'sara_textile_loom_master_v8'
const KEY_BEAMS = 'sara_textile_beam_master_v9'
const KEY_YARN = 'sara_textile_yarn_master_v8'
const KEY_YARN_ISSUANCE = 'sara_textile_yarn_issuance_v8'
const KEY_QUALITY = 'sara_textile_quality_master_v8'
const KEY_SHEET = 'sara_textile_production_sheet_v8'
const KEY_YARN_MOVEMENTS = 'sara_textile_yarn_movements_v8'
/** Browser backup so Quality Ends survive refresh if DB PUT is slow/fails. */
const KEY_QUALITY_ENDS_LOCAL = 'sara_textile_quality_ends_v1'
/** Browser backup for reused/new Active qualities until DB upsert confirms. */
const KEY_QUALITY_PENDING_LOCAL = 'sara_textile_quality_pending_v1'
/** Browser backup so Sw# survives refresh if DB patch is slow/fails. */
const KEY_BEAM_SWLOT_LOCAL = 'sara_textile_beam_swlot_v1'

function readLocalBeamSwLots(): Record<string, string> {
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

function writeLocalBeamSwLot(beamNo: string, swLot: string | null | undefined) {
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

function applyLocalBeamSwLots(beams: BeamMaster[]): BeamMaster[] {
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

/** Browser backup for newly added beams until DB upsert confirms. */
const KEY_BEAM_PENDING_LOCAL = 'sara_textile_beam_pending_v1'

function readLocalPendingBeams(): BeamMaster[] {
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

function writeLocalPendingBeam(beam: BeamMaster) {
  if (!isClient() || !beam?.beamNo) return
  try {
    const list = readLocalPendingBeams().filter((b) => b.beamNo !== beam.beamNo)
    list.push(normalizeBeam(beam))
    localStorage.setItem(KEY_BEAM_PENDING_LOCAL, JSON.stringify(list))
  } catch {
    // ignore
  }
}

function forgetLocalPendingBeam(beamNo: string) {
  if (!isClient() || !beamNo) return
  try {
    const list = readLocalPendingBeams().filter((b) => b.beamNo !== beamNo)
    if (list.length) localStorage.setItem(KEY_BEAM_PENDING_LOCAL, JSON.stringify(list))
    else localStorage.removeItem(KEY_BEAM_PENDING_LOCAL)
  } catch {
    // ignore
  }
}

function applyLocalPendingBeams(beams: BeamMaster[]): BeamMaster[] {
  const pending = readLocalPendingBeams()
  if (!pending.length) return beams
  const byNo = new Map(beams.map((b) => [b.beamNo, b]))
  for (const p of pending) {
    if (!byNo.has(p.beamNo)) byNo.set(p.beamNo, p)
  }
  return [...byNo.values()]
}


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

function normalizeQuality(q: QualityMaster): QualityMaster {
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

type LocalQualityEnd = {
  id: string
  endedOn: string
  name?: string
  loomEnds?: QualityLoomEnd[]
}

function readLocalQualityEnds(): LocalQualityEnd[] {
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

function writeLocalQualityEnds(rows: LocalQualityEnd[]) {
  if (!isClient()) return
  try {
    localStorage.setItem(KEY_QUALITY_ENDS_LOCAL, JSON.stringify(rows))
  } catch {
    // ignore quota
  }
}

function readLocalPendingQualities(): QualityMaster[] {
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

function writeLocalPendingQualities(rows: QualityMaster[]) {
  if (!isClient()) return
  try {
    localStorage.setItem(KEY_QUALITY_PENDING_LOCAL, JSON.stringify(rows))
  } catch {
    // ignore quota
  }
}

function rememberLocalPendingQuality(q: QualityMaster) {
  const next = readLocalPendingQualities().filter((e) => e.id !== q.id)
  next.push(normalizeQuality(q))
  writeLocalPendingQualities(next)
}

function forgetLocalPendingQuality(id: string) {
  writeLocalPendingQualities(readLocalPendingQualities().filter((e) => e.id !== id))
}

/** Merge pending reused/new Active rows onto DB list (refresh-safe). */
function applyLocalPendingQualities(qualities: QualityMaster[]): QualityMaster[] {
  const pending = readLocalPendingQualities()
  if (pending.length === 0) return qualities
  const byId = new Map(qualities.map((q) => [q.id, q]))
  let changed = false
  for (const p of pending) {
    const existing = byId.get(p.id)
    const pStatus = normalizeQualityStatus(p.status)
    if (!existing) {
      // New fork or Ends archive not yet in DB.
      byId.set(p.id, normalizeQuality(p))
      changed = true
      continue
    }
    const eStatus = normalizeQualityStatus(existing.status)
    // Same-id reuse: pending ACTIVE must win over stale DB/local ENDED.
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
      // Prefer pending createdOn until DB catches up — but do NOT drop pending here.
      // Early forget let hydrate overwrite Continue with stale ENDED before flush finished.
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

function mergeLoomEndLists(
  a: QualityLoomEnd[] | undefined,
  b: QualityLoomEnd[] | undefined
): QualityLoomEnd[] {
  const map = new Map<string, QualityLoomEnd>()
  for (const e of [...(a || []), ...(b || [])]) {
    map.set(`${e.date}:${e.loomNumber}`, e)
  }
  return [...map.values()].sort((x, y) =>
    x.date === y.date ? x.loomNumber - y.loomNumber : x.date.localeCompare(y.date)
  )
}

function rememberLocalQualityEnd(
  id: string,
  endedOn: string,
  name?: string,
  newLoomEnds?: QualityLoomEnd[]
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

function forgetLocalQualityEnd(id: string) {
  const next = readLocalQualityEnds().filter((e) => e.id !== id)
  writeLocalQualityEnds(next)
}

/** Merge browser-backed ends onto DB qualities (refresh-safe). */
function applyLocalQualityEnds(qualities: QualityMaster[]): QualityMaster[] {
  const ends = readLocalQualityEnds()
  if (ends.length === 0) return qualities
  // Same-id reuse: never force ENDED if a pending Active revive exists.
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

/** Loom numbers ended for this quality on a given date (or any date if date omitted). */
export function qualityLoomEndsOnDate(q: QualityMaster, dateStr?: string): number[] {
  const day = dateStr ? String(dateStr).slice(0, 10) : ''
  const rows = q.loomEnds || []
  const nums = rows
    .filter((e) => !day || e.date === day)
    .map((e) => e.loomNumber)
  return [...new Set(nums)].sort((a, b) => a - b)
}

/** If this loom's quality was ended/held on `dateStr`, return a short note for Looms UI. */
export function loomRecentQualityClearNote(
  loomNumber: number,
  qualities: QualityMaster[],
  dateStr: string
): { status: 'ENDED' | 'HOLD'; name: string } | null {
  const day = String(dateStr || '').slice(0, 10)
  if (!day) return null
  for (const q of qualities) {
    const status = normalizeQualityStatus(q.status)
    if (status !== 'ENDED' && status !== 'HOLD') continue
    const stamp = String(q.endedOn || '').slice(0, 10)
    if (!stamp) continue
    const visible =
      status === 'ENDED'
        ? qualityEndedVisibleOnDate(q, day)
        : stamp === day
    if (!visible) continue
    const onLoom =
      (q.loomEnds || []).some(
        (e) => e.loomNumber === loomNumber && (e.date === stamp || e.date === day)
      ) ||
      qualityLoomEndsOnDate(q, stamp).includes(loomNumber) ||
      qualityLoomEndsOnDate(q, day).includes(loomNumber)
    if (!onLoom) continue
    return { status, name: qualityDisplayName(q, qualities) }
  }
  return null
}

/** True if this loom already has an end recorded for the quality (any date). */
export function qualityLoomAlreadyEnded(q: QualityMaster, loomNumber: number): boolean {
  return (q.loomEnds || []).some((e) => e.loomNumber === loomNumber)
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

/** Same quality name is allowed when pick differs (Active runs only). */
export function qualityHasDuplicateName(q: QualityMaster, qualities: QualityMaster[]) {
  const key = qualityNameKey(q.name)
  if (!key) return false
  const activeSame = qualities.filter(
    (item) =>
      qualityNameKey(item.name) === key && normalizeQualityStatus(item.status) === 'ACTIVE'
  )
  if (activeSame.length <= 1) return false
  const picks = new Set(activeSame.map((item) => Number(item.pick)))
  return picks.size > 1
}

/** Live Active/Hold row with the same cleaned name (exclude one id). */
export function findLiveQualityByName(
  qualities: QualityMaster[],
  name: string,
  excludeId?: string
): QualityMaster | undefined {
  const key = qualityNameKey(name)
  if (!key) return undefined
  return qualities.find((item) => {
    if (excludeId && item.id === excludeId) return false
    const status = normalizeQualityStatus(item.status)
    if (status !== 'ACTIVE' && status !== 'HOLD') return false
    return qualityNameKey(item.name) === key
  })
}

/**
 * At most one Active per quality name. Older duplicates become ENDED
 * so Reuse / Continue never leave two SILVER-SHINE on Active.
 * Returns { qualities, remaps } where remaps maps demotedId → kept Active id.
 */
export function collapseDuplicateActiveQualities(
  list: QualityMaster[],
  endDay: string = getProductionToday()
): QualityMaster[] {
  const day = String(endDay || getProductionToday()).slice(0, 10)
  const byName = new Map<string, QualityMaster[]>()
  for (const q of list) {
    if (normalizeQualityStatus(q.status) !== 'ACTIVE') continue
    const key = qualityNameKey(q.name)
    if (!key) continue
    const arr = byName.get(key) || []
    arr.push(q)
    byName.set(key, arr)
  }
  const demote = new Map<string, string>() // demotedId → keptId
  for (const arr of byName.values()) {
    if (arr.length <= 1) continue
    const sorted = [...arr].sort((a, b) => {
      const ca = a.createdOn ? String(a.createdOn).slice(0, 10) : '1970-01-01'
      const cb = b.createdOn ? String(b.createdOn).slice(0, 10) : '1970-01-01'
      if (ca !== cb) return cb.localeCompare(ca)
      return b.id.localeCompare(a.id)
    })
    const kept = sorted[0]
    for (const older of sorted.slice(1)) demote.set(older.id, kept.id)
  }
  if (demote.size === 0) return list
  return list.map((q) =>
    demote.has(q.id)
      ? normalizeQuality({
          ...q,
          status: 'ENDED',
          endedOn: q.endedOn ? String(q.endedOn).slice(0, 10) : day,
        })
      : q
  )
}

/** Remap loom.qualityId after duplicate Active collapse (demoted → kept). */
export function remapLoomQualityIdsAfterCollapse(
  looms: LoomMaster[],
  before: QualityMaster[],
  after: QualityMaster[]
): LoomMaster[] {
  const beforeActive = before.filter((q) => normalizeQualityStatus(q.status) === 'ACTIVE')
  const afterByName = new Map<string, string>()
  for (const q of after) {
    if (normalizeQualityStatus(q.status) !== 'ACTIVE') continue
    afterByName.set(qualityNameKey(q.name), q.id)
  }
  let changed = false
  const next = looms.map((l) => {
    if (!l.qualityId) return l
    const stillActive = after.some(
      (q) => q.id === l.qualityId && normalizeQualityStatus(q.status) === 'ACTIVE'
    )
    if (stillActive) return l
    const was = beforeActive.find((q) => q.id === l.qualityId)
    if (!was) return l
    const keptId = afterByName.get(qualityNameKey(was.name))
    if (!keptId || keptId === l.qualityId) return l
    changed = true
    return { ...l, qualityId: keptId }
  })
  return changed ? next : looms
}

/** Display name on cards / looms — plain name only (Pick is shown in its own column). */
export function qualityDisplayName(q: QualityMaster, _qualities?: QualityMaster[]) {
  return q.name
}

export function matchQualityByNameAndPick(
  qualities: QualityMaster[],
  name: string,
  pick?: number
): QualityMaster | undefined {
  const named = qualities.filter((item) => qualityNameKey(item.name) === qualityNameKey(name))
  if (named.length === 0) return undefined

  const rank = (q: QualityMaster) => {
    const status = normalizeQualityStatus(q.status)
    if (status === 'ACTIVE') return 3
    if (status === 'HOLD') return 2
    return 1
  }
  const byPick =
    pick != null && named.length > 1
      ? named.filter((item) => Number(item.pick) === Number(pick))
      : named
  const pool = byPick.length > 0 ? byPick : named
  return [...pool].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return rb - ra
    const ca = a.createdOn ? String(a.createdOn).slice(0, 10) : '1970-01-01'
    const cb = b.createdOn ? String(b.createdOn).slice(0, 10) : '1970-01-01'
    if (ca !== cb) return cb.localeCompare(ca)
    return b.id.localeCompare(a.id)
  })[0]
}

/** Max same-day quality parts per loom (Part 1 + Part 2). */
export const MAX_SAME_DAY_QUALITY_SEGMENTS = 2

/** Same-day dual quality segment (1 = primary). Legacy rows without the field = 1. */
export function sheetSegmentIndex(entry?: { segmentIndex?: number | null } | null): number {
  const n = Number(entry?.segmentIndex)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

export function sheetRowKey(loomNumber: number, segmentIndex: number = 1): string {
  return `${loomNumber}:${sheetSegmentIndex({ segmentIndex })}`
}

export function sheetEntryId(dateStr: string, loomNumber: number, segmentIndex: number = 1): string {
  const seg = sheetSegmentIndex({ segmentIndex })
  return seg <= 1 ? `PROD-${dateStr}-${loomNumber}` : `PROD-${dateStr}-${loomNumber}-s${seg}`
}

function namedQualityOnRow(name?: string | null): boolean {
  const n = (name || '').trim()
  return n !== '' && n !== '—' && n !== '-'
}

/** Sheet remark when quality ended and loom has no new pose yet. */
export const QUALITY_ENDED_REMARK = 'Quality Ended'

export function isQualityEndedSheetRow(entry: { remarks?: string } | null | undefined): boolean {
  return /quality\s*ended/i.test(String(entry?.remarks || '').trim())
}

/**
 * True when this sheet row's quality run was ENDED before `day`
 * (next day must not keep pick/meters unless a new quality is assigned).
 * Uses name/pick match — does not rely on ownership "through end+1" window,
 * so seeded days after End still zero out.
 */
function qualityPoseEndedBeforeDay(
  entry: { qualityName?: string; pick?: number; date?: string; loomNumber?: number } | null | undefined,
  catalog: QualityMaster[],
  day: string
): boolean {
  if (!entry || !namedQualityOnRow(entry.qualityName)) return false
  const dayStr = String(day || '').slice(0, 10)
  if (!dayStr) return false

  const owner = qualityRunThatOwnsSheetEntry(
    { ...entry, date: entry.date || dayStr },
    catalog,
    dayStr
  )
  if (owner && normalizeQualityStatus(owner.status) === 'ENDED') {
    const stamp = owner.endedOn ? String(owner.endedOn).slice(0, 10) : ''
    if (stamp && stamp < dayStr) return true
  }

  // Fallback: ENDED catalog row same name (pick if duplicate names) closed before day.
  // Needed when ownership window drops the run after end+1, or loom still holds ended id.
  const eClean = qualityNameKey(entry.qualityName || '')
  if (!eClean) return false
  const nameCounts = new Map<string, number>()
  for (const q of catalog) {
    const key = qualityNameKey(q.name)
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1)
  }
  const entryPick = Number(entry.pick) || 0
  return catalog.some((q) => {
    if (normalizeQualityStatus(q.status) !== 'ENDED') return false
    if (qualityNameKey(q.name) !== eClean) return false
    if ((nameCounts.get(eClean) || 0) > 1 && entryPick > 0 && entryPick !== Number(q.pick)) {
      return false
    }
    const stamp = q.endedOn ? String(q.endedOn).slice(0, 10) : ''
    return Boolean(stamp && stamp < dayStr)
  })
}

function sortSheetEntries(entries: DailyLoomProductionEntry[]): DailyLoomProductionEntry[] {
  return [...entries].sort((a, b) =>
    a.loomNumber === b.loomNumber
      ? sheetSegmentIndex(a) - sheetSegmentIndex(b)
      : a.loomNumber - b.loomNumber
  )
}

function normalizeSheetEntry(entry: DailyLoomProductionEntry): DailyLoomProductionEntry {
  const segmentIndex = sheetSegmentIndex(entry)
  return {
    ...entry,
    segmentIndex,
    id: entry.id || sheetEntryId(entry.date, entry.loomNumber, segmentIndex),
  }
}

/** All quality run ids present on a loom for a day (every segment). */
export function qualityIdsOnLoomForDate(
  loom: LoomMaster,
  qualities: QualityMaster[],
  dayRows: DailyLoomProductionEntry[],
  sheetDate?: string
): string[] {
  const day = String(sheetDate || '').slice(0, 10)
  const isPastDay = Boolean(day && day !== getProductionToday())
  const rows = dayRows.filter((e) => e.loomNumber === loom.loomNumber)
  const ids: string[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    if (!namedQualityOnRow(row.qualityName)) continue
    const id =
      qualityRunThatOwnsSheetEntry({ ...row, date: day || row.date }, qualities, day || row.date)
        ?.id ??
      matchQualityByNameAndPick(qualities, row.qualityName, row.pick)?.id ??
      null
    if (id && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }

  if (ids.length > 0) return ids
  if (rows.length > 0 && isPastDay) return []
  if (isPastDay) return []

  if (loom.qualityId) {
    const masterQ = qualities.find((q) => q.id === loom.qualityId)
    const masterStatus = masterQ ? normalizeQualityStatus(masterQ.status) : null
    if (masterQ && (masterStatus === 'ACTIVE' || masterStatus === 'HOLD')) {
      return [loom.qualityId]
    }
  }
  return loom.qualityId ? [loom.qualityId] : []
}

/** Day-wise primary quality on a loom: segment 1 sheet row, else master (today only). */
export function qualityIdOnLoomForDate(
  loom: LoomMaster,
  qualities: QualityMaster[],
  dayRows: DailyLoomProductionEntry[],
  sheetDate?: string
): string | null {
  const ids = qualityIdsOnLoomForDate(loom, qualities, dayRows, sheetDate)
  return ids[0] ?? null
}

/** True when any segment on that loom/day belongs to this quality. */
export function loomHasQualityOnDate(
  loom: LoomMaster,
  qualityId: string,
  qualities: QualityMaster[],
  dayRows: DailyLoomProductionEntry[],
  sheetDate?: string
): boolean {
  return qualityIdsOnLoomForDate(loom, qualities, dayRows, sheetDate).includes(qualityId)
}

/**
 * Which quality *run* owns a sheet row when the same name is re-added / reassigned.
 * Latest `createdOn` that still covers that day wins — so Track/Overall start at 0 for new runs.
 *
 * End/Hold clears `qualityName` to "—" but keeps meters. Those rows still belong to the
 * closed run via `loomEnds` (date + loom) so Ends totals match pre-End / Continue meters.
 */
export function qualityRunThatOwnsSheetEntry(
  entry: { qualityName?: string; pick?: number; date?: string; loomNumber?: number; qualityId?: string },
  catalog: QualityMaster[],
  fallbackDate?: string
): QualityMaster | null {
  const day = String(entry.date || fallbackDate || '').slice(0, 10)
  if (!day) return null

  // Server-stamped id wins (exact run), as long as the row still carries that quality's name.
  if (entry.qualityId && entry.qualityName && entry.qualityName !== '—') {
    const byId = catalog.find((q) => q.id === entry.qualityId)
    if (byId && qualityNameKey(byId.name) === qualityNameKey(entry.qualityName)) return byId
  }

  // Cleared end-day rows: meters stay, name wiped — credit via loomEnds stamp.
  if (!entry.qualityName || entry.qualityName === '—') {
    const loomNumber = Number(entry.loomNumber)
    if (!Number.isFinite(loomNumber) || loomNumber <= 0) return null
    const stamped = catalog.filter((q) => {
      const status = normalizeQualityStatus(q.status)
      if (status !== 'ENDED' && status !== 'HOLD') return false
      return (q.loomEnds || []).some((e) => e.loomNumber === loomNumber && e.date === day)
    })
    if (stamped.length === 0) return null
    if (stamped.length === 1) return stamped[0]
    return [...stamped].sort((a, b) => {
      const ea = a.endedOn ? String(a.endedOn).slice(0, 10) : ''
      const eb = b.endedOn ? String(b.endedOn).slice(0, 10) : ''
      if (ea !== eb) return eb.localeCompare(ea)
      return b.id.localeCompare(a.id)
    })[0]
  }

  const eClean = qualityNameKey(entry.qualityName || '')
  if (!eClean) return null

  const nameCounts = new Map<string, number>()
  for (const q of catalog) {
    const key = qualityNameKey(q.name)
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1)
  }

  const candidates = catalog.filter((q) => {
    const qClean = qualityNameKey(q.name)
    // Exact cleaned name only — "PARCO" must not steal "PARCO PU" meters (substring false friends).
    if (eClean !== qClean) return false
    if ((nameCounts.get(qClean) || 0) > 1 && Number(entry.pick) !== Number(q.pick)) return false

    const status = normalizeQualityStatus(q.status)
    // Undated Active must not steal full history after reuse (zero-start).
    const createdOn = q.createdOn
      ? String(q.createdOn).slice(0, 10)
      : status === 'ACTIVE'
        ? day
        : '1970-01-01'
    if (day < createdOn) return false

    const stamp = q.endedOn ? String(q.endedOn).slice(0, 10) : null
    // ENDED runs stay on the next production day too (factory month 2→1 hisab).
    if (status === 'ENDED' && stamp) {
      const through = shiftProductionDate(stamp, 1)
      if (day > through) return false
    } else if (status === 'HOLD' && stamp && day > stamp) {
      return false
    }
    return true
  })

  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]
  return [...candidates].sort((a, b) => {
    const statusA = normalizeQualityStatus(a.status)
    const statusB = normalizeQualityStatus(b.status)
    // Prefer ENDED history over new Active — Reuse Track starts at zero same day.
    if (statusA === 'ENDED' && statusB === 'ACTIVE') return -1
    if (statusB === 'ENDED' && statusA === 'ACTIVE') return 1
    if (statusA === 'ACTIVE' && statusB !== 'ACTIVE') return -1
    if (statusB === 'ACTIVE' && statusA !== 'ACTIVE') return 1
    const ca = a.createdOn ? String(a.createdOn).slice(0, 10) : '1970-01-01'
    const cb = b.createdOn ? String(b.createdOn).slice(0, 10) : '1970-01-01'
    if (ca !== cb) return cb.localeCompare(ca)
    return b.id.localeCompare(a.id)
  })[0]
}

/**
 * Ends tab: keep closed qualities for the whole factory month (2 → next 1)
 * so month PDF / hisab can still list them after reuse.
 */
export function qualityEndedVisibleOnDate(
  q: Pick<QualityMaster, 'status' | 'endedOn'>,
  sheetDate: string
): boolean {
  if (normalizeQualityStatus(q.status) !== 'ENDED') return false
  const day = String(sheetDate || '').slice(0, 10)
  const stamp = q.endedOn ? String(q.endedOn).slice(0, 10) : ''
  if (!day || !stamp) return false
  const { from, to } = productionAccountingMonthBounds(day)
  return stamp >= from && stamp <= to
}

export function qualityRunOwnsSheetEntry(
  quality: QualityMaster,
  entry: { qualityName?: string; pick?: number; date?: string; loomNumber?: number },
  catalog: QualityMaster[],
  fallbackDate?: string
): boolean {
  const owner = qualityRunThatOwnsSheetEntry(entry, catalog, fallbackDate)
  return Boolean(owner && owner.id === quality.id)
}

/**
 * True when a HOLD quality should still appear on Active for a *past* day
 * (it was running that day; Hold day onward → Hold tab only).
 * History rows are read-only (H badge + orange BG) — Resume only from Hold tab
 * on hold date or any later day.
 */
export function qualityHeldButVisibleOnPastDay(
  q: QualityMaster,
  sheetDate: string
): boolean {
  if (normalizeQualityStatus(q.status) !== 'HOLD') return false
  const day = String(sheetDate || '').slice(0, 10)
  const stamp = q.endedOn ? String(q.endedOn).slice(0, 10) : ''
  if (!day || !stamp) return false
  // Hold day and after → Hold tab only. Before hold → history on Active.
  return day < stamp
}

/**
 * True when an ENDED quality should still appear on Active for a day it ran
 * (any day up to and including its End day; after that → Ends tab only).
 * History rows are read-only (E badge + muted BG).
 */
export function qualityEndedButVisibleOnPastDay(
  q: QualityMaster,
  sheetDate: string
): boolean {
  if (normalizeQualityStatus(q.status) !== 'ENDED') return false
  const day = String(sheetDate || '').slice(0, 10)
  const stamp = q.endedOn ? String(q.endedOn).slice(0, 10) : ''
  if (!day || !stamp) return false
  // Up to and including the End day it was running → stays on Active as read-only
  // history (E badge, muted BG). Only after the End day does it leave Active.
  return day <= stamp
}

/** HOLD or ENDED history row on Active for a past sheet date (read-only). */
export function qualityHistoryOnActivePastDay(
  q: QualityMaster,
  sheetDate: string
): boolean {
  return (
    qualityHeldButVisibleOnPastDay(q, sheetDate) ||
    qualityEndedButVisibleOnPastDay(q, sheetDate)
  )
}

/** Active tab on `sheetDate`: live Active, plus HOLD/ENDED history before stamp day. */
export function qualityActiveOnSheetDate(
  q: QualityMaster,
  sheetDate: string,
  dayRows: DailyLoomProductionEntry[],
  catalog: QualityMaster[]
): boolean {
  const day = String(sheetDate || '').slice(0, 10)
  const createdOn = q.createdOn ? String(q.createdOn).slice(0, 10) : null
  // New qualities do not appear on dates before they were created.
  if (createdOn && day && day < createdOn) {
    // Exception: already on that day's sheet (legacy / imported allotment).
    if (!dayRows.some((e) => sheetRowShowsQuality(e, q, catalog))) return false
  }
  const status = normalizeQualityStatus(q.status)
  if (status === 'ENDED') {
    return qualityEndedButVisibleOnPastDay(q, day)
  }
  if (status === 'HOLD') {
    return qualityHeldButVisibleOnPastDay(q, day)
  }
  return true
}

/** True when this quality is on at least one loom master row or today's sheet. */
export function qualityAssignedOnDay(
  q: QualityMaster,
  looms: LoomMaster[],
  dayRows: DailyLoomProductionEntry[],
  catalog: QualityMaster[]
): boolean {
  if (looms.some((l) => l.qualityId === q.id)) return true
  return dayRows.some((e) => sheetRowShowsQuality(e, q, catalog))
}

/** Day-wise RPM on a loom: sheet row for that date, else master default. */
export function rpmOnLoomForDate(
  loom: LoomMaster,
  dayRows: DailyLoomProductionEntry[]
): number {
  const row = dayRows.find((e) => e.loomNumber === loom.loomNumber)
  if (row && row.rpm != null && Number(row.rpm) > 0) return Number(row.rpm)
  return loom.defaultRpm || 0
}

/** Day-wise loom status: sheet row for that date, else master. */
export function statusOnLoomForDate(
  loom: LoomMaster,
  dayRows: DailyLoomProductionEntry[]
): LoomStatus {
  const row = dayRows.find((e) => e.loomNumber === loom.loomNumber)
  if (row) return resolveLoomCondition(row.status, row.remarks)
  return (loom.status || 'RUNNING') as LoomStatus
}

export function sheetRowShowsQuality(
  row: DailyLoomProductionEntry,
  quality: QualityMaster,
  catalog: QualityMaster[]
): boolean {
  const qClean = qualityNameKey(quality.name)
  const eClean = qualityNameKey(row.qualityName || '')
  if (!qClean || !eClean || row.qualityName === '—') return false
  // Exact cleaned name only — "PARCO" ≠ "PARCO PU".
  if (eClean !== qClean) return false
  const shared = catalog.filter((item) => qualityNameKey(item.name) === qClean).length > 1
  if (shared) return Number(row.pick) === Number(quality.pick)
  return true
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

/** All beams currently mounted on a given loom. */
export function getMountedBeamsOnLoom(
  beams: BeamMaster[],
  loomNumber: number,
  exceptBeamNo?: string
): BeamMaster[] {
  return beams.filter(
    (b) => beamOnLoom(b, loomNumber) && (!exceptBeamNo || b.beamNo !== exceptBeamNo)
  )
}

export function loomBeamCapacity(loom: { isTwinBeam?: boolean | null }): number {
  return loom.isTwinBeam ? 2 : 1
}

/** Single: free if 0 beams. Twin: free until 2 beams are mounted. */
export function loomHasFreeBeamSlot(
  loom: { loomNumber: number; isTwinBeam?: boolean | null },
  beams: BeamMaster[],
  exceptBeamNo?: string
): boolean {
  const mounted = getMountedBeamsOnLoom(beams, loom.loomNumber, exceptBeamNo)
  return mounted.length < loomBeamCapacity(loom)
}

/** Beam currently mounted on loom — blocks a second mount until first is moved (for single-beam looms). */
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
  // Keep free-form warp as entered (e.g. "45/1 Pv White+46/1 Pv Silver").
  if (!name) return ''
  return String(name).replace(/\s+/g, ' ').trim()
}

function normalizeBeam(b: Partial<BeamMaster> & { beamNo: string }): BeamMaster {
  const reed = b.reed ?? 0
  const width = b.width ?? 0
  const usedInLoom = normalizeLoomRef(b.usedInLoom as string | number | null | undefined)
  const fillStatus = b.fillStatus || (usedInLoom ? 'FULL' : b.status === 'EMPTY' ? 'EMPTY' : 'FULL')
  const status: BeamMaster['status'] = usedInLoom ? 'MOUNTED' : fillStatus
  const location = usedInLoom ? String(usedInLoom) : (b.location || 'STORE')
  const qualityId =
    b.qualityId != null && String(b.qualityId).trim() !== '' ? String(b.qualityId).trim() : null
  const swLot =
    b.swLot != null && String(b.swLot).trim() !== '' ? String(b.swLot).trim() : null
  const beamRepeat =
    b.beamRepeat != null && String(b.beamRepeat).trim() !== ''
      ? String(b.beamRepeat).trim()
      : null
  return {
    beamNo: b.beamNo,
    warp: simplifyWarpName(b.warp),
    reed,
    width,
    totalThreads:
      b.totalThreads != null && Number.isFinite(Number(b.totalThreads))
        ? Math.round(Number(b.totalThreads))
        : calcTotalThreads(reed, width),
    length: b.length ?? 0,
    loomType: b.loomType || 'G6200',
    fillStatus,
    usedInLoom,
    status,
    location,
    mountedOn: usedInLoom ? (b.mountedOn || '2026-09-15') : null,
    beamEndedOn: b.beamEndedOn ?? null,
    endedFromLoom: normalizeLoomRef(b.endedFromLoom as string | number | null | undefined),
    qualityId,
    swLot,
    beamRepeat,
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
      isTwinBeam: false,
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
      qualityId: null,
      swLot: null,
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
      id: "q-parcopv-p60",
      name: "PARCOPV",
      fabricType: "Suiting",
      warpYarn: "20/1-Pv-China",
      weftYarn: "20/1-Pv-China",
      reed: 120,
      pick: 60,
      widthInch: 66,
      gsm: 1.6,
    },
    {
      id: "q-design-2x1-p53",
      name: "DESIGN-2x1",
      fabricType: "Ripstop",
      warpYarn: "20/1-Pv-China",
      weftYarn: "20/1-Pv-China",
      reed: 66,
      pick: 53,
      widthInch: 66,
      gsm: 2.04,
    },
    {
      id: "q-harnai-p39",
      name: "HARNAI",
      fabricType: "Worsted Wool",
      warpYarn: "20/2-Pvt-Kohat",
      weftYarn: "300/2-Twisted",
      reed: 68,
      pick: 39,
      widthInch: 66,
      gsm: 2.03,
    },
    {
      id: "q-gul-ahmed-1x1-p92",
      name: "Gul-Ahmed-(1x1)",
      fabricType: "Fabrics",
      warpYarn: "45/1-Pv-White+46/1-Pv-Silver",
      weftYarn: "45/1-Pv-White+75/144-Twisted",
      reed: 82,
      pick: 92,
      widthInch: 66,
      gsm: 0.96,
    },
    {
      id: "q-silver-shine-p95",
      name: "SILVER-SHINE",
      fabricType: "Gabardine Suiting",
      warpYarn: "45/1-Pv-China",
      weftYarn: "45/1-Pv-China",
      reed: 120,
      pick: 95,
      widthInch: 66,
      gsm: 1.26,
    },
    {
      id: "q-gul-ahmed-2x2-p84",
      name: "Gul-Ahmed-(2x2)",
      fabricType: "Fabrics",
      warpYarn: "46/1-Pv-White+60/1-Pv-Silver",
      weftYarn: "45/1-Pv-White+60/1-Pv-Silver",
      reed: 84,
      pick: 84,
      widthInch: 66,
      gsm: 0.88,
    },
    {
      id: "q-dumdum-p36",
      name: "DUMDUM",
      fabricType: "Worsted Suiting",
      warpYarn: "20/2-Pvt-Ash",
      weftYarn: "20/3-Pvt-St-Ash",
      reed: 68,
      pick: 36,
      widthInch: 66,
      gsm: 2.36,
    },
    {
      id: "q-seven-eleven-p82",
      name: "SEVEN-ELEVEN",
      fabricType: "Suiting",
      warpYarn: "20/1-Pv-80/20-China",
      weftYarn: "40/1-Pv-65/35",
      reed: 82,
      pick: 82,
      widthInch: 66,
      gsm: 1.63,
    },
    {
      id: "q-decatize-p290",
      name: "DECATIZE",
      fabricType: "Suiting",
      warpYarn: "40/3-Cvc",
      weftYarn: "30/1-Cvc",
      reed: 37,
      pick: 290,
      widthInch: 76,
      gsm: 3.93,
    },
    {
      id: "q-herringbone-p60",
      name: "HERRINGBONE",
      fabricType: "NoName",
      warpYarn: "20/1-Pv-China",
      weftYarn: "30/1-PP",
      reed: 74,
      pick: 60,
      widthInch: 66,
      gsm: 1.51,
    },
    {
      id: "q-kaavish-p73",
      name: "KAAVISH",
      fabricType: "Shirting",
      warpYarn: "40/1-PP-China",
      weftYarn: "40/1-Pv-Grace+Fr-75/2",
      reed: 82,
      pick: 73,
      widthInch: 66,
      gsm: 1.11,
    },
    {
      id: "q-pakeeza-p95",
      name: "PAKEEZA",
      fabricType: "Shirting",
      warpYarn: "Fr-75 T",
      weftYarn: "45/1-Pv-China",
      reed: 100,
      pick: 95,
      widthInch: 66,
      gsm: 0.89,
    },
    {
      id: "q-burma-p63",
      name: "BURMA",
      fabricType: "Suiting",
      warpYarn: "Fr-157",
      weftYarn: "Fr-150-Twisted",
      reed: 120,
      pick: 63,
      widthInch: 66,
      gsm: 1.63,
    },
    {
      id: "q-ujala-p93",
      name: "UJALA",
      fabricType: "Shirting",
      warpYarn: "Fr-100",
      weftYarn: "45/1-Pv-China",
      reed: 100,
      pick: 93,
      widthInch: 66,
      gsm: 1.04,
    },
    {
      id: "q-nuvex-p82",
      name: "NUVEX",
      fabricType: "By-Gul-Ahmed",
      warpYarn: "30/1-Pv-65/35-Grace",
      weftYarn: "30/1-Pv-65/35-China",
      reed: 112,
      pick: 82,
      widthInch: 66,
      gsm: 1.74,
    },
    {
      id: "q-tibet-p58",
      name: "TIBET",
      fabricType: "Worsted Suiting",
      warpYarn: "Fr-150/2-Twisted",
      weftYarn: "20/1-Pv-China",
      reed: 68,
      pick: 58,
      widthInch: 66,
      gsm: 1.8,
    },
    {
      id: "q-vision-silvra-p76",
      name: "VISION-SILVRA",
      fabricType: "By-Gul-Ahmed",
      warpYarn: "36/1-Pv-AA",
      weftYarn: "36/1-Pv-Ash",
      reed: 88,
      pick: 76,
      widthInch: 66,
      gsm: 1.24,
    },
    {
      id: "q-vision-silvra-p82",
      name: "VISION-SILVRA",
      fabricType: "By-Gul-Ahmed",
      warpYarn: "36/1-Pv-AA",
      weftYarn: "36/1-Pv-Ash",
      reed: 82,
      pick: 82,
      widthInch: 66,
      gsm: 1.26,
    },
    {
      id: "q-golden-eye-p82",
      name: "GOLDEN-EYE",
      fabricType: "Shirting",
      warpYarn: "Fr-150-Twisted",
      weftYarn: "36/1-Pv-AA",
      reed: 82,
      pick: 82,
      widthInch: 66,
      gsm: 1.21,
    }
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

/**
 * Tell the user when the server refused a floor save (blocked by a data-safety guard,
 * locked by approval, or no permission). Previously failures were only logged to the
 * console, so people believed unsaved work was saved.
 */
function notifyFloorSaveProblem(status: number, data: unknown) {
  if (!isClient()) return
  if (status !== 403 && status !== 409 && status !== 423) return
  const message =
    (data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : '') || 'This change was not saved.'
  try {
    window.dispatchEvent(new CustomEvent('floor:save-problem', { detail: { status, message } }))
  } catch {
    // ignore
  }
}

async function persistKey(key: string, value: unknown): Promise<boolean> {
  if (!isClient()) return false
  // Never push seed/fallback masters before DB hydrate — that wiped swLot on refresh.
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
      notifyFloorSaveProblem(res.status, data)
      console.error('[floor] persist failed', key, res.status, data)
      return false
    }
    return true
  } catch (err) {
    console.error('[floor] persist failed', key, err)
    return false
  }
}


async function persistBeamPatch(
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
      notifyFloorSaveProblem(res.status, data)
      console.error('[floor] patchBeam failed', beamNo, res.status, data)
      return false
    }
    return true
  } catch (err) {
    console.error('[floor] patchBeam failed', beamNo, err)
    return false
  }
}

/** Persist one full beam row (Add Beam) — does not rewrite/delete sibling beams. */
async function persistBeamUpsert(beam: BeamMaster): Promise<boolean> {
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
      notifyFloorSaveProblem(res.status, data)
      console.error('[floor] upsertBeam failed', beam.beamNo, res.status, data)
      return false
    }
    return true
  } catch (err) {
    console.error('[floor] upsertBeam failed', beam.beamNo, err)
    return false
  }
}

async function persistBeamDelete(beamNo: string): Promise<boolean> {
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
      notifyFloorSaveProblem(res.status, data)
      console.error('[floor] deleteBeam failed', beamNo, res.status, data)
      return false
    }
    return true
  } catch (err) {
    console.error('[floor] deleteBeam failed', beamNo, err)
    return false
  }
}

/** Patch one quality ENDED/ACTIVE in DB so refresh keeps the record. */
async function persistQualityStatus(
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
      notifyFloorSaveProblem(res.status, data)
      console.error('[floor] patchQualityStatus failed', id, res.status, data)
      return false
    }
    return true
  } catch (err) {
    console.error('[floor] patchQualityStatus failed', id, err)
    return false
  }
}

/** Insert/update one quality row — reuse fork must hit DB or refresh drops Active. */
async function persistQualityUpsert(quality: QualityMaster): Promise<boolean> {
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
      notifyFloorSaveProblem(res.status, data)
      console.error('[floor] upsertQuality failed', quality.id, res.status, data)
      return false
    }
    return true
  } catch (err) {
    console.error('[floor] upsertQuality failed', quality.id, err)
    return false
  }
}

/** Server-atomic reuse: keep ENDED + insert Active in one request. */
async function persistQualityReuse(
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
      notifyFloorSaveProblem(res.status, data)
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

async function persistLoomEntry(
  dateStr: string,
  loomNumber: number,
  entry: DailyLoomProductionEntry
): Promise<void> {
  if (!isClient()) return
  const stamped = normalizeSheetEntry({ ...entry, date: dateStr, loomNumber })
  try {
    const res = await fetch('/api/floor/store', {
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
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      notifyFloorSaveProblem(res.status, data)
      console.error('[floor] persist loom entry rejected', loomNumber, res.status, data)
    }
  } catch (err) {
    console.error('[floor] persist loom entry failed', loomNumber, err)
  }
}

async function persistDeleteLoomSegment(
  dateStr: string,
  loomNumber: number,
  segmentIndex: number
): Promise<void> {
  if (!isClient()) return
  const seg = sheetSegmentIndex({ segmentIndex })
  if (seg <= 1) return
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

function clearLegacyFloorLocalStorage() {
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
    // Old sheet snapshots in localStorage must not fight the DB.
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

function loadJson<T>(key: string, fallback: () => T): T {
  try {
    const raw = memoryStore.get(key)
    if (raw) return JSON.parse(raw) as T
  } catch {
    // ignore
  }
  // Legacy localStorage: read once into memory only. Never push to DB from here —
  // that was wiping live qualities/sheets with stale browser seed data.
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
        // Re-apply browser-backed Quality Ends + pending reused Actives if DB lagged.
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
              // Never re-stamp ENDED over a same-id Active reuse still in pending.
              if (q.status === 'ENDED' && q.endedOn && !pendingActiveIds.has(q.id)) {
                void persistQualityStatus(q.id, 'ENDED', q.endedOn)
              }
            }
            // Push any still-pending rows (Active reuse / new quality) to DB.
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
                // Drop pending only once DB has confirmed the row (or upsert just wrote it).
                if (alreadyInDb || okUpsert || okPatch) forgetLocalPendingQuality(p.id)
              })()
            }
          }
        } catch {
          // ignore merge errors
        }
        clearLegacyFloorLocalStorage()
        // Re-apply browser Sw# backup + pending new beams if DB lagged.
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
            // Flush any beams that only exist in browser pending backup.
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

/** Re-pull beams/looms/qualities from DB (Track needs fresh swLot after seed). */
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
    // Keep browser Sw# + pending new beams if server row is still empty / missing.
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

/** Load every saved production day into memory so Quality overall / Beam Track see all days. */
export async function preloadAllFloorSheets(): Promise<void> {
  if (!isClient()) return
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
      // Always take DB truth — stale in-memory sheets (wrong lot / 0 meters) were blocking Track.
      memoryStore.set(key, JSON.stringify(sheet.entries))
    }
  } catch (err) {
    console.error('[floor] preload all sheets failed', err)
  }
}

/** Prefetch one day's sheet into memory from DB (call after hydrate). */
export async function preloadFloorSheet(
  dateStr: string,
  opts?: { force?: boolean }
): Promise<void> {
  if (!isClient()) return
  const key = `${KEY_SHEET}_${dateStr}`
  // Always prefer DB when forcing (date change / after seed) — stale memory was
  // wiping named dual-quality rows (e.g. DUM DUM seg1 → "—") on rebuild+persist.
  if (!opts?.force && memoryStore.has(key)) return
  const entries = await loadSheetFromDb(dateStr)
  if (entries) memoryStore.set(key, JSON.stringify(entries.map(normalizeSheetEntry)))
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

/** Saved sheet rows for one date with live editor rows overlaid by loom + segment. */
export function mergeSheetEntriesForDate(
  dateStr: string,
  live: DailyLoomProductionEntry[] = []
): DailyLoomProductionEntry[] {
  const saved = listPersistedSheetEntries()
    .filter((e) => e.date === dateStr)
    .map(normalizeSheetEntry)
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

/**
 * Production days for Quality Overall / Track gate, as-of `sheetDate`.
 * Includes all persisted days up to and including the selected day (today = full run;
 * past day = cut later days so yesterday does not still show today's meters).
 * Selected day is replaced by saved + live merge.
 */
export function mergedSheetEntriesForTotals(
  sheetDate: string,
  live: DailyLoomProductionEntry[] = []
): DailyLoomProductionEntry[] {
  const day = String(sheetDate || '').slice(0, 10)
  const otherDays = listPersistedSheetEntries().filter((e) => {
    const d = String(e.date || '').slice(0, 10)
    if (!d || d === day) return false
    // Cap at selected date — no future days in Overall.
    if (day && d > day) return false
    return true
  })
  return [...otherDays, ...mergeSheetEntriesForDate(sheetDate, live)]
}

function monthLastEnteredDay(monthStr: string) {
  const [y, m] = monthStr.split('-').map(Number)
  const daysInMonth = y && m ? new Date(y, m, 0).getDate() : 30
  const cal = getCalendarToday()
  const cap = monthStr === cal.slice(0, 7) ? Number(cal.slice(-2)) : daysInMonth
  return Math.min(daysInMonth, Math.max(cap || 1, 1))
}

/** Prefetch every day of a month into memory (DB getSheet per date). */
export async function preloadMonthSheets(monthStr: string = PRODUCTION_TODAY_MONTH): Promise<void> {
  if (!isClient()) return
  const [y, m] = monthStr.split('-').map(Number)
  if (!y || !m) return
  const lastDay = monthLastEnteredDay(monthStr)
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

  /** Last forward-fill days skipped because another quality was already on the loom. */
  private lastForwardFillSkips: {
    date: string
    qualityName: string
    loomNumber: number
  }[] = []

  consumeLastForwardFillSkips(): {
    date: string
    qualityName: string
    loomNumber: number
  }[] {
    const out = this.lastForwardFillSkips
    this.lastForwardFillSkips = []
    return out
  }

  /**
   * Quality pose from `fromDate` forward through today on one loom.
   * Days before `fromDate` stay untouched.
   * Start day: replace Part 1 (dropdown change) — never auto-create Part 2.
   * Part 2 only via `addQualitySegmentOnDay` (loom +P button).
   * Later days: fill only if empty/cleared/same quality — never overwrite a busy day.
   */
  private applyQualityOnLoomFromDate(
    loomNumber: number,
    qualityId: string | null,
    fromDate: string,
    baseLoom: LoomMaster
  ): void {
    const from = String(fromDate || '').slice(0, 10)
    const today = getProductionToday()
    if (!from || from > today) return

    this.lastForwardFillSkips = []
    const catalog = this.getQualities()
    const loomForRecipe: LoomMaster = { ...baseLoom, qualityId }
    let cursor = from
    while (cursor <= today) {
      const sheet = this.peekSheetDay(cursor)
      const hasSheet = sheet != null
      // Always write the start day; later days only when a sheet already exists.
      if (cursor === from || hasSheet) {
        if (qualityId) {
          this.writeQualityPoseOnDay(cursor, loomNumber, qualityId, loomForRecipe, catalog, {
            allowNewSegment: false,
            replacePrimary: cursor === from,
          })
        } else {
          // Unassign: clear only segments that still show the *previous* loom quality.
          // Never wipe a same-day dual primary (e.g. DUM DUM) while Bunny sits on part 2.
          const sheet = this.peekSheetDay(cursor) || []
          const prevQ = catalog.find((q) => q.id === baseLoom.qualityId) || null
          const segs = sheet.filter((e) => e.loomNumber === loomNumber)
          const clearPatch = {
            qualityName: '—',
            fabricType: '',
            warpYarn: '',
            weftYarn: '',
            _clearQuality: true,
          } as Partial<DailyLoomProductionEntry> & { _clearQuality?: boolean }
          if (segs.length === 0) {
            this.updateSheetEntry(cursor, loomNumber, clearPatch, undefined, 1)
          } else {
            for (const row of segs) {
              if (prevQ && !sheetRowShowsQuality(row, prevQ, catalog)) continue
              this.updateSheetEntry(
                cursor,
                loomNumber,
                clearPatch,
                undefined,
                sheetSegmentIndex(row)
              )
            }
          }
        }
      }
      cursor = shiftProductionDate(cursor, 1)
    }
  }

  /**
   * Write a quality onto a loom for one day.
   * - Matching segment → update that segment.
   * - Empty / same primary → update Part 1.
   * - `replacePrimary` (loom dropdown): overwrite Part 1 — never auto Part 2.
   * - `allowNewSegment` (+P only): add Part 2 while keeping Part 1.
   * - Else (forward fill): skip busy days.
   */
  private writeQualityPoseOnDay(
    dateStr: string,
    loomNumber: number,
    qualityId: string,
    loomForRecipe: LoomMaster,
    catalog: QualityMaster[],
    opts: { allowNewSegment: boolean; replacePrimary?: boolean }
  ): void {
    const sheet = this.peekSheetDay(dateStr) || this.buildSheetForDate(dateStr, { skipPersist: true })
    const rows = sheet.filter((e) => e.loomNumber === loomNumber)
    const recipe = this.recipeForLoom(loomForRecipe, dateStr)
    // New / replacement quality: always drop stale "Quality Ended" (grey + remark).
    const posePatch = (
      target: DailyLoomProductionEntry | null | undefined
    ): Partial<DailyLoomProductionEntry> => {
      const primaryRow =
        rows.find((r) => sheetSegmentIndex(r) === 1) || rows[0] || null
      const clearEnded =
        isQualityEndedSheetRow(target) || isQualityEndedSheetRow(primaryRow)
      return {
        ...recipe,
        ...(clearEnded ? { remarks: '' } : {}),
      }
    }

    const existingForQuality = rows.find((row) => {
      if (!namedQualityOnRow(row.qualityName)) return false
      const owner = qualityRunThatOwnsSheetEntry({ ...row, date: dateStr }, catalog, dateStr)
      return owner?.id === qualityId
    })
    if (existingForQuality) {
      this.updateSheetEntry(
        dateStr,
        loomNumber,
        posePatch(existingForQuality),
        undefined,
        sheetSegmentIndex(existingForQuality)
      )
      return
    }

    const primary =
      rows.find((r) => sheetSegmentIndex(r) === 1) || rows[0] || null
    const primaryNamed = primary && namedQualityOnRow(primary.qualityName)
    const primaryOwner = primaryNamed
      ? qualityRunThatOwnsSheetEntry({ ...primary!, date: dateStr }, catalog, dateStr)
      : null

    if (!primaryNamed || !primaryOwner || primaryOwner.id === qualityId) {
      this.updateSheetEntry(dateStr, loomNumber, posePatch(primary), undefined, 1)
      return
    }

    // Loom dropdown quality change: replace Part 1 only (Part 2 stays if already added via +P).
    if (opts.replacePrimary) {
      this.updateSheetEntry(dateStr, loomNumber, posePatch(primary), undefined, 1)
      return
    }

    // Busy with another quality — forward-fill skip (unless explicit +P Part 2).
    if (!opts.allowNewSegment) {
      this.lastForwardFillSkips.push({
        date: dateStr,
        qualityName: primaryOwner.name,
        loomNumber,
      })
      return
    }

    // Same-day dual quality via +P only: keep Part 1, add Part 2.
    const maxSeg = rows.reduce((m, r) => Math.max(m, sheetSegmentIndex(r)), 0)
    if (maxSeg >= MAX_SAME_DAY_QUALITY_SEGMENTS) {
      this.lastForwardFillSkips.push({
        date: dateStr,
        qualityName: primaryOwner.name,
        loomNumber,
      })
      return
    }
    const segmentIndex = Math.max(2, maxSeg + 1)
    this.updateSheetEntry(dateStr, loomNumber, posePatch(null), undefined, segmentIndex)
  }

  updateLoom(
    loomNumber: number,
    patch: Partial<LoomMaster>,
    dateStr: string = PRODUCTION_TODAY
  ): LoomMaster[] {
    const previousLoom = this.getLooms().find((l) => l.loomNumber === loomNumber)
    const previousQualityId = previousLoom?.qualityId ?? null
    const isPastProductionDay = dateStr !== getProductionToday()

    let workingPatch: Partial<LoomMaster> = { ...patch }
    if (workingPatch.qualityId) {
      const resolved = this.resolveQualityIdForAssign(workingPatch.qualityId, dateStr)
      if (resolved && resolved !== workingPatch.qualityId) {
        workingPatch = { ...workingPatch, qualityId: resolved }
      }
    }

    // A quality run cannot be put on a loom before the day it started — otherwise the
    // days between an old End and the new start get back-filled with the new quality.
    if (workingPatch.qualityId) {
      const target = this.getQualities().find((q) => q.id === workingPatch.qualityId)
      const startDay = target?.createdOn ? String(target.createdOn).slice(0, 10) : ''
      const day = String(dateStr || '').slice(0, 10)
      if (target && startDay && day && day < startDay) {
        notifyFloorSaveProblem(409, {
          error:
            `"${target.name}" ki start date ${startDay} hai — ${day} par loom ${loomNumber} par nahi lag sakti. ` +
            `Upar se ${startDay} (ya baad ki) date chunein, ya Quality Master mein start date theek karein.`,
        })
        return this.getLooms()
      }
    }

    const qualityAssign = workingPatch.qualityId !== undefined
    const dayOnlyRpm = isPastProductionDay && workingPatch.defaultRpm !== undefined
    const dayOnlyStatus = isPastProductionDay && workingPatch.status !== undefined

    // Past days: RPM / status stay on that day's sheet only (not forward-filled).
    if (dayOnlyRpm || dayOnlyStatus) {
      const current = previousLoom
      if (current) {
        const sheetPatch: Partial<DailyLoomProductionEntry> = {}
        if (dayOnlyRpm) {
          sheetPatch.rpm = workingPatch.defaultRpm
        }
        if (dayOnlyStatus && workingPatch.status) {
          const label = LOOM_STATUS_LABEL[workingPatch.status] || workingPatch.status
          sheetPatch.status = workingPatch.status
          sheetPatch.remarks = workingPatch.status === 'RUNNING' ? '' : label
          // Do NOT zero rollerHours / meters — Beam End only marks status; day's punch stays.
          if (workingPatch.status === 'BEAM_END' || workingPatch.status === 'BEAM_CUT') {
            this.flagBeamEndFromLoom(loomNumber, dateStr)
            this.reconcileBeamEndsWithLooms(dateStr)
          }
        }
        if (Object.keys(sheetPatch).length > 0) {
          this.updateSheetEntry(dateStr, loomNumber, sheetPatch)
        }
      }
    }

    // Quality: from selected date forward to today (sheets). Days before stay as-is.
    // Later days that already have another quality are skipped (busy loom).
    if (qualityAssign && previousLoom) {
      this.applyQualityOnLoomFromDate(
        loomNumber,
        workingPatch.qualityId ?? null,
        dateStr,
        previousLoom
      )
    }

    const masterPatch: Partial<LoomMaster> = { ...workingPatch }
    if (dayOnlyRpm) delete masterPatch.defaultRpm
    if (dayOnlyStatus) delete masterPatch.status
    // If today still belongs to another quality (skipped forward-fill), do not steal live master.
    if (qualityAssign && workingPatch.qualityId) {
      const today = getProductionToday()
      const todaySkipped = this.lastForwardFillSkips.some(
        (s) => s.loomNumber === loomNumber && s.date === today
      )
      if (todaySkipped) {
        delete masterPatch.qualityId
      } else {
        const todaySheet = this.peekSheetDay(today)
        const todayRow = todaySheet?.find((e) => e.loomNumber === loomNumber)
        if (todayRow) {
          const owner = qualityRunThatOwnsSheetEntry(
            { ...todayRow, date: today },
            this.getQualities(),
            today
          )
          if (owner && owner.id !== workingPatch.qualityId) {
            delete masterPatch.qualityId
          }
        }
      }
    }

    const hasMasterChange = Object.keys(masterPatch).length > 0
    const looms = hasMasterChange
      ? this.getLooms().map((l) => {
          if (l.loomNumber !== loomNumber) return l
          const statusChanged = masterPatch.status && masterPatch.status !== l.status
          const nextStatusSince = statusChanged
            ? masterPatch.status === 'RUNNING'
              ? null
              : dateStr
            : masterPatch.statusSince !== undefined
              ? masterPatch.statusSince
              : l.statusSince

          const merged = {
            ...l,
            ...masterPatch,
            statusSince: nextStatusSince,
            category: (masterPatch.model || masterPatch.category || l.category) as LoomCategory,
            model: (masterPatch.model || masterPatch.category || l.model) as LoomCategory,
          }
          if (masterPatch.pictureDataUrls) {
            Object.assign(
              merged,
              normalizeLoomPictures({ ...merged, pictureDataUrls: masterPatch.pictureDataUrls })
            )
          } else if (masterPatch.pictureDataUrl !== undefined && !masterPatch.pictureDataUrls) {
            const rest = getLoomPictures(l).filter((u) => u !== masterPatch.pictureDataUrl)
            Object.assign(
              merged,
              normalizeLoomPictures({
                ...merged,
                pictureDataUrls: [masterPatch.pictureDataUrl, ...rest].filter(Boolean) as string[],
              })
            )
          } else {
            Object.assign(merged, normalizeLoomPictures(merged))
          }
          return merged
        })
      : this.getLooms()

    if (hasMasterChange) {
      this.saveLooms(looms)
    }

    // Keep Quality Master list order = loom allotment order (same as production sheet)
    if (masterPatch.qualityId !== undefined) {
      this.saveQualities(orderQualitiesByLoomAllotment(this.getQualities(), looms))
    }

    // RPM on today (quality sheets already written by applyQualityOnLoomFromDate).
    if (masterPatch.defaultRpm !== undefined && !qualityAssign) {
      const loom = looms.find((l) => l.loomNumber === loomNumber)
      if (loom) {
        this.updateSheetEntry(dateStr, loomNumber, { rpm: masterPatch.defaultRpm })
      }
    } else if (masterPatch.defaultRpm !== undefined && qualityAssign) {
      this.updateSheetEntry(dateStr, loomNumber, { rpm: masterPatch.defaultRpm })
    }

    // Clear quality from loom → if no looms left on that quality, mark ENDED.
    // Only on today assign — mid-month past pose must not end a run still on earlier days.
    // Assigning HOLD → resume same run. ENDED is forked above (Ends row stays).
    if (masterPatch.qualityId !== undefined && !isPastProductionDay) {
      if (previousQualityId && previousQualityId !== masterPatch.qualityId) {
        const stillOn = looms.some((l) => l.qualityId === previousQualityId)
        if (!stillOn) {
          const prevQ = this.getQualities().find((q) => q.id === previousQualityId)
          if (prevQ && (prevQ.status ?? 'ACTIVE') !== 'ENDED') {
            this.updateQuality(
              previousQualityId,
              {
                status: 'ENDED',
                endedOn: dateStr,
              },
              dateStr
            )
          }
        }
      }
      if (masterPatch.qualityId) {
        const nextQ = this.getQualities().find((q) => q.id === masterPatch.qualityId)
        if (nextQ && nextQ.status === 'HOLD') {
          this.updateQuality(masterPatch.qualityId, { status: 'ACTIVE', endedOn: null }, dateStr)
        }
      }
    } else if (masterPatch.qualityId && isPastProductionDay) {
      const nextQ = this.getQualities().find((q) => q.id === masterPatch.qualityId)
      if (nextQ && nextQ.status === 'HOLD') {
        this.updateQuality(masterPatch.qualityId, { status: 'ACTIVE', endedOn: null }, dateStr)
      }
    }

    // Loom condition — only this production day (and master when editing today).
    // Do not rewrite past or other future days; next day inherits via sheet carry-forward.
    if (masterPatch.status) {
      const label = LOOM_STATUS_LABEL[masterPatch.status] || masterPatch.status
      const sheetPatch: Partial<DailyLoomProductionEntry> = {
        status: masterPatch.status,
        remarks: masterPatch.status === 'RUNNING' ? '' : label,
      }
      // Beam End / Stopped: status + remarks only — keep roller hours & A/B meters intact.
      if (masterPatch.status === 'BEAM_END' || masterPatch.status === 'BEAM_CUT') {
        this.flagBeamEndFromLoom(loomNumber, dateStr)
        this.reconcileBeamEndsWithLooms(dateStr)
      }
      this.updateSheetEntry(dateStr, loomNumber, sheetPatch)
    }

    return this.getLooms()
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
      isTwinBeam: Boolean(partial?.isTwinBeam),
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
    forgetLocalPendingBeam(beamNo)
    const beams = this.getBeams().filter((b) => b.beamNo !== beamNo)
    // Memory first; DB delete is explicit (avoid full-list stale wipe races).
    try {
      memoryStore.set(KEY_BEAMS, JSON.stringify(beams.map((b) => normalizeBeam(b))))
    } catch {
      // ignore
    }
    void persistBeamDelete(beamNo)
    void persistKey(KEY_BEAMS, beams)
    return beams
  }

  getBeams(): BeamMaster[] {
    const beams = loadJson(KEY_BEAMS, seedBeams).map((b) => normalizeBeam(b))
    return applyLocalBeamSwLots(applyLocalPendingBeams(beams)).map((b) => normalizeBeam(b))
  }

  saveBeams(beams: BeamMaster[]) {
    saveJson(KEY_BEAMS, beams.map((b) => normalizeBeam(b)))
  }

  updateBeam(
    beamNo: string,
    patch: Partial<BeamMaster>,
    opts?: { sheetDate?: string }
  ): BeamMaster[] {
    if (patch.swLot !== undefined) {
      writeLocalBeamSwLot(beamNo, patch.swLot)
    }
    const beams = this.getBeams().map((b) => {
      if (b.beamNo !== beamNo) return b
      return normalizeBeam({ ...b, ...patch, beamNo })
    })
    this.saveBeams(beams)
    const next = beams.find((b) => b.beamNo === beamNo)
    // Sw# must hit DB immediately — also stamps Daily Entry SW # when mounted.
    if (
      patch.swLot !== undefined ||
      patch.qualityId !== undefined ||
      patch.beamRepeat !== undefined ||
      patch.warp !== undefined ||
      patch.reed !== undefined ||
      patch.width !== undefined ||
      patch.length !== undefined ||
      patch.loomType !== undefined ||
      patch.totalThreads !== undefined
    ) {
      void persistBeamPatch(beamNo, {
        ...(patch.swLot !== undefined ? { swLot: next?.swLot ?? null } : {}),
        ...(patch.qualityId !== undefined ? { qualityId: next?.qualityId ?? null } : {}),
        ...(patch.beamRepeat !== undefined ? { beamRepeat: next?.beamRepeat ?? null } : {}),
        ...(patch.warp !== undefined ? { warp: next?.warp } : {}),
        ...(patch.reed !== undefined ? { reed: next?.reed } : {}),
        ...(patch.width !== undefined ? { width: next?.width } : {}),
        ...(patch.length !== undefined ? { length: next?.length } : {}),
        ...(patch.loomType !== undefined ? { loomType: next?.loomType } : {}),
        ...(patch.totalThreads !== undefined || patch.reed !== undefined || patch.width !== undefined
          ? { totalThreads: next?.totalThreads }
          : {}),
      })
    }
    if (patch.swLot !== undefined && next?.usedInLoom) {
      const loomNum = Number(next.usedInLoom)
      if (Number.isFinite(loomNum) && loomNum > 0) {
        const day = String(opts?.sheetDate || getProductionToday()).slice(0, 10)
        const lot = beamDailyEntryLot(next)
        this.updateSheetEntry(day, loomNum, { lot })
        // Also stamp today so Daily Entry always shows the same Sw#.
        const today = getProductionToday()
        if (today !== day) this.updateSheetEntry(today, loomNum, { lot })
      }
    }
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
      const loom = this.getLooms().find((l) => l.loomNumber === loomNum)
      const isTwin = Boolean(loom?.isTwinBeam)
      const maxBeams = isTwin ? 2 : 1
      const mountedBeams = getMountedBeamsOnLoom(beams, loomNum)
      if (mountedBeams.length >= maxBeams) {
        const names = mountedBeams.map((b) => `"${b.beamNo}"`).join(' aur ')
        throw new Error(
          isTwin
            ? `Loom ${loomNum} Twin Beam loom hai aur is par pehle se 2 Beams (${names}) lage hain. Pehle kisi ek beam ko Store / Sizing pe shift karein, phir naya beam lagaen.`
            : `Loom ${loomNum} pe pehle se Beam ${names} laga hai. Pehle us beam ko Store / Sizing pe shift karein, phir naya beam lagaen.`
        )
      }
    }

    const added = normalizeBeam({
      beamNo: partial.beamNo,
      warp: partial.warp || '',
      reed: partial.reed ?? 60,
      width: partial.width ?? 66,
      totalThreads: partial.totalThreads,
      length: partial.length ?? 0,
      loomType: partial.loomType || 'G6200',
      fillStatus: partial.fillStatus || 'FULL',
      usedInLoom: partial.usedInLoom ?? null,
      location: partial.location,
      mountedOn: partial.mountedOn,
      qualityId: partial.qualityId ?? null,
      swLot: partial.swLot ?? null,
      beamRepeat: partial.beamRepeat ?? null,
    })
    beams.push(added)
    if (partial.swLot) writeLocalBeamSwLot(partial.beamNo, partial.swLot)
    // Browser backup until DB confirms — survives refresh if network/PUT fails.
    writeLocalPendingBeam(added)
    try {
      memoryStore.set(KEY_BEAMS, JSON.stringify(beams.map((b) => normalizeBeam(b))))
    } catch {
      // ignore
    }
    // Fire upsert immediately; hydrate merge restores from pending if refresh wins the race.
    void (async () => {
      const ok = await persistBeamUpsert(added)
      if (ok) {
        forgetLocalPendingBeam(added.beamNo)
        void persistKey(KEY_BEAMS, this.getBeams())
      } else {
        console.error('[floor] addBeam upsert failed — kept in pending local', added.beamNo)
      }
    })()
    if (added.usedInLoom) {
      const mountedLoom = Number(added.usedInLoom)
      if (Number.isFinite(mountedLoom) && mountedLoom > 0) {
        const mountDay = String(added.mountedOn || getProductionToday()).slice(0, 10)
        this.updateSheetEntry(mountDay, mountedLoom, { lot: beamDailyEntryLot(added) })
      }
    }
    return this.getBeams()
  }

  /** Wait until a pending beam is confirmed in DB (or timeout). */
  async flushPendingBeam(beamNo: string, timeoutMs = 8000): Promise<boolean> {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const pending = readLocalPendingBeams().some((b) => b.beamNo === beamNo)
      if (!pending) return true
      const beam = this.getBeams().find((b) => b.beamNo === beamNo)
      if (beam) {
        const ok = await persistBeamUpsert(beam)
        if (ok) {
          forgetLocalPendingBeam(beamNo)
          return true
        }
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    return !readLocalPendingBeams().some((b) => b.beamNo === beamNo)
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

    const loom = this.getLooms().find((l) => l.loomNumber === loomNumber)
    const isTwin = Boolean(loom?.isTwinBeam)
    const maxBeams = isTwin ? 2 : 1
    const mountedBeams = getMountedBeamsOnLoom(current, loomNumber, beamNo)

    if (mountedBeams.length >= maxBeams) {
      const names = mountedBeams.map((b) => `"${b.beamNo}"`).join(' aur ')
      return {
        ok: false,
        beams: current,
        loomNumber,
        blockingBeamNo: mountedBeams[0]?.beamNo,
        message: isTwin
          ? `Loom ${loomNumber} Twin Beam loom hai aur is par pehle se 2 Beams (${names}) lage hain.\n\nPehle kisi ek beam ki location Store ya Sizing pe change karein, phir ye beam lagaen.`
          : `Loom ${loomNumber} pe pehle se Beam ${names} laga hai.\n\nPehle us beam ki location Store ya Sizing pe change karein, phir ye beam lagaen.`,
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
    const allMounted = getMountedBeamsOnLoom(beams, loomNumber)
    const lotStr = allMounted.map((b) => beamDailyEntryLot(b) || b.beamNo).filter(Boolean).join(' + ')
    // Stamp Sw# lot on Daily Entry (Excel SW # Lot column).
    this.updateSheetEntry(dateStr, loomNumber, {
      lot: lotStr,
    })
    return { ok: true, beams }
  }

  /** Excel Beem Length model — Length / Consumed / Balance from sheet lot rows. */
  buildBeamTrack(beamNo: string): BeamTrackResult | null {
    const beam = this.getBeams().find((b) => b.beamNo === beamNo)
    if (!beam) return null
    const qualityName = beam.qualityId
      ? this.getQualities().find((q) => q.id === beam.qualityId)?.name || null
      : null
    return buildBeamTrackFromEntries(
      beam,
      listPersistedSheetEntries(),
      getProductionToday(),
      qualityName
    )
  }

  /** Quick consumed meters for Track button gate. */
  beamConsumedMeters(beamNo: string): number {
    return this.buildBeamTrack(beamNo)?.consumed ?? 0
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
    const prev = this.getBeams().find((b) => b.beamNo === beamNo)
    const prevLoom = prev?.usedInLoom ? Number(prev.usedInLoom) : NaN
    const patch: Partial<BeamMaster> = {
      usedInLoom: null,
      location,
      mountedOn: null,
      beamEndedOn: dateStr || null,
    }
    if (location === 'SIZING') patch.fillStatus = 'EMPTY'
    const updated = this.updateBeam(beamNo, patch)
    if (Number.isFinite(prevLoom) && prevLoom > 0) {
      const remainingMounted = getMountedBeamsOnLoom(updated, prevLoom)
      const day = String(dateStr || getProductionToday()).slice(0, 10)
      const lotStr = remainingMounted.map((b) => beamDailyEntryLot(b) || b.beamNo).filter(Boolean).join(' + ')
      this.updateSheetEntry(day, prevLoom, { lot: lotStr })
      const today = getProductionToday()
      if (today !== day) this.updateSheetEntry(today, prevLoom, { lot: lotStr })
    }
    return updated
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
    const before = applyLocalPendingQualities(
      applyLocalQualityEnds(loadJson(KEY_QUALITY, seedQualities).map(normalizeQuality))
    )
    const merged = collapseDuplicateActiveQualities(before)
    // Keep merged Active forks in memory so later PUTs include them.
    try {
      memoryStore.set(KEY_QUALITY, JSON.stringify(merged))
    } catch {
      // ignore
    }
    // If collapse demoted an Active that looms still pointed at, remap to the kept Active.
    const demoted = before.some((q) => {
      const next = merged.find((item) => item.id === q.id)
      return (
        normalizeQualityStatus(q.status) === 'ACTIVE' &&
        next != null &&
        normalizeQualityStatus(next.status) === 'ENDED'
      )
    })
    if (demoted) {
      try {
        const looms = loadJson(KEY_LOOMS, seedLooms)
        const remapped = remapLoomQualityIdsAfterCollapse(looms, before, merged)
        if (remapped !== looms) saveJson(KEY_LOOMS, remapped)
      } catch {
        // ignore
      }
    }
    return merged
  }

  /** Qualities ordered by loom allotment (Loom 1 → N). */
  getQualitiesOrdered(entries?: DailyLoomProductionEntry[]): QualityMaster[] {
    return orderQualitiesByLoomAllotment(this.getQualities(), this.getLooms(), entries)
  }

  saveQualities(qualities: QualityMaster[]) {
    // Memory + merge-upsert PUT (server no longer deleteMany). Prefer row upserts for new forks.
    saveJson(KEY_QUALITY, qualities)
  }

  /** Memory only — avoids racing a full qualities PUT while reuse upsert is in flight. */
  private saveQualitiesMemory(qualities: QualityMaster[]) {
    try {
      memoryStore.set(KEY_QUALITY, JSON.stringify(qualities.map(normalizeQuality)))
    } catch {
      // ignore
    }
  }

  updateQuality(
    id: string,
    patch: Partial<QualityMaster>,
    fromDate: string = getProductionToday()
  ): QualityMaster[] {
    const current = this.getQualities().find((q) => q.id === id)
    const catalogBefore = this.getQualities()
    const nextPatch = { ...patch }
    const currentStatus = normalizeQualityStatus(current?.status)
    // Hold only on production Today — past Hold would wipe / confuse that day's production.
    if (nextPatch.status === 'HOLD') {
      const day = String(fromDate || '').slice(0, 10)
      if (day && day !== getProductionToday()) {
        return catalogBefore
      }
    }
    // Renaming a quality that already ran on earlier days would split its history:
    // those days' rows keep the old name and stop matching. Only allow a rename on the
    // quality's first day (typo fix); otherwise End it and add the new name.
    if (current && nextPatch.name !== undefined) {
      const newKey = qualityNameKey(String(nextPatch.name))
      const oldKey = qualityNameKey(current.name)
      const startDay = current.createdOn ? String(current.createdOn).slice(0, 10) : ''
      const day = String(fromDate || '').slice(0, 10)
      if (newKey && oldKey && newKey !== oldKey && (!startDay || day > startDay)) {
        notifyFloorSaveProblem(409, {
          error:
            `"${current.name}" ${startDay || 'pehle'} se chal rahi hai — naam badalne se pichle dinon ka record alag ho jayega. ` +
            `Naam sirf pehle din (${startDay || 'start date'}) badal sakte hain. Warna is quality ko End karein aur naye naam se nayi quality add karein.`,
        })
        delete nextPatch.name
        if (Object.keys(nextPatch).length === 0) return catalogBefore
      }
    }
    // Already ended/hold: only allow explicit revive to ACTIVE (or re-stamp date).
    if (currentStatus === 'ENDED' || currentStatus === 'HOLD') {
      if (nextPatch.status === 'ACTIVE') {
        // explicit revive / continue / resume
      } else if (nextPatch.status && nextPatch.status !== currentStatus) {
        // allow HOLD ↔ ENDED switches
      } else if (nextPatch.status) {
        delete nextPatch.status
      }
    }

    /** Continue / Resume: undo End-Hold clear so same meters stay on this run. */
    const reviving =
      Boolean(current) &&
      (currentStatus === 'ENDED' || currentStatus === 'HOLD') &&
      nextPatch.status === 'ACTIVE'
    // Cannot Continue/Resume when another Active already uses this name (Reuse path).
    if (reviving && current && findLiveQualityByName(catalogBefore, current.name, current.id)) {
      return catalogBefore
    }
    // HOLD Resume: only from hold day or later — days before Hold are history-only (H badge).
    if (reviving && currentStatus === 'HOLD') {
      const holdStamp = current?.endedOn ? String(current.endedOn).slice(0, 10) : ''
      const resumeDay = String(fromDate || '').slice(0, 10)
      if (holdStamp && resumeDay && resumeDay < holdStamp) {
        return catalogBefore
      }
    }
    const reviveEndDay = reviving
      ? String(current?.endedOn || fromDate).slice(0, 10)
      : ''
    const restoreLoomNums = reviving
      ? [
          ...new Set([
            ...qualityLoomEndsOnDate(current!, reviveEndDay),
            ...qualityLoomEndsOnDate(current!),
          ]),
        ]
      : []

    // End / Hold: collect looms first, stamp loomEnds, then clear allotment + sheet.
    const clearing = nextPatch.status === 'ENDED' || nextPatch.status === 'HOLD'
    const clearLoomNums = new Set<number>()
    if (clearing) {
      const day = this.peekSheetDay(fromDate) || []
      for (const l of this.getLooms()) {
        if (l.qualityId === id) clearLoomNums.add(l.loomNumber)
      }
      if (current) {
        for (const e of day) {
          if (sheetRowShowsQuality(e, current, catalogBefore)) clearLoomNums.add(e.loomNumber)
        }
      }
    }

    const qualities = this.getQualities().map((q) => {
      if (q.id !== id) return q
      const merged = applyMidRunYarnChange(q, nextPatch, fromDate)
      if (reviving) {
        // Drop the close stamp so L# / Track treat this as the same open run.
        const kept = (q.loomEnds || []).filter((e) => e.date !== reviveEndDay)
        merged.loomEnds = kept.length ? kept : undefined
        merged.endedOn = null
        merged.status = 'ACTIVE'
      } else {
        let loomEnds = nextPatch.loomEnds
          ? mergeLoomEndLists(q.loomEnds, nextPatch.loomEnds)
          : q.loomEnds
        if (clearing && clearLoomNums.size > 0) {
          const stamped = [...clearLoomNums].map((loomNumber) => ({
            date: String(fromDate).slice(0, 10),
            loomNumber,
          }))
          loomEnds = mergeLoomEndLists(loomEnds, stamped)
        }
        if (loomEnds) merged.loomEnds = loomEnds
      }
      return normalizeQuality(merged)
    })

    if (clearing) {
      // HOLD: clear pose on the hold day (history stays on past Active via badge).
      // ENDED: keep end-day sheet as-is; wipe following days to zeros + "Quality Ended"
      // until a new quality is assigned (loom.qualityId cleared below).
      if (nextPatch.status === 'HOLD') {
        const dayRows = this.peekSheetDay(fromDate) || []
        for (const loomNumber of clearLoomNums) {
          const segs = dayRows.filter((e) => e.loomNumber === loomNumber)
          const clearPatch = {
            qualityName: '—',
            fabricType: '',
            warpYarn: '',
            weftYarn: '',
            _clearQuality: true,
          } as Partial<DailyLoomProductionEntry> & { _clearQuality?: boolean }
          if (segs.length === 0) {
            this.updateSheetEntry(fromDate, loomNumber, clearPatch, undefined, 1)
            continue
          }
          // Clear only segments owned by this quality; leave same-day dual segments intact.
          let clearedAny = false
          for (const row of segs) {
            if (current && !sheetRowShowsQuality(row, current, catalogBefore)) continue
            this.updateSheetEntry(
              fromDate,
              loomNumber,
              clearPatch,
              undefined,
              sheetSegmentIndex(row)
            )
            clearedAny = true
          }
          if (
            !clearedAny &&
            this.getLooms().some((l) => l.loomNumber === loomNumber && l.qualityId === id)
          ) {
            this.updateSheetEntry(fromDate, loomNumber, clearPatch, undefined, 1)
          }
        }
      }
      if (nextPatch.status === 'ENDED') {
        const endDay = String(fromDate).slice(0, 10)
        const today = getProductionToday()
        const endedName = (current?.name || '').trim()
        // Wipe through today, and any already-seeded days after today (local override / seed).
        let cursor = shiftProductionDate(endDay, 1)
        const wipeUntil = shiftProductionDate(today, 60)
        while (cursor <= wipeUntil) {
          const exists = this.peekSheetDay(cursor) != null
          if (!exists && cursor > today) break
          if (exists) {
            for (const loomNumber of clearLoomNums) {
              const dayRows = this.peekSheetDay(cursor) || []
              const segs = dayRows.filter((e) => e.loomNumber === loomNumber)
              const targets =
                segs.length > 0
                  ? segs
                  : [{ loomNumber, segmentIndex: 1 } as DailyLoomProductionEntry]
              for (const row of targets) {
                if (
                  current &&
                  segs.length > 0 &&
                  namedQualityOnRow(row.qualityName) &&
                  !sheetRowShowsQuality(row, current, catalogBefore)
                ) {
                  continue
                }
                this.updateSheetEntry(
                  cursor,
                  loomNumber,
                  {
                    qualityName: endedName || '—',
                    fabricType: current?.fabricType || '',
                    warpYarn: '',
                    weftYarn: '',
                    pick: 0,
                    reed: 0,
                    widthInch: 0,
                    gsm: 0,
                    rollerHours: 0,
                    shiftAMeters: 0,
                    shiftBMeters: 0,
                    totalMeters: 0,
                    remarks: QUALITY_ENDED_REMARK,
                    _clearQuality: !endedName,
                  } as Partial<DailyLoomProductionEntry> & { _clearQuality?: boolean },
                  undefined,
                  sheetSegmentIndex(row)
                )
              }
            }
          }
          cursor = shiftProductionDate(cursor, 1)
        }
      }
      const looms = this.getLooms()
      if (looms.some((l) => l.qualityId === id)) {
        this.saveLooms(looms.map((l) => (l.qualityId === id ? { ...l, qualityId: null } : l)))
      }
    }
    this.saveQualities(qualities)

    // After End catalog is saved, rebuild post-end days so poseEnded zeros + E remark stick
    // (stale seed meters / demote-restore cannot survive). Include seeded days past today.
    if (nextPatch.status === 'ENDED' && clearLoomNums.size > 0) {
      const endDay = String(fromDate).slice(0, 10)
      const today = getProductionToday()
      let cursor = shiftProductionDate(endDay, 1)
      const rebuildUntil = shiftProductionDate(today, 60)
      while (cursor <= rebuildUntil) {
        const exists = this.peekSheetDay(cursor) != null
        if (!exists && cursor > today) break
        if (exists) {
          this.buildSheetForDate(cursor, { persist: true })
        }
        cursor = shiftProductionDate(cursor, 1)
      }
    }

    // Stale loom.qualityId still pointing at this ENDED run — clear so Daily Entry zeros.
    if (nextPatch.status === 'ENDED') {
      const loomsNow = this.getLooms()
      if (loomsNow.some((l) => l.qualityId === id)) {
        this.saveLooms(loomsNow.map((l) => (l.qualityId === id ? { ...l, qualityId: null } : l)))
      }
    }

    // Backdated start date must survive refresh until DB upsert confirms createdOn.
    if (nextPatch.createdOn !== undefined) {
      const stamped = qualities.find((q) => q.id === id)
      if (stamped) rememberLocalPendingQuality(stamped)
    }

    if (reviving && restoreLoomNums.length > 0) {
      const looms = this.getLooms()
      const restoredNums: number[] = []
      const nextLooms = looms.map((l) => {
        if (!restoreLoomNums.includes(l.loomNumber)) return l
        // Don't steal a loom already given to another quality after the close.
        if (l.qualityId && l.qualityId !== id) return l
        restoredNums.push(l.loomNumber)
        return { ...l, qualityId: id }
      })
      this.saveLooms(nextLooms)

      const resumeDay = String(fromDate).slice(0, 10)
      for (const loomNumber of restoredNums) {
        const loom = nextLooms.find((l) => l.loomNumber === loomNumber)
        if (!loom) continue
        // Resume from selected date → today (skips days that already have another quality).
        if (resumeDay) {
          this.applyQualityOnLoomFromDate(loomNumber, id, resumeDay, loom)
        } else if (reviveEndDay && this.peekSheetDay(reviveEndDay)) {
          this.updateSheetEntry(
            reviveEndDay,
            loomNumber,
            this.recipeForLoom({ ...loom, qualityId: id }, reviveEndDay)
          )
        }
      }
    }

    const saved = qualities.find((q) => q.id === id)
    if (reviving && saved) {
      // Keep Active revive until DB confirms — otherwise hydrate/local ends snap back to ENDED
      // and Continue looks like success while Ends row never leaves.
      forgetLocalQualityEnd(id)
      rememberLocalPendingQuality(
        normalizeQuality({
          ...saved,
          status: 'ACTIVE',
          endedOn: null,
          loomEnds: saved.loomEnds,
        })
      )
    } else if (saved?.status === 'ENDED' && saved.endedOn) {
      rememberLocalQualityEnd(id, saved.endedOn, saved.name, saved.loomEnds)
    } else if (nextPatch.status === 'ACTIVE' || nextPatch.status === 'HOLD') {
      forgetLocalQualityEnd(id)
    }
    const recipeTouched =
      nextPatch.name !== undefined ||
      nextPatch.fabricType !== undefined ||
      nextPatch.warpYarn !== undefined ||
      nextPatch.weftYarn !== undefined ||
      nextPatch.reed !== undefined ||
      nextPatch.pick !== undefined ||
      nextPatch.widthInch !== undefined ||
      nextPatch.gsm !== undefined
    if (recipeTouched && current && this.peekSheetDay(fromDate)) {
      const day = this.peekSheetDay(fromDate) || []
      for (const row of day) {
        if (!sheetRowShowsQuality(row, current, catalogBefore)) continue
        const loom = this.getLooms().find((l) => l.loomNumber === row.loomNumber)
        if (!loom) continue
        this.updateSheetEntry(
          fromDate,
          row.loomNumber,
          this.recipeForLoom({ ...loom, qualityId: id }, fromDate),
          undefined,
          sheetSegmentIndex(row)
        )
      }
    }
    return this.getQualities()
  }

  addQuality(partial?: Partial<QualityMaster>, createdOn: string = getProductionToday()): QualityMaster[] {
    const qualities = this.getQualities()
    const added = normalizeQuality({
      id: `q-${Date.now()}`,
      name: partial?.name || 'New Quality',
      fabricType: normalizeFabricType(partial?.fabricType),
      weavePlan: partial?.weavePlan != null ? String(partial.weavePlan) : '',
      weftPlan: partial?.weftPlan != null ? String(partial.weftPlan) : '',
      warpYarn: partial?.warpYarn != null ? partial.warpYarn : '20/1',
      weftYarn: partial?.weftYarn != null ? partial.weftYarn : '20/1',
      reed: partial?.reed ?? 120,
      pick: partial?.pick ?? 60,
      widthInch: partial?.widthInch ?? 66,
      gsm: partial?.gsm !== undefined ? Number(Number(partial.gsm).toFixed(2)) : 0,
      status: partial?.status ?? 'ACTIVE',
      createdOn: partial?.createdOn || createdOn,
      endedOn: partial?.endedOn ?? null,
    })
    qualities.push(added)
    this.saveQualities(qualities)
    rememberLocalPendingQuality(added)
    void this.flushNewQuality(added)
    return qualities
  }

  /**
   * Reuse an ENDED quality without losing Ends history:
   * - keep the original ENDED row for Ends tab / month PDF (2→1)
   * - fork a NEW Active id from zero (new createdOn → Track starts at 0)
   */
  reassignEndedQuality(
    id: string,
    createdOn: string = getProductionToday()
  ): { qualities: QualityMaster[]; newQuality: QualityMaster | null; archive: QualityMaster | null } {
    const list = this.getQualities()
    const src = list.find((q) => q.id === id)
    if (!src || normalizeQualityStatus(src.status) !== 'ENDED') {
      return { qualities: list, newQuality: null, archive: null }
    }
    // Frozen archive rows are history only — never fork from them.
    if (String(id).startsWith('q-end-')) {
      return { qualities: list, newQuality: null, archive: null }
    }
    // Same name already live on Active/Hold → Reuse would duplicate the row.
    const liveSame = findLiveQualityByName(list, src.name, src.id)
    if (liveSame) {
      return { qualities: list, newQuality: null, archive: null }
    }
    const day = String(createdOn || getProductionToday()).slice(0, 10)
    const endedOn = src.endedOn ? String(src.endedOn).slice(0, 10) : day

    const newQuality = normalizeQuality({
      id: `q-${Date.now()}`,
      name: src.name,
      fabricType: src.fabricType,
      weavePlan: src.weavePlan || '',
      weftPlan: src.weftPlan || '',
      warpYarn: src.warpYarn,
      weftYarn: src.weftYarn,
      reed: src.reed,
      pick: src.pick,
      widthInch: src.widthInch,
      gsm: src.gsm,
      status: 'ACTIVE',
      createdOn: day,
      endedOn: null,
      loomEnds: [],
    })

    // Keep original ENDED for Ends tab — do NOT revive / forget its local end.
    rememberLocalQualityEnd(src.id, endedOn, src.name, src.loomEnds)
    rememberLocalPendingQuality(newQuality)

    const qualities = collapseDuplicateActiveQualities(
      [...list.filter((q) => q.id !== newQuality.id), newQuality],
      day
    )
    // Memory only — full PUT can race and drop the new Active before upsert lands.
    this.saveQualitiesMemory(qualities)
    return { qualities, newQuality, archive: normalizeQuality({ ...src, status: 'ENDED', endedOn }) }
  }

  /** Persist new Active run; keep original ENDED row in DB (server-atomic). */
  async flushReassign(revived: QualityMaster, archive: QualityMaster | null): Promise<boolean> {
    // Browser backup until hydrate confirms DB has the Active fork.
    rememberLocalPendingQuality(revived)
    if (archive?.id && archive.endedOn) {
      rememberLocalQualityEnd(archive.id, String(archive.endedOn).slice(0, 10), archive.name, archive.loomEnds)
    }

    const createdOn = String(revived.createdOn || getProductionToday()).slice(0, 10)
    let ok = false
    let active = revived

    if (archive?.id) {
      const result = await persistQualityReuse(archive.id, createdOn, revived)
      ok = result.ok
      if (result.active) active = result.active
    } else {
      ok = await persistQualityUpsert(revived)
    }

    // Fallback: plain upsert if atomic call failed (older server / network).
    if (!ok) {
      ok = await persistQualityUpsert(revived)
      if (archive?.id && archive.endedOn) {
        await persistQualityStatus(archive.id, 'ENDED', String(archive.endedOn).slice(0, 10))
      }
    }

    // Merge-safe full list PUT — now upserts rows, never deleteMany.
    const list = this.getQualities()
    const synced = list.some((q) => q.id === active.id)
      ? list.map((q) => (q.id === active.id ? normalizeQuality(active) : q))
      : [...list, normalizeQuality(active)]
    const withEnded = synced.map((q) =>
      archive && q.id === archive.id
        ? normalizeQuality({
            ...q,
            status: 'ENDED',
            endedOn: archive.endedOn ? String(archive.endedOn).slice(0, 10) : q.endedOn,
          })
        : q
    )
    this.saveQualitiesMemory(withEnded)
    // Extra belt: merge-upsert entire catalog so Active cannot vanish on refresh.
    await persistKey(KEY_QUALITY, withEnded)

    // Keep pending if still not confirmed — hydrate drops it when DB has the id.
    if (ok) {
      // Leave pending; hydrate forgets only after DB confirms.
    }
    return ok
  }

  /** @deprecated prefer flushReassign — kept for addQuality path */
  async flushNewQuality(quality: QualityMaster): Promise<boolean> {
    rememberLocalPendingQuality(quality)
    const okUpsert = await persistQualityUpsert(quality)
    // Keep pending until hydrate confirms — protects against stale quality PUT wipe.
    return okUpsert
  }

  /** If user picks an ENDED quality on a loom, fork a new Active run (Ends row stays). */
  private resolveQualityIdForAssign(
    qualityId: string | null | undefined,
    dateStr: string
  ): string | null | undefined {
    if (!qualityId) return qualityId
    const q = this.getQualities().find((item) => item.id === qualityId)
    if (!q) return qualityId
    if (normalizeQualityStatus(q.status) !== 'ENDED') return qualityId
    // Archive ids are already closed history — don't reuse those.
    if (String(qualityId).startsWith('q-end-')) return qualityId
    const { newQuality } = this.reassignEndedQuality(qualityId, dateStr)
    if (newQuality) return newQuality.id
    // Same name already Active (Reuse blocked) — assign that live row instead.
    const live = findLiveQualityByName(this.getQualities(), q.name, q.id)
    return live?.id || qualityId
  }

  /** Push one quality's status/endedOn to DB (await before refresh-safe UI). */
  async flushQualityStatus(id: string): Promise<boolean> {
    const q = this.getQualities().find((item) => item.id === id)
    if (!q) return false
    const status = normalizeQualityStatus(q.status)
    if (status === 'ENDED' && q.endedOn) {
      rememberLocalQualityEnd(id, q.endedOn, q.name, q.loomEnds)
    } else if (status === 'ACTIVE') {
      forgetLocalQualityEnd(id)
    }
    const endedOn = status === 'ACTIVE' ? null : q.endedOn ?? null
    // Row upsert + status patch only — full-table PUT races and can wipe reuse archives.
    const okUpsert = await persistQualityUpsert(q)
    const okPatch = await persistQualityStatus(id, status, endedOn)
    const ok = okPatch || okUpsert
    // Only clear Continue/Resume pending after DB confirms Active.
    if (ok && status === 'ACTIVE') {
      forgetLocalPendingQuality(id)
    }
    return ok
  }

  /** Push full qualities list + status patch for ended/hold rows. */
  async flushQualitiesToDb(): Promise<boolean> {
    const list = this.getQualities()
    const ok = await persistKey(KEY_QUALITY, list)
    for (const q of list) {
      const status = normalizeQualityStatus(q.status)
      if (status === 'ENDED' || status === 'HOLD') {
        await persistQualityStatus(q.id, status, q.endedOn ?? null)
      }
    }
    return ok
  }

  endQuality(id: string, endedOn: string): QualityMaster[] {
    return this.updateQuality(id, { status: 'ENDED', endedOn })
  }

  /**
   * End quality on selected looms for `dateStr`.
   * Always records ENDED + endedOn for that date (so Quality Ends tab shows it),
   * while only clearing the chosen looms — other looms can keep running that day.
   * Call `flushQualityStatus` after this so refresh keeps the record.
   */
  endQualityOnLooms(
    qualityId: string,
    loomNumbers: number[],
    dateStr: string
  ): { qualities: QualityMaster[]; looms: LoomMaster[]; entries: DailyLoomProductionEntry[]; fullyEnded: boolean } {
    const catalog = this.getQualities()
    const quality = catalog.find((q) => q.id === qualityId)
    if (!quality) {
      return {
        qualities: catalog,
        looms: this.getLooms(),
        entries: this.buildSheetForDate(dateStr, { skipPersist: true }),
        fullyEnded: false,
      }
    }

    const chosen = [...new Set(loomNumbers.filter((n) => Number.isFinite(n)))]
    if (chosen.length === 0) {
      return {
        qualities: catalog,
        looms: this.getLooms(),
        entries: this.buildSheetForDate(dateStr, { skipPersist: true }),
        fullyEnded: false,
      }
    }

    for (const loomNumber of chosen) {
      this.updateSheetEntry(dateStr, loomNumber, {
        qualityName: '—',
        fabricType: '',
        warpYarn: '',
        weftYarn: '',
        _clearQuality: true,
      } as Partial<DailyLoomProductionEntry> & { _clearQuality?: boolean })
      const loom = this.getLooms().find((l) => l.loomNumber === loomNumber)
      if (loom?.qualityId === qualityId) {
        this.saveLooms(
          this.getLooms().map((l) =>
            l.loomNumber === loomNumber ? { ...l, qualityId: null } : l
          )
        )
      }
    }

    const newLoomEnds = chosen.map((loomNumber) => ({ date: dateStr, loomNumber }))
    const qualities = this.updateQuality(
      qualityId,
      {
        status: 'ENDED',
        endedOn: dateStr,
        loomEnds: mergeLoomEndLists(quality.loomEnds, newLoomEnds),
      },
      dateStr
    )

    return {
      qualities,
      looms: this.getLooms(),
      entries: this.peekSheetDay(dateStr) || this.buildSheetForDate(dateStr, { skipPersist: true }),
      fullyEnded: true,
    }
  }

  deleteQuality(id: string): QualityMaster[] {
    const qualities = this.getQualities().filter((q) => q.id !== id)
    this.saveQualitiesMemory(qualities)
    forgetLocalPendingQuality(id)
    forgetLocalQualityEnd(id)
    const beams = this.getBeams()
    if (beams.some((b) => b.qualityId === id)) {
      this.saveBeams(beams.map((b) => (b.qualityId === id ? { ...b, qualityId: null } : b)))
    }
    if (isClient()) {
      void fetch('/api/floor/store', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteQuality', id }),
      }).catch((err) => console.error('[floor] deleteQuality failed', id, err))
    }
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
      if (raw) {
        const parsed = JSON.parse(raw) as DailyLoomProductionEntry[]
        if (!Array.isArray(parsed)) return null
        return sortSheetEntries(parsed.map(normalizeSheetEntry))
      }
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

  /** Latest saved primary (segment 1) row for this loom before `dateStr`. */
  private priorSheetRow(dateStr: string, loomNumber: number): DailyLoomProductionEntry | null {
    const priorDates = listPersistedSheetDates().filter((d) => d < dateStr)
    const priorDate = priorDates.length ? priorDates[priorDates.length - 1] : shiftProductionDate(dateStr, -1)
    const rows =
      this.peekSheetDay(priorDate) ??
      (priorDate < getProductionToday() ? getExcelDailyLoomsForDate(priorDate) : null)
    if (!rows) return null
    const forLoom = rows.filter((e) => e.loomNumber === loomNumber)
    return (
      forLoom.find((e) => sheetSegmentIndex(e) === 1) ||
      forLoom[0] ||
      null
    )
  }

  /** Latest saved lot for this loom before `dateStr`. Empty string is kept; missing day returns null. */
  private carriedLot(dateStr: string, loomNumber: number): string | null {
    const row = this.priorSheetRow(dateStr, loomNumber)
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
    const catalog = this.getQualities()
    // Repair: loom still allotted to an ENDED quality → clear so post-end days zero + E.
    let looms = this.getLooms()
    if (
      looms.some((l) => {
        if (!l.qualityId) return false
        const q = catalog.find((item) => item.id === l.qualityId)
        return Boolean(q && normalizeQualityStatus(q.status) === 'ENDED')
      })
    ) {
      looms = looms.map((l) => {
        if (!l.qualityId) return l
        const q = catalog.find((item) => item.id === l.qualityId)
        if (q && normalizeQualityStatus(q.status) === 'ENDED') {
          return { ...l, qualityId: null }
        }
        return l
      })
      this.saveLooms(looms)
    }
    const beams = this.getBeams()
    const hadPersisted = this.peekSheetDay(dateStr) != null
    const loaded = this.loadSheetDay(dateStr).map(normalizeSheetEntry)
    const prevByKey = new Map(
      loaded.map((e) => [sheetRowKey(e.loomNumber, sheetSegmentIndex(e)), e])
    )

    const primaryEntries = looms.map((loom) => {
      const prev = prevByKey.get(sheetRowKey(loom.loomNumber, 1))
      const beam = beams.find((b) => beamOnLoom(b, loom.loomNumber))
      const live = this.recipeForLoom(loom, dateStr)
      const prior = this.priorSheetRow(dateStr, loom.loomNumber)
      const isPastDay = dateStr !== getProductionToday()
      const loomQ = loom.qualityId
        ? catalog.find((q) => q.id === loom.qualityId)
        : undefined
      const loomQStatus = loomQ ? normalizeQualityStatus(loomQ.status) : null
      // Only ACTIVE/HOLD counts as a live pose — stale ENDED id must not keep meters.
      const loomHasLivePose = Boolean(
        loomQ && (loomQStatus === 'ACTIVE' || loomQStatus === 'HOLD')
      )
      // After Quality End (no new quality on loom): keep ended name for E badge,
      // but force zeros — never carry pick/meters from end-day / stale seed.
      const prevNamed = Boolean(prev && namedQualityOnRow(prev.qualityName))
      const rowLooksEnded =
        isQualityEndedSheetRow(prev) ||
        qualityPoseEndedBeforeDay(prev, catalog, dateStr) ||
        (!prevNamed && qualityPoseEndedBeforeDay(prior, catalog, dateStr)) ||
        // Stale seed: same quality name as ended prior day, loom has no live pose.
        (prevNamed &&
          prior &&
          qualityNameKey(prev!.qualityName) === qualityNameKey(prior.qualityName || '') &&
          qualityPoseEndedBeforeDay(prior, catalog, dateStr))
      // On a past day the loom's *current* quality does not apply (it starts on the day it
      // was assigned and is written forward from there), so an End before this day wins.
      const poseEnded = rowLooksEnded && (!loomHasLivePose || isPastDay)
      // Carry yesterday's quality forward only while that quality is still running.
      const priorStillRuns = Boolean(
        prior && namedQualityOnRow(prior.qualityName) && !qualityPoseEndedBeforeDay(prior, catalog, dateStr)
      )
      const endedLabelSrc = poseEnded
        ? prev && (namedQualityOnRow(prev.qualityName) || isQualityEndedSheetRow(prev))
          ? prev
          : prior && namedQualityOnRow(prior.qualityName)
            ? prior
            : null
        : null
      // A saved row keeps the quality stored on that date, including a deliberate clear.
      // Past days must NOT fall back to today's live loom master — factory backfill
      // starts empty / from prior day only (e.g. set up 2 Oct without copying 3 Oct).
      // After Quality End, loom.qualityId is null — do NOT carry prior day's pick/quality
      // onto the next day (show empty / B/End only until a new quality is assigned).
      const cleared = prev ? !namedQualityOnRow(prev.qualityName) && !poseEnded : false
      // Only revive after a real "Quality Ended" stub + new live assign.
      // Do NOT treat Part1≠loom.qualityId as revive — that is normal dual quality (P1/P2)
      // and overwriting P1 with live destroyed live Part 1/2 rows after deploy.
      const reviveFromLive =
        Boolean(loomHasLivePose && namedQualityOnRow(live.qualityName)) &&
        isQualityEndedSheetRow(prev)
      const identity = poseEnded
        ? null
        : cleared
          ? null
          : reviveFromLive
            ? live
            : prev
              ? prev
              : priorStillRuns && loomHasLivePose
                ? prior
                : !isPastDay && loomHasLivePose && namedQualityOnRow(live.qualityName)
                  ? live
                  : null
      const hasPose = Boolean(identity && namedQualityOnRow(identity.qualityName))
      const pick = hasPose
        ? identity?.pick || (!isPastDay ? live.pick : undefined) || 60
        : 0
      const reed = hasPose
        ? identity?.reed || (!isPastDay ? live.reed : undefined) || 60
        : 0
      const rpm =
        identity?.rpm ||
        (hasPose && !isPastDay ? live.rpm : undefined) ||
        (prev || prior ? undefined : loom.defaultRpm) ||
        loom.defaultRpm
      const masterStatus = (loom.status || 'RUNNING') as LoomStatus
      // Day-wise status: saved row for this date → else prior day (auto carry) → else master.
      // Ignore "Quality Ended" as a condition source once a live quality is on the loom.
      const statusSource =
        loomHasLivePose && isQualityEndedSheetRow(prev)
          ? prior && !isQualityEndedSheetRow(prior)
            ? prior
            : null
          : prev || prior
      const status = statusSource
        ? resolveLoomCondition(statusSource.status, statusSource.remarks)
        : masterStatus
      const statusLabel =
        status === 'RUNNING' ? '' : LOOM_STATUS_LABEL[status] || status
      const prevRemarks = (statusSource?.remarks || '').trim()
      const prevIsStatusLabel =
        !prevRemarks ||
        (Object.values(LOOM_STATUS_LABEL) as string[]).some(
          (label) => label.toLowerCase() === prevRemarks.toLowerCase()
        )
      // Grey + "Quality Ended" only while loom has no new quality; clear once attached.
      const remarks = poseEnded
        ? QUALITY_ENDED_REMARK
        : loomHasLivePose && isQualityEndedSheetRow(prev)
          ? statusLabel
          : statusSource
            ? prevIsStatusLabel
              ? statusLabel
              : statusSource.remarks || ''
            : statusLabel

      const rollerHours = poseEnded
        ? 0
        : prev?.rollerHours != null
          ? prev.rollerHours
          : status === 'BEAM_END' || status === 'STOPPED' || dateStr >= getProductionToday()
            ? 0
            : 24
      const shiftA = poseEnded ? 0 : (prev?.shiftAMeters ?? 0)
      const shiftB = poseEnded ? 0 : (prev?.shiftBMeters ?? 0)

      const metrics = calculateProductionMetrics({
        rpm,
        runningHours: rollerHours,
        pick,
        shiftAMeters: shiftA,
        shiftBMeters: shiftB,
        loomNumber: loom.loomNumber,
      })
      const mountedBeams = getMountedBeamsOnLoom(beams, loom.loomNumber)
      const fromBeam = mountedBeams.map((b) => beamDailyEntryLot(b)).filter(Boolean).join(' + ')
      // Mounted beam owns SW # (read-only in Daily Entry). Beam Identity is never the lot.
      const lot = fromBeam || (beam ? beamDailyEntryLot(beam) : '')

      const built: DailyLoomProductionEntry = {
        id: sheetEntryId(dateStr, loom.loomNumber, 1),
        date: dateStr,
        loomNumber: loom.loomNumber,
        segmentIndex: 1,
        category: prev?.category || loom.category,
        model: prev?.model || loom.model,
        qualityName: poseEnded
          ? endedLabelSrc?.qualityName || '—'
          : identity?.qualityName || '—',
        fabricType: poseEnded
          ? endedLabelSrc?.fabricType || ''
          : hasPose
            ? identity?.fabricType || ''
            : '',
        warpYarn: hasPose ? identity?.warpYarn || '' : '',
        weftYarn: hasPose ? identity?.weftYarn || '' : '',
        rpm,
        reed,
        pick,
        widthInch: hasPose
          ? identity?.widthInch || (!isPastDay ? live.widthInch : undefined) || 66
          : 0,
        gsm: hasPose
          ? identity?.gsm ?? (!isPastDay ? live.gsm : undefined) ?? 0
          : 0,
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
        fabricFault: prev?.fabricFault || '',
        // Same-day values typed on Daily Entry — keep them when the day is rebuilt.
        ...(prev?.fabricFaultA != null ? { fabricFaultA: prev.fabricFaultA } : {}),
        ...(prev?.fabricFaultB != null ? { fabricFaultB: prev.fabricFaultB } : {}),
        ...(!poseEnded && prev?.weightKg != null ? { weightKg: prev.weightKg } : {}),
        // Server-stamped quality run id — kept while the row keeps the same quality.
        ...(hasPose && identity?.qualityId ? { qualityId: identity.qualityId } : {}),
        lot,
      }
      // Guard: never demote a saved named primary to "—" on rebuild (dual-quality wipe).
      // Skip when quality ended before this day — zeros + E remark must stick.
      if (
        !poseEnded &&
        prev &&
        namedQualityOnRow(prev.qualityName) &&
        !namedQualityOnRow(built.qualityName)
      ) {
        built.qualityName = prev.qualityName
        built.fabricType = prev.fabricType || built.fabricType
        built.warpYarn = prev.warpYarn || built.warpYarn
        built.weftYarn = prev.weftYarn || built.weftYarn
        built.reed = prev.reed || built.reed
        built.pick = prev.pick || built.pick
        built.widthInch = prev.widthInch || built.widthInch
        built.gsm = prev.gsm ?? built.gsm
      }
      return built
    })

    // Preserve same-day dual-quality segments (2+) — never drop on rebuild.
    const extraSegments = loaded
      .filter((e) => sheetSegmentIndex(e) > 1)
      .map((prev) => {
        const loom =
          looms.find((l) => l.loomNumber === prev.loomNumber) ||
          ({
            loomNumber: prev.loomNumber,
            category: prev.category,
            model: prev.model,
            defaultRpm: prev.rpm,
            status: prev.status,
          } as LoomMaster)
        const rollerHours = prev.rollerHours ?? prev.runningHours ?? 0
        const shiftA = prev.shiftAMeters ?? 0
        const shiftB = prev.shiftBMeters ?? 0
        const metrics = calculateProductionMetrics({
          rpm: prev.rpm || loom.defaultRpm || 340,
          runningHours: rollerHours,
          pick: prev.pick || 60,
          shiftAMeters: shiftA,
          shiftBMeters: shiftB,
          loomNumber: prev.loomNumber,
        })
        const seg = sheetSegmentIndex(prev)
        return normalizeSheetEntry({
          ...prev,
          id: sheetEntryId(dateStr, prev.loomNumber, seg),
          date: dateStr,
          segmentIndex: seg,
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
        })
      })

    const entries = sortSheetEntries([...primaryEntries, ...extraSegments])
    if (!opts?.skipPersist && (opts?.persist || hadPersisted)) {
      saveJson(this.sheetKey(dateStr), entries)
    }
    return entries
  }

  updateSheetEntry(
    dateStr: string,
    loomNumber: number,
    patch: Partial<DailyLoomProductionEntry>,
    editorName?: string,
    segmentIndex: number = sheetSegmentIndex(patch)
  ): DailyLoomProductionEntry[] {
    const seg = sheetSegmentIndex({ segmentIndex })
    const forceClear = Boolean(
      (patch as Partial<DailyLoomProductionEntry> & { _clearQuality?: boolean })._clearQuality
    )
    const current = this.buildSheetForDate(dateStr, { skipPersist: true })
    let updatedLoom: (DailyLoomProductionEntry & { _clearQuality?: boolean }) | null = null
    let found = false
    const next = current.map((e) => {
      if (e.loomNumber !== loomNumber || sheetSegmentIndex(e) !== seg) return e
      found = true
      const { _clearQuality: _drop, ...patchRest } = patch as Partial<DailyLoomProductionEntry> & {
        _clearQuality?: boolean
      }
      void _drop
      const merged = {
        ...e,
        ...patchRest,
        loomNumber,
        segmentIndex: seg,
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
        loomNumber,
      })
      const result: DailyLoomProductionEntry = normalizeSheetEntry({
        ...merged,
        id: sheetEntryId(dateStr, loomNumber, seg),
        date: dateStr,
        rollerHours,
        runningHours: rollerHours,
        runningTheoretical: metrics.theoreticalMeters,
        totalMeters: metrics.totalMeters,
        efficiencyPercentage: metrics.efficiencyPercentage,
        stopLossMeters: metrics.stopLossMeters,
        theoretical24h: metrics.theoretical24h,
        efficiency24h: metrics.efficiency24h,
        loss24h: metrics.loss24h,
      })
      updatedLoom = forceClear ? { ...result, _clearQuality: true } : result
      return result
    })

    if (!found) {
      const loom = this.getLooms().find((l) => l.loomNumber === loomNumber)
      const base =
        current.find((e) => e.loomNumber === loomNumber && sheetSegmentIndex(e) === 1) ||
        current.find((e) => e.loomNumber === loomNumber)
      const { _clearQuality: _drop2, ...patchRest2 } = patch as Partial<DailyLoomProductionEntry> & {
        _clearQuality?: boolean
      }
      void _drop2
      const seed: DailyLoomProductionEntry = normalizeSheetEntry({
        id: sheetEntryId(dateStr, loomNumber, seg),
        date: dateStr,
        loomNumber,
        segmentIndex: seg,
        category: base?.category || loom?.category || 'G6200',
        model: base?.model || loom?.model,
        qualityName: '—',
        fabricType: '',
        warpYarn: '',
        weftYarn: '',
        rpm: base?.rpm || loom?.defaultRpm || 340,
        reed: base?.reed || 60,
        pick: base?.pick || 60,
        widthInch: base?.widthInch || 66,
        gsm: base?.gsm ?? 0,
        rollerHours: 0,
        runningHours: 0,
        shiftAMeters: 0,
        shiftBMeters: 0,
        totalMeters: 0,
        efficiencyPercentage: 0,
        stopLossMeters: 0,
        status: (base?.status || loom?.status || 'RUNNING') as LoomStatus,
        remarks: '',
        fabricFault: '',
        lot: base?.lot || '',
        ...patchRest2,
        lastEditedBy: editorName || 'Floor Operator',
        lastEditedAt: new Date().toISOString(),
      })
      const rollerHours = seed.rollerHours ?? seed.runningHours ?? 0
      const metrics = calculateProductionMetrics({
        rpm: seed.rpm,
        runningHours: rollerHours,
        pick: seed.pick || 60,
        shiftAMeters: seed.shiftAMeters || 0,
        shiftBMeters: seed.shiftBMeters || 0,
        loomNumber,
      })
      const seeded = normalizeSheetEntry({
        ...seed,
        rollerHours,
        runningHours: rollerHours,
        runningTheoretical: metrics.theoreticalMeters,
        totalMeters: metrics.totalMeters,
        efficiencyPercentage: metrics.efficiencyPercentage,
        stopLossMeters: metrics.stopLossMeters,
        theoretical24h: metrics.theoretical24h,
        efficiency24h: metrics.efficiency24h,
        loss24h: metrics.loss24h,
      })
      updatedLoom = forceClear ? { ...seeded, _clearQuality: true } : seeded
      next.push(seeded)
    }

    const sorted = sortSheetEntries(next)
    // Save the patched day once, so an older rebuild cannot put today's quality onto another day.
    saveJson(this.sheetKey(dateStr), sorted)

    // Row-level persist to DB (prevents overwriting other looms / segments)
    if (updatedLoom) {
      void persistLoomEntry(dateStr, loomNumber, updatedLoom)
    }

    return sorted
  }

  /** Explicit same-day dual quality: add next segment for `qualityId` on this loom/date. */
  addQualitySegmentOnDay(
    dateStr: string,
    loomNumber: number,
    qualityId: string
  ): DailyLoomProductionEntry[] {
    const loom = this.getLooms().find((l) => l.loomNumber === loomNumber)
    if (!loom) return this.buildSheetForDate(dateStr, { skipPersist: true })
    const before = this.buildSheetForDate(dateStr, { skipPersist: true })
    const maxSeg = before
      .filter((e) => e.loomNumber === loomNumber)
      .reduce((m, r) => Math.max(m, sheetSegmentIndex(r)), 0)
    if (maxSeg >= MAX_SAME_DAY_QUALITY_SEGMENTS) {
      return before
    }
    const catalog = this.getQualities()
    this.writeQualityPoseOnDay(
      dateStr,
      loomNumber,
      qualityId,
      { ...loom, qualityId },
      catalog,
      { allowNewSegment: true }
    )
    return this.buildSheetForDate(dateStr, { skipPersist: true })
  }

  /** Remove same-day Part 2+ row (cannot delete Part 1). */
  removeQualitySegmentOnDay(
    dateStr: string,
    loomNumber: number,
    segmentIndex: number
  ): DailyLoomProductionEntry[] {
    const seg = sheetSegmentIndex({ segmentIndex })
    const current = this.buildSheetForDate(dateStr, { skipPersist: true })
    if (seg <= 1) return current

    const removed = current.find(
      (e) => e.loomNumber === loomNumber && sheetSegmentIndex(e) === seg
    )
    if (!removed) return current

    const next = sortSheetEntries(
      current.filter(
        (e) => !(e.loomNumber === loomNumber && sheetSegmentIndex(e) === seg)
      )
    )
    saveJson(this.sheetKey(dateStr), next)
    void persistDeleteLoomSegment(dateStr, loomNumber, seg)

    const catalog = this.getQualities()
    const removedQ = qualityRunThatOwnsSheetEntry(
      { ...removed, date: dateStr },
      catalog,
      dateStr
    )
    const loom = this.getLooms().find((l) => l.loomNumber === loomNumber)
    if (loom && removedQ && loom.qualityId === removedQ.id) {
      const p1 = next.find(
        (e) => e.loomNumber === loomNumber && sheetSegmentIndex(e) === 1
      )
      const p1Q = p1
        ? qualityRunThatOwnsSheetEntry({ ...p1, date: dateStr }, catalog, dateStr)
        : null
      if (p1Q) {
        this.saveLooms(
          this.getLooms().map((l) =>
            l.loomNumber === loomNumber ? { ...l, qualityId: p1Q.id } : l
          )
        )
      }
    }

    return next
  }

  /** Zero roller hours + Actual A/B for every loom on this day (after UI confirm). */
  resetDayMeters(dateStr: string, editorName?: string): DailyLoomProductionEntry[] {
    const current = this.buildSheetForDate(dateStr, { skipPersist: true })
    const editor = editorName || 'Floor Operator'
    const now = new Date().toISOString()
    const next = current.map((e) => {
      const metrics = calculateProductionMetrics({
        rpm: e.rpm,
        runningHours: 0,
        pick: e.pick || 60,
        shiftAMeters: 0,
        shiftBMeters: 0,
        loomNumber: e.loomNumber,
      })
      return {
        ...e,
        rollerHours: 0,
        runningHours: 0,
        shiftAMeters: 0,
        shiftBMeters: 0,
        runningTheoretical: metrics.theoreticalMeters,
        totalMeters: metrics.totalMeters,
        efficiencyPercentage: metrics.efficiencyPercentage,
        stopLossMeters: metrics.stopLossMeters,
        theoretical24h: metrics.theoretical24h,
        efficiency24h: metrics.efficiency24h,
        loss24h: metrics.loss24h,
        lastEditedBy: editor,
        lastEditedAt: now,
      } satisfies DailyLoomProductionEntry
    })
    saveJson(this.sheetKey(dateStr), next)
    for (const row of next) {
      void persistLoomEntry(dateStr, row.loomNumber, row)
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
   * Loom × day matrix. meters / shiftA / shiftB sum. efficiency is actual ÷ target.
   * active is 1 when the loom was running that day. Empty days stay —.
   * `ownsEntry` keeps a quality track on that quality only: a loom that switched
   * quality mid-month does not carry the previous quality's meters.
   */
  buildMonthlyMatrix(
    monthStr: string = PRODUCTION_TODAY_MONTH,
    metric: 'meters' | 'shiftA' | 'shiftB' | 'efficiency' | 'active' = 'meters',
    ownsEntry?: (entry: DailyLoomProductionEntry, dateStr: string) => boolean
  ): {
    days: MonthlyMatrixDay[]
    loomTotals: Record<number, number>
    grandTotalMeters: number
    avgPerDay: number
    /** Sum of actual meters and running target, used to weight efficiency. */
    loomActual: Record<number, number>
    loomTarget: Record<number, number>
    dayActual: number[]
    dayTarget: number[]
  } {
    const lastDay = monthLastEnteredDay(monthStr)

    const loomNumbers = this.getLooms()
      .filter((l) => l.isActive)
      .map((l) => l.loomNumber)
      .sort((a, b) => a - b)

    const loomTotals: Record<number, number> = {}
    const loomActual: Record<number, number> = {}
    const loomTarget: Record<number, number> = {}
    loomNumbers.forEach((n) => {
      loomTotals[n] = 0
      loomActual[n] = 0
      loomTarget[n] = 0
    })

    const days: MonthlyMatrixDay[] = []
    const dayActual: number[] = []
    const dayTarget: number[] = []
    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`
      const peeked = this.peekSheetDay(dateStr)
      const loomMeters: Record<number, number> = {}
      const dayLoomActual: Record<number, number> = {}
      const dayLoomTarget: Record<number, number> = {}
      const loomCounted: Record<number, boolean> = {}
      loomNumbers.forEach((n) => {
        loomMeters[n] = 0
      })
      let totalMeters = 0
      let actualSum = 0
      let targetSum = 0
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
          if (ownsEntry && !ownsEntry(e, dateStr)) continue
          if (ownsEntry) loomCounted[e.loomNumber] = true
          const meters =
            e.totalMeters != null
              ? Number(e.totalMeters) || 0
              : (Number(e.shiftAMeters) || 0) + (Number(e.shiftBMeters) || 0)
          const target = Number(e.runningTheoretical) || 0
          actualSum += meters
          targetSum += target
          loomActual[e.loomNumber] = (loomActual[e.loomNumber] || 0) + meters
          loomTarget[e.loomNumber] = (loomTarget[e.loomNumber] || 0) + target
          // Same-day dual segments: sum meters/target per loom (do not overwrite).
          dayLoomActual[e.loomNumber] = (dayLoomActual[e.loomNumber] || 0) + meters
          dayLoomTarget[e.loomNumber] = (dayLoomTarget[e.loomNumber] || 0) + target

          let value = meters
          if (metric === 'shiftA') value = Number(e.shiftAMeters) || 0
          else if (metric === 'shiftB') value = Number(e.shiftBMeters) || 0
          else if (metric === 'active') {
            value = resolveLoomCondition(e.status, e.remarks) === 'RUNNING' ? 1 : 0
            loomMeters[e.loomNumber] = Math.max(loomMeters[e.loomNumber] || 0, value)
            continue
          } else if (metric === 'efficiency') {
            // Defer % until dayLoomActual/Target are fully summed for the loom.
            continue
          }
          loomMeters[e.loomNumber] = (loomMeters[e.loomNumber] || 0) + value
          loomTotals[e.loomNumber] = (loomTotals[e.loomNumber] || 0) + value
          totalMeters += value
        }
        if (metric === 'efficiency') {
          for (const n of loomNumbers) {
            const a = dayLoomActual[n] || 0
            const t = dayLoomTarget[n] || 0
            loomMeters[n] = t > 0 ? Math.round((a / t) * 100) : 0
          }
        }
        if (metric === 'active') {
          totalMeters = 0
          for (const n of loomNumbers) {
            const v = loomMeters[n] || 0
            loomTotals[n] = (loomTotals[n] || 0) + v
            totalMeters += v
          }
        }
      }

      if (metric === 'efficiency') {
        totalMeters = targetSum > 0 ? Math.round((actualSum / targetSum) * 100) : 0
      }

      dayActual.push(actualSum)
      dayTarget.push(targetSum)
      days.push({
        day,
        date: dateStr,
        totalMeters,
        loomMeters,
        hasSheet,
        loomCounted: ownsEntry ? loomCounted : undefined,
        loomActual: metric === 'efficiency' ? dayLoomActual : undefined,
        loomTarget: metric === 'efficiency' ? dayLoomTarget : undefined,
      })
    }

    if (metric === 'efficiency') {
      for (const n of loomNumbers) {
        const target = loomTarget[n] || 0
        loomTotals[n] = target > 0 ? Math.round(((loomActual[n] || 0) / target) * 100) : 0
      }
    }

    const daysWithSheet = days.filter((d) => d.hasSheet).length
    const grandTotalMeters =
      metric === 'efficiency'
        ? (() => {
            const actual = dayActual.reduce((s, n) => s + n, 0)
            const target = dayTarget.reduce((s, n) => s + n, 0)
            return target > 0 ? Math.round((actual / target) * 100) : 0
          })()
        : days.reduce((s, d) => s + (d.totalMeters || 0), 0)
    const avgPerDay =
      metric === 'efficiency'
        ? grandTotalMeters
        : daysWithSheet > 0
          ? grandTotalMeters / daysWithSheet
          : 0
    return {
      days,
      loomTotals,
      grandTotalMeters,
      avgPerDay,
      loomActual,
      loomTarget,
      dayActual,
      dayTarget,
    }
  }
}

export const productionMastersService = new ProductionMastersService()
