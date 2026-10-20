/**
 * What the production floor API accepts. Every write is checked here before it reaches
 * the database; a bad payload gets a clear 400 instead of being stored.
 * Objects are "loose": fields not listed are kept (the day sheet row has many optional
 * display fields), but the listed ones must have the right type and range.
 */
import { z } from 'zod'

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tareekh YYYY-MM-DD honi chahiye')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
  }, 'Ghalat tareekh')
export const monthStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mahina YYYY-MM hona chahiye')

const num = (min: number, max: number) => z.number().finite().min(min).max(max)
const optNum = (min: number, max: number) => num(min, max).optional().nullable()
const optStr = (max: number) => z.string().max(max).optional().nullable()

export const loomRowSchema = z.looseObject({
  loomNumber: z.number().int().min(1).max(999),
  name: z.string().max(200),
  model: z.string().max(80),
  category: z.string().max(80).optional(),
  year: z.number().int().min(1900).max(2200).optional().nullable(),
  pictureDataUrl: z.string().optional().nullable(),
  pictureDataUrls: z.array(z.string()).max(20).optional(),
  defaultRpm: num(0, 3000).optional(),
  shed: optStr(120),
  isActive: z.boolean().optional(),
  status: z.string().max(40).optional(),
  statusSince: optStr(40),
  qualityId: optStr(120),
  weftYarnId: optStr(120),
  isTwinBeam: z.boolean().optional().nullable(),
})

export const beamRowSchema = z.looseObject({
  beamNo: z.string().trim().min(1).max(60),
  warp: optStr(200),
  reed: optNum(0, 1000),
  width: optNum(0, 1000),
  totalThreads: optNum(0, 10_000_000),
  length: optNum(0, 1_000_000),
  loomType: optStr(60),
  fillStatus: z.enum(['FULL', 'EMPTY']).optional().nullable(),
  usedInLoom: z.union([z.string().max(20), z.number()]).optional().nullable(),
  location: optStr(60),
  mountedOn: optStr(40),
  beamEndedOn: optStr(40),
  endedFromLoom: z.union([z.string().max(20), z.number()]).optional().nullable(),
  qualityId: optStr(120),
  swLot: optStr(120),
  beamRepeat: optStr(120),
})

export const qualityRowSchema = z.looseObject({
  id: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(200),
  fabricType: optStr(120),
  weavePlan: optStr(500),
  weftPlan: optStr(500),
  warpYarn: optStr(300),
  weftYarn: optStr(300),
  reed: optNum(0, 1000),
  pick: optNum(0, 1000),
  widthInch: optNum(0, 1000),
  gsm: optNum(0, 100_000),
  status: z.enum(['ACTIVE', 'HOLD', 'ENDED']).optional().nullable(),
  createdOn: optStr(40),
  endedOn: optStr(40),
})

/** One loom-part row of a day sheet. */
export const sheetEntrySchema = z.looseObject({
  loomNumber: z.number().int().min(1).max(999),
  segmentIndex: z.number().int().min(1).max(20).optional(),
  date: optStr(10),
  qualityName: optStr(200),
  rpm: optNum(0, 3000),
  pick: optNum(0, 1000),
  reed: optNum(0, 1000),
  widthInch: optNum(0, 1000),
  rollerHours: optNum(0, 10_000),
  runningHours: optNum(0, 10_000),
  shiftAMeters: optNum(0, 100_000),
  shiftBMeters: optNum(0, 100_000),
  totalMeters: optNum(0, 200_000),
  remarks: optStr(2000),
})

const hash = z.string().max(80).nullable()

export const listChangesSchema = z.object({
  key: z.enum(['sara_textile_loom_master_v8', 'sara_textile_beam_master_v9', 'sara_textile_quality_master_v8']),
  upserts: z.array(z.object({ row: z.record(z.string(), z.unknown()), base: hash })).max(3000),
  deletes: z.array(z.object({ id: z.string().min(1).max(120), base: hash })).max(3000),
})

export const sheetChangesSchema = z.object({
  date: isoDate,
  rows: z
    .array(
      z.object({
        entry: sheetEntrySchema,
        base: hash,
        clearQuality: z.boolean().optional(),
        /** A row the user edited by hand (not a rebuild of the day). */
        explicit: z.boolean().optional(),
      })
    )
    .min(1)
    .max(500),
})

export const yarnInwardSchema = z.object({
  yarnId: z.string().max(120).optional().nullable(),
  yarnType: z.string().trim().min(1).max(120),
  bags: z.number().int().min(0).max(100_000),
  weightKg: num(0.01, 1_000_000),
  date: isoDate,
  lotOrSupplier: optStr(200),
})

export const yarnIssueSchema = z.object({
  yarnId: z.string().min(1).max(120),
  loomNumber: z.number().int().min(1).max(999),
  issuedKg: num(0.01, 1_000_000),
  pick: z.number().int().min(0).max(1000),
  date: isoDate,
})

export const yarnCorrectSchema = z
  .object({
    yarnId: z.string().min(1).max(120),
    receivedKg: num(0, 10_000_000).optional(),
    issuedKg: num(0, 10_000_000).optional(),
    bags: z.number().int().min(0).max(1_000_000).optional(),
    date: isoDate,
  })
  .refine((v) => v.receivedKg !== undefined || v.issuedKg !== undefined || v.bags !== undefined, 'Kuch to badlein')

export const yarnAddSchema = z.object({
  yarnType: z.string().trim().min(1).max(120),
  bags: z.number().int().min(0).max(100_000).optional(),
  receivedKg: num(0, 1_000_000).optional(),
  date: isoDate,
})

export const yarnRenameSchema = z.object({
  yarnId: z.string().min(1).max(120),
  yarnType: z.string().trim().min(1).max(120),
})

export const yarnDeleteSchema = z.object({ yarnId: z.string().min(1).max(120) })

export const monthLockSchema = z.object({ month: monthStr, locked: z.boolean() })

/** First problem of a failed parse, in plain words. */
export function zodMessage(err: z.ZodError): string {
  const i = err.issues[0]
  if (!i) return 'Ghalat data.'
  const where = i.path.length ? `${i.path.join('.')}: ` : ''
  return `${where}${i.message}`
}
