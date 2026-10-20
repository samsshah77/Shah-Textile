/** Request bodies for /api/accounts/* — validated on the server, reused by the pages. */
import { z } from 'zod'
import { DATE_RE, MONTH_RE, isDate } from '@/lib/accounts/util'

const month = z.string().regex(MONTH_RE, 'Month must be YYYY-MM')
const date = z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD').refine(isDate, 'Not a real date')
const text = (max: number) => z.string().trim().max(max)
const money = z.coerce.number().finite().min(0).max(1e11)
const qty = z.coerce.number().finite().min(0).max(1e7)

export const lineInput = z.object({
  id: z.string().max(64).optional(),
  description: text(300),
  machine: text(40).default(''),
  quantity: qty,
  rate: money,
})

export const billCreate = z.object({
  month,
  date,
  billNo: text(60).default(''),
  inwardNo: text(60).default(''),
  /** Existing party id, or a new name (created on the fly with `partyKind`). */
  partyId: z.string().max(64).optional(),
  partyName: text(160).optional(),
  partyKind: z.enum(['TRADER', 'WORKSHOP']).optional(),
  remarks: text(500).default(''),
  lines: z.array(lineInput).min(1, 'At least one item').max(200),
  /** Insert right after this bill in the sheet order (optional). */
  afterBillId: z.string().max(64).optional(),
})

export const billUpdate = z.object({
  baseVersion: z.number().int().min(1),
  date: date.optional(),
  month: month.optional(),
  billNo: text(60).optional(),
  inwardNo: text(60).optional(),
  partyId: z.string().max(64).optional(),
  remarks: text(500).optional(),
  /** When given, replaces all lines (ids kept where provided). */
  lines: z.array(lineInput).min(1).max(200).optional(),
})

export const lineUpdate = z.object({
  baseVersion: z.number().int().min(1),
  description: text(300).optional(),
  machine: text(40).optional(),
  quantity: qty.optional(),
  rate: money.optional(),
})

export const lineAdd = z.object({
  baseVersion: z.number().int().min(1),
  afterLineId: z.string().max(64).optional(),
  line: lineInput,
})

export const partyCreate = z.object({
  name: text(160).min(1, 'Name required'),
  kind: z.enum(['TRADER', 'WORKSHOP']),
  category: text(80).default(''),
  costBucket: z.enum(['MACHINERY', 'ELECTRIC', 'REPAIR']).optional(),
  remarks: text(500).default(''),
})

export const partyUpdate = z.object({
  baseVersion: z.number().int().min(1),
  name: text(160).min(1).optional(),
  kind: z.enum(['TRADER', 'WORKSHOP']).optional(),
  category: text(80).optional(),
  costBucket: z.enum(['MACHINERY', 'ELECTRIC', 'REPAIR']).optional(),
  remarks: text(500).optional(),
  active: z.boolean().optional(),
})

export const paymentCreate = z.object({
  partyId: z.string().min(1).max(64),
  date,
  month: month.optional(),
  amount: money.refine((v) => v > 0, 'Amount must be more than 0'),
  mode: z.enum(['CASH', 'CHEQUE', 'OTHER']).default('CASH'),
  reference: text(80).default(''),
  remarks: text(500).default(''),
})

export const pettyCreate = z.object({
  date,
  month: month.optional(),
  description: text(300).min(1, 'Description required'),
  kind: z.enum(['OPENING', 'CASH_IN', 'EXPENSE', 'SALARY']),
  amount: money,
})

export const pettyUpdate = z.object({
  baseVersion: z.number().int().min(1),
  date: date.optional(),
  description: text(300).min(1).optional(),
  kind: z.enum(['OPENING', 'CASH_IN', 'EXPENSE', 'SALARY']).optional(),
  amount: money.optional(),
})

const namedAmount = z.object({ name: text(160), amount: z.coerce.number().finite().min(-1e11).max(1e11), role: text(80).optional() })
const optMoney = z.coerce.number().finite().min(0).max(1e11).optional()

export const costInputs = z.object({
  period: text(80).optional(),
  powerAndLight: optMoney,
  vehicleFuel: optMoney,
  generatorFuel: optMoney,
  waterSupplies: optMoney,
  guardSalary: optMoney,
  solarPanelSystem: optMoney,
  depreciationProduction: optMoney,
  adminExpenses: z
    .object({
      salaries: optMoney,
      overtime: optMoney,
      telephoneInternet: optMoney,
      depreciationAdmin: optMoney,
    })
    .optional(),
  storeInventory: z.array(namedAmount).max(200).optional(),
  monthlyProductionMeters: z.coerce.number().finite().min(0).max(1e9).nullable().optional(),
})

export const costSave = z.object({
  month,
  baseVersion: z.number().int().min(0),
  inputs: costInputs,
})

export const lockSet = z.object({ month, locked: z.boolean() })
