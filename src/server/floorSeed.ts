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
