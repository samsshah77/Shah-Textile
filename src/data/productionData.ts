import productionRawData from './productionExcelData.json';
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
  const date = productionRawData.date || '2026-09-09';
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

export function getExcelFloorSummary(): ProductionSummary {
  const stats = productionRawData.summaryStats;
  const date = productionRawData.date || '2026-09-09';
  const dayName = productionRawData.dayName || 'Wednesday';

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

export function getExcelMonthlyMatrix(): {
  days: MonthlyMatrixDay[];
  loomTotals: Record<number, number>;
  grandTotalMeters: number;
  avgPerDay: number;
} {
  return productionRawData.monthlyMatrix as any;
}

export function getExcelBeamStock(): BeamStockItem[] {
  return productionRawData.beamStock as BeamStockItem[];
}

export function getExcelWeftStock(): {
  yarnColumns: string[];
  days: WeftStockDay[];
} {
  return productionRawData.weftStock as any;
}

export function getExcelQualityEndRecords(): QualityEndRecord[] {
  return productionRawData.qualityEndReport as QualityEndRecord[];
}

export function getExcelChallan(): any {
  return productionRawData.challan;
}
