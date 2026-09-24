import { INITIAL_34_LOOMS_CONFIG } from '@/constants/looms-init'
import { getExcelBeamStock, getExcelWeftStock } from '@/data/productionData'
import type { LoomStatus } from '@/types/loom'
import {
  type BeamMaster,
  type LoomMaster,
  type QualityMaster,
  type YarnLoomIssuance,
  type YarnMaster,
  type YarnMovementRecord,
  calcTotalThreads,
  getDummyLoomImage,
  kgToLbs,
  normalizeLoomPictures,
  withYarnWeights,
} from '@/services/productionMastersService'

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
      status: (isStopped
        ? l.loomNumber === 13
          ? 'BEAM_END'
          : 'STOPPED'
        : 'RUNNING') as LoomStatus,
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
    const usedInLoom = b.usedInLoom ? String(b.usedInLoom) : null
    return {
      beamNo: b.beamNo,
      warp: b.warp,
      reed,
      width,
      totalThreads: calcTotalThreads(reed, width),
      length: b.length,
      loomType: b.loomType,
      fillStatus: 'FULL' as const,
      usedInLoom,
      status: (usedInLoom ? 'MOUNTED' : 'FULL') as BeamMaster['status'],
      location: usedInLoom || 'STORE',
      mountedOn: mountedDate,
      beamEndedOn: b.beamNo === '134' ? '2026-09-22' : null,
      endedFromLoom: b.beamNo === '134' ? '13' : null,
    }
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
  ]
}

function seedYarnMovements(): YarnMovementRecord[] {
  const issuances = seedYarnIssuances()
  const inward: YarnMovementRecord[] = seedYarn().slice(0, 3).map((y, i) => ({
    id: `in-${i + 1}`,
    type: 'INWARD',
    yarnId: y.id,
    yarnType: y.yarnType,
    date: '2026-09-20',
    weightKg: y.receivedKg,
    weightLbs: kgToLbs(y.receivedKg),
    bags: y.bags,
    createdAt: '2026-09-20T05:00:00Z',
  }))
  const outward: YarnMovementRecord[] = issuances.map((iss) => ({
    id: `out-${iss.id}`,
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
  return [...inward, ...outward]
}

export function buildFloorSeedPayload() {
  return {
    looms: seedLooms(),
    beams: seedBeams(),
    yarn: seedYarn(),
    issuances: seedYarnIssuances(),
    movements: seedYarnMovements(),
    qualities: seedQualities(),
  }
}
