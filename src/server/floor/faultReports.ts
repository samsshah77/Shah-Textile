/**
 * "Kamran Fault": fault reports from the floor — a loom, photos / video, and a note
 * (typed or spoken). Kept in its own table; it never touches production numbers.
 * Created at runtime (CREATE … IF NOT EXISTS) like the other floor tables.
 */
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'

export type FaultMedia = { url: string; kind: 'image' | 'video' }

export interface FaultReport {
  id: string
  date: string
  loomNumber: number
  shift: 'A' | 'B'
  text: string
  media: FaultMedia[]
  createdBy: string
  createdById: string
  createdAt: string
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS "floor_fault_reports" (
    "id" TEXT PRIMARY KEY,
    "date" DATE NOT NULL,
    "loomNumber" INTEGER NOT NULL,
    "shift" TEXT DEFAULT 'A',
    "text" TEXT NOT NULL DEFAULT '',
    "media" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3)
  )`,
  `ALTER TABLE "floor_fault_reports" ADD COLUMN IF NOT EXISTS "shift" TEXT DEFAULT 'A'`,
  `CREATE INDEX IF NOT EXISTS "floor_fault_reports_date_idx" ON "floor_fault_reports"("date", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "floor_fault_reports_loom_idx" ON "floor_fault_reports"("loomNumber", "date")`,
]

let ready: Promise<void> | null = null
export function ensureFaultReportTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const sql of DDL) await prisma.$executeRawUnsafe(sql)
    })().catch((e) => {
      ready = null
      throw e
    })
  }
  return ready
}

type Row = {
  id: string
  date: Date | string
  loomNumber: number
  shift?: string | null
  text: string
  media: unknown
  createdBy: string
  createdById: string
  createdAt: Date | string
}

const ymd = (d: Date | string) => {
  if (typeof d === 'string') return d.slice(0, 10)
  // DATE columns come back as UTC midnight.
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function toReport(r: Row): FaultReport {
  const media = Array.isArray(r.media) ? (r.media as FaultMedia[]) : []
  return {
    id: r.id,
    date: ymd(r.date),
    loomNumber: Number(r.loomNumber),
    shift: r.shift === 'B' ? 'B' : 'A',
    text: r.text || '',
    media: media.filter((m) => m && typeof m.url === 'string' && (m.kind === 'image' || m.kind === 'video')),
    createdBy: r.createdBy || '',
    createdById: r.createdById || '',
    createdAt: new Date(r.createdAt).toISOString(),
  }
}

/** Reports of one day, or of a loom over a period — newest first. */
export async function listFaultReports(opts: { from: string; to: string; loom?: number }): Promise<FaultReport[]> {
  await ensureFaultReportTable()
  const rows = opts.loom
    ? await prisma.$queryRawUnsafe<Row[]>(
        `SELECT * FROM "floor_fault_reports" WHERE "deletedAt" IS NULL AND "date" BETWEEN $1::date AND $2::date AND "loomNumber" = $3 ORDER BY "date" DESC, "createdAt" DESC LIMIT 500`,
        opts.from,
        opts.to,
        opts.loom
      )
    : await prisma.$queryRawUnsafe<Row[]>(
        `SELECT * FROM "floor_fault_reports" WHERE "deletedAt" IS NULL AND "date" BETWEEN $1::date AND $2::date ORDER BY "date" DESC, "createdAt" DESC LIMIT 500`,
        opts.from,
        opts.to
      )
  return rows.map(toReport)
}

export async function createFaultReport(input: {
  date: string
  loomNumber: number
  shift?: 'A' | 'B'
  text: string
  media: FaultMedia[]
  createdBy: string
  createdById: string
}): Promise<FaultReport> {
  await ensureFaultReportTable()
  const shift = input.shift === 'B' ? 'B' : 'A'
  const id = `fr_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `INSERT INTO "floor_fault_reports" ("id","date","loomNumber","shift","text","media","createdBy","createdById","createdAt")
     VALUES ($1, $2::date, $3, $4, $5, $6::jsonb, $7, $8, (now() AT TIME ZONE 'UTC')) RETURNING *`,
    id,
    input.date,
    input.loomNumber,
    shift,
    input.text,
    JSON.stringify(input.media),
    input.createdBy,
    input.createdById
  )

  // Not copied into the production sheet: the Fabric Fault tab shows these reports beside
  // the sheet's own faults, so a floor report never changes production rows (locks, hashes,
  // approvals and the ledger stay exactly as Daily Entry left them).

  return toReport(rows[0])
}

export async function getFaultReport(id: string): Promise<FaultReport | null> {
  await ensureFaultReportTable()
  const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM "floor_fault_reports" WHERE "id" = $1 AND "deletedAt" IS NULL`, id)
  return rows[0] ? toReport(rows[0]) : null
}

/** Soft delete — the row (and its pictures) stay for the audit. */
export async function deleteFaultReport(id: string): Promise<void> {
  await ensureFaultReportTable()
  await prisma.$executeRawUnsafe(`UPDATE "floor_fault_reports" SET "deletedAt" = (now() AT TIME ZONE 'UTC') WHERE "id" = $1`, id)
}

/** Loom numbers for the dropdown (active looms first). */
export async function loomChoices(): Promise<Array<{ loomNumber: number; name: string }>> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ loomNumber: number; name: string; isActive: boolean }>>(
      `SELECT "loomNumber", "name", "isActive" FROM "floor_looms" ORDER BY "isActive" DESC, "loomNumber" ASC`
    )
    // A name that is only "Loom 12" adds nothing next to the number.
  return rows.map((r) => ({ loomNumber: Number(r.loomNumber), name: /^\s*loom\s*#?\s*\d+\s*$/i.test(r.name || '') ? '' : r.name || '' }))
  } catch {
    return []
  }
}

/** Only our own upload paths are accepted as media (never an outside link). */
export function cleanMedia(list: unknown): FaultMedia[] {
  if (!Array.isArray(list)) return []
  return list
    .filter(
      (m): m is FaultMedia =>
        Boolean(m) &&
        typeof (m as FaultMedia).url === 'string' &&
        /^\/uploads\/faults\/fault-\d{8}-[a-f0-9]+\.(jpg|png|webp|mp4|mov|webm)$/.test((m as FaultMedia).url) &&
        ((m as FaultMedia).kind === 'image' || (m as FaultMedia).kind === 'video')
    )
    .slice(0, 12)
}
