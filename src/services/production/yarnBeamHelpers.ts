import { PRODUCTION_START } from '@/constants/productionCalendar'
import {
  LoomMaster,
  BeamMaster,
  YarnMaster,
  QualityMaster,
  QualityYarnChange,
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
export function applyMidRunYarnChange(
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
