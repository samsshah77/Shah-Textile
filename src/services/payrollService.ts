// src/services/payrollService.ts
import {
  EmployeeProfile,
  AdvanceRecord,
  StaffSalaryRecord,
  ContractSalaryRecord,
  EfficiencyIncentiveRecord,
  WeaverWageRecord,
  HelperWageRecord,
  ContractorPaymentRecord,
  FortnightSynopsis,
  MonthlyGrandSalarySynopsis,
  PettyCashRecord,
} from '@/types/payroll'

import allEmployeesData from '@/data/all_employees.json'

const STORAGE_KEYS = {
  EMPLOYEES: 'sara_payroll_employees_v9',
  ADVANCES: 'sara_payroll_advances_v7',
  STAFF: 'sara_payroll_staff_v6',
  CONTRACT: 'sara_payroll_contract_v7',
  EFFICIENCY: 'sara_payroll_efficiency_v6',
  WEAVERS: 'sara_payroll_weavers_v6',
  HELPERS: 'sara_payroll_helpers_v6',
  CONTRACTORS: 'sara_payroll_contractors_v6',
  PETTY_CASH: 'sara_payroll_petty_cash_v6',
}

// Master Employee Directory loaded with Pakistani CNICs, Father Names, Phone, Address, Category & Status (Sheet 1: 46 Master Roster Employees)
const INITIAL_EMPLOYEES: EmployeeProfile[] = (allEmployeesData as unknown as EmployeeProfile[]).slice(0, 46)

// Seed data directly transcribed from August-2026 Excel sheets
const INITIAL_STAFF_SALARIES: StaffSalaryRecord[] = [
  {
    "id": "staff-1",
    "serialNo": 1,
    "employeeName": "Muhammad Javed",
    "designation": "Incharge",
    "salary": 80000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 2581,
    "basicSalary": 80000.0,
    "perHrRate": 333.33,
    "otHours": 45.0,
    "otAmount": 15000,
    "grossAmount": 95000,
    "lessAdvance": 20000.0,
    "chequeAmount": 60000.0,
    "synopsisAmount": 75000,
    "netCashAmount": 15000,
    "month": "2026-08"
  },
  {
    "id": "staff-2",
    "serialNo": 2,
    "employeeName": "Liaquat Ali",
    "designation": "Supervisor",
    "salary": 40000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1290,
    "basicSalary": 40000.0,
    "perHrRate": 166.67,
    "otHours": 194.0,
    "otAmount": 32333,
    "grossAmount": 72333,
    "lessAdvance": 10000.0,
    "chequeAmount": 0.0,
    "synopsisAmount": 62333,
    "netCashAmount": 62333,
    "month": "2026-08"
  }
]

const INITIAL_ADVANCES: AdvanceRecord[] = [
  {
    "id": "adv-1",
    "serialNo": 1,
    "employeeName": "Muhammed Javed",
    "designation": "Incharge",
    "amount": 20000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-2",
    "serialNo": 2,
    "employeeName": "Liaquat Ali",
    "designation": "Supervisor",
    "amount": 10000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-3",
    "serialNo": 3,
    "employeeName": "Tufail ur Rehman",
    "designation": "Accountant",
    "amount": 25000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-4",
    "serialNo": 4,
    "employeeName": "Kamran",
    "designation": "Quality Controller",
    "amount": 20000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-5",
    "serialNo": 5,
    "employeeName": "Ahmar",
    "designation": "Quality Controller",
    "amount": 10000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-6",
    "serialNo": 6,
    "employeeName": "Abdul Waheed",
    "designation": "Sr.Technician",
    "amount": 10000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-7",
    "serialNo": 7,
    "employeeName": "Basit",
    "designation": "Electrician",
    "amount": 20000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-8",
    "serialNo": 8,
    "employeeName": "Ameen Ullah Khan",
    "designation": "Electrician",
    "amount": 30000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-9",
    "serialNo": 9,
    "employeeName": "Shoaib",
    "designation": "Electrician",
    "amount": 5000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-10",
    "serialNo": 10,
    "employeeName": "Zulfiqar",
    "designation": "Asst Technician",
    "amount": 20000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-11",
    "serialNo": 11,
    "employeeName": "Maqsood",
    "designation": "Oil Man",
    "amount": 20000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-12",
    "serialNo": 12,
    "employeeName": "Salman",
    "designation": "Jeckquard",
    "amount": 20000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-13",
    "serialNo": 13,
    "employeeName": "Hasnain",
    "designation": "Jeckquard",
    "amount": 15000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-14",
    "serialNo": 14,
    "employeeName": "Nazakat",
    "designation": "Beem Gater",
    "amount": 30000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-15",
    "serialNo": 15,
    "employeeName": "Muhammad Arif",
    "designation": "Technician",
    "amount": 30000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-16",
    "serialNo": 16,
    "employeeName": "Mushtaq Ahmed",
    "designation": "Folding",
    "amount": 15000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-17",
    "serialNo": 17,
    "employeeName": "Ali Zar",
    "designation": "Sweeper",
    "amount": 7000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-18",
    "serialNo": 18,
    "employeeName": "Adison",
    "designation": "Sweeper",
    "amount": 8000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-19",
    "serialNo": 19,
    "employeeName": "Christopher",
    "designation": "Sweeper",
    "amount": 5000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-20",
    "serialNo": 20,
    "employeeName": "Amir",
    "designation": "Technician/Contracter",
    "amount": 30000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  }
]

const INITIAL_HELPERS_WAGES: HelperWageRecord[] = [
  {
    "id": "h-1-1",
    "serialNo": 1,
    "employeeName": "REHAN KHAN",
    "designation": "Helper",
    "wagePerDay": 1150.0,
    "attendanceDays": 13.0,
    "wagesAmount": 14950.0,
    "otRate": 1400.0,
    "holidayAttendance": 1.0,
    "otAmount": 1400.0,
    "netAmount": 16350.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-2",
    "serialNo": 2,
    "employeeName": "KHALID",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 14850.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-3",
    "serialNo": 3,
    "employeeName": "MUDASSIR",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 14850.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-4",
    "serialNo": 4,
    "employeeName": "IBRAHEEM",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 12.0,
    "wagesAmount": 12600.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 13800.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-5",
    "serialNo": 5,
    "employeeName": "USMAN",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 14850.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-6",
    "serialNo": 6,
    "employeeName": "HASEEB",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 14850.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-7",
    "serialNo": 7,
    "employeeName": "WASIF",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 14850.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-8",
    "serialNo": 8,
    "employeeName": "REHAN",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 14850.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-9",
    "serialNo": 9,
    "employeeName": "INAYAT",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 11.0,
    "wagesAmount": 11550.0,
    "otRate": 1200.0,
    "holidayAttendance": 0.0,
    "otAmount": 0.0,
    "netAmount": 11550.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-10",
    "serialNo": 10,
    "employeeName": "AWAIS",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 14850.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-11",
    "serialNo": 11,
    "employeeName": "ABDUL SAMAD",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 11.0,
    "wagesAmount": 11550.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 12750.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-12",
    "serialNo": 12,
    "employeeName": "JAWAD",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 14850.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-2-13",
    "serialNo": 1,
    "employeeName": "REHAN",
    "designation": "Helper",
    "wagePerDay": 1150.0,
    "attendanceDays": 12.0,
    "wagesAmount": 13800.0,
    "otRate": 1400.0,
    "holidayAttendance": 2.0,
    "otAmount": 2800.0,
    "netAmount": 16600.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-14",
    "serialNo": 2,
    "employeeName": "KHALID",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 12.0,
    "wagesAmount": 12600.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 15000.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-15",
    "serialNo": 3,
    "employeeName": "MUDASSIR",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 16050.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-16",
    "serialNo": 4,
    "employeeName": "IBRAHEEM",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 16050.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-17",
    "serialNo": 5,
    "employeeName": "USMAN",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 16050.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-18",
    "serialNo": 6,
    "employeeName": "HASEEB",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 16050.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-19",
    "serialNo": 7,
    "employeeName": "WASIF",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 16050.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-20",
    "serialNo": 8,
    "employeeName": "REHAN",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 16050.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-21",
    "serialNo": 9,
    "employeeName": "INAYAT",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 11.0,
    "wagesAmount": 11550.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 13950.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-22",
    "serialNo": 10,
    "employeeName": "AWAIS",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 16050.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-23",
    "serialNo": 11,
    "employeeName": "ABDUL SAMAD",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 16050.0,
    "fortnight": "16-31",
    "month": "2026-08"
  }
]

const INITIAL_WEAVERS_WAGES: WeaverWageRecord[] = [
  {
    "id": "w-1-1",
    "serialNo": 1,
    "employeeName": "HASSAN",
    "designation": "Spare Weaver",
    "wagePerDay": 1800,
    "attendanceDays": 8.0,
    "basicSalary": 14400.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 1.0,
    "holidayRate": 2100,
    "holidayAmount": 2100.0,
    "efficiencyAmount": 2268.0,
    "grossAmount": 14400.0,
    "netPay": 18768.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-2",
    "serialNo": 2,
    "employeeName": "YASIR",
    "designation": "Spare Weaver",
    "wagePerDay": 1800,
    "attendanceDays": 16.0,
    "basicSalary": 28800.0,
    "rateLoom": 150,
    "extraLooms": 4.0,
    "extraLoomAmount": 600.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 2100,
    "holidayAmount": 2100.0,
    "efficiencyAmount": 4284.0,
    "grossAmount": 30200.0,
    "netPay": 36584.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-3",
    "serialNo": 3,
    "employeeName": "KASHIF",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 14.0,
    "extraLoomAmount": 2100.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 5454.0,
    "grossAmount": 21750.0,
    "netPay": 28954.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-4",
    "serialNo": 4,
    "employeeName": "ARIF",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 12.0,
    "basicSalary": 17400.0,
    "rateLoom": 150,
    "extraLooms": 39.0,
    "extraLoomAmount": 5850.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 1620.0,
    "grossAmount": 23250.0,
    "netPay": 26620.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-5",
    "serialNo": 5,
    "employeeName": "ADNAN BALOCH",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 11.0,
    "basicSalary": 15950.0,
    "rateLoom": 150,
    "extraLooms": 4.0,
    "extraLoomAmount": 600.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 1985.0,
    "grossAmount": 16550.0,
    "netPay": 20285.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-6",
    "serialNo": 6,
    "employeeName": "AKMAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 14.0,
    "extraLoomAmount": 2100.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 5387.0,
    "grossAmount": 21750.0,
    "netPay": 28887.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-7",
    "serialNo": 7,
    "employeeName": "SHAH JALAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 12.0,
    "basicSalary": 17400.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 716.0,
    "grossAmount": 17400.0,
    "netPay": 19866.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-8",
    "serialNo": 8,
    "employeeName": "NAQEEBULLAH",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 14.0,
    "extraLoomAmount": 2100.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 3902.0,
    "grossAmount": 21750.0,
    "netPay": 27402.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-9",
    "serialNo": 9,
    "employeeName": "FAYAZ",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 4.0,
    "extraLoomAmount": 600.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 1971.0,
    "grossAmount": 20250.0,
    "netPay": 23971.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-10",
    "serialNo": 10,
    "employeeName": "IMTIAZ",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 14.0,
    "extraLoomAmount": 2100.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 2808.0,
    "grossAmount": 21750.0,
    "netPay": 26308.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-11",
    "serialNo": 11,
    "employeeName": "AJMAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 14.0,
    "extraLoomAmount": 2100.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 3915.0,
    "grossAmount": 21750.0,
    "netPay": 27415.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-12",
    "serialNo": 12,
    "employeeName": "BASIT",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 11.0,
    "basicSalary": 15950.0,
    "rateLoom": 150,
    "extraLooms": 4.0,
    "extraLoomAmount": 600.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 1458.0,
    "grossAmount": 16550.0,
    "netPay": 19758.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-13",
    "serialNo": 13,
    "employeeName": "RUSTAM",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 12.0,
    "basicSalary": 17400.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 1661.0,
    "grossAmount": 17400.0,
    "netPay": 20811.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-14",
    "serialNo": 14,
    "employeeName": "SHAHZAIB",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 14.0,
    "extraLoomAmount": 2100.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 3915.0,
    "grossAmount": 21750.0,
    "netPay": 27415.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-15",
    "serialNo": 15,
    "employeeName": "NAZEER AHMED",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 3.0,
    "extraLoomAmount": 450.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 2336.0,
    "grossAmount": 20100.0,
    "netPay": 24186.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-16",
    "serialNo": 16,
    "employeeName": "SHEHZAD",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 14.0,
    "extraLoomAmount": 2100.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 3902.0,
    "grossAmount": 21750.0,
    "netPay": 27402.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-17",
    "serialNo": 17,
    "employeeName": "HAMZA",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 14.0,
    "extraLoomAmount": 2100.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 2808.0,
    "grossAmount": 21750.0,
    "netPay": 26308.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-2-18",
    "serialNo": 1,
    "employeeName": "HASSAN",
    "designation": "Spare Weaver",
    "wagePerDay": 1800,
    "attendanceDays": 13.0,
    "basicSalary": 23400.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 2100,
    "holidayAmount": 4200.0,
    "efficiencyAmount": 3240.0,
    "grossAmount": 24200.0,
    "netPay": 31640.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-19",
    "serialNo": 2,
    "employeeName": "YASIR",
    "designation": "Spare Weaver",
    "wagePerDay": 1800,
    "attendanceDays": 13.0,
    "basicSalary": 23400.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 2100,
    "holidayAmount": 4200.0,
    "efficiencyAmount": 3240.0,
    "grossAmount": 24200.0,
    "netPay": 31640.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-20",
    "serialNo": 3,
    "employeeName": "KASHIF",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 35.0,
    "extraLoomAmount": 5250.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 5844.0,
    "grossAmount": 24900.0,
    "netPay": 34244.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-21",
    "serialNo": 4,
    "employeeName": "ARIF",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 580.0,
    "grossAmount": 18850.0,
    "netPay": 21180.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-22",
    "serialNo": 5,
    "employeeName": "FAYAZ",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 8.0,
    "extraLoomAmount": 1200.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 2088.0,
    "grossAmount": 20850.0,
    "netPay": 26438.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-23",
    "serialNo": 6,
    "employeeName": "ADNAN BALOCH",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 12.0,
    "basicSalary": 17400.0,
    "rateLoom": 150,
    "extraLooms": 4.0,
    "extraLoomAmount": 600.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 1523.0,
    "grossAmount": 18000.0,
    "netPay": 21273.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-24",
    "serialNo": 7,
    "employeeName": "SHAH JALAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 580.0,
    "grossAmount": 19650.0,
    "netPay": 23730.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-25",
    "serialNo": 8,
    "employeeName": "AKMAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 15.0,
    "extraLoomAmount": 2250.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 6003.0,
    "grossAmount": 21900.0,
    "netPay": 31403.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-26",
    "serialNo": 9,
    "employeeName": "IMTIAZ",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 15.0,
    "extraLoomAmount": 2250.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 3263.0,
    "grossAmount": 21900.0,
    "netPay": 28663.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-27",
    "serialNo": 10,
    "employeeName": "AJMAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 35.0,
    "extraLoomAmount": 5250.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 5394.0,
    "grossAmount": 24900.0,
    "netPay": 33794.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-28",
    "serialNo": 11,
    "employeeName": "RUSTAM",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 11.0,
    "basicSalary": 15950.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 1508.0,
    "grossAmount": 15950.0,
    "netPay": 20958.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-29",
    "serialNo": 12,
    "employeeName": "SHAH ZAIB",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 15.0,
    "extraLoomAmount": 2250.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 5452.0,
    "grossAmount": 21900.0,
    "netPay": 30852.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-30",
    "serialNo": 13,
    "employeeName": "BASIT",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 12.0,
    "basicSalary": 17400.0,
    "rateLoom": 150,
    "extraLooms": 8.0,
    "extraLoomAmount": 1200.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 1769.0,
    "grossAmount": 18600.0,
    "netPay": 23869.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-31",
    "serialNo": 14,
    "employeeName": "JAWAD",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 3.0,
    "extraLoomAmount": 450.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 3350.0,
    "grossAmount": 20100.0,
    "netPay": 26950.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-32",
    "serialNo": 15,
    "employeeName": "NAZEER AHMED",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 3828.0,
    "grossAmount": 19650.0,
    "netPay": 26978.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-33",
    "serialNo": 16,
    "employeeName": "SHEHZAD",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 5.0,
    "basicSalary": 7250.0,
    "rateLoom": 150,
    "extraLooms": 5.0,
    "extraLoomAmount": 750.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 0.0,
    "holidayRate": 1750,
    "holidayAmount": 0.0,
    "efficiencyAmount": 1827.0,
    "grossAmount": 8000.0,
    "netPay": 9827.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-34",
    "serialNo": 17,
    "employeeName": "NAQEEBULLAH",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 15.0,
    "extraLoomAmount": 2250.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 4945.0,
    "grossAmount": 21900.0,
    "netPay": 30345.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-35",
    "serialNo": 18,
    "employeeName": "HAMZA",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 25.0,
    "extraLoomAmount": 3750.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 3422.0,
    "grossAmount": 23400.0,
    "netPay": 30322.0,
    "fortnight": "16-31",
    "month": "2026-08"
  }
]

const INITIAL_CONTRACT_SALARIES: ContractSalaryRecord[] = [
  {
    "id": "cnt-1",
    "serialNo": 1,
    "employeeName": "Tufail ur Rehman",
    "designation": "Accountant",
    "salary": 50000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1613,
    "ratePerHr": 185.19,
    "basicSalary": 50000.0,
    "otHours": 45.0,
    "otAmount": 8333,
    "efficiencyAmount": 0,
    "grossSalary": 58333,
    "advanceDeduction": 25000.0,
    "ticketCharges": 5.0,
    "netAmount": 33328,
    "month": "2026-08"
  },
  {
    "id": "cnt-2",
    "serialNo": 2,
    "employeeName": "Kamran",
    "designation": "Quality Controller",
    "salary": 50000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1613,
    "ratePerHr": 138.89,
    "basicSalary": 50000.0,
    "otHours": 54.0,
    "otAmount": 7500,
    "efficiencyAmount": 0,
    "grossSalary": 57500,
    "advanceDeduction": 20000.0,
    "ticketCharges": 5.0,
    "netAmount": 37495,
    "month": "2026-08"
  },
  {
    "id": "cnt-3",
    "serialNo": 3,
    "employeeName": "Ahmer",
    "designation": "D.E.O",
    "salary": 40000.0,
    "attendanceDays": 22.0,
    "ratePerDay": 1290,
    "ratePerHr": 148.15,
    "basicSalary": 28387.096774193546,
    "otHours": 30.0,
    "otAmount": 4444,
    "efficiencyAmount": 0,
    "grossSalary": 32831,
    "advanceDeduction": 10000.0,
    "ticketCharges": 5.0,
    "netAmount": 22826,
    "month": "2026-08"
  },
  {
    "id": "cnt-4",
    "serialNo": 4,
    "employeeName": "Abdul Waheed",
    "designation": "Sr.Technician",
    "salary": 62000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 2000,
    "ratePerHr": 206.67,
    "basicSalary": 62000.0,
    "otHours": 41.0,
    "otAmount": 8473,
    "efficiencyAmount": 6200,
    "grossSalary": 76673,
    "advanceDeduction": 10000.0,
    "ticketCharges": 5.0,
    "netAmount": 66668,
    "month": "2026-08"
  },
  {
    "id": "cnt-5",
    "serialNo": 5,
    "employeeName": "Ameen Ullah Khan",
    "designation": "Electrician",
    "salary": 55000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1774,
    "ratePerHr": 183.33,
    "basicSalary": 55000.0,
    "otHours": 42.5,
    "otAmount": 7792,
    "efficiencyAmount": 6600,
    "grossSalary": 69392,
    "advanceDeduction": 30000.0,
    "ticketCharges": 5.0,
    "netAmount": 39387,
    "month": "2026-08"
  },
  {
    "id": "cnt-6",
    "serialNo": 6,
    "employeeName": "Zulfiqar",
    "designation": "Asst Technician",
    "salary": 45000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1452,
    "ratePerHr": 125.0,
    "basicSalary": 45000.0,
    "otHours": 54.0,
    "otAmount": 6750,
    "efficiencyAmount": 9450,
    "grossSalary": 61200,
    "advanceDeduction": 20000.0,
    "ticketCharges": 5.0,
    "netAmount": 41195,
    "month": "2026-08"
  },
  {
    "id": "cnt-7",
    "serialNo": 7,
    "employeeName": "Maqsood",
    "designation": "Asst Technician",
    "salary": 38000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1226,
    "ratePerHr": 105.56,
    "basicSalary": 38000.0,
    "otHours": 54.0,
    "otAmount": 5700,
    "efficiencyAmount": 0,
    "grossSalary": 43700,
    "advanceDeduction": 20000.0,
    "ticketCharges": 5.0,
    "netAmount": 23695,
    "month": "2026-08"
  },
  {
    "id": "cnt-8",
    "serialNo": 8,
    "employeeName": "Salman",
    "designation": "Jeckquard",
    "salary": 50000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1613,
    "ratePerHr": 166.67,
    "basicSalary": 50000.0,
    "otHours": 39.0,
    "otAmount": 6500,
    "efficiencyAmount": 6000,
    "grossSalary": 62500,
    "advanceDeduction": 20000.0,
    "ticketCharges": 5.0,
    "netAmount": 42495,
    "month": "2026-08"
  },
  {
    "id": "cnt-9",
    "serialNo": 9,
    "employeeName": "Hasnain",
    "designation": "Jeckquard",
    "salary": 42000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1355,
    "ratePerHr": 140.0,
    "basicSalary": 42000.0,
    "otHours": 54.0,
    "otAmount": 7560,
    "efficiencyAmount": 0,
    "grossSalary": 49560,
    "advanceDeduction": 15000.0,
    "ticketCharges": 5.0,
    "netAmount": 34555,
    "month": "2026-08"
  },
  {
    "id": "cnt-10",
    "serialNo": 10,
    "employeeName": "Nazakat",
    "designation": "Beem Gater",
    "salary": 50000.0,
    "attendanceDays": 21.0,
    "ratePerDay": 1613,
    "ratePerHr": 138.89,
    "basicSalary": 33870.967741935485,
    "otHours": 18.0,
    "otAmount": 2500,
    "efficiencyAmount": 4065,
    "grossSalary": 40436,
    "advanceDeduction": 30000.0,
    "ticketCharges": 5.0,
    "netAmount": 10431,
    "month": "2026-08"
  },
  {
    "id": "cnt-11",
    "serialNo": 11,
    "employeeName": "Muhammad Arif",
    "designation": "Technician",
    "salary": 55000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1774,
    "ratePerHr": 152.78,
    "basicSalary": 55000.0,
    "otHours": 54.0,
    "otAmount": 8250,
    "efficiencyAmount": 11550,
    "grossSalary": 74800,
    "advanceDeduction": 30000.0,
    "ticketCharges": 5.0,
    "netAmount": 44795,
    "month": "2026-08"
  },
  {
    "id": "cnt-12",
    "serialNo": 12,
    "employeeName": "Mushtaq Ahmed",
    "designation": "Folding",
    "salary": 36000.0,
    "attendanceDays": 30.0,
    "ratePerDay": 1161,
    "ratePerHr": 100.0,
    "basicSalary": 34838.709677419356,
    "otHours": 49.5,
    "otAmount": 4950,
    "efficiencyAmount": 0,
    "grossSalary": 39789,
    "advanceDeduction": 15000.0,
    "ticketCharges": 5.0,
    "netAmount": 24784,
    "month": "2026-08"
  },
  {
    "id": "cnt-13",
    "serialNo": 13,
    "employeeName": "Adison",
    "designation": "Sweeper",
    "salary": 32000.0,
    "attendanceDays": 8.0,
    "ratePerDay": 1032,
    "ratePerHr": 133.33,
    "basicSalary": 8258.064516129032,
    "otHours": 0.0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 8258,
    "advanceDeduction": 8000.0,
    "ticketCharges": 5.0,
    "netAmount": 253,
    "month": "2026-08"
  },
  {
    "id": "cnt-14",
    "serialNo": 14,
    "employeeName": "Christopher",
    "designation": "Sweeper",
    "salary": 32000.0,
    "attendanceDays": 5.0,
    "ratePerDay": 1032,
    "ratePerHr": 133.33,
    "basicSalary": 5161.290322580645,
    "otHours": 0.0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 5161,
    "advanceDeduction": 5000.0,
    "ticketCharges": 5.0,
    "netAmount": 156,
    "month": "2026-08"
  },
  {
    "id": "cnt-15",
    "serialNo": 15,
    "employeeName": "Ali Zar",
    "designation": "Sweeper",
    "salary": 32000.0,
    "attendanceDays": 26.0,
    "ratePerDay": 1032,
    "ratePerHr": 133.33,
    "basicSalary": 26838.709677419356,
    "otHours": 12.0,
    "otAmount": 1600,
    "efficiencyAmount": 0,
    "grossSalary": 28439,
    "advanceDeduction": 7000.0,
    "ticketCharges": 5.0,
    "netAmount": 21434,
    "month": "2026-08"
  }
]

const INITIAL_CONTRACTORS: ContractorPaymentRecord[] = [
  {
    "id": "c-1-1",
    "serialNo": 1,
    "name": "REHBAR ALI",
    "contractType": "Hand Knotting",
    "contractualAmount": 28880.0,
    "extraIncentive": 0,
    "totalAmount": 28880.0,
    "lessAdvance": 0,
    "netPayment": 28880.0,
    "remarks": "Bill Payment",
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "c-1-2",
    "serialNo": 2,
    "name": "NAZIM HUSSAIN",
    "contractType": "Sarning",
    "contractualAmount": 0.0,
    "extraIncentive": 0,
    "totalAmount": 0.0,
    "lessAdvance": 0,
    "netPayment": 0.0,
    "remarks": "Bill Payment",
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "c-2-3",
    "serialNo": 1,
    "name": "AMIR",
    "contractType": "PU Technician",
    "contractualAmount": 70000.0,
    "extraIncentive": 0.0,
    "totalAmount": 70000.0,
    "lessAdvance": 30000.0,
    "netPayment": 40000.0,
    "remarks": "Fix Salary(70000)",
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "c-2-4",
    "serialNo": 2,
    "name": "BASIT",
    "contractType": "Electrician",
    "contractualAmount": 70000.0,
    "extraIncentive": 0.0,
    "totalAmount": 70000.0,
    "lessAdvance": 20000.0,
    "netPayment": 50000.0,
    "remarks": "Fix Salary (70000)",
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "c-2-5",
    "serialNo": 3,
    "name": "NASEER AHMED",
    "contractType": "Reed Repairing",
    "contractualAmount": 5500.0,
    "extraIncentive": 0.0,
    "totalAmount": 5500.0,
    "lessAdvance": 0.0,
    "netPayment": 5500.0,
    "remarks": "Fix Salary (5500)",
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "c-2-6",
    "serialNo": 4,
    "name": "NAWAB",
    "contractType": "Gitta Winder",
    "contractualAmount": 30000.0,
    "extraIncentive": 0.0,
    "totalAmount": 30000.0,
    "lessAdvance": 0.0,
    "netPayment": 30000.0,
    "remarks": "Fix Salary (30000)",
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "c-2-7",
    "serialNo": 5,
    "name": "ZAFAR GUL",
    "contractType": "Chowkidar (Guard)",
    "contractualAmount": 32000.0,
    "extraIncentive": 0.0,
    "totalAmount": 32000.0,
    "lessAdvance": 0.0,
    "netPayment": 32000.0,
    "remarks": "Fix Salary (32000)",
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "c-2-8",
    "serialNo": 6,
    "name": "SHOAIB",
    "contractType": "Electrician Helper",
    "contractualAmount": 25000.0,
    "extraIncentive": 0.0,
    "totalAmount": 25000.0,
    "lessAdvance": 5000.0,
    "netPayment": 20000.0,
    "remarks": "Fix Salary (25000)",
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "c-2-9",
    "serialNo": 7,
    "name": "REHBAR ALI",
    "contractType": "H-Knotting",
    "contractualAmount": 54669.0,
    "extraIncentive": 0.0,
    "totalAmount": 54669.0,
    "lessAdvance": 0.0,
    "netPayment": 54669.0,
    "remarks": "Bill",
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "c-2-10",
    "serialNo": 8,
    "name": "SHAHID",
    "contractType": "M.Knotting",
    "contractualAmount": 34100.0,
    "extraIncentive": 0.0,
    "totalAmount": 34100.0,
    "lessAdvance": 0.0,
    "netPayment": 34100.0,
    "remarks": "Bill",
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "c-2-11",
    "serialNo": 9,
    "name": "NAZIM HUSSAIN",
    "contractType": "Sarning",
    "contractualAmount": 28200.0,
    "extraIncentive": 0.0,
    "totalAmount": 28200.0,
    "lessAdvance": 0.0,
    "netPayment": 28200.0,
    "remarks": "Bill",
    "fortnight": "16-31",
    "month": "2026-08"
  }
]

const INITIAL_EFFICIENCY_INCENTIVES: EfficiencyIncentiveRecord[] = [
  {
    "id": "eff-1",
    "serialNo": 1,
    "loom": "G6200",
    "name": "Muhammad Arif",
    "designation": "Technician",
    "efficiencyPercent": 81,
    "salaryEarned": 55000.0,
    "availPercent": 21,
    "amount": 11550.0,
    "month": "2026-08"
  },
  {
    "id": "eff-2",
    "serialNo": 2,
    "loom": "G6200",
    "name": "Zulfiqar",
    "designation": "Asst Technician",
    "efficiencyPercent": 81,
    "salaryEarned": 45000.0,
    "availPercent": 21,
    "amount": 9450.0,
    "month": "2026-08"
  },
  {
    "id": "eff-3",
    "serialNo": 3,
    "loom": "G6300",
    "name": "Abdul Waheed",
    "designation": "Sr.Technician",
    "efficiencyPercent": 70,
    "salaryEarned": 62000.0,
    "availPercent": 10,
    "amount": 6200.0,
    "month": "2026-08"
  },
  {
    "id": "eff-4",
    "serialNo": 4,
    "loom": "Overall",
    "name": "Ameen Ullah Khan",
    "designation": "Electrician",
    "efficiencyPercent": 72,
    "salaryEarned": 55000.0,
    "availPercent": 12,
    "amount": 6600.0,
    "month": "2026-08"
  },
  {
    "id": "eff-5",
    "serialNo": 5,
    "loom": "Overall",
    "name": "Salman",
    "designation": "Jeckquard",
    "efficiencyPercent": 72,
    "salaryEarned": 50000.0,
    "availPercent": 12,
    "amount": 6000.0,
    "month": "2026-08"
  },
  {
    "id": "eff-6",
    "serialNo": 6,
    "loom": "Overall",
    "name": "Nazakat",
    "designation": "Beem Gater",
    "efficiencyPercent": 72,
    "salaryEarned": 33870.967741935485,
    "availPercent": 12,
    "amount": 4064.516129032258,
    "month": "2026-08"
  }
]

class PayrollService {
  private isClient(): boolean {
    return typeof window !== 'undefined'
  }

  // ==========================================
  // FORMULA CALCULATION UTILITIES (LIVE EXCEL MATH)
  // ==========================================

  calculateStaffSalaryRow(row: Partial<StaffSalaryRecord>, daysInMonth = 31): StaffSalaryRecord {
    const salary = Number(row.salary) || 0
    const attendance = Number(row.attendanceDays) || 0
    const otHours = Number(row.otHours) || 0
    const lessAdvance = Number(row.lessAdvance) || 0
    const chequeAmount = Number(row.chequeAmount) || 0

    const ratePerDay = Math.round(salary / daysInMonth)
    const basicSalary = attendance === daysInMonth ? salary : Math.round((salary / daysInMonth) * attendance)
    const perHrRate = Number((salary / 240).toFixed(2))
    const otAmount = Math.round(otHours * perHrRate)
    const grossAmount = basicSalary + otAmount
    const synopsisAmount = grossAmount - lessAdvance
    const netCashAmount = Math.max(0, synopsisAmount - chequeAmount)

    return {
      id: row.id || `staff-${Date.now()}`,
      serialNo: row.serialNo || 1,
      employeeName: row.employeeName || '',
      designation: row.designation || '',
      salary,
      attendanceDays: attendance,
      ratePerDay,
      basicSalary,
      perHrRate,
      otHours,
      otAmount,
      grossAmount,
      lessAdvance,
      chequeAmount,
      synopsisAmount,
      netCashAmount,
      month: row.month || '2026-08',
    }
  }

  calculateContractSalaryRow(row: Partial<ContractSalaryRecord>, daysInMonth = 31): ContractSalaryRecord {
    const salary = Number(row.salary) || 0
    const attendance = Number(row.attendanceDays) || 0
    const otHours = Number(row.otHours) || 0
    const efficiencyAmount = Number(row.efficiencyAmount) || 0
    const advanceDeduction = Number(row.advanceDeduction) || 0
    const ticketCharges = row.ticketCharges !== undefined ? Number(row.ticketCharges) : 5

    const ratePerDay = Math.round(salary / daysInMonth)
    const basicSalary = attendance >= daysInMonth ? salary : Math.min(salary, Math.round((salary / daysInMonth) * attendance))
    
    // Look up duty hours from master employee roster (Sheet 1) or fall back to role defaults
    let dutyHrs = 10
    const empName = (row.employeeName || '').trim().toLowerCase()
    const matchedEmp = INITIAL_EMPLOYEES.find((e) => {
      const eName = (e.name || '').trim().toLowerCase()
      return eName === empName || (empName && (empName.includes(eName) || eName.includes(empName)))
    })

    if (matchedEmp && matchedEmp.dutyHrs && matchedEmp.dutyHrs > 0) {
      dutyHrs = matchedEmp.dutyHrs
    } else {
      const des = (row.designation || '').toLowerCase()
      if (
        des.includes('quality controller') ||
        des.includes('oilman') ||
        des.includes('oil man') ||
        des.includes('folding') ||
        des.includes('time keeper') ||
        des.includes('beem gater') ||
        des.includes('shift technician') ||
        des.includes('asst technician') ||
        des.includes('asst. technician') ||
        des.includes('technician')
      ) {
        dutyHrs = 12
      } else if (
        des.includes('incharge') ||
        des.includes('accountant') ||
        des.includes('supervisor') ||
        des.includes('store') ||
        des.includes('kitchen') ||
        des.includes('sweeper')
      ) {
        dutyHrs = 8
      } else if (des.includes('d.e.o') || des.includes('deo')) {
        dutyHrs = 9
      }
    }

    // Rate Per Hour is ALWAYS based on 30 days standard (Salary / (30 * Duty Hours))
    const ratePerHr = Number((salary / (30 * dutyHrs)).toFixed(2))
    const otAmount = Math.round(otHours * (salary / (30 * dutyHrs)))
    const grossSalary = basicSalary + otAmount + efficiencyAmount
    const netAmount = grossSalary - advanceDeduction - ticketCharges

    return {
      id: row.id || `cnt-${Date.now()}`,
      serialNo: row.serialNo || 1,
      employeeName: row.employeeName || '',
      designation: row.designation || '',
      salary,
      attendanceDays: attendance,
      ratePerDay,
      ratePerHr,
      basicSalary,
      otHours,
      otAmount,
      efficiencyAmount,
      grossSalary,
      advanceDeduction,
      ticketCharges,
      netAmount,
      month: row.month || '2026-08',
    }
  }

  calculateEfficiencyRow(row: Partial<EfficiencyIncentiveRecord>): EfficiencyIncentiveRecord {
    const eff = Number(row.efficiencyPercent) || 0
    const salaryEarned = Number(row.salaryEarned) || 0
    const availPercent = eff >= 70 ? Math.max(0, eff - 60) : 0
    const amount = Math.round(salaryEarned * (availPercent / 100))

    return {
      id: row.id || `eff-${Date.now()}`,
      serialNo: row.serialNo || 1,
      loom: row.loom || 'Overall',
      name: row.name || '',
      designation: row.designation || '',
      efficiencyPercent: eff,
      salaryEarned,
      availPercent,
      amount,
      month: row.month || '2026-08',
    }
  }

  calculateWeaverWageRow(row: Partial<WeaverWageRecord>): WeaverWageRecord {
    const designation = row.designation || 'Weaver'
    const isSpare = designation === 'Spare Weaver' || (row.wagePerDay && row.wagePerDay >= 1800)
    const wagePerDay = row.wagePerDay ? Number(row.wagePerDay) : isSpare ? 1800 : 1450
    const attendance = Number(row.attendanceDays) || 0
    const extraLooms = Number(row.extraLooms) || 0
    const rateLoom = row.rateLoom !== undefined ? Number(row.rateLoom) : 150
    const holidayAttendance = Number(row.holidayAttendance) || 0
    const holidayRate = row.holidayRate !== undefined ? Number(row.holidayRate) : isSpare ? 2100 : 1750
    const efficiencyAmount = Number(row.efficiencyAmount) || 0

    const basicSalary = wagePerDay * attendance
    const extraLoomAmount = extraLooms * rateLoom
    const attendanceAllowance = attendance >= 13 ? 800 : 0
    const holidayAmount = holidayAttendance * holidayRate
    const grossAmount = basicSalary + extraLoomAmount + attendanceAllowance
    const netPay = grossAmount + holidayAmount + efficiencyAmount

    return {
      id: row.id || `w-${Date.now()}`,
      serialNo: row.serialNo || 1,
      employeeName: row.employeeName || '',
      designation: isSpare ? 'Spare Weaver' : 'Weaver',
      wagePerDay,
      attendanceDays: attendance,
      basicSalary,
      rateLoom,
      extraLooms,
      extraLoomAmount,
      attendanceAllowance,
      holidayAttendance,
      holidayRate,
      holidayAmount,
      efficiencyAmount,
      grossAmount,
      netPay,
      fortnight: row.fortnight || '1-15',
      month: row.month || '2026-08',
    }
  }

  calculateHelperWageRow(row: Partial<HelperWageRecord>): HelperWageRecord {
    const wagePerDay = row.wagePerDay !== undefined ? Number(row.wagePerDay) : 1050
    const attendance = Number(row.attendanceDays) || 0
    const holidayAttendance = Number(row.holidayAttendance) || 0
    const otRate = row.otRate !== undefined ? Number(row.otRate) : 1200

    const wagesAmount = wagePerDay * attendance
    const otAmount = holidayAttendance * otRate
    const netAmount = wagesAmount + otAmount

    return {
      id: row.id || `h-${Date.now()}`,
      serialNo: row.serialNo || 1,
      employeeName: row.employeeName || '',
      designation: 'Helper',
      wagePerDay,
      attendanceDays: attendance,
      wagesAmount,
      otRate,
      holidayAttendance,
      otAmount,
      netAmount,
      fortnight: row.fortnight || '1-15',
      month: row.month || '2026-08',
    }
  }

  calculateContractorPaymentRow(row: Partial<ContractorPaymentRecord>): ContractorPaymentRecord {
    const contractualAmount = Number(row.contractualAmount) || 0
    const extraIncentive = Number(row.extraIncentive) || 0
    const lessAdvance = Number(row.lessAdvance) || 0

    const totalAmount = contractualAmount + extraIncentive
    const netPayment = totalAmount - lessAdvance

    return {
      id: row.id || `c-${Date.now()}`,
      serialNo: row.serialNo || 1,
      name: row.name || '',
      contractType: row.contractType || '',
      contractualAmount,
      extraIncentive,
      totalAmount,
      lessAdvance,
      netPayment,
      remarks: row.remarks || '',
      fortnight: row.fortnight || '1-15',
      month: row.month || '2026-08',
    }
  }

  // ==========================================
  // REACTIVE EVENT BROADCAST & SYNC
  // ==========================================

  notifyDataChanged(month?: string): void {
    if (this.isClient()) {
      try {
        window.dispatchEvent(new CustomEvent('payroll_synced', { detail: { month } }))
      } catch (err) {
        console.error('Error dispatching payroll sync event', err)
      }
    }
  }

  // ==========================================
  // LOCAL STORAGE GETTERS & PERSISTENCE
  // ==========================================

  getEmployees(): EmployeeProfile[] {
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(STORAGE_KEYS.EMPLOYEES)
        if (stored) return JSON.parse(stored)
      } catch (err) {
        console.error(err)
      }
    }
    return INITIAL_EMPLOYEES
  }

  saveEmployees(list: EmployeeProfile[]): void {
    if (this.isClient()) {
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(list))
      this.notifyDataChanged()
    }
  }

  addEmployee(emp: Omit<EmployeeProfile, 'id' | 'serialNo' | 'ratePerDay31' | 'ratePerDay30' | 'ratePerHr30' | 'ratePerDay28'>): EmployeeProfile {
    const list = this.getEmployees()
    const ratePerDay31 = Math.round((emp.salary / 31) * 100) / 100
    const ratePerDay30 = Math.round((emp.salary / 30) * 100) / 100
    const ratePerHr30 = Math.round((emp.salary / (30 * (emp.dutyHrs || 8))) * 100) / 100
    const ratePerDay28 = Math.round((emp.salary / 28) * 100) / 100

    const newEmp: EmployeeProfile = {
      ...emp,
      id: `emp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      serialNo: list.length + 1,
      ratePerDay31,
      ratePerDay30,
      ratePerHr30,
      ratePerDay28,
      status: emp.status || 'Active',
      employeeCategory: emp.employeeCategory || 'Staff',
    }
    list.push(newEmp)
    this.saveEmployees(list)
    return newEmp
  }

  updateEmployee(id: string, updatedFields: Partial<EmployeeProfile>): EmployeeProfile | null {
    const list = this.getEmployees()
    const idx = list.findIndex((e) => e.id === id)
    if (idx === -1) return null

    const current = list[idx]
    const salary = updatedFields.salary !== undefined ? Number(updatedFields.salary) : current.salary
    const dutyHrs = updatedFields.dutyHrs !== undefined ? Number(updatedFields.dutyHrs) : current.dutyHrs

    const ratePerDay31 = Math.round((salary / 31) * 100) / 100
    const ratePerDay30 = Math.round((salary / 30) * 100) / 100
    const ratePerHr30 = Math.round((salary / (30 * (dutyHrs || 8))) * 100) / 100
    const ratePerDay28 = Math.round((salary / 28) * 100) / 100

    const updated: EmployeeProfile = {
      ...current,
      ...updatedFields,
      salary,
      dutyHrs,
      ratePerDay31,
      ratePerDay30,
      ratePerHr30,
      ratePerDay28,
    }

    list[idx] = updated
    this.saveEmployees(list)
    this.syncEmployeeProfileUpdate(updated)
    return updated
  }

  deleteEmployee(id: string): void {
    let list = this.getEmployees()
    list = list.filter((e) => e.id !== id)
    // Renumber serials
    list = list.map((e, i) => ({ ...e, serialNo: i + 1 }))
    this.saveEmployees(list)
  }

  // Auto-sync employee designation & salary updates to all salary tables
  syncEmployeeProfileUpdate(emp: EmployeeProfile): void {
    const norm = (s?: string) => (s || '').trim().toLowerCase()
    const targetName = norm(emp.name)

    // Sync Staff Salaries
    const staffList = this.getStaffSalaries('2026-08')
    let staffChanged = false
    const updatedStaff = staffList.map((st) => {
      if (st.employeeId === emp.id || norm(st.employeeName) === targetName) {
        staffChanged = true
        return this.calculateStaffSalaryRow({
          ...st,
          employeeName: emp.name,
          designation: emp.designation,
          salary: emp.salary,
        })
      }
      return st
    })
    if (staffChanged) this.saveStaffSalaries(updatedStaff, false)

    // Sync Contract Salaries
    const contractList = this.getContractSalaries('2026-08')
    let contractChanged = false
    const updatedContract = contractList.map((ct) => {
      if (ct.employeeId === emp.id || norm(ct.employeeName) === targetName) {
        contractChanged = true
        return this.calculateContractSalaryRow({
          ...ct,
          employeeName: emp.name,
          designation: emp.designation,
          salary: emp.salary,
        })
      }
      return ct
    })
    if (contractChanged) this.saveContractSalaries(updatedContract, false)

    // Sync Weavers
    const weavers = this.getWeaversWages('2026-08')
    let weaversChanged = false
    const updatedWeavers = weavers.map((w) => {
      if (w.employeeId === emp.id || norm(w.employeeName) === targetName) {
        weaversChanged = true
        return this.calculateWeaverWageRow({
          ...w,
          employeeName: emp.name,
          wagePerDay: emp.ratePerDay30 || w.wagePerDay,
        })
      }
      return w
    })
    if (weaversChanged) this.saveWeaversWages('2026-08', updatedWeavers, false)

    this.notifyDataChanged()
  }

  // Cross-table synchronization: Advance ➔ Staff / Contract / Contractor Tables
  syncAdvanceToSalaries(employeeNameOrId: string, month: string = '2026-08', newAmount: number): void {
    const norm = (s?: string) => (s || '').trim().toLowerCase()
    const target = norm(employeeNameOrId)

    // 1. Check Staff Salaries
    const staffList = this.getStaffSalaries(month)
    let staffUpdated = false
    const updatedStaff = staffList.map((st) => {
      if (st.employeeId === employeeNameOrId || norm(st.employeeName) === target) {
        staffUpdated = true
        return this.calculateStaffSalaryRow({
          ...st,
          lessAdvance: newAmount,
        })
      }
      return st
    })
    if (staffUpdated) {
      this.saveStaffSalaries(updatedStaff, false)
    }

    // 2. Check Contract Salaries
    const contractList = this.getContractSalaries(month)
    let contractUpdated = false
    const updatedContract = contractList.map((ct) => {
      if (ct.employeeId === employeeNameOrId || norm(ct.employeeName) === target) {
        contractUpdated = true
        return this.calculateContractSalaryRow({
          ...ct,
          advanceDeduction: newAmount,
        })
      }
      return ct
    })
    if (contractUpdated) {
      this.saveContractSalaries(updatedContract, false)
    }

    // 3. Check Contractors Payments
    const contractors = this.getContractorsPayments(month)
    let contractorUpdated = false
    const updatedContractors = contractors.map((c) => {
      if (c.employeeId === employeeNameOrId || norm(c.name) === target) {
        contractorUpdated = true
        return this.calculateContractorPaymentRow({
          ...c,
          lessAdvance: newAmount,
        })
      }
      return c
    })
    if (contractorUpdated) {
      this.saveContractorsPayments('2026-08', updatedContractors, false)
    }

    this.notifyDataChanged(month)
  }

  // Cross-table synchronization: Efficiency ➔ Contract Salaries / Weaver Wages
  syncEfficiencyToSalaries(name: string, month: string = '2026-08', amount: number): void {
    const norm = (s?: string) => (s || '').trim().toLowerCase()
    const target = norm(name)

    // Contract Salaries
    const contractList = this.getContractSalaries(month)
    let contractUpdated = false
    const updatedContract = contractList.map((ct) => {
      if (norm(ct.employeeName) === target) {
        contractUpdated = true
        return this.calculateContractSalaryRow({
          ...ct,
          efficiencyAmount: amount,
        })
      }
      return ct
    })
    if (contractUpdated) this.saveContractSalaries(updatedContract, false)

    // Weavers Wages
    const weavers = this.getWeaversWages(month)
    let weaverUpdated = false
    const updatedWeavers = weavers.map((w) => {
      if (norm(w.employeeName) === target) {
        weaverUpdated = true
        return this.calculateWeaverWageRow({
          ...w,
          efficiencyAmount: amount,
        })
      }
      return w
    })
    if (weaverUpdated) this.saveWeaversWages(month, updatedWeavers, false)

    this.notifyDataChanged(month)
  }

  // ==========================================
  // ADVANCES (WITH AUTOMATIC CASCADING SYNC)
  // ==========================================

  getAdvances(month: string = '2026-08', fortnight?: string): AdvanceRecord[] {
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(STORAGE_KEYS.ADVANCES)
        if (stored) {
          const list: AdvanceRecord[] = JSON.parse(stored)
          let filtered = list.filter((a) => (a.month || '2026-08') === month)
          if (fortnight && fortnight !== 'all') {
            filtered = filtered.filter((a) => (a.fortnight || '1-15') === fortnight)
          }
          if (filtered.length > 0) return filtered
        }
      } catch (err) {
        console.error(err)
      }
    }
    let list = INITIAL_ADVANCES.filter((a) => (a.month || '2026-08') === month)
    if (fortnight && fortnight !== 'all') {
      list = list.filter((a) => (a.fortnight || '1-15') === fortnight)
    }
    return list
  }

  saveAdvances(list: AdvanceRecord[], triggerCascade: boolean = true, month?: string, fortnight?: string): void {
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(STORAGE_KEYS.ADVANCES)
        let masterList: AdvanceRecord[] = stored ? JSON.parse(stored) : [...INITIAL_ADVANCES]
        
        if (month) {
          masterList = masterList.filter((a) => {
            if ((a.month || '2026-08') !== month) return true
            if (fortnight && fortnight !== 'all' && (a.fortnight || '1-15') !== fortnight) return true
            return false
          })
          masterList = [...masterList, ...list]
        } else {
          masterList = list
        }
        
        localStorage.setItem(STORAGE_KEYS.ADVANCES, JSON.stringify(masterList))
      } catch (err) {
        console.error(err)
        localStorage.setItem(STORAGE_KEYS.ADVANCES, JSON.stringify(list))
      }

      if (triggerCascade && list.length > 0) {
        list.forEach((adv) => {
          this.syncAdvanceToSalaries(adv.employeeName, adv.month || month || '2026-08', adv.amount || 0)
        })
      }
      this.notifyDataChanged(month)
    }
  }

  // ==========================================
  // STAFF SALARIES
  // ==========================================

  getStaffSalaries(month: string = '2026-08'): StaffSalaryRecord[] {
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(STORAGE_KEYS.STAFF)
        if (stored) {
          const list: StaffSalaryRecord[] = JSON.parse(stored)
          const filtered = list.filter((s) => s.month === month)
          if (filtered.length > 0) return filtered
        }
      } catch (err) {
        console.error(err)
      }
    }
    return INITIAL_STAFF_SALARIES.filter((s) => s.month === month)
  }

  saveStaffSalaries(list: StaffSalaryRecord[], broadcast: boolean = true): void {
    if (this.isClient()) {
      localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(list))
      if (broadcast) this.notifyDataChanged()
    }
  }

  // ==========================================
  // CONTRACT SALARIES
  // ==========================================

  getContractSalaries(month: string = '2026-08'): ContractSalaryRecord[] {
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(STORAGE_KEYS.CONTRACT)
        if (stored) {
          const list: ContractSalaryRecord[] = JSON.parse(stored)
          const filtered = list.filter((c) => c.month === month)
          if (filtered.length > 0) return filtered
        }
      } catch (err) {
        console.error(err)
      }
    }
    return INITIAL_CONTRACT_SALARIES.filter((c) => c.month === month)
  }

  saveContractSalaries(monthOrList: string | ContractSalaryRecord[], listOrBroadcast?: ContractSalaryRecord[] | boolean, broadcast: boolean = true): void {
    const data = Array.isArray(monthOrList) ? monthOrList : (Array.isArray(listOrBroadcast) ? listOrBroadcast : [])
    const shouldBroadcast = typeof listOrBroadcast === 'boolean' ? listOrBroadcast : broadcast
    if (this.isClient()) {
      localStorage.setItem(STORAGE_KEYS.CONTRACT, JSON.stringify(data))
      if (shouldBroadcast) this.notifyDataChanged()
    }
  }

  // ==========================================
  // EFFICIENCY INCENTIVES
  // ==========================================

  getEfficiencyIncentives(month: string = '2026-08'): EfficiencyIncentiveRecord[] {
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(STORAGE_KEYS.EFFICIENCY)
        if (stored) {
          const list: EfficiencyIncentiveRecord[] = JSON.parse(stored)
          const filtered = list.filter((e) => e.month === month)
          if (filtered.length > 0) return filtered
        }
      } catch (err) {
        console.error(err)
      }
    }
    return INITIAL_EFFICIENCY_INCENTIVES.filter((e) => e.month === month)
  }

  saveEfficiencyIncentives(list: EfficiencyIncentiveRecord[], triggerCascade: boolean = true): void {
    if (this.isClient()) {
      localStorage.setItem(STORAGE_KEYS.EFFICIENCY, JSON.stringify(list))
      if (triggerCascade) {
        list.forEach((eff) => {
          this.syncEfficiencyToSalaries(eff.name, eff.month || '2026-08', eff.amount || 0)
        })
      }
      this.notifyDataChanged()
    }
  }

  // ==========================================
  // WEAVERS WAGES
  // ==========================================

  getWeaversWages(month: string = '2026-08', fortnight?: '1-15' | '16-31'): WeaverWageRecord[] {
    let list: WeaverWageRecord[] = INITIAL_WEAVERS_WAGES
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(STORAGE_KEYS.WEAVERS)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) list = parsed
        }
      } catch (err) {
        console.error(err)
      }
    }
    return list.filter((w) => w.month === month && (!fortnight || w.fortnight === fortnight))
  }

  saveWeaversWages(monthOrList: string | WeaverWageRecord[], fortnightOrList?: string | WeaverWageRecord[], listOrBroadcast?: WeaverWageRecord[] | boolean, broadcast: boolean = true): void {
    const data = Array.isArray(monthOrList) ? monthOrList : (Array.isArray(fortnightOrList) ? fortnightOrList : (Array.isArray(listOrBroadcast) ? listOrBroadcast : []))
    const shouldBroadcast = typeof listOrBroadcast === 'boolean' ? listOrBroadcast : broadcast
    if (this.isClient()) {
      localStorage.setItem(STORAGE_KEYS.WEAVERS, JSON.stringify(data))
      if (shouldBroadcast) this.notifyDataChanged()
    }
  }

  // ==========================================
  // HELPERS WAGES
  // ==========================================

  getHelpersWages(month: string = '2026-08', fortnight?: '1-15' | '16-31'): HelperWageRecord[] {
    let list: HelperWageRecord[] = INITIAL_HELPERS_WAGES
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(STORAGE_KEYS.HELPERS)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) list = parsed
        }
      } catch (err) {
        console.error(err)
      }
    }
    return list.filter((h) => h.month === month && (!fortnight || h.fortnight === fortnight))
  }

  saveHelpersWages(monthOrList: string | HelperWageRecord[], fortnightOrList?: string | HelperWageRecord[], listOrBroadcast?: HelperWageRecord[] | boolean, broadcast: boolean = true): void {
    const data = Array.isArray(monthOrList) ? monthOrList : (Array.isArray(fortnightOrList) ? fortnightOrList : (Array.isArray(listOrBroadcast) ? listOrBroadcast : []))
    const shouldBroadcast = typeof listOrBroadcast === 'boolean' ? listOrBroadcast : broadcast
    if (this.isClient()) {
      localStorage.setItem(STORAGE_KEYS.HELPERS, JSON.stringify(data))
      if (shouldBroadcast) this.notifyDataChanged()
    }
  }

  // ==========================================
  // CONTRACTORS PAYMENTS
  // ==========================================

  getContractorsPayments(month: string = '2026-08', fortnight?: '1-15' | '16-31'): ContractorPaymentRecord[] {
    let list: ContractorPaymentRecord[] = INITIAL_CONTRACTORS
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(STORAGE_KEYS.CONTRACTORS)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) list = parsed
        }
      } catch (err) {
        console.error(err)
      }
    }
    return list.filter((c) => c.month === month && (!fortnight || c.fortnight === fortnight))
  }

  saveContractorsPayments(monthOrList: string | ContractorPaymentRecord[], fortnightOrList?: string | ContractorPaymentRecord[], listOrBroadcast?: ContractorPaymentRecord[] | boolean, broadcast: boolean = true): void {
    const data = Array.isArray(monthOrList) ? monthOrList : (Array.isArray(fortnightOrList) ? fortnightOrList : (Array.isArray(listOrBroadcast) ? listOrBroadcast : []))
    const shouldBroadcast = typeof listOrBroadcast === 'boolean' ? listOrBroadcast : broadcast
    if (this.isClient()) {
      localStorage.setItem(STORAGE_KEYS.CONTRACTORS, JSON.stringify(data))
      if (shouldBroadcast) this.notifyDataChanged()
    }
  }

  // ==========================================
  // DYNAMIC SYNOPSIS & ROLLUPS (EXACT EXCEL LIVE MATH)
  // ==========================================

  getFortnightSynopsis(month: string = '2026-08', fortnight: '1-15' | '16-31'): FortnightSynopsis {
    if (fortnight === '1-15') {
      const advances = this.getAdvances(month)
      const totalAdvance = advances.reduce((s, a) => s + (a.amount || 0), 0)

      const weavers1 = this.getWeaversWages(month, '1-15')
      const totalWeaverWages = weavers1.reduce((s, w) => s + (w.grossAmount || 0), 0)
      const totalWeaverHol = weavers1.reduce((s, w) => s + (w.holidayAmount || 0), 0)
      const totalWeaverEff = weavers1.reduce((s, w) => s + (w.efficiencyAmount || 0), 0)

      const helpers1 = this.getHelpersWages(month, '1-15')
      const totalHelperWages = helpers1.reduce((s, h) => s + (h.netAmount || 0), 0)

      const contractors1 = this.getContractorsPayments(month, '1-15')
      const totalContractor1 = contractors1.reduce((s, c) => s + (c.netPayment || 0), 0)

      const totalPayrollCash = totalAdvance + totalWeaverWages + totalWeaverHol + totalWeaverEff + totalHelperWages + totalContractor1
      const pettyCashInflow = 86930
      const totalBankCheque = totalPayrollCash + pettyCashInflow

      return {
        fortnight: '1-15',
        month,
        title: `Salary Expense 1 to 15 (${month}) - 1st Fortnight Disbursal Voucher`,
        items: [
          { serialNo: 1, description: 'ADVANCE (Peshgi)', amount: totalAdvance },
          { serialNo: 2, description: 'WEAVERS WAGES (Basic + Extra Looms + Allowance)', amount: totalWeaverWages },
          { serialNo: 3, description: 'WEAVERS OVERTIME / HOLIDAYS', amount: totalWeaverHol },
          { serialNo: 4, description: 'WEAVER EFFICIENCY BONUS', amount: totalWeaverEff },
          { serialNo: 5, description: `HELPERS WAGES (${helpers1.length} Helpers)`, amount: totalHelperWages },
          { serialNo: 6, description: `CONTRACTORS PAYMENT (${contractors1.length} Contractors)`, amount: totalContractor1 },
        ],
        totalPayrollCash,
        pettyCashInflow,
        totalBankCheque,
      }
    }

    // Fortnight 2 (16-31 & Month End)
    const staff = this.getStaffSalaries(month)
    const totalStaffSynopsis = staff.reduce((s, st) => s + (st.synopsisAmount || 0), 0)
    const totalStaffCheque = staff.reduce((s, st) => s + (st.chequeAmount || 0), 0)
    const totalStaffAdvance = staff.reduce((s, st) => s + (st.lessAdvance || 0), 0)

    const contract = this.getContractSalaries(month)
    const totalContractBasic = contract.reduce((s, c) => s + (c.basicSalary || 0), 0)
    const totalContractAdv = contract.reduce((s, c) => s + (c.advanceDeduction || 0), 0)
    const netContractBasic = Math.max(0, totalContractBasic - totalContractAdv)
    const totalContractOT = contract.reduce((s, c) => s + (c.otAmount || 0), 0)
    const totalContractEff = contract.reduce((s, c) => s + (c.efficiencyAmount || 0), 0)
    const totalTicket = contract.reduce((s, c) => s + (c.ticketCharges || 0), 0)

    const weavers2 = this.getWeaversWages(month, '16-31')
    const totalWeaverWages2 = weavers2.reduce((s, w) => s + (w.grossAmount || 0), 0)
    const totalWeaverHol2 = weavers2.reduce((s, w) => s + (w.holidayAmount || 0), 0)
    const totalWeaverEff2 = weavers2.reduce((s, w) => s + (w.efficiencyAmount || 0), 0)

    const helpers2 = this.getHelpersWages(month, '16-31')
    const totalHelperWages2 = helpers2.reduce((s, h) => s + (h.netAmount || 0), 0)

    const contractors2 = this.getContractorsPayments(month, '16-31')
    const totalContractor2 = contractors2.reduce((s, c) => s + (c.netPayment || 0), 0)

    const totalPayrollCash = Math.round(
      (totalStaffSynopsis - totalStaffCheque) +
      netContractBasic +
      totalContractOT +
      totalContractEff +
      totalWeaverWages2 +
      totalWeaverHol2 +
      totalWeaverEff2 +
      totalHelperWages2 +
      totalContractor2 -
      totalTicket
    )
    const pettyCashInflow = 86570
    const totalBankCheque = totalPayrollCash + pettyCashInflow

    return {
      fortnight: '16-31',
      month,
      title: `Salary Expense 16 to 31 (${month}) - 2nd Fortnight & Settlement`,
      items: [
        { serialNo: 1, description: 'Staff Salaries & Overtime (Net Cash)', amount: Math.round(totalStaffSynopsis - totalStaffCheque), chequeAmount: totalStaffCheque, advance: totalStaffAdvance },
        { serialNo: 2, description: 'Contract Employees Salaries (Net Basic)', amount: Math.round(netContractBasic), advance: totalContractAdv },
        { serialNo: 3, description: 'Contract Employees Overtime', amount: Math.round(totalContractOT) },
        { serialNo: 4, description: 'Contract Employees Efficiency', amount: Math.round(totalContractEff) },
        { serialNo: 5, description: 'Weavers Wages (2nd Half)', amount: totalWeaverWages2 },
        { serialNo: 6, description: 'Weavers Overtime / Holidays (2nd Half)', amount: totalWeaverHol2 },
        { serialNo: 7, description: 'Weaver Efficiency Bonus (2nd Half)', amount: totalWeaverEff2 },
        { serialNo: 8, description: `Helpers Wages (${helpers2.length} Helpers)`, amount: totalHelperWages2 },
        { serialNo: 9, description: `Contractors Bill Payments (${contractors2.length} Contractors)`, amount: totalContractor2 },
        { serialNo: 10, description: 'Ticket Charges Deductions', amount: -totalTicket },
      ],
      totalPayrollCash,
      pettyCashInflow,
      totalBankCheque,
    }
  }

  getMonthlyGrandSummary(month: string = '2026-08'): MonthlyGrandSalarySynopsis {
    const f1 = this.getFortnightSynopsis(month, '1-15')
    const f2 = this.getFortnightSynopsis(month, '16-31')

    const staff = this.getStaffSalaries(month)
    const contract = this.getContractSalaries(month)
    const weavers1 = this.getWeaversWages(month, '1-15')
    const weavers2 = this.getWeaversWages(month, '16-31')
    const helpers1 = this.getHelpersWages(month, '1-15')
    const helpers2 = this.getHelpersWages(month, '16-31')
    const contractors1 = this.getContractorsPayments(month, '1-15')
    const contractors2 = this.getContractorsPayments(month, '16-31')

    const totalStaffGross = staff.reduce((s, st) => s + (st.grossAmount || 0), 0)
    const totalStaffCheque = staff.reduce((s, st) => s + (st.chequeAmount || 0), 0)
    const totalStaffAdv = staff.reduce((s, st) => s + (st.lessAdvance || 0), 0)
    const totalStaffCash = staff.reduce((s, st) => s + (st.netCashAmount || 0), 0)

    const totalContractBasic = contract.reduce((s, c) => s + (c.basicSalary || 0), 0)
    const totalContractAdv = contract.reduce((s, c) => s + (c.advanceDeduction || 0), 0)
    const totalContractOT = contract.reduce((s, c) => s + (c.otAmount || 0), 0)
    const totalContractEff = contract.reduce((s, c) => s + (c.efficiencyAmount || 0), 0)

    const totalWeaverWages = weavers1.reduce((s, w) => s + (w.grossAmount || 0), 0) + weavers2.reduce((s, w) => s + (w.grossAmount || 0), 0)
    const totalWeaverHol = weavers1.reduce((s, w) => s + (w.holidayAmount || 0), 0) + weavers2.reduce((s, w) => s + (w.holidayAmount || 0), 0)
    const totalWeaverEff = weavers1.reduce((s, w) => s + (w.efficiencyAmount || 0), 0) + weavers2.reduce((s, w) => s + (w.efficiencyAmount || 0), 0)

    const totalHelperWages = helpers1.reduce((s, h) => s + (h.netAmount || 0), 0) + helpers2.reduce((s, h) => s + (h.netAmount || 0), 0)
    const totalContractorPayments = contractors1.reduce((s, c) => s + (c.netPayment || 0), 0) + contractors2.reduce((s, c) => s + (c.netPayment || 0), 0)

    return {
      month,
      monthTitle: `Grand Monthly Salary & Wages Synopsis (${month})`,
      fortnight1Total: f1.totalPayrollCash,
      fortnight1PettyCash: f1.pettyCashInflow,
      fortnight1Cheque: f1.totalBankCheque,
      fortnight2Total: f2.totalPayrollCash,
      fortnight2PettyCash: f2.pettyCashInflow,
      fortnight2Cheque: f2.totalBankCheque,
      monthlyTotalSalary: f1.totalBankCheque + f2.totalBankCheque,
      grandSynopsisItems: [
        { serialNo: 1, description: 'Staff Salaries & Overtime', amount: Math.round(totalStaffCash), chequeAmount: totalStaffCheque, advance: totalStaffAdv, totalGrossHead: totalStaffGross },
        { serialNo: 2, description: 'Contract Employees Salaries', amount: Math.round(Math.max(0, totalContractBasic - totalContractAdv)), chequeAmount: 0, advance: totalContractAdv, totalGrossHead: totalContractBasic },
        { serialNo: 3, description: 'Contract Employee Overtime', amount: Math.round(totalContractOT), chequeAmount: 0, advance: 0, totalGrossHead: totalContractOT },
        { serialNo: 4, description: 'Contract Employee Efficiency', amount: Math.round(totalContractEff), chequeAmount: 0, advance: 0, totalGrossHead: totalContractEff },
        { serialNo: 5, description: 'Weavers Wages (Total Fortnight 1 + 2)', amount: Math.round(totalWeaverWages), chequeAmount: 0, advance: 0, totalGrossHead: totalWeaverWages },
        { serialNo: 6, description: 'Weavers Holy Days / OT Amount', amount: Math.round(totalWeaverHol), chequeAmount: 0, advance: 0, totalGrossHead: totalWeaverHol },
        { serialNo: 7, description: 'Weaver Efficiency Bonus', amount: Math.round(totalWeaverEff), chequeAmount: 0, advance: 0, totalGrossHead: totalWeaverEff },
        { serialNo: 8, description: 'Helpers Wages (Total Fortnight 1 + 2)', amount: Math.round(totalHelperWages), chequeAmount: 0, advance: 0, totalGrossHead: totalHelperWages },
        { serialNo: 9, description: 'Contractors Bill Payments', amount: Math.round(totalContractorPayments), chequeAmount: 0, advance: 0, totalGrossHead: totalContractorPayments },
      ],
    }
  }

  // Petty Cash Register (Sheets 13 & 20)
  getPettyCashEntries(month: string = '2026-08', fortnight: '1-15' | '16-31'): PettyCashRecord[] {
    if (this.isClient()) {
      const stored = localStorage.getItem(STORAGE_KEYS.PETTY_CASH)
      if (stored) {
        try {
          const parsed: PettyCashRecord[] = JSON.parse(stored)
          const filtered = parsed.filter((e) => e.fortnight === fortnight)
          if (filtered.length > 0) return filtered
        } catch (e) {
          console.error('Failed to parse petty cash', e)
        }
      }
    }
    return INITIAL_PETTY_CASH.filter((e) => e.fortnight === fortnight)
  }

  savePettyCashEntries(monthOrList: string | PettyCashRecord[], fortnightOrList?: string | PettyCashRecord[], list?: PettyCashRecord[]): void {
    const data = Array.isArray(monthOrList) ? monthOrList : (Array.isArray(fortnightOrList) ? fortnightOrList : (list || []))
    if (this.isClient()) {
      localStorage.setItem(STORAGE_KEYS.PETTY_CASH, JSON.stringify(data))
      this.notifyDataChanged()
    }
  }

  resetAllToDefault(): void {
    this.resetToDefaults()
  }

  resetToDefaults(): void {
    if (this.isClient()) {
      localStorage.removeItem(STORAGE_KEYS.EMPLOYEES)
      localStorage.removeItem(STORAGE_KEYS.ADVANCES)
      localStorage.removeItem(STORAGE_KEYS.STAFF)
      localStorage.removeItem(STORAGE_KEYS.CONTRACT)
      localStorage.removeItem(STORAGE_KEYS.EFFICIENCY)
      localStorage.removeItem(STORAGE_KEYS.WEAVERS)
      localStorage.removeItem(STORAGE_KEYS.HELPERS)
      localStorage.removeItem(STORAGE_KEYS.CONTRACTORS)
      localStorage.removeItem(STORAGE_KEYS.PETTY_CASH)
      this.notifyDataChanged()
    }
  }
}

const INITIAL_PETTY_CASH: PettyCashRecord[] = [
  // Fortnight 1 (1 to 15 Aug 2026) - Sheet 13
  { id: 'pc-1-1', serialNo: 1, date: '2026-08-01', description: 'Balance b/f', drAmount: null, crAmount: null, balance: 4714, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-2', serialNo: 2, date: '2026-08-05', description: 'Cash Recceived for Petty Cash', drAmount: 80136, crAmount: null, balance: 84850, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-3', serialNo: 3, date: '2026-08-05', description: 'Cash Recceived for Salary, Wages and Contractor Payment', drAmount: 1509864, crAmount: null, balance: 1594714, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-4', serialNo: 4, date: '2026-08-05', description: 'Paid Salaries and Contracters amount', drAmount: null, crAmount: 1509864, balance: 84850, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-5', serialNo: 5, date: '2026-08-02', description: 'Salvage & Weft Cutter For G-6300', drAmount: null, crAmount: 18000, balance: 66850, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-6', serialNo: 6, date: '2026-08-03', description: 'Bearing 6207 5pcs, Toner Refilling, KDJ-4629 Petrol, Bykea', drAmount: null, crAmount: 8400, balance: 58450, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-7', serialNo: 7, date: '2026-08-07', description: 'LY3 Relay 9pcs, LY4 Relay 6pcs, LY4 Base 6pcs', drAmount: null, crAmount: 17100, balance: 41350, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-8', serialNo: 8, date: '2026-08-08', description: 'Acid 2 Can, Broom 10pcs, Surf 3kg, Belt 1100 H 2pcs', drAmount: null, crAmount: 13010, balance: 28340, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-9', serialNo: 9, date: '2026-08-08', description: 'LN Bolt 4pcs, Breaker 16 To 22A 2pcs, Petrol KGA 6065', drAmount: null, crAmount: 6640, balance: 21700, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-10', serialNo: 10, date: '2026-08-08', description: 'Bearing 6207 3pcs, 6304 3pcs, 6008 2pcs, Diamond File, Cutter Blade', drAmount: null, crAmount: 9920, balance: 11780, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-11', serialNo: 11, date: '2026-08-12', description: 'PTCL Bill Paid', drAmount: null, crAmount: 8070, balance: 3710, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-12', serialNo: 12, date: '2026-08-15', description: 'Chalk 24box, Register 3pcs, Bykea For Electronic Component', drAmount: null, crAmount: 2780, balance: 930, fortnight: '1-15', month: '2026-08' },

  // Fortnight 2 (16 to 31 Aug 2026) - Sheet 20
  { id: 'pc-2-0', serialNo: null, date: '2026-08-16', description: 'Balance b/f', drAmount: null, crAmount: null, balance: 930, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-1', serialNo: 1, date: '2026-08-20', description: 'Cash Recceived for Petty Cash', drAmount: 86930, crAmount: null, balance: 87860, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-2', serialNo: 2, date: '2026-08-20', description: 'Cash Recceived for Salary, Wages and Contractor Payment', drAmount: 983070, crAmount: null, balance: 1070930, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-3', serialNo: 3, date: '2026-08-20', description: 'Paid Salaries and Contracters amount', drAmount: null, crAmount: 983070, balance: 87860, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-4', serialNo: 4, date: '2026-08-16', description: 'Solar Panel Wash, Washing Chemical, Dry Mop (Cleaning 10-08-2026)', drAmount: null, crAmount: 16400, balance: 71460, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-5', serialNo: 5, date: '2026-08-20', description: 'Grease Bucket 12kg, Petrol KGA-6065', drAmount: null, crAmount: 9000, balance: 62460, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-6', serialNo: 6, date: '2026-08-21', description: 'Jeck Drive Plate Bush, Bykea For Electronic Component, Silicon Tube', drAmount: null, crAmount: 3790, balance: 58670, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-7', serialNo: 7, date: '2026-08-24', description: 'Chain Gear 38 Teeth With Bolt', drAmount: null, crAmount: 4680, balance: 53990, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-8', serialNo: 8, date: '2026-08-25', description: 'Leno Con Winding', drAmount: null, crAmount: 2500, balance: 51490, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-9', serialNo: 9, date: '2026-08-27', description: '08BI 428 Chain 10ft, Ufone Blaze Pkg', drAmount: null, crAmount: 5650, balance: 45840, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-10', serialNo: 10, date: '2026-08-27', description: 'Stationary Items, Marker, Ink, Ball pen, A4 Rim, Register, D/Book', drAmount: null, crAmount: 6455, balance: 39385, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-11', serialNo: 11, date: '2026-08-29', description: 'Solar Panel Wash (Cleaning Date 25-08-2026)', drAmount: null, crAmount: 12000, balance: 27385, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-12', serialNo: 12, date: '2026-08-29', description: 'Helper Injured (Bandage And Medicine)', drAmount: null, crAmount: 5700, balance: 21685, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-13', serialNo: 13, date: '2026-08-31', description: 'Dobby Belt 1400-14M 55mm 1pcs, 1100H Belt 30mm 1pcs', drAmount: null, crAmount: 8200, balance: 13485, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-14', serialNo: 14, date: '2026-08-31', description: 'Bearing 6304N 6pcs, Silicon Tube 5pcs', drAmount: null, crAmount: 4350, balance: 9135, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-15', serialNo: 15, date: '2026-08-31', description: 'JeckQuard LCD Repaired, Ribbon Cable 3+1 10pcs', drAmount: null, crAmount: 4500, balance: 4635, fortnight: '16-31', month: '2026-08' },
]

export const payrollService = new PayrollService()
