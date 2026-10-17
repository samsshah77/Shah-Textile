import { PRODUCTION_TODAY } from '@/constants/productionCalendar'
import {
  DailyLoomProductionEntry,
  ProductionSummary,
  ActiveQualityOrder,
  MonthlyMatrixDay,
  BeamStockItem,
  WeftStockDay,
  QualityEndRecord,
} from '@/types/production'

export function getExcelDailyLoomEntries(): DailyLoomProductionEntry[] {
  return []
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
  const date = dateStr || PRODUCTION_TODAY
  return {
    date,
    dayName: '',
    totalLooms: 34,
    runningLooms: 34,
    stoppedLooms: 0,
    breakdownLooms: 0,
    knottingLooms: 0,
    beamEndLooms: 0,
    totalShiftAMeters: 0,
    totalShiftBMeters: 0,
    grandTotalMeters: 0,
    totalTheoreticalMeters: 0,
    averageEfficiency: 0,
    averageEfficiency24h: 0,
    avgPick: 0,
    rollerCutting: 0,
    avgPerLoom: 0,
    totalRevenue: 0,
    monthlyProduction: 0,
    modelBreakdown: {
      G6200: { production: 0, efficiency: 0 },
      G6300: { production: 0, efficiency: 0 },
      PU: { production: 0, efficiency: 0 },
    },
  }
}

export function getExcelActiveQualities(): ActiveQualityOrder[] {
  return []
}

export function getExcelMonthlyMatrix(_month?: string): {
  days: MonthlyMatrixDay[]
  loomTotals: Record<number, number>
  grandTotalMeters: number
  avgPerDay: number
} {
  return { days: [], loomTotals: {}, grandTotalMeters: 0, avgPerDay: 0 }
}

export function getExcelBeamStock(): BeamStockItem[] {
  return []
}

export function getExcelWeftStock(_month?: string): {
  yarnColumns: string[]
  days: WeftStockDay[]
} {
  return { yarnColumns: [], days: [] }
}

export function getExcelQualityEndRecords(): QualityEndRecord[] {
  return []
}

export function getExcelChallan(): any {
  return { items: [] }
}
