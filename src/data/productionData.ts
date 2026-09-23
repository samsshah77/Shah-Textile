import productionRawData from './productionExcelData.json'
import { PRODUCTION_TODAY } from '@/constants/productionCalendar';
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

function getDeterministicSeed(dateStr: string, loomNumber: number): number {
  let hash = 0
  const str = `${dateStr}-loom-${loomNumber}`
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function getExcelDailyLoomsForDate(dateStr: string): DailyLoomProductionEntry[] {
  const history = (productionRawData as any).dailyHistory;
  const hasHistory = history && history[dateStr] && Array.isArray(history[dateStr]);
  const rawList = hasHistory ? history[dateStr] : productionRawData.dailyLooms;
  
  return rawList.map((l: any) => {
    let category: LoomCategory = 'G6200';
    if (l.model === 'G6300') category = 'G6300';
    else if (l.model === 'PU') category = 'PU';

    let status: LoomStatus = 'RUNNING';
    let remarks = l.remarks || '';
    let rollerHours = l.rollerHours || 24;
    let shiftA = l.shiftAMeters ?? 0;
    let shiftB = l.shiftBMeters ?? 0;

    if (!hasHistory) {
      const seed = getDeterministicSeed(dateStr, l.loomNumber);
      // Realistic mill conditions on ~5-8% of loom-days:
      if (seed % 34 === 0) {
        status = 'BEAM_END';
        remarks = 'Beam End';
        rollerHours = 0;
        shiftA = 0;
        shiftB = 0;
      } else if (seed % 47 === 0) {
        status = 'BREAKDOWN';
        remarks = 'Electric / Mechanical Fault';
        rollerHours = Math.floor(10 + (seed % 6));
        shiftA = Math.round((l.shiftAMeters || 160) * 0.55);
        shiftB = 0;
      } else if (seed % 29 === 0) {
        status = 'KNOTTING';
        remarks = 'Knotting';
        rollerHours = Math.floor(16 + (seed % 6));
        shiftA = Math.round((l.shiftAMeters || 160) * 0.7);
        shiftB = Math.round((l.shiftBMeters || 160) * 0.85);
      } else {
        status = 'RUNNING';
        remarks = '';
        rollerHours = 24;
        const factorA = 0.94 + ((seed % 14) / 100);
        const factorB = 0.93 + (((seed >> 3) % 15) / 100);
        shiftA = Math.round((l.shiftAMeters || 170) * factorA);
        shiftB = Math.round((l.shiftBMeters || 165) * factorB);
      }
    } else {
      if (l.status === 'BEAM_END' || l.remarks?.includes('B/End')) status = 'BEAM_END';
      else if (l.status === 'KNOTTING' || l.remarks?.includes('Knotting')) status = 'KNOTTING';
      else if (l.status === 'STOPPED' || l.totalMeters === 0) status = 'STOPPED';
      else if (l.status === 'BREAKDOWN') status = 'BREAKDOWN';
    }

    const totalMeters = shiftA + shiftB;
    const rpm = l.rpm || 350;
    const pick = l.pick || 60;
    const runningTheoretical = Number(((rpm / pick) * (60 / 39.38) * rollerHours).toFixed(2));
    const efficiencyRunning = runningTheoretical > 0 ? Number(((totalMeters / runningTheoretical) * 100).toFixed(2)) : 0;
    const lossRunning = Number(Math.max(0, runningTheoretical - totalMeters).toFixed(2));
    const theoretical24h = Number(((rpm / pick) * (60 / 39.38) * 24).toFixed(2));
    const efficiency24h = theoretical24h > 0 ? Number(((totalMeters / theoretical24h) * 100).toFixed(2)) : 0;
    const loss24h = Number(Math.max(0, theoretical24h - totalMeters).toFixed(2));

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
      lot: l.lot || `Sw # ${300 + l.loomNumber}`,
    };
  });
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
  if (month === '2026-08' && (productionRawData as any).augustMatrix) {
    return (productionRawData as any).augustMatrix;
  }
  return productionRawData.monthlyMatrix as any;
}

export function getExcelBeamStock(): BeamStockItem[] {
  return productionRawData.beamStock as BeamStockItem[];
}

export function getExcelWeftStock(month: string = '2026-09'): {
  yarnColumns: string[];
  days: WeftStockDay[];
} {
  if (month === '2026-08' && (productionRawData as any).augustWeftStock) {
    return (productionRawData as any).augustWeftStock;
  }
  return productionRawData.weftStock as any;
}

export function getExcelQualityEndRecords(): QualityEndRecord[] {
  return productionRawData.qualityEndReport as QualityEndRecord[];
}

export function getExcelChallan(): any {
  return productionRawData.challan;
}

