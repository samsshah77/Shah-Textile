// src/types/production.ts
import { LoomCategory, LoomStatus } from './loom';

export interface DailyLoomProductionEntry {
  id: string;
  date: string; // YYYY-MM-DD
  loomNumber: number;
  /**
   * Same-day dual quality: segment 1 = primary pose, 2+ = later qualities on the same loom/day.
   * Omitted / unset means 1 (legacy rows).
   */
  segmentIndex?: number;
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
  /** Per-loom fabric fault note for the day (Daily Entry + Fabric Fault tab). Summary of A/B. */
  fabricFault?: string;
  /** Shift A fabric faults (newline-separated). Optional — legacy rows only have fabricFault. */
  fabricFaultA?: string;
  /** Shift B fabric faults (newline-separated). */
  fabricFaultB?: string;
  lot?: string;
  approvalStatus?: 'DRAFT' | 'APPROVED';
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  lastEditedBy?: string;
  lastEditedAt?: string;
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
  /** True when a floor production sheet exists for this date (show 0; else —). */
  hasSheet?: boolean;
  /**
   * Quality track only: loom was on this quality that day.
   * Missing key means the loom ran a different quality — show —, not its meters.
   */
  loomCounted?: Record<number, boolean>;
  /** Filled for efficiency so a fortnight is actual ÷ target, not a sum of percents. */
  loomActual?: Record<number, number>;
  loomTarget?: Record<number, number>;
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
  /** Looms 21, 23, 24, 25, 26 use Excel formula × 2 (two beams). Loom 22 does not. */
  loomNumber?: number;
}

/** Excel Production: looms 21, 23, 24, 25, 26 → 100% Running and 100% 24h are × 2. */
const DOUBLE_BEAM_LOOMS = new Set([21, 23, 24, 25, 26]);

export function runningBeamFactor(loomNumber?: number) {
  return loomNumber != null && DOUBLE_BEAM_LOOMS.has(loomNumber) ? 2 : 1;
}

/** Excel Production sheet: 100% = RPM/Pick * 60 / 39.38 * Hours */
const INCH_TO_METER = 39.38;

export function theoreticalMeters(rpm: number, pick: number, hours: number) {
  if (!pick || pick <= 0 || !hours) return 0;
  return (rpm / pick) * (60 / INCH_TO_METER) * hours;
}

export function calculateProductionMetrics(input: CalculationInput) {
  const { rpm, runningHours, pick, shiftAMeters, shiftBMeters, ratePerPick = 0.95 } = input;

  const beam = runningBeamFactor(input.loomNumber);
  const runningTheo = theoreticalMeters(rpm, pick, runningHours) * beam;
  const theo24h = theoreticalMeters(rpm, pick, 24) * beam;
  const totalMeters = (shiftAMeters || 0) + (shiftBMeters || 0);

  const efficiencyRunning = runningTheo > 0 ? (totalMeters / runningTheo) * 100 : 0
  // Match Excel: Eff 24h can exceed 100% when Roller Hours > 24
  const efficiency24h = theo24h > 0 ? (totalMeters / theo24h) * 100 : 0
  const lossRunning = runningTheo - totalMeters
  const loss24h = theo24h - totalMeters

  let bonusPercentage = 0
  if (efficiencyRunning >= 70) {
    bonusPercentage = Math.max(0, Math.round(efficiencyRunning - 60))
  }

  const dailyRevenue = totalMeters * (pick * ratePerPick)

  return {
    // Round meters/eff like Excel display (ROUND)
    theoreticalMeters: Math.round(runningTheo),
    theoretical24h: Math.round(theo24h),
    totalMeters: Math.round(totalMeters),
    efficiencyPercentage: Math.round(efficiencyRunning),
    efficiency24h: Math.round(efficiency24h),
    stopLossMeters: Math.round(lossRunning),
    loss24h: Math.round(loss24h),
    bonusPercentage,
    dailyRevenue: Number(dailyRevenue.toFixed(2)),
  }
}
