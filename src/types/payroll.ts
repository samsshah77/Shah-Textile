// src/types/payroll.ts

export type EmploymentType = 'Permanent' | 'Company Contract' | 'Contractor' | 'Weaver' | 'Helper';
export type LoomCategoryFilter = 'G6200' | 'G6300' | 'PU' | 'Overall';
export type FortnightPeriod = '1-15' | '16-31' | '1-31';

export interface CustomColumn {
  id: string;
  label: string;
  color: 'slate' | 'emerald' | 'blue' | 'amber' | 'purple' | 'rose' | 'teal';
  width?: number; // custom width in px
}

export type EmployeeCategory = 'Admin' | 'Staff' | 'Contract' | 'Weaver' | 'Helper' | 'Contractor' | string;
export type EmployeeStatus = 'Active' | 'Resigned' | 'On Leave';

export interface EmployeeProfile {
  id: string;
  serialNo: number;
  name: string;
  fatherName?: string;
  cnic?: string; // Format: 42101-1234567-1
  phone?: string; // Format: 0300-1234567
  address?: string;
  designation: string;
  department?: string;
  employeeCategory?: EmployeeCategory;
  dutyHrs: number; // e.g. 8, 9, 10, 12
  shiftFromTo: string; // e.g. "9 to 6", "8 to 8", "9 to 7"
  salary: number; // monthly base or standard rate
  ratePerDay31: number;
  ratePerHr31?: number;
  ratePerDay30: number;
  ratePerHr30: number;
  ratePerDay28: number;
  ratePerHr28?: number;
  doj: string; // Date of joining
  contractStatus: 'Permanent' | 'Company Contract' | 'Daily Wage' | 'Contractor' | string;
  status?: EmployeeStatus;
  /** Last day / resign date (YYYY-MM-DD). Used to drop person from later month sheets. */
  resignedAt?: string;
  /** When true, person appears in Advance (Peshgi) search — only a few staff get advances. */
  advanceEligible?: boolean;
  remarks?: string; // e.g. "Resignation 31 Oct 2022" or "Rejoining 08 Jun-21"
  customFields?: Record<string, string | number>;
}

export interface AdvanceRecord {
  id: string;
  serialNo: number;
  employeeId?: string;
  employeeName: string;
  designation: string;
  amount: number;
  date?: string;
  month: string; // e.g. "2026-08"
  fortnight?: '1-15' | '16-31' | 'all' | string;
  remarks?: string;
  customFields?: Record<string, string | number>;
}

export interface StaffSalaryRecord {
  id: string;
  serialNo: number;
  employeeId?: string;
  employeeName: string;
  designation: string;
  salary: number;
  attendanceDays: number;
  ratePerDay: number;
  basicSalary: number;
  perHrRate: number;
  otHours: number;
  otAmount: number;
  grossAmount: number;
  lessAdvance: number;
  chequeAmount: number;
  synopsisAmount: number;
  netCashAmount: number;
  month: string;
  customFields?: Record<string, string | number>;
}

export interface ContractSalaryRecord {
  id: string;
  serialNo: number;
  employeeId?: string;
  employeeName: string;
  designation: string;
  salary: number;
  attendanceDays: number;
  ratePerDay: number;
  ratePerHr: number;
  basicSalary: number;
  lateHours?: number;
  lateAmount?: number;
  otHours: number;
  otAmount: number;
  efficiencyAmount: number;
  grossSalary: number;
  advanceDeduction: number;
  ticketCharges: number;
  netAmount: number;
  month: string;
  customFields?: Record<string, string | number>;
}

export interface EfficiencyIncentiveRecord {
  id: string;
  serialNo: number;
  employeeId?: string;
  loom: LoomCategoryFilter;
  name: string;
  designation: string;
  efficiencyPercent: number; // e.g. 81, 70, 72
  salaryEarned: number;
  availPercent: number; // efficiencyPercent - 60
  amount: number;
  month: string;
  customFields?: Record<string, string | number>;
}

export interface WeaverWageRecord {
  id: string;
  serialNo: number;
  employeeId?: string;
  employeeName: string;
  designation: 'Spare Weaver' | 'Weaver';
  wagePerDay: number; // 1800 for Spare, 1450 for Regular
  attendanceDays: number;
  basicSalary: number;
  rateLoom: number; // default 150 per extra loom
  extraLooms: number;
  extraLoomAmount: number;
  attendanceAllowance: number; // 800 for full attendance
  holidayAttendance: number; // Holiday shifts worked
  holidayRate: number; // 2100 for Spare Weaver, 1750 for Regular Weaver
  holidayAmount: number;
  efficiencyAmount: number;
  grossAmount: number;
  netPay: number;
  fortnight: '1-15' | '16-31';
  month: string;
  customFields?: Record<string, string | number>;
}

export interface HelperWageRecord {
  id: string;
  serialNo: number;
  employeeId?: string;
  employeeName: string;
  designation: 'Helper';
  wagePerDay: number; // 1050
  attendanceDays: number;
  wagesAmount: number;
  otRate: number; // 1200 per holiday shift
  holidayAttendance: number;
  otAmount: number;
  netAmount: number;
  fortnight: '1-15' | '16-31';
  month: string;
  customFields?: Record<string, string | number>;
}

export interface ContractorPaymentRecord {
  id: string;
  serialNo: number;
  employeeId?: string;
  name: string;
  contractType: string;
  contractualAmount: number;
  extraIncentive: number;
  totalAmount: number;
  lessAdvance: number;
  netPayment: number;
  remarks: string;
  fortnight: '1-15' | '16-31' | '1-31';
  month: string;
  customFields?: Record<string, string | number>;
}

export interface FortnightSynopsis {
  fortnight: '1-15' | '16-31';
  month: string;
  title: string;
  items: {
    serialNo: number;
    description: string;
    amount: number;
    chequeAmount?: number;
    advance?: number;
  }[];
  totalPayrollCash: number;
  pettyCashInflow: number;
  totalBankCheque: number;
}

export interface MonthlyGrandSalarySynopsis {
  month: string;
  monthTitle: string;
  fortnight1Total: number;
  fortnight1PettyCash: number;
  fortnight1Cheque: number;
  fortnight2Total: number;
  fortnight2PettyCash: number;
  fortnight2Cheque: number;
  monthlyTotalSalary: number; // 2,690,000
  grandSynopsisItems: {
    serialNo: number;
    description: string;
    amount: number;
    chequeAmount?: number;
    advance?: number;
    totalGrossHead: number;
  }[];
}

export interface PettyCashRecord {
  id: string;
  serialNo?: number | null;
  date: string;
  description: string;
  drAmount?: number | null;
  crAmount?: number | null;
  balance?: number | null;
  fortnight: '1-15' | '16-31';
  month: string;
  customFields?: Record<string, string | number>;
}
