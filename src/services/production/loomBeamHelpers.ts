/** Units (kg/lbs), beam-on-loom lookups, beam normalizer and loom pictures. */
import type { YarnMaster, BeamMaster, LoomMaster } from '@/services/production/masterTypes'


/** 1 kg = 2.2046 lbs → kg = lbs / 2.2046 */
export const LBS_PER_KG = 2.2046

export function kgToLbs(kg: number) {
  return Number((kg * LBS_PER_KG).toFixed(2))
}

export function lbsToKg(lbs: number) {
  return Number((lbs / LBS_PER_KG).toFixed(2))
}

export function calcTotalThreads(reed: number, width: number) {
  return Math.round((reed || 0) * (width || 0))
}

export function isClient() {
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

export function normalizeLoomRef(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null
  return String(value)
}

export function beamOnLoom(beam: BeamMaster, loomNumber: number) {
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
  // Only a beam lying in the store has a "kept behind loom" place.
  const parkedNearLoom =
    !usedInLoom && location === 'STORE' && b.parkedNearLoom != null && String(b.parkedNearLoom).trim() !== ''
      ? String(b.parkedNearLoom).trim()
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
    parkedNearLoom,
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
