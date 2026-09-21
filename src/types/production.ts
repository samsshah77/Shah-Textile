// src/types/production.ts
import { LoomCategory, LoomStatus } from './loom';

export interface DailyLoomProductionEntry {
  id: string;
  date: string; // YYYY-MM-DD
  loomNumber: number;
  category: LoomCategory;
  model?: string;
  qualityName: string;
  fabricType: string;
  warpYarn: string;
  weftYarn: string;
  rpm: number;
  reed: number;
  pick: number;
  widthInch: number;
  gsm: number;
  rollerHours: number;
  runningHours: number;
  runningTheoretical?: number;
  shiftAMeters: number;
  shiftBMeters: number;
  totalMeters: number;
  efficiencyPercentage: number;
  stopLossMeters: number;
  theoretical24h?: number;
  efficiency24h?: number;
  loss24h?: number;
  status: LoomStatus;
  remarks?: string;
  lot?: string;
}

export interface ProductionSummary {
  date: string;
  dayName?: string;
  totalLooms: number;
  runningLooms: number;
  stoppedLooms: number;
  breakdownLooms: number;
  knottingLooms: number;
  beamEndLooms: number;
  totalShiftAMeters: number;
  totalShiftBMeters: number;
  grandTotalMeters: number;
  totalTheoreticalMeters: number;
  averageEfficiency: number;
  averageEfficiency24h?: number;
  avgPick?: number;
  rollerCutting?: number;
  avgPerLoom?: number;
  totalRevenue: number;
  monthlyProduction?: number;
  modelBreakdown?: {
    G6200: { production: number; efficiency: number };
    G6300: { production: number; efficiency: number };
    PU: { production: number; efficiency: number };
  };
}

export interface ActiveQualityOrder {
  qualityName: string;
  target: number;
  loomsCount: number;
  production: number;
  inRegister: number;
  balance: number;
  loomNumbers: string;
  warpYarn: string;
  lot: string;
  warpRepeat: string;
  weftRepeat: string;
}

export interface MonthlyMatrixDay {
  day: number;
  date: string;
  totalMeters: number;
  loomMeters: Record<number, number>;
}

export interface BeamStockItem {
  warp: string;
  reedWidth: string;
  ends: number;
  length: number;
  loomType: string;
  quantity: number;
  beamNo: string;
  usedInLoom: string | null;
}

export interface WeftStockDay {
  day: number;
  date: string;
  totalKg: number;
  consumption: Record<string, number>;
}

export interface QualityEndRecord {
  sNo: number;
  qualityName: string;
  endDate: string;
  warpYarn: string;
  warpRepeat: string;
  weftYarn: string;
  weftRepeat: string;
  reed: number;
  pick: number;
  productionMeters: number;
}

export interface CalculationInput {
  rpm: number;
  runningHours: number;
  pick: number;
  shiftAMeters: number;
  shiftBMeters: number;
  ratePerPick?: number;
}

/** Excel Production sheet: 100% = RPM/Pick * 60 / 39.38 * Hours */
const INCH_TO_METER = 39.38;

export function theoreticalMeters(rpm: number, pick: number, hours: number) {
  if (!pick || pick <= 0 || !hours) return 0;
  return (rpm / pick) * (60 / INCH_TO_METER) * hours;
}

export function calculateProductionMetrics(input: CalculationInput) {
  const { rpm, runningHours, pick, shiftAMeters, shiftBMeters, ratePerPick = 0.95 } = input;

  const runningTheo = theoreticalMeters(rpm, pick, runningHours);
  const theo24h = theoreticalMeters(rpm, pick, 24);
  const totalMeters = (shiftAMeters || 0) + (shiftBMeters || 0);

  const efficiencyRunning = runningTheo > 0 ? (totalMeters / runningTheo) * 100 : 0;
  const efficiency24h = theo24h > 0 ? (totalMeters / theo24h) * 100 : 0;
  const lossRunning = runningTheo - totalMeters;
  const loss24h = theo24h - totalMeters;

  let bonusPercentage = 0;
  if (efficiencyRunning >= 70) {
    bonusPercentage = Math.max(0, Math.round(efficiencyRunning - 60));
  }

  const dailyRevenue = totalMeters * (pick * ratePerPick);

  return {
    theoreticalMeters: Number(runningTheo.toFixed(2)),
    theoretical24h: Number(theo24h.toFixed(2)),
    totalMeters: Number(totalMeters.toFixed(2)),
    efficiencyPercentage: Number(efficiencyRunning.toFixed(2)),
    efficiency24h: Number(efficiency24h.toFixed(2)),
    stopLossMeters: Number(lossRunning.toFixed(2)),
    loss24h: Number(loss24h.toFixed(2)),
    bonusPercentage,
    dailyRevenue: Number(dailyRevenue.toFixed(2)),
  };
}
