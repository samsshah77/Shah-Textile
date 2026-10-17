import { PRODUCTION_START } from '@/constants/productionCalendar'
import {
  LoomMaster,
  BeamMaster,
  YarnMaster,
  QualityMaster,
  QualityYarnChange,
  QualitySpecChange,
} from './productionTypes'
import {
  LBS_PER_KG,
  DUMMY_LOOM_IMAGES,
  MAX_LOOM_PICTURES,
} from './productionConstants'

export function isClient(): boolean {
  return typeof window !== 'undefined'
}

export function kgToLbs(kg: number): number {
  return Number((kg * LBS_PER_KG).toFixed(2))
}

export function lbsToKg(lbs: number): number {
  return Number((lbs / LBS_PER_KG).toFixed(2))
}

export function calcTotalThreads(reed: number, width: number): number {
  return Math.round((reed || 0) * (width || 0))
}

export function withYarnWeights(
  partial: Partial<YarnMaster> & { yarnType: string; id: string }
): YarnMaster {
  const receivedKg =
    partial.receivedKg ?? (partial.receivedLbs != null ? lbsToKg(partial.receivedLbs) : 0)
  const issuedKg =
    partial.issuedKg ?? (partial.issuedLbs != null ? lbsToKg(partial.issuedLbs) : 0)
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

export function normalizeLoomRef(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null
  return String(value)
}

export function beamOnLoom(beam: BeamMaster, loomNumber: number): boolean {
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

export function simplifyWarpName(name?: string | null): string {
  // Keep free-form warp as entered (e.g. "45/1 Pv White+46/1 Pv Silver").
  if (!name) return ''
  return String(name).replace(/\s+/g, ' ').trim()
}

export function normalizeBeam(b: Partial<BeamMaster> & { beamNo: string }): BeamMaster {
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

export function getDummyLoomImage(loomNumber: number): string {
  const index = Math.abs((loomNumber - 1) % DUMMY_LOOM_IMAGES.length)
  return DUMMY_LOOM_IMAGES[index]
}

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

/** Recipe in force on a production day. History wins; otherwise the current quality yarn. */
function isoDay(value: unknown): string {
  const day = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : ''
}

function sortedSpecHistory(quality: QualityMaster): QualitySpecChange[] {
  return (quality.specHistory || [])
    .filter((item) => Boolean(item) && Boolean(isoDay(item.from)) && Number(item.pick) > 0)
    .map((item) => ({ ...item, from: isoDay(item.from) }))
    .sort((a, b) => a.from.localeCompare(b.from))
}

function sortedYarnHistory(quality: QualityMaster): QualityYarnChange[] {
  return (quality.yarnHistory || [])
    .filter((item) => Boolean(item) && Boolean(isoDay(item.from)))
    .map((item) => ({
      from: isoDay(item.from),
      warpYarn: String(item.warpYarn || ''),
      weftYarn: String(item.weftYarn || ''),
    }))
    .sort((a, b) => a.from.localeCompare(b.from))
}

export function yarnRecipeForDate(
  quality: QualityMaster | null | undefined,
  dateStr: string
): { warpYarn: string; weftYarn: string } | null {
  if (!quality) return null
  const day = isoDay(dateStr)
  let hit: QualityYarnChange | null = null
  for (const h of sortedYarnHistory(quality)) {
    if (h.from <= day && (!hit || h.from >= hit.from)) hit = h
  }
  if (hit) return { warpYarn: hit.warpYarn, weftYarn: hit.weftYarn }
  return { warpYarn: quality.warpYarn || '', weftYarn: quality.weftYarn || '' }
}

export interface EffectiveQualitySpec {
  pick: number
  reed: number
  widthInch: number
  gsm: number
  warpYarn: string
  weftYarn: string
  weavePlan: string
  from: string
}

/**
 * Returns the exact fabric specification effective on a specific production date.
 * If mid-run changes (pick, width, reed, yarn) were made on or before `dateStr`,
 * the version active on that date is returned, protecting past dates from overwrite.
 */
export function qualitySpecForDate(
  quality: QualityMaster | null | undefined,
  dateStr: string
): EffectiveQualitySpec | null {
  if (!quality) return null
  const day = isoDay(dateStr)

  let hit: QualitySpecChange | null = null
  for (const h of sortedSpecHistory(quality)) {
    if (h.from <= day && (!hit || h.from >= hit.from)) {
      hit = h
    }
  }

  const yarnRec = yarnRecipeForDate(quality, day)

  if (hit) {
    return {
      pick: Number(hit.pick) || Number(quality.pick) || 60,
      reed: Number(hit.reed) || Number(quality.reed) || 60,
      widthInch: Number(hit.widthInch) || Number(quality.widthInch) || 66,
      gsm: Number(hit.gsm) || Number(quality.gsm) || 0,
      warpYarn: hit.warpYarn || yarnRec?.warpYarn || quality.warpYarn || '',
      weftYarn: hit.weftYarn || yarnRec?.weftYarn || quality.weftYarn || '',
      weavePlan: hit.weavePlan || quality.weavePlan || '',
      from: hit.from,
    }
  }

  return {
    pick: Number(quality.pick) || 60,
    reed: Number(quality.reed) || 60,
    widthInch: Number(quality.widthInch) || 66,
    gsm: Number(quality.gsm) || 0,
    warpYarn: yarnRec?.warpYarn || quality.warpYarn || '',
    weftYarn: yarnRec?.weftYarn || quality.weftYarn || '',
    weavePlan: quality.weavePlan || '',
    from: quality.createdOn ? String(quality.createdOn).slice(0, 10) : PRODUCTION_START,
  }
}

/** Keep the old warp/weft for days before `fromDate`, and the new pair from that day on. */
export function applyMidRunYarnChange(
  q: QualityMaster,
  patch: Partial<QualityMaster>,
  fromDate: string
): QualityMaster {
  return applyMidRunSpecChange(q, patch, fromDate)
}

/**
 * Versioned Quality Specification:
 * When pick, reed, width, gsm, or yarn changes midway through a run,
 * days before `fromDate` keep their original specifications, and the new
 * specs apply from `fromDate` onward. This guarantees that past production
 * calculations (theoretical meters, efficiency) are never overwritten.
 */
export function applyMidRunSpecChange(
  q: QualityMaster,
  patch: Partial<QualityMaster>,
  fromDate: string
): QualityMaster {
  const day = isoDay(fromDate) || isoDay(q.createdOn) || PRODUCTION_START
  const effective = qualitySpecForDate(q, day)
  const basePick = effective?.pick || Number(q.pick) || 60
  const baseReed = effective?.reed || Number(q.reed) || 60
  const baseWidth = effective?.widthInch || Number(q.widthInch) || 66
  const baseGsm = (effective?.gsm ?? Number(q.gsm)) || 0
  const baseWarp = effective?.warpYarn || q.warpYarn || ''
  const baseWeft = effective?.weftYarn || q.weftYarn || ''
  const baseWeavePlan = effective?.weavePlan || q.weavePlan || ''
  const nextPick = patch.pick !== undefined ? Number(patch.pick) : basePick
  const nextReed = patch.reed !== undefined ? Number(patch.reed) : baseReed
  const nextWidth = patch.widthInch !== undefined ? Number(patch.widthInch) : baseWidth
  const nextGsm = patch.gsm !== undefined ? Number(Number(patch.gsm).toFixed(2)) : baseGsm
  const nextWarp = patch.warpYarn !== undefined ? patch.warpYarn : baseWarp
  const nextWeft = patch.weftYarn !== undefined ? patch.weftYarn : baseWeft
  const nextWeavePlan = patch.weavePlan !== undefined ? patch.weavePlan : baseWeavePlan

  const specTouched =
    patch.pick !== undefined ||
    patch.reed !== undefined ||
    patch.widthInch !== undefined ||
    patch.gsm !== undefined ||
    patch.warpYarn !== undefined ||
    patch.weftYarn !== undefined ||
    patch.weavePlan !== undefined

  const specChanged =
    specTouched &&
    (nextPick !== basePick ||
      nextReed !== baseReed ||
      nextWidth !== baseWidth ||
      nextGsm !== baseGsm ||
      nextWarp !== baseWarp ||
      nextWeft !== baseWeft ||
      nextWeavePlan !== baseWeavePlan)

  let specHistory = sortedSpecHistory(q)
  let yarnHistory = sortedYarnHistory(q)

  if (specChanged) {
    if (specHistory.length === 0) {
      specHistory.push({
        from: q.createdOn ? String(q.createdOn).slice(0, 10) : PRODUCTION_START,
        pick: Number(q.pick) || 60,
        reed: Number(q.reed) || 60,
        widthInch: Number(q.widthInch) || 66,
        gsm: Number(q.gsm) || 0,
        warpYarn: q.warpYarn || '',
        weftYarn: q.weftYarn || '',
        weavePlan: q.weavePlan || '',
      })
    }

    const kept = specHistory.filter((h) => h.from !== day)
    kept.push({
      from: day,
      pick: nextPick,
      reed: nextReed,
      widthInch: nextWidth,
      gsm: nextGsm,
      warpYarn: nextWarp,
      weftYarn: nextWeft,
      weavePlan: nextWeavePlan,
    })
    kept.sort((a, b) => a.from.localeCompare(b.from))
    specHistory = kept
  }

  // Also maintain backward-compatible yarnHistory
  const yarnTouched = patch.warpYarn !== undefined || patch.weftYarn !== undefined
  const currentYarn = yarnRecipeForDate(q, day)
  const yarnChanged =
    yarnTouched &&
    (nextWarp !== (currentYarn?.warpYarn || q.warpYarn || '') ||
      nextWeft !== (currentYarn?.weftYarn || q.weftYarn || ''))
  if (yarnChanged) {
    if (yarnHistory.length === 0) {
      yarnHistory.push({
        from: q.createdOn ? String(q.createdOn).slice(0, 10) : PRODUCTION_START,
        warpYarn: q.warpYarn || '',
        weftYarn: q.weftYarn || '',
      })
    }
    const keptYarn = yarnHistory.filter((h) => h.from !== day)
    keptYarn.push({ from: day, warpYarn: nextWarp, weftYarn: nextWeft })
    keptYarn.sort((a, b) => a.from.localeCompare(b.from))
    yarnHistory = keptYarn
  }

  // The master row always mirrors the latest version; inserting a correction in the
  // past must not roll current production back or delete later scheduled versions.
  const latest = qualitySpecForDate({ ...q, specHistory, yarnHistory }, '9999-12-31')

  return {
    ...q,
    ...patch,
    pick: latest?.pick ?? nextPick,
    reed: latest?.reed ?? nextReed,
    widthInch: latest?.widthInch ?? nextWidth,
    gsm: latest?.gsm ?? nextGsm,
    warpYarn: latest?.warpYarn ?? nextWarp,
    weftYarn: latest?.weftYarn ?? nextWeft,
    weavePlan: latest?.weavePlan ?? nextWeavePlan,
    specHistory,
    yarnHistory,
  }
}
