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

export function calculateProductionMetrics(input: CalculationInput) {
  const { rpm, runningHours, pick, shiftAMeters, shiftBMeters, ratePerPick = 0.95 } = input;
  
  // Theoretical Meters = (RPM * 60 * Running Hours) / (Pick * 39.3701)
  const theoreticalMeters = pick > 0 ? (rpm * 60 * runningHours) / (pick * 39.3701) : 0;
  const totalMeters = (shiftAMeters || 0) + (shiftBMeters || 0);
  const efficiencyPercentage = theoreticalMeters > 0 ? (totalMeters / theoreticalMeters) * 100 : 0;
  
  // Bonus: If Efficiency >= 70% then Round(Efficiency - 60)%, else 0%
  let bonusPercentage = 0;
  if (efficiencyPercentage >= 70) {
    bonusPercentage = Math.max(0, Math.round(efficiencyPercentage - 60));
  }

  const stopLossMeters = Math.max(0, theoreticalMeters - totalMeters);
  const dailyRevenue = totalMeters * (pick * ratePerPick);

  return {
    theoreticalMeters: Number(theoreticalMeters.toFixed(2)),
    totalMeters: Number(totalMeters.toFixed(2)),
    efficiencyPercentage: Number(efficiencyPercentage.toFixed(2)),
    bonusPercentage,
    stopLossMeters: Number(stopLossMeters.toFixed(2)),
    dailyRevenue: Number(dailyRevenue.toFixed(2)),
  };
}
