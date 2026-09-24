/**
 * Seed masters + daily production sheet for 2026-09-23
 * from the printed Sara Textile ERP sheet (G6200 / G6300 / PU).
 */
import { calculateProductionMetrics, type DailyLoomProductionEntry } from '@/types/production'
import type { LoomStatus, LoomCategory } from '@/types/loom'
import { LOOM_STATUS_LABEL } from '@/constants/loomConditions'
import {
  dbGetBeams,
  dbGetLooms,
  dbGetQualities,
  dbGetYarn,
  dbGetYarnIssuances,
  dbSaveBeams,
  dbSaveLooms,
  dbSaveQualities,
  dbSaveSheet,
  dbSaveYarn,
  dbSaveYarnIssuances,
} from '@/server/floorDb'
import {
  calcTotalThreads,
  getDummyLoomImage,
  normalizeLoomPictures,
  withYarnWeights,
  type BeamMaster,
  type LoomMaster,
  type QualityMaster,
  type YarnLoomIssuance,
  type YarnMaster,
} from '@/services/productionMastersService'

export const SHEET_DATE_2026_09_23 = '2026-09-23'

type Row = {
  loomNumber: number
  category: LoomCategory
  qualityName: string
  fabricType: string
  warp: string
  weft: string
  rpm: number
  reed: number
  pick: number
  widthInch: number
  gsm: number
  rollerHours: number
  shiftA: number
  shiftB: number
  remarks: string
  lot: string
  status: LoomStatus
}

const DATE = SHEET_DATE_2026_09_23

/** Paper sheet 23 Sep 2026 — masters + Actual A/B / roller / remarks / SW# */
const ROWS: Row[] = [
  { loomNumber: 1, category: 'G6200', qualityName: 'PARCOPV', fabricType: 'Suiting', warp: '20/1-Pv-China', weft: '20/1-Pv-China', rpm: 353, reed: 120, pick: 60, widthInch: 66, gsm: 1.77, rollerHours: 22, shiftA: 101, shiftB: 88, remarks: '', lot: 'Sw # 331', status: 'RUNNING' },
  { loomNumber: 2, category: 'G6200', qualityName: 'DESIGN-2x1', fabricType: 'Ribstop', warp: '20/1-Pv-China', weft: '20/1-Pv-China', rpm: 337, reed: 66, pick: 53, widthInch: 66, gsm: 2.04, rollerHours: 22, shiftA: 111, shiftB: 95, remarks: '', lot: 'Sw # 337', status: 'RUNNING' },
  { loomNumber: 3, category: 'G6200', qualityName: 'HARNAI', fabricType: 'Worsted Wool', warp: '20/2-Pvt-Kohat', weft: '300/2-Twisted', rpm: 360, reed: 68, pick: 39, widthInch: 66, gsm: 2.03, rollerHours: 22, shiftA: 119, shiftB: 11, remarks: 'Elec Fault', lot: 'Sw # 329', status: 'ELEC_FAULT' },
  { loomNumber: 4, category: 'G6200', qualityName: 'HARNAI', fabricType: 'Worsted Wool', warp: '20/2-Pvt-Kohat', weft: '300/2-Twisted', rpm: 364, reed: 68, pick: 39, widthInch: 66, gsm: 2.03, rollerHours: 22, shiftA: 86, shiftB: 115, remarks: 'Elec Fault', lot: '', status: 'ELEC_FAULT' },
  { loomNumber: 5, category: 'G6200', qualityName: 'Gul-Ahmed-(1x1)', fabricType: 'Fabrics', warp: '45/1-Pv-White+46/1-Pv-Silver', weft: '45/1-Pv-White+75/144-Twisted', rpm: 347, reed: 82, pick: 92, widthInch: 66, gsm: 0.96, rollerHours: 22, shiftA: 54, shiftB: 54, remarks: 'Jacquard Fault', lot: 'Sw # 337', status: 'JACQUARD_FAULT' },
  { loomNumber: 6, category: 'G6200', qualityName: 'SILVER-SHINE', fabricType: 'Gabardine Suiting', warp: '45/1-Pv-China', weft: '45/1-Pv-China', rpm: 346, reed: 120, pick: 95, widthInch: 66, gsm: 1.26, rollerHours: 46, shiftA: 96, shiftB: 56, remarks: 'Elec Fault', lot: 'Sw # 328', status: 'ELEC_FAULT' },
  { loomNumber: 7, category: 'G6200', qualityName: 'Gul-Ahmed-(1x1)', fabricType: 'Fabrics', warp: '45/1-Pv-White+46/1-Pv-Silver', weft: '45/1-Pv-White+75/144-Twisted', rpm: 341, reed: 82, pick: 92, widthInch: 66, gsm: 0.96, rollerHours: 22, shiftA: 50, shiftB: 52, remarks: '', lot: 'Sw # 337', status: 'RUNNING' },
  { loomNumber: 8, category: 'G6200', qualityName: 'EIFFEL-TOWER', fabricType: 'Gabardine Suiting', warp: '45/1-Pv-China', weft: '300-Twisted', rpm: 323, reed: 120, pick: 70, widthInch: 66, gsm: 1.83, rollerHours: 0, shiftA: 0, shiftB: 0, remarks: 'B/End', lot: 'Sw # 328', status: 'BEAM_END' },
  { loomNumber: 9, category: 'G6200', qualityName: 'DUMDUM', fabricType: 'Worsted Suiting', warp: '20/2-Pvt-Ash', weft: '20/3-Pvt-St-Ash', rpm: 320, reed: 68, pick: 36, widthInch: 66, gsm: 2.36, rollerHours: 22, shiftA: 122, shiftB: 60, remarks: 'Elec Fault', lot: '', status: 'ELEC_FAULT' },
  { loomNumber: 10, category: 'G6200', qualityName: 'Gul-Ahmed-(1x1)', fabricType: 'Fabrics', warp: '45/1-Pv-White+46/1-Pv-Silver', weft: '45/1-Pv-White+75/144-Twisted', rpm: 355, reed: 82, pick: 92, widthInch: 66, gsm: 0.96, rollerHours: 22, shiftA: 62, shiftB: 29, remarks: 'Elec Fault', lot: 'Sw # 337', status: 'ELEC_FAULT' },
  { loomNumber: 11, category: 'G6200', qualityName: 'HARNAI', fabricType: 'Worsted Wool', warp: '20/2-Pvt-Kohat', weft: '300/2-Twisted', rpm: 327, reed: 68, pick: 39, widthInch: 66, gsm: 2.03, rollerHours: 0, shiftA: 0, shiftB: 0, remarks: 'B/End', lot: '', status: 'BEAM_END' },
  { loomNumber: 12, category: 'G6200', qualityName: 'SEVEN-ELEVEN', fabricType: 'Suiting', warp: '20/1-Pv-80/20-China', weft: '40/1-Pv-65/35', rpm: 328, reed: 82, pick: 82, widthInch: 66, gsm: 1.63, rollerHours: 22, shiftA: 62, shiftB: 61, remarks: '', lot: 'Sw # 331', status: 'RUNNING' },
  { loomNumber: 13, category: 'G6200', qualityName: 'DECATIZE', fabricType: '', warp: '40/3-Cvc', weft: '30/1-Cvc', rpm: 366, reed: 37, pick: 290, widthInch: 76, gsm: 3.93, rollerHours: 22, shiftA: 18, shiftB: 20, remarks: '', lot: '', status: 'RUNNING' },
  { loomNumber: 14, category: 'G6200', qualityName: 'HERRINGBONE', fabricType: 'NoName', warp: '20/1-Pv-China', weft: '30/1-PP', rpm: 333, reed: 74, pick: 60, widthInch: 66, gsm: 1.51, rollerHours: 22, shiftA: 94, shiftB: 44, remarks: '', lot: 'Sw # 333', status: 'RUNNING' },
  { loomNumber: 15, category: 'G6200', qualityName: 'KAAVISH', fabricType: 'Shirting', warp: '40/1-PP-China', weft: '40/1-Pv-Grace+Fr-75/2', rpm: 344, reed: 82, pick: 73, widthInch: 66, gsm: 1.11, rollerHours: 0, shiftA: 0, shiftB: 0, remarks: '', lot: 'Sw # 323', status: 'RUNNING' },
  { loomNumber: 16, category: 'G6200', qualityName: 'UJALA', fabricType: 'Shirting', warp: 'Fr-100', weft: '45/1-Pv-China', rpm: 326, reed: 100, pick: 93, widthInch: 66, gsm: 1.04, rollerHours: 0, shiftA: 0, shiftB: 0, remarks: 'B/End', lot: '', status: 'BEAM_END' },
  { loomNumber: 17, category: 'G6200', qualityName: 'BURMA', fabricType: 'Suiting', warp: 'Fr-157', weft: 'Fr-150-Twisted', rpm: 350, reed: 120, pick: 63, widthInch: 66, gsm: 1.63, rollerHours: 0, shiftA: 0, shiftB: 0, remarks: '', lot: '', status: 'RUNNING' },
  { loomNumber: 18, category: 'G6200', qualityName: 'UJALA', fabricType: 'Shirting', warp: 'Fr-100', weft: '45/1-Pv-China', rpm: 327, reed: 100, pick: 93, widthInch: 66, gsm: 1.04, rollerHours: 0, shiftA: 0, shiftB: 0, remarks: '', lot: '', status: 'RUNNING' },
  { loomNumber: 19, category: 'G6200', qualityName: 'PARCOPV', fabricType: 'Suiting', warp: '20/1-Pv-China', weft: '20/1-Pv-China', rpm: 336, reed: 120, pick: 60, widthInch: 66, gsm: 1.6, rollerHours: 22, shiftA: 91, shiftB: 17, remarks: 'Elec Fault', lot: 'Sw # 335', status: 'ELEC_FAULT' },
  { loomNumber: 20, category: 'G6200', qualityName: 'HERRINGBONE', fabricType: 'NoName', warp: '20/1-Pv-China', weft: '30/1-PP', rpm: 329, reed: 74, pick: 60, widthInch: 66, gsm: 1.51, rollerHours: 22, shiftA: 87, shiftB: 75, remarks: '', lot: 'Sw # 333', status: 'RUNNING' },
  { loomNumber: 27, category: 'G6300', qualityName: 'NUVEX', fabricType: 'By-Gul-Ahmed', warp: '30/1-Pv-65/35-Grace', weft: '30/1-Pv-65/35-China', rpm: 352, reed: 112, pick: 82, widthInch: 66, gsm: 1.74, rollerHours: 22, shiftA: 57, shiftB: 43, remarks: 'Elec Fault', lot: 'Sw # 336', status: 'ELEC_FAULT' },
  { loomNumber: 28, category: 'G6300', qualityName: 'NUVEX', fabricType: 'By-Gul-Ahmed', warp: '30/1-Pv-65/35-Grace', weft: '30/1-Pv-65/35-Grace', rpm: 364, reed: 112, pick: 82, widthInch: 66, gsm: 1.74, rollerHours: 0, shiftA: 0, shiftB: 0, remarks: '', lot: 'Sw # 336', status: 'RUNNING' },
  { loomNumber: 29, category: 'G6300', qualityName: 'Gul-Ahmed-(2x2)', fabricType: 'Fabrics', warp: '46/1-Pv-White+60/1-Pv-Silver', weft: '45/1-Pv-White+60/1-Pv-Silver', rpm: 375, reed: 84, pick: 84, widthInch: 66, gsm: 0.88, rollerHours: 0, shiftA: 0, shiftB: 0, remarks: '', lot: 'Sw # 338', status: 'RUNNING' },
  { loomNumber: 30, category: 'G6300', qualityName: 'OPTIMAX', fabricType: 'Shirting', warp: 'Fr-75', weft: '45/1-Pv', rpm: 350, reed: 112, pick: 85, widthInch: 66, gsm: 0.91, rollerHours: 46, shiftA: 116, shiftB: 105, remarks: '', lot: '', status: 'RUNNING' },
  { loomNumber: 31, category: 'G6300', qualityName: 'TIBET', fabricType: 'Worsted Suiting', warp: 'Fr-150/2-Twisted', weft: '20/1-Pv-China', rpm: 395, reed: 68, pick: 58, widthInch: 66, gsm: 1.8, rollerHours: 15, shiftA: 88, shiftB: 21, remarks: 'B/End', lot: '', status: 'BEAM_END' },
  { loomNumber: 32, category: 'G6300', qualityName: 'Gul-Ahmed-(2x2)', fabricType: 'Fabrics', warp: '46/1-Pv-White+60/1-Pv-Silver', weft: '45/1-Pv-White+60/1-Pv-Silver', rpm: 345, reed: 84, pick: 84, widthInch: 66, gsm: 0.88, rollerHours: 0, shiftA: 0, shiftB: 0, remarks: '', lot: 'Sw # 323', status: 'RUNNING' },
  { loomNumber: 33, category: 'G6300', qualityName: 'Gul-Ahmed-(2x2)', fabricType: 'Fabrics', warp: '46/1-Pv-White+60/1-Pv-Silver', weft: '45/1-Pv-White+60/1-Pv-Silver', rpm: 364, reed: 84, pick: 84, widthInch: 66, gsm: 0.88, rollerHours: 0, shiftA: 0, shiftB: 0, remarks: '', lot: 'Sw # 338', status: 'RUNNING' },
  { loomNumber: 34, category: 'G6300', qualityName: 'Gul-Ahmed-(2x2)', fabricType: 'Fabrics', warp: '46/1-Pv-White+60/1-Pv-Silver', weft: '45/1-Pv-White+60/1-Pv-Silver', rpm: 353, reed: 84, pick: 84, widthInch: 66, gsm: 0.88, rollerHours: 46, shiftA: 99, shiftB: 71, remarks: 'Elec Fault', lot: 'Sw # 338', status: 'ELEC_FAULT' },
  { loomNumber: 21, category: 'PU', qualityName: 'VISION-SILVRA', fabricType: 'By-Gul-Ahmed', warp: '36/1-Pv-AA', weft: '36/1-Pv-Ash', rpm: 230, reed: 88, pick: 76, widthInch: 66, gsm: 1.24, rollerHours: 0, shiftA: 0, shiftB: 0, remarks: 'Knotting', lot: 'Sw # 330', status: 'KNOTTING' },
  { loomNumber: 22, category: 'PU', qualityName: 'PARCOPV', fabricType: 'Suiting', warp: '20/1-Pv-China', weft: '20/1-Pv-China', rpm: 265, reed: 120, pick: 60, widthInch: 66, gsm: 1.6, rollerHours: 23, shiftA: 76, shiftB: 70, remarks: '', lot: 'Sw # 335', status: 'RUNNING' },
  { loomNumber: 23, category: 'PU', qualityName: 'VISION-SILVRA', fabricType: 'By-Gul-Ahmed', warp: '36/1-Pv-AA', weft: '36/1-Pv-AA', rpm: 230, reed: 88, pick: 76, widthInch: 66, gsm: 1.24, rollerHours: 46, shiftA: 140, shiftB: 102, remarks: 'Jacquard Fault', lot: 'Sw # 340', status: 'JACQUARD_FAULT' },
  { loomNumber: 24, category: 'PU', qualityName: 'VISION-SILVRA', fabricType: 'By-Gul-Ahmed', warp: '36/1-Pv-AA', weft: '36/1-Pv-AA', rpm: 230, reed: 82, pick: 82, widthInch: 66, gsm: 1.26, rollerHours: 0, shiftA: 0, shiftB: 0, remarks: 'B/End', lot: 'Sw # 326', status: 'BEAM_END' },
  { loomNumber: 25, category: 'PU', qualityName: 'VISION-SILVRA', fabricType: 'By-Gul-Ahmed', warp: '36/1-Pv-AA', weft: '36/1-Pv-AA', rpm: 220, reed: 88, pick: 76, widthInch: 66, gsm: 1.24, rollerHours: 22, shiftA: 86, shiftB: 74, remarks: '', lot: 'Sw # 340', status: 'RUNNING' },
  { loomNumber: 26, category: 'PU', qualityName: 'VISION-SILVRA', fabricType: 'By-Gul-Ahmed', warp: '36/1-Pv-AA', weft: '36/1-Pv-Ash', rpm: 230, reed: 82, pick: 82, widthInch: 66, gsm: 1.26, rollerHours: 0, shiftA: 0, shiftB: 0, remarks: 'B/End', lot: 'Sw # 326', status: 'BEAM_END' },
]

function qualityIdFor(name: string) {
  return `q-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`
}

function yarnIdFor(weft: string) {
  return `yarn-${weft
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)}`
}

export type SeedSheetResult = {
  date: string
  looms: number
  totalA: number
  totalB: number
  totalAB: number
}

/** Upsert qualities/looms/beams/yarn + daily sheet for 2026-09-23 into the connected DATABASE_URL. */
export async function seedSheet20260923(): Promise<SeedSheetResult> {
  const qualityByName = new Map<string, QualityMaster>()
  for (const r of ROWS) {
    if (qualityByName.has(r.qualityName)) continue
    qualityByName.set(r.qualityName, {
      id: qualityIdFor(r.qualityName),
      name: r.qualityName,
      fabricType: r.fabricType || '—',
      warpYarn: r.warp,
      weftYarn: r.weft,
      reed: r.reed,
      pick: r.pick,
      widthInch: r.widthInch,
      gsm: r.gsm,
    })
  }
  const existingQ = await dbGetQualities()
  const keepExtra = existingQ.filter((q) => !qualityByName.has(q.name))
  await dbSaveQualities([...qualityByName.values(), ...keepExtra])

  const yarnByType = new Map<string, YarnMaster>()
  for (const y of await dbGetYarn()) yarnByType.set(y.yarnType, y)
  for (const r of ROWS) {
    if (yarnByType.has(r.weft)) continue
    yarnByType.set(
      r.weft,
      withYarnWeights({
        id: yarnIdFor(r.weft),
        yarnType: r.weft,
        bags: 10,
        receivedKg: 500,
        issuedKg: 50,
      })
    )
  }
  await dbSaveYarn([...yarnByType.values()])

  const existingLooms = await dbGetLooms()
  const loomMap = new Map(existingLooms.map((l) => [l.loomNumber, l]))
  const looms: LoomMaster[] = ROWS.map((r) => {
    const prev = loomMap.get(r.loomNumber)
    const pics = normalizeLoomPictures({
      loomNumber: r.loomNumber,
      pictureDataUrl: prev?.pictureDataUrl || getDummyLoomImage(r.loomNumber),
      pictureDataUrls: prev?.pictureDataUrls,
    })
    return {
      loomNumber: r.loomNumber,
      name: prev?.name || `Loom ${r.loomNumber}`,
      model: r.category,
      category: r.category,
      year: prev?.year ?? 2018 + (r.loomNumber % 6),
      ...pics,
      defaultRpm: r.rpm,
      shed: prev?.shed || 'Main Floor',
      isActive: true,
      status: 'RUNNING',
      statusSince: null,
      qualityId: qualityIdFor(r.qualityName),
      weftYarnId: yarnIdFor(r.weft),
    }
  })
  for (const l of existingLooms) {
    if (!ROWS.some((r) => r.loomNumber === l.loomNumber)) looms.push(l)
  }
  await dbSaveLooms(looms)

  const existingBeams = await dbGetBeams()
  const usedLooms = new Set(ROWS.map((r) => String(r.loomNumber)))
  const beams: BeamMaster[] = existingBeams
    .filter((b) => !String(b.beamNo).startsWith('S23-'))
    .map((b) => {
      if (b.usedInLoom && usedLooms.has(String(b.usedInLoom))) {
        return {
          ...b,
          usedInLoom: null,
          status: 'FULL' as const,
          location: 'STORE' as const,
          mountedOn: null,
          beamEndedOn: null,
          endedFromLoom: null,
        }
      }
      return b
    })

  for (const r of ROWS) {
    beams.push({
      beamNo: `S23-${r.loomNumber}`,
      warp: r.warp,
      reed: r.reed,
      width: r.widthInch,
      totalThreads: calcTotalThreads(r.reed, r.widthInch),
      length: 2500,
      loomType: r.category,
      fillStatus: 'FULL',
      usedInLoom: String(r.loomNumber),
      status: 'MOUNTED',
      location: String(r.loomNumber),
      mountedOn: '2026-09-10',
      beamEndedOn: null,
      endedFromLoom: null,
    })
  }
  await dbSaveBeams(beams)

  const prevIss = await dbGetYarnIssuances()
  const keptIss = prevIss.filter((i) => !ROWS.some((r) => r.loomNumber === i.loomNumber && i.date === DATE))
  const newIss: YarnLoomIssuance[] = ROWS.map((r, idx) => ({
    id: `iss-${DATE}-${r.loomNumber}`,
    yarnId: yarnIdFor(r.weft),
    yarnType: r.weft,
    loomNumber: r.loomNumber,
    issuedKg: 5,
    pick: r.pick,
    date: DATE,
    createdAt: new Date(Date.UTC(2026, 8, 23, 8, idx, 0)).toISOString(),
  }))
  await dbSaveYarnIssuances([...newIss, ...keptIss])

  const entries: DailyLoomProductionEntry[] = ROWS.map((r) => {
    const metrics = calculateProductionMetrics({
      rpm: r.rpm,
      runningHours: r.rollerHours,
      pick: r.pick,
      shiftAMeters: r.shiftA,
      shiftBMeters: r.shiftB,
    })
    return {
      id: `PROD-${DATE}-${r.loomNumber}`,
      date: DATE,
      loomNumber: r.loomNumber,
      category: r.category,
      model: r.category,
      qualityName: r.qualityName,
      fabricType: r.fabricType || '—',
      warpYarn: r.warp,
      weftYarn: r.weft,
      rpm: r.rpm,
      reed: r.reed,
      pick: r.pick,
      widthInch: r.widthInch,
      gsm: r.gsm,
      rollerHours: r.rollerHours,
      runningHours: r.rollerHours,
      runningTheoretical: metrics.theoreticalMeters,
      shiftAMeters: r.shiftA,
      shiftBMeters: r.shiftB,
      totalMeters: metrics.totalMeters,
      efficiencyPercentage: metrics.efficiencyPercentage,
      stopLossMeters: metrics.stopLossMeters,
      theoretical24h: metrics.theoretical24h,
      efficiency24h: metrics.efficiency24h,
      loss24h: metrics.loss24h,
      status: r.status,
      remarks: r.remarks || (r.status !== 'RUNNING' ? LOOM_STATUS_LABEL[r.status] : ''),
      lot: r.lot,
    }
  })

  await dbSaveSheet(DATE, entries)

  const totalA = entries.reduce((s, e) => s + e.shiftAMeters, 0)
  const totalB = entries.reduce((s, e) => s + e.shiftBMeters, 0)
  return {
    date: DATE,
    looms: entries.length,
    totalA,
    totalB,
    totalAB: totalA + totalB,
  }
}
