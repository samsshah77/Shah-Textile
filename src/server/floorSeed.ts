import { INITIAL_34_LOOMS_CONFIG } from '@/constants/looms-init'
import type { LoomStatus } from '@/types/loom'
import {
  type BeamMaster,
  type LoomMaster,
  type QualityMaster,
  type YarnLoomIssuance,
  type YarnMaster,
  type YarnMovementRecord,
  getDummyLoomImage,
  normalizeLoomPictures,
} from '@/services/productionMastersService'

function seedLooms(): LoomMaster[] {
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
    }
  })
}

function seedBeams(): BeamMaster[] {
  return []
}

function seedYarn(): YarnMaster[] {
  return []
}

function seedQualities(): QualityMaster[] {
  return []
}

function seedYarnIssuances(): YarnLoomIssuance[] {
  return []
}

function seedYarnMovements(): YarnMovementRecord[] {
  return []
}

export function buildFloorSeedPayload() {
  return {
    looms: seedLooms(),
    beams: [],
    yarn: [],
    issuances: [],
    movements: [],
    qualities: [],
  }
}
