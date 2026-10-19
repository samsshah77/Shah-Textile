/** Starting data (34 looms, beams, yarn, qualities, issuances) used when the DB has none. */
import { LoomStatus } from '@/types/loom'
import { INITIAL_34_LOOMS_CONFIG } from '@/constants/looms-init'
import { getExcelBeamStock, getExcelWeftStock } from '@/data/productionData'
import type {
  LoomMaster,
  BeamMaster,
  YarnMaster,
  QualityMaster,
  YarnLoomIssuance,
  YarnMovementRecord,
} from '@/services/production/masterTypes'
import {
  normalizeLoomPictures,
  getDummyLoomImage,
  normalizeBeam,
  withYarnWeights,
  kgToLbs,
} from '@/services/production/loomBeamHelpers'

/** Mill roster is always Loom 1 … 34, in that order. Missing numbers are filled from the seed. */
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

export function seedLooms(): LoomMaster[] {
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

export function seedBeams(): BeamMaster[] {
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

export function seedYarn(): YarnMaster[] {
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

export function seedQualities(): QualityMaster[] {
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

export function seedYarnIssuances(): YarnLoomIssuance[] {
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

export function seedYarnMovements(): YarnMovementRecord[] {
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
