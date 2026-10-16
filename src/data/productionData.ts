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
  return [];
}

/** Excel history entries disabled — DB is the single source of truth. */
export function getExcelHistoryEntries(): DailyLoomProductionEntry[] {
  return []
}

/** Excel daily looms disabled — DB is the single source of truth. */
export function getExcelDailyLoomsForDate(_dateStr: string): DailyLoomProductionEntry[] {
  return []
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

