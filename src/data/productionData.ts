import productionRawData from './productionExcelData.json'
import { PRODUCTION_TODAY } from '@/constants/productionCalendar'
import {
  DailyLoomProductionEntry,
  ProductionSummary,
  ActiveQualityOrder,
  MonthlyMatrixDay,
  BeamStockItem,
  WeftStockDay,
  QualityEndRecord,
} from '@/types/production';
import { LoomCategory, LoomStatus } from '@/types/loom';

export const PRODUCTION_EXCEL_DATA = productionRawData;

export function getExcelDailyLoomEntries(): DailyLoomProductionEntry[] {
  const date = productionRawData.date || PRODUCTION_TODAY;
  return productionRawData.dailyLooms.map((l: any) => {
    let category: LoomCategory = 'G6200';
    if (l.model === 'G6300') category = 'G6300';
    else if (l.model === 'PU') category = 'PU';

    let status: LoomStatus = 'RUNNING';
    if (l.status === 'BEAM_END' || l.remarks?.includes('B/End')) status = 'BEAM_END';
    else if (l.status === 'KNOTTING' || l.remarks?.includes('Knotting')) status = 'KNOTTING';
    else if (l.status === 'STOPPED' || l.totalMeters === 0) status = 'STOPPED';
    else if (l.status === 'BREAKDOWN') status = 'BREAKDOWN';

    return {
      id: `PROD-${date}-${l.loomNumber}`,
      date,
      loomNumber: l.loomNumber,
      category,
      model: l.model,
      qualityName: l.qualityName || 'Plain Weave',
      fabricType: l.fabricType || 'Suiting',
      warpYarn: l.warpYarn || '',
      weftYarn: l.weftYarn || '',
      rpm: l.rpm,
      reed: l.reed,
      pick: l.pick,
      widthInch: l.width,
      gsm: l.gsm,
      rollerHours: l.rollerHours || 24,
      runningHours: l.rollerHours || 24,
      runningTheoretical: l.runningTheoretical,
      shiftAMeters: l.shiftAMeters,
      shiftBMeters: l.shiftBMeters,
      totalMeters: l.totalMeters,
      efficiencyPercentage: l.efficiencyRunning,
      stopLossMeters: l.lossRunning,
      theoretical24h: l.theoretical24h,
      efficiency24h: l.efficiency24h,
      loss24h: l.loss24h,
      status,
      remarks: l.remarks || undefined,
      lot: l.lot || undefined,
    };
  });
}

/** Every dated Excel production day (the 23 Sep sheet lives here when it is not in the DB yet). */
export function getExcelHistoryEntries(): DailyLoomProductionEntry[] {
  const history = (productionRawData as { dailyHistory?: Record<string, unknown> }).dailyHistory || {}
  const rows: DailyLoomProductionEntry[] = []
  for (const dateStr of Object.keys(history)) {
    if (dateStr.startsWith('2026-08') || dateStr >= PRODUCTION_TODAY) continue
    rows.push(...getExcelDailyLoomsForDate(dateStr))
  }
  return rows
}

export function getExcelDailyLoomsForDate(dateStr: string): DailyLoomProductionEntry[] {
  // No August (or other) fabricated history — only real entered days / blank template
  if (dateStr.startsWith('2026-08')) {
    return []
  }

  const history = (productionRawData as any).dailyHistory
  const hasHistory = history && history[dateStr] && Array.isArray(history[dateStr])
  const rawList = hasHistory ? history[dateStr] : productionRawData.dailyLooms

  const blankDay = !hasHistory || dateStr >= PRODUCTION_TODAY

  return rawList.map((l: any) => {
    let category: LoomCategory = 'G6200'
    if (l.model === 'G6300') category = 'G6300'
    else if (l.model === 'PU') category = 'PU'

    let status: LoomStatus = 'RUNNING'
    let remarks = ''
    let rollerHours = 0
    let shiftA = 0
    let shiftB = 0

    if (!blankDay) {
      remarks = l.remarks || ''
      rollerHours = l.rollerHours ?? 0
      shiftA = l.shiftAMeters ?? 0
      shiftB = l.shiftBMeters ?? 0
      if (l.status === 'BEAM_END' || l.remarks?.includes('B/End')) status = 'BEAM_END'
      else if (l.status === 'KNOTTING' || l.remarks?.includes('Knotting')) status = 'KNOTTING'
      else if (l.status === 'STOPPED' || l.totalMeters === 0) status = 'STOPPED'
      else if (l.status === 'BREAKDOWN') status = 'BREAKDOWN'
      else status = (l.status as LoomStatus) || 'RUNNING'
    }

    const totalMeters = shiftA + shiftB
    const rpm = l.rpm || 350
    const pick = l.pick || 60
    const beamDivisor = [21, 23, 24, 25, 26].includes(l.loomNumber) ? 2 : 1
    const runningTheo = ((rpm / pick) * (60 / 39.38) * rollerHours) / beamDivisor
    const theo24h = (rpm / pick) * (60 / 39.38) * 24
    const efficiencyRunning = runningTheo > 0 ? Math.round((totalMeters / runningTheo) * 100) : 0
    const efficiency24h = theo24h > 0 ? Math.round((totalMeters / theo24h) * 100) : 0
    const runningTheoretical = Math.round(runningTheo)
    const theoretical24h = Math.round(theo24h)
    const lossRunning = Math.round(runningTheo - totalMeters)
    const loss24h = Math.round(theo24h - totalMeters)

    return {
      id: `PROD-${dateStr}-${l.loomNumber}`,
      date: dateStr,
      loomNumber: l.loomNumber,
      category,
      model: l.model,
      qualityName: l.qualityName || 'Plain Weave',
      fabricType: l.fabricType || 'Suiting',
      warpYarn: l.warpYarn || '',
      weftYarn: l.weftYarn || '',
      rpm,
      reed: l.reed,
      pick,
      widthInch: l.width,
      gsm: l.gsm,
      rollerHours,
      runningHours: rollerHours,
      runningTheoretical,
      shiftAMeters: shiftA,
      shiftBMeters: shiftB,
      totalMeters,
      efficiencyPercentage: efficiencyRunning,
      stopLossMeters: lossRunning,
      theoretical24h,
      efficiency24h,
      loss24h,
      status,
      remarks: remarks || undefined,
      lot: blankDay ? l.lot || undefined : l.lot || undefined,
    }
  })
}

export function getExcelFloorSummary(dateStr?: string): ProductionSummary {
  const stats = productionRawData.summaryStats;
  const date = dateStr || productionRawData.date || PRODUCTION_TODAY;
  const dayName = productionRawData.dayName || 'Saturday';

  return {
    date,
    dayName,
    totalLooms: stats.totalLooms,
    runningLooms: stats.loomsRunning,
    stoppedLooms: stats.loomsDown,
    breakdownLooms: 0,
    knottingLooms: 1,
    beamEndLooms: 2,
    totalShiftAMeters: stats.totalShiftA,
    totalShiftBMeters: stats.totalShiftB,
    grandTotalMeters: stats.totalProduction,
    totalTheoreticalMeters: 5737.63,
    averageEfficiency: stats.avgEfficiencyRunning,
    averageEfficiency24h: stats.avgEfficiency24h,
    avgPick: stats.avgPick,
    rollerCutting: stats.rollerCutting,
    avgPerLoom: stats.avgPerLoom,
    totalRevenue: stats.totalProduction * (stats.avgPick * 0.95),
    monthlyProduction: stats.monthlyProduction,
    modelBreakdown: stats.modelBreakdown as any,
  };
}

export function getExcelActiveQualities(): ActiveQualityOrder[] {
  return productionRawData.activeQualities as ActiveQualityOrder[];
}

export function getExcelMonthlyMatrix(month: string = '2026-09'): {
  days: MonthlyMatrixDay[];
  loomTotals: Record<number, number>;
  grandTotalMeters: number;
  avgPerDay: number;
} {
  if (month === '2026-08') {
    return { days: [], loomTotals: {}, grandTotalMeters: 0, avgPerDay: 0 }
  }
  return productionRawData.monthlyMatrix as any
}

export function getExcelBeamStock(): BeamStockItem[] {
  return productionRawData.beamStock as BeamStockItem[]
}

export function getExcelWeftStock(month: string = '2026-09'): {
  yarnColumns: string[]
  days: WeftStockDay[]
} {
  if (month === '2026-08') {
    return { yarnColumns: [], days: [] }
  }
  return productionRawData.weftStock as any
}

export function getExcelQualityEndRecords(): QualityEndRecord[] {
  return productionRawData.qualityEndReport as QualityEndRecord[];
}

export function getExcelChallan(): any {
  return productionRawData.challan;
}

