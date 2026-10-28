/**
 * Quality Archive — the yearly "All Summer Quality" workbooks (2020 onwards) kept as a
 * permanent record. Admin-only, read-only.
 *
 *  - The original .xlsx is stored as it was uploaded (bytes + SHA-256), so it can be
 *    downloaded unchanged and is part of every database backup.
 *  - Every sheet is stored cell by cell, exactly as Excel shows it (no tidying).
 *  - The quality lines found in the sheets are stored for search / filters, each pointing
 *    to its cell.
 *
 * Nothing can be changed: the app has no edit or delete for these tables, and the database
 * itself refuses UPDATE / DELETE / TRUNCATE on them (trigger), whoever asks. The same file
 * uploaded twice is recognised by its SHA-256 and not stored again.
 */
import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { readXlsx, type XlsxSheet } from '@/lib/archive/xlsx'
import { qualityRows, type QualityRow } from '@/lib/archive/qualityRows'

const TABLES = ['quality_archive_files', 'quality_archive_sheets', 'quality_archive_rows'] as const

const DDL = [
  `CREATE TABLE IF NOT EXISTS "quality_archive_files" (
    "id" TEXT PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL UNIQUE,
    "size" INTEGER NOT NULL,
    "year" INTEGER,
    "title" TEXT NOT NULL DEFAULT '',
    "content" BYTEA NOT NULL,
    "uploadedBy" TEXT NOT NULL DEFAULT '',
    "uploadedById" TEXT NOT NULL DEFAULT '',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')
  )`,
  `CREATE TABLE IF NOT EXISTS "quality_archive_sheets" (
    "fileId" TEXT NOT NULL REFERENCES "quality_archive_files"("id"),
    "idx" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    PRIMARY KEY ("fileId", "idx")
  )`,
  `CREATE TABLE IF NOT EXISTS "quality_archive_rows" (
    "id" BIGSERIAL PRIMARY KEY,
    "fileId" TEXT NOT NULL REFERENCES "quality_archive_files"("id"),
    "sheetIdx" INTEGER NOT NULL,
    "sheetName" TEXT NOT NULL,
    "year" INTEGER,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "warp" TEXT NOT NULL,
    "weft" TEXT NOT NULL,
    "reed" DOUBLE PRECISION NOT NULL,
    "pick" DOUBLE PRECISION NOT NULL,
    "production" DOUBLE PRECISION NOT NULL,
    "grp" TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS "quality_archive_rows_year_idx" ON "quality_archive_rows"("year", "sheetName")`,
  // The lock: these tables only ever grow.
  `CREATE OR REPLACE FUNCTION "quality_archive_read_only"() RETURNS trigger AS $$
   BEGIN
     RAISE EXCEPTION 'Quality Archive record hai — is mein badal ya delete nahi ho sakta (%).', TG_TABLE_NAME;
   END $$ LANGUAGE plpgsql`,
  ...TABLES.flatMap((t) => [
    `DROP TRIGGER IF EXISTS "${t}_no_change" ON "${t}"`,
    `CREATE TRIGGER "${t}_no_change" BEFORE UPDATE OR DELETE ON "${t}" FOR EACH ROW EXECUTE FUNCTION "quality_archive_read_only"()`,
    `DROP TRIGGER IF EXISTS "${t}_no_truncate" ON "${t}"`,
    `CREATE TRIGGER "${t}_no_truncate" BEFORE TRUNCATE ON "${t}" FOR EACH STATEMENT EXECUTE FUNCTION "quality_archive_read_only"()`,
  ]),
]

let ready: Promise<void> | null = null
export function ensureQualityArchive(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      // One setup at a time even with several app processes.
      await prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('quality_archive_setup'))::text`)
        for (const sql of DDL) await tx.$executeRawUnsafe(sql)
      })
    })().catch((e) => {
      ready = null
      throw e
    })
  }
  return ready
}

export interface ArchivePreview {
  fileName: string
  sha256: string
  size: number
  year: number | null
  title: string
  sheets: Array<{ name: string; cells: number; rows: number; production: number }>
  duplicateOf: { id: string; fileName: string; uploadedAt: string } | null
}

export interface ArchiveFile {
  id: string
  fileName: string
  sha256: string
  size: number
  year: number | null
  title: string
  uploadedBy: string
  uploadedAt: string
  sheets: Array<{ idx: number; name: string }>
  rows: number
}

export type ArchiveRow = QualityRow & { fileId: string; sheetIdx: number; sheetName: string; year: number | null }

/** Excel files are zip archives; anything else is refused before parsing. */
export function looksLikeXlsx(buf: Uint8Array): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
}

const yearOf = (fileName: string): number | null => {
  const m = fileName.match(/(?:19|20)\d{2}/)
  return m ? Number(m[0]) : null
}

/** The period line near the top of the first sheet, e.g. "Quality 01 Nov 2020 To 2 Mar 2021 (Complete Lot)". */
const titleOf = (sheets: XlsxSheet[]): string => {
  const top = sheets[0]?.cells.filter((c) => c.r <= 3 && typeof c.v === 'string') ?? []
  const line = top.find((c) => /\bto\b/i.test(String(c.v))) ?? top.find((c) => c.r === 2)
  return line ? String(line.v).replace(/\s+/g, ' ').trim() : ''
}

function parse(buf: Uint8Array) {
  const sheets = readXlsx(buf)
  if (!sheets.length) throw new Error('Is file mein koi sheet nahi mili.')
  return sheets.map((s) => ({ sheet: s, rows: qualityRows(s) }))
}

export async function previewArchiveFile(buf: Uint8Array, fileName: string): Promise<ArchivePreview> {
  await ensureQualityArchive()
  const sha256 = createHash('sha256').update(buf).digest('hex')
  const parsed = parse(buf)
  const dup = await prisma.$queryRawUnsafe<Array<{ id: string; fileName: string; uploadedAt: Date }>>(
    `SELECT "id", "fileName", "uploadedAt" FROM "quality_archive_files" WHERE "sha256" = $1`,
    sha256
  )
  return {
    fileName,
    sha256,
    size: buf.length,
    year: yearOf(fileName),
    title: titleOf(parsed.map((p) => p.sheet)),
    sheets: parsed.map((p) => ({
      name: p.sheet.name,
      cells: p.sheet.cells.length,
      rows: p.rows.length,
      production: p.rows.reduce((t, r) => t + r.production, 0),
    })),
    duplicateOf: dup[0] ? { id: dup[0].id, fileName: dup[0].fileName, uploadedAt: new Date(dup[0].uploadedAt).toISOString() } : null,
  }
}

/** True once the archive has its files — after that nothing can be added (one-time import). */
export async function archiveSealed(): Promise<boolean> {
  await ensureQualityArchive()
  const r = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "quality_archive_files"`)
  return Number(r[0]?.n) > 0
}

/**
 * The one-time import: all workbooks in one transaction (all or nothing). Refused once the
 * archive already holds files, so the record is closed after the first import.
 */
export async function saveArchiveBatch(
  files: Array<{ buf: Uint8Array; fileName: string }>,
  actor: { id: string; name: string }
): Promise<Array<{ id: string; fileName: string; sha256: string }>> {
  await ensureQualityArchive()
  const prepared = files.map((f) => ({
    ...f,
    sha256: createHash('sha256').update(f.buf).digest('hex'),
    parsed: parse(f.buf),
    year: yearOf(f.fileName),
    id: `qa_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`,
  }))
  if (new Set(prepared.map((p) => p.sha256)).size !== prepared.length) throw new Error('Ek hi file do dafa chuni gayi hai.')
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('quality_archive_write'))::text`)
      const [{ n }] = await tx.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "quality_archive_files"`)
      if (Number(n) > 0) throw new Error('Archive pehle se save ho chuka hai — is mein ab kuch add nahi ho sakta.')
      for (const f of prepared) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "quality_archive_files" ("id","fileName","sha256","size","year","title","content","uploadedBy","uploadedById")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          f.id,
          f.fileName,
          f.sha256,
          f.buf.length,
          f.year,
          titleOf(f.parsed.map((p) => p.sheet)),
          Buffer.from(f.buf),
          actor.name,
          actor.id
        )
        for (const [idx, p] of f.parsed.entries()) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "quality_archive_sheets" ("fileId","idx","name","data") VALUES ($1,$2,$3,$4::jsonb)`,
            f.id,
            idx,
            p.sheet.name,
            JSON.stringify(p.sheet)
          )
          if (p.rows.length) {
            // One statement per sheet — values passed as JSON, never spliced into SQL.
            await tx.$executeRawUnsafe(
              `INSERT INTO "quality_archive_rows" ("fileId","sheetIdx","sheetName","year","row","col","name","warp","weft","reed","pick","production","grp")
               SELECT $1, $2, $3, $4, (r->>'row')::int, (r->>'col')::int, r->>'name', r->>'warp', r->>'weft',
                      (r->>'reed')::float8, (r->>'pick')::float8, (r->>'production')::float8, r->>'group'
               FROM jsonb_array_elements($5::jsonb) AS r`,
              f.id,
              idx,
              p.sheet.name,
              f.year,
              JSON.stringify(p.rows)
            )
          }
        }
      }
      return prepared.map((f) => ({ id: f.id, fileName: f.fileName, sha256: f.sha256 }))
    },
    { timeout: 120_000 }
  )
}

export async function listArchive(): Promise<{ files: ArchiveFile[]; rows: ArchiveRow[] }> {
  await ensureQualityArchive()
  const files = await prisma.$queryRawUnsafe<
    Array<{ id: string; fileName: string; sha256: string; size: number; year: number | null; title: string; uploadedBy: string; uploadedAt: Date }>
  >(
    `SELECT "id","fileName","sha256","size","year","title","uploadedBy","uploadedAt" FROM "quality_archive_files" ORDER BY "year" NULLS LAST, "fileName"`
  )
  const sheets = await prisma.$queryRawUnsafe<Array<{ fileId: string; idx: number; name: string }>>(
    `SELECT "fileId","idx","name" FROM "quality_archive_sheets" ORDER BY "fileId","idx"`
  )
  const rows = await prisma.$queryRawUnsafe<
    Array<{ fileId: string; sheetIdx: number; sheetName: string; year: number | null; row: number; col: number; name: string; warp: string; weft: string; reed: number; pick: number; production: number; grp: string }>
  >(
    `SELECT "fileId","sheetIdx","sheetName","year","row","col","name","warp","weft","reed","pick","production","grp"
     FROM "quality_archive_rows" ORDER BY "year" NULLS LAST, "sheetIdx", "col", "row"`
  )
  return {
    files: files.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      sha256: f.sha256,
      size: Number(f.size),
      year: f.year == null ? null : Number(f.year),
      title: f.title,
      uploadedBy: f.uploadedBy,
      uploadedAt: new Date(f.uploadedAt).toISOString(),
      sheets: sheets.filter((s) => s.fileId === f.id).map((s) => ({ idx: Number(s.idx), name: s.name })),
      rows: rows.filter((r) => r.fileId === f.id).length,
    })),
    rows: rows.map((r) => ({
      fileId: r.fileId,
      sheetIdx: Number(r.sheetIdx),
      sheetName: r.sheetName,
      year: r.year == null ? null : Number(r.year),
      row: Number(r.row),
      col: Number(r.col),
      name: r.name,
      warp: r.warp,
      weft: r.weft,
      reed: Number(r.reed),
      pick: Number(r.pick),
      production: Number(r.production),
      group: r.grp,
    })),
  }
}

export async function getArchiveSheet(fileId: string, idx: number): Promise<XlsxSheet | null> {
  await ensureQualityArchive()
  const r = await prisma.$queryRawUnsafe<Array<{ data: XlsxSheet }>>(
    `SELECT "data" FROM "quality_archive_sheets" WHERE "fileId" = $1 AND "idx" = $2`,
    fileId,
    idx
  )
  return r[0]?.data ?? null
}

export async function getArchiveOriginal(fileId: string): Promise<{ fileName: string; content: Buffer } | null> {
  await ensureQualityArchive()
  const r = await prisma.$queryRawUnsafe<Array<{ fileName: string; content: Buffer }>>(
    `SELECT "fileName","content" FROM "quality_archive_files" WHERE "id" = $1`,
    fileId
  )
  return r[0] ? { fileName: r[0].fileName, content: Buffer.from(r[0].content) } : null
}
