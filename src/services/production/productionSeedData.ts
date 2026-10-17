import { LoomStatus } from '@/types/loom'
import { INITIAL_34_LOOMS_CONFIG } from '@/constants/looms-init'
import {
  LoomMaster,
  BeamMaster,
  YarnMaster,
  QualityMaster,
  YarnLoomIssuance,
  YarnMovementRecord,
} from './productionTypes'
import {
  getDummyLoomImage,
  normalizeLoomPictures,
} from './yarnBeamHelpers'

export function seedLooms(): LoomMaster[] {
  return INITIAL_34_LOOMS_CONFIG.map((l) => {
    const pics = normalizeLoomPictures({
      loomNumber: l.loomNumber,
      pictureDataUrl: getDummyLoomImage(l.loomNumber),
    })
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
      status: 'RUNNING' as LoomStatus,
      statusSince: null,
      qualityId: null,
      qualityAssignedOn: null,
      weftYarnId: null,
      isTwinBeam: false,
    }
  })
}

export function seedBeams(): BeamMaster[] {
  return []
}

export function seedYarn(): YarnMaster[] {
  return []
}

export function seedQualities(): QualityMaster[] {
  return []
}

export function seedYarnIssuances(): YarnLoomIssuance[] {
  return []
}

export function seedYarnMovements(): YarnMovementRecord[] {
  return []
}

/** Mill roster is always Loom 1 … 34, in that order. Missing numbers are filled from clean defaults. */
export function completeLoomRoster(looms: LoomMaster[]): { list: LoomMaster[]; changed: boolean } {
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
