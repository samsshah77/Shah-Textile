// src/services/payroll/payrollConstants.ts

export const STORAGE_KEYS = {
  EMPLOYEES: 'sara_payroll_employees_v9',
  ADVANCES: 'sara_payroll_advances_v7',
  STAFF: 'sara_payroll_staff_v6',
  CONTRACT: 'sara_payroll_contract_v7',
  EFFICIENCY: 'sara_payroll_efficiency_v6',
  WEAVERS: 'sara_payroll_weavers_v6',
  HELPERS: 'sara_payroll_helpers_v6',
  CONTRACTORS: 'sara_payroll_contractors_v6',
  PETTY_CASH: 'sara_payroll_petty_cash_v6',
  HR_META: 'sara_payroll_hr_meta_v1',
} as const

export const DEFAULT_HR_CATEGORIES = [
  'Admin',
  'Staff',
  'Contract',
  'Weaver',
  'Helper',
  'Contractor',
]

export const DEFAULT_HR_DESIGNATIONS = [
  'Incharge',
  'Supervisor',
  'Accountant',
  'Quality Controller',
  'D.E.O',
  'Sr.Technician',
  'Electrician',
  'Asst Technician',
  'Oil Man',
  'Weaver',
  'Spare Weaver',
  'Helper',
  'Store Keeper',
  'Time Keeper',
]

export type JobFamily = 'weaver' | 'helper' | 'contractor' | 'salaried'

export const NAME_ALIASES: Record<string, string> = {
  muhammed: 'muhammad',
  mohammed: 'muhammad',
  mohammad: 'muhammad',
  ahmer: 'ahmar',
  billal: 'bilal',
}

export const MONTH_NAME_TO_NUM: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  may_full: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}
