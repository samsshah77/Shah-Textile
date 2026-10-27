/**
 * Server half of row-level floor saving (see src/lib/floor/rowSync.ts).
 * Every save runs in one transaction holding a per-list (or per-day) lock, checks the
 * hash each changed row started from, and either applies all rows or none.
 */
import { withRowMetrics } from '@/lib/floor/rowMetrics'
import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  CONFLICT_MESSAGE,
  FLOOR_KEYS,
  canonical,
  checkRowBase,
  rowIdOf,
  sheetRowId,
  type ListChangeSet,
  type RowConflict,
  type RowHashes,
  type RowListKey,
  type RowSyncResult,
  type SheetRowChange,
} from '@/lib/floor/rowSync'
import { beamRowSchema, loomRowSchema, qualityRowSchema } from '@/lib/floor/schemas'
import {
  beamRowToMaster,
  beamWriteData,
  dbGetBeams,
  dbGetLooms,
  dbGetQualities,
  dbGetSheet,
  loomRowToMaster,
  loomWriteData,
  qualityRowToMaster,
  qualityWriteData,
  sheetEntryFromDbRow,
  sheetSegmentFromRow,
} from '@/server/floorDb'
import { FloorGuardError, assertSafeSheetOverwrite, keepStoredApproval, sheetIsApproved, LIST_GUARD } from '@/server/floorGuards'
import { loadQualityRefs, stampQualityIds } from '@/server/qualityStamp'
import { refreshProductionDay, rebuildProductionLedger } from '@/server/productionLedger'
import { assertDateOpen } from '@/server/floor/locks'
import type { BeamMaster, LoomMaster, QualityMaster } from '@/services/productionMastersService'
import { recordBeamChanges, type BeamChange } from '@/server/floor/beamHistory'
import type { DailyLoomProductionEntry } from '@/types/production'

type Tx = Prisma.TransactionClient

export function rowHash(row: unknown): string {
  return createHash('sha1').update(canonical(row)).digest('hex').slice(0, 24)
}

export function hashesOf<T>(rows: T[], idOf: (r: T) => string): RowHashes {
  const out: RowHashes = {}
  for (const r of rows) out[idOf(r)] = rowHash(r)
  return out
}

export class FloorConflictError extends Error {
  readonly status = 409
  constructor(readonly conflicts: RowConflict[]) {
    super(CONFLICT_MESSAGE)
    this.name = 'FloorConflictError'
  }
}

export class FloorApprovalLockedError extends Error {
  readonly status = 403
  constructor() {
    super('This production sheet has been finalized & approved by Javed Sir. Changes are locked.')
    this.name = 'FloorApprovalLockedError'
  }
}

export class FloorBadRequest extends Error {
  readonly status = 400
  constructor(message: string) {
    super(message)
    this.name = 'FloorBadRequest'
  }
}

async function lock(tx: Tx, name: string) {
  await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))::text`, name)
}

function inTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { timeout: 60_000, maxWait: 20_000 })
}

const idOfLoom = (l: LoomMaster) => String(l.loomNumber)
const idOfBeam = (b: BeamMaster) => b.beamNo
const idOfQuality = (q: QualityMaster) => q.id

/** Lists as the GET returns them, with the hash of every row. */
export async function listsWithHashes() {
  const [looms, beams, qualities] = await Promise.all([dbGetLooms(), dbGetBeams(), dbGetQualities()])
  return {
    looms,
    beams,
    qualities,
    hashes: {
      [FLOOR_KEYS.LOOMS]: hashesOf(looms, idOfLoom),
      [FLOOR_KEYS.BEAMS]: hashesOf(beams, idOfBeam),
      [FLOOR_KEYS.QUALITY]: hashesOf(qualities, idOfQuality),
    } as Record<RowListKey, RowHashes>,
  }
}

export function sheetHashes(entries: DailyLoomProductionEntry[] | null | undefined): RowHashes {
  return hashesOf(entries || [], (e) => sheetRowId(e))
}

/** Current rows + hashes for some ids of a list (sent back after targeted actions). */
export async function syncFor(key: RowListKey, ids: string[], deleted: string[] = []): Promise<RowSyncResult & { key: RowListKey }> {
  const want = new Set(ids)
  const all = key === FLOOR_KEYS.LOOMS ? await dbGetLooms() : key === FLOOR_KEYS.BEAMS ? await dbGetBeams() : await dbGetQualities()
  const idOf = (r: Record<string, unknown>) => rowIdOf(key, r)
  const rows = (all as unknown as Record<string, unknown>[]).filter((r) => want.has(idOf(r)))
  return { key, rows, hashes: hashesOf(rows, idOf), deleted }
}

function parseRow<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } } }, row: unknown, label: string): T {
  const r = schema.safeParse(row)
  if (!r.success) {
    const i = r.error?.issues[0]
    throw new FloorBadRequest(`${label}: ${i ? `${i.path.join('.')} ${i.message}` : 'ghalat data'}`)
  }
  return r.data as T
}

function assertFewDeletes(label: string, deletes: number, stored: number) {
  if (deletes > LIST_GUARD.freeRemovals && deletes > stored * LIST_GUARD.maxRemovedRatio) {
    throw new FloorGuardError(
      `Save blocked: ${deletes} of ${stored} ${label} records would be deleted in one save. Nothing was changed. ` +
        'Refresh the page and delete records one at a time if intended.'
    )
  }
}

function listIds(cs: ListChangeSet) {
  const key = cs.key
  const upsertIds = cs.upserts.map((u) => rowIdOf(key, u.row))
  if (upsertIds.some((id) => !id)) throw new FloorBadRequest('Har row ka id / number zaroori hai.')
  if (new Set(upsertIds).size !== upsertIds.length) throw new FloorBadRequest('Ek hi row do dafa bheji gayi.')
  if (key === FLOOR_KEYS.QUALITY && cs.deletes.length) throw new FloorBadRequest('Quality is tarah delete nahi hoti — Delete button use karein.')
  return { upsertIds, ids: [...upsertIds, ...cs.deletes.map((d) => d.id)] }
}

/** Apply a browser's changed rows of the looms / beams / qualities list. */
export async function applyListChanges(cs: ListChangeSet): Promise<RowSyncResult & { key: RowListKey; changed: boolean }> {
  const key = cs.key
  const { upsertIds, ids } = listIds(cs)
  if (ids.length === 0) return { key, rows: [], hashes: {}, deleted: [], changed: false }
  const beamChanges: BeamChange[] = []
  await inTx((tx) => applyListChangesTx(tx, cs, beamChanges))
  await recordBeamChanges(beamChanges)
  if (key === FLOOR_KEYS.QUALITY && cs.upserts.length) await rebuildProductionLedger()
  const deleted = cs.deletes.map((d) => d.id)
  const out = await syncFor(key, upsertIds, deleted)
  return { ...out, changed: true }
}

/** The list part of a save, inside the caller's transaction. */
async function applyListChangesTx(tx: Tx, cs: ListChangeSet, beamChanges?: BeamChange[]): Promise<void> {
  const key = cs.key
  const { ids } = listIds(cs)
  if (ids.length === 0) return
  {
    await lock(tx, `floor:${key}`)
    if (key === FLOOR_KEYS.LOOMS) {
      const nums = ids.map(Number).filter((n) => Number.isInteger(n))
      const stored = new Map((await tx.floorLoom.findMany({ where: { loomNumber: { in: nums } } })).map((r) => [String(r.loomNumber), loomRowToMaster(r)]))
      check(cs, stored)
      const total = await tx.floorLoom.count()
      assertFewDeletes('loom', cs.deletes.filter((d) => stored.has(d.id)).length, total)
      const clearing = cs.upserts.filter((u) => stored.get(rowIdOf(key, u.row))?.qualityId && !u.row.qualityId).length
      if (clearing >= 10) throw new FloorGuardError(`Save blocked: ${clearing} looms would lose their quality in one save. Nothing was changed.`)
      for (const u of cs.upserts) {
        const l = parseRow<LoomMaster>(loomRowSchema, u.row, `Loom ${rowIdOf(key, u.row)}`)
        const data = loomWriteData(l)
        await tx.floorLoom.upsert({ where: { loomNumber: l.loomNumber }, create: { loomNumber: l.loomNumber, ...data }, update: data })
      }
      if (cs.deletes.length) await tx.floorLoom.deleteMany({ where: { loomNumber: { in: cs.deletes.map((d) => Number(d.id)) } } })
    } else if (key === FLOOR_KEYS.BEAMS) {
      const raw = await tx.floorBeam.findMany({ where: { beamNo: { in: ids } } })
      const stored = new Map(raw.map((r) => [r.beamNo, beamRowToMaster(r)]))
      const prevRaw = new Map(raw.map((r) => [r.beamNo, r]))
      check(cs, stored)
      const total = await tx.floorBeam.count()
      assertFewDeletes('beam', cs.deletes.filter((d) => stored.has(d.id)).length, total)
      for (const u of cs.upserts) {
        const b = parseRow<BeamMaster>(beamRowSchema, u.row, `Beam ${rowIdOf(key, u.row)}`)
        const beamNo = String(b.beamNo).trim()
        const data = beamWriteData({ ...b, beamNo }, prevRaw.get(beamNo))
        const saved = await tx.floorBeam.upsert({ where: { beamNo }, create: { beamNo, ...data }, update: data })
        beamChanges?.push({ before: stored.get(beamNo) ?? null, after: beamRowToMaster(saved) })
      }
      if (cs.deletes.length) {
        await tx.floorBeam.deleteMany({ where: { beamNo: { in: cs.deletes.map((d) => d.id) } } })
        for (const d of cs.deletes) if (stored.has(d.id)) beamChanges?.push({ before: stored.get(d.id)!, after: null })
      }
    } else {
      const stored = new Map((await tx.floorQuality.findMany({ where: { id: { in: ids } } })).map((r) => [r.id, qualityRowToMaster(r)]))
      check(cs, stored)
      for (const u of cs.upserts) {
        const q = parseRow<QualityMaster>(qualityRowSchema, u.row, `Quality ${rowIdOf(key, u.row)}`)
        const data = qualityWriteData(q)
        await tx.floorQuality.upsert({ where: { id: q.id }, create: { id: q.id, ...data }, update: data })
      }
    }
  }
}

function check(cs: ListChangeSet, stored: Map<string, unknown>) {
  const conflicts: RowConflict[] = []
  for (const u of cs.upserts) {
    const id = rowIdOf(cs.key, u.row)
    const s = stored.get(id)
    const c = checkRowBase(id, u.base, s === undefined ? null : rowHash(s), 'upsert')
    if (c) conflicts.push(c)
  }
  for (const d of cs.deletes) {
    const s = stored.get(d.id)
    const c = checkRowBase(d.id, d.base, s === undefined ? null : rowHash(s), 'delete')
    if (c) conflicts.push(c)
  }
  if (conflicts.length) throw new FloorConflictError(conflicts)
}

const namedQuality = (n: unknown) => {
  const s = String(n ?? '').trim()
  return Boolean(s) && s !== '—' && s !== '-'
}

export type SheetActor = { name: string; isAdmin: boolean }

/**
 * Apply changed rows of one day. Hand edits keep the old "do not lose the quality name
 * unless cleared on purpose" rule; rows coming from a rebuild of the day go through the
 * bulk-wipe guard as whole-sheet saves always did.
 */
type SheetCtx = { refs: Awaited<ReturnType<typeof loadQualityRefs>>; ended: Map<string, string> }

async function sheetContext(db: Pick<typeof prisma, 'floorQuality'>): Promise<SheetCtx> {
  const refs = await loadQualityRefs(db)
  const endedRows = await db.floorQuality.findMany({ where: { status: 'ENDED' }, select: { name: true, endedOn: true } })
  const ended = new Map<string, string>()
  for (const q of endedRows) {
    const k = q.name.toLowerCase().replace(/[^a-z0-9]/g, '')
    const on = String(q.endedOn || '').slice(0, 10)
    if (k && on && (!ended.has(k) || on > (ended.get(k) as string))) ended.set(k, on)
  }
  return { refs, ended }
}

export async function applySheetRows(
  date: string,
  changes: SheetRowChange[],
  actor: SheetActor
): Promise<RowSyncResult<DailyLoomProductionEntry> & { before: DailyLoomProductionEntry[]; after: DailyLoomProductionEntry[] }> {
  await assertDateOpen(date)
  const ctx = await sheetContext(prisma)
  const { ids, before } = await inTx((tx) => applySheetRowsTx(tx, date, changes, actor, ctx))
  await refreshProductionDay(date)
  const want = new Set(ids)
  const after = ((await dbGetSheet(date)) || []).filter((e) => want.has(sheetRowId(e)))
  return { rows: after, hashes: sheetHashes(after), deleted: [], before, after }
}

/** One day's part of a save, inside the caller's transaction. */
async function applySheetRowsTx(
  tx: Tx,
  date: string,
  changes: SheetRowChange[],
  actor: SheetActor,
  { refs, ended }: SheetCtx
): Promise<{ ids: string[]; before: DailyLoomProductionEntry[] }> {
  const ids: string[] = []
  await lock(tx, `floor:sheet:${date}`)
  const storedRows = (await tx.floorDailySheet.findMany({ where: { date } })).map((r) => sheetEntryFromDbRow(r))
  if (sheetIsApproved(storedRows) && !actor.isAdmin) throw new FloorApprovalLockedError()
  const stored = new Map(storedRows.map((e) => [sheetRowId(e), e]))

  const conflicts: RowConflict[] = []
  const finals: DailyLoomProductionEntry[] = []
  const rebuilt: DailyLoomProductionEntry[] = []
  for (const ch of changes) {
    const raw = ch.entry as unknown as DailyLoomProductionEntry & { _clearQuality?: boolean }
    const segmentIndex = sheetSegmentFromRow({ segmentIndex: raw.segmentIndex, payload: raw })
    const id = sheetRowId({ loomNumber: raw.loomNumber, segmentIndex })
    if (ids.includes(id)) throw new FloorBadRequest(`Loom ${id} do dafa bheja gaya.`)
    ids.push(id)
    const prev = stored.get(id)
    const c = checkRowBase(id, ch.base, prev ? rowHash(prev) : null, 'upsert')
    if (c) {
      conflicts.push(c)
      continue
    }
    let e: DailyLoomProductionEntry = { ...raw, date, loomNumber: raw.loomNumber, segmentIndex }
    delete (e as { _clearQuality?: boolean })._clearQuality
    if (ch.explicit && !ch.clearQuality && prev && namedQuality(prev.qualityName) && !namedQuality(e.qualityName)) {
      e = {
        ...e,
        qualityName: prev.qualityName,
        fabricType: e.fabricType || prev.fabricType,
        warpYarn: e.warpYarn || prev.warpYarn,
        weftYarn: e.weftYarn || prev.weftYarn,
        reed: e.reed || prev.reed,
        pick: e.pick || prev.pick,
        widthInch: e.widthInch || prev.widthInch,
        gsm: e.gsm ?? prev.gsm,
      }
    }
    if (ch.explicit) {
      if (!actor.isAdmin) e = keepStoredApproval(e, prev)
      e.lastEditedBy = actor.name || e.lastEditedBy || 'Floor Operator'
      e.lastEditedAt = e.lastEditedAt || new Date().toISOString()
    } else {
      // A rebuild of the day does not decide approval or who edited last.
      e = keepStoredApproval(e, prev)
      const p = (prev || {}) as Partial<DailyLoomProductionEntry>
      if (p.lastEditedBy !== undefined) e.lastEditedBy = p.lastEditedBy
      else delete e.lastEditedBy
      if (p.lastEditedAt !== undefined) e.lastEditedAt = p.lastEditedAt
      else delete e.lastEditedAt
    }
    // A hand edit: theoretical meters, total, efficiency and loss are worked out here
    // (same sum as the screen), never taken from the browser. Rows of a rebuilt day keep
    // the figures the day was built with (e.g. 0 for a loom whose quality ended).
    if (ch.explicit) e = withRowMetrics(e)
    finals.push(e)
    if (!ch.explicit) rebuilt.push(ch.clearQuality ? ({ ...e, _clearQuality: true } as DailyLoomProductionEntry) : e)
  }
  if (conflicts.length) throw new FloorConflictError(conflicts)
  if (rebuilt.length && storedRows.length) assertSafeSheetOverwrite(date, storedRows, rebuilt, ended)

  const stamped = stampQualityIds(date, finals, refs)
  for (const e of stamped) {
    const segmentIndex = sheetSegmentFromRow({ segmentIndex: e.segmentIndex, payload: e })
    await tx.floorDailySheet.upsert({
      where: { date_loomNumber_segmentIndex: { date, loomNumber: e.loomNumber, segmentIndex } },
      update: { payload: e as unknown as Prisma.InputJsonValue, segmentIndex },
      create: { date, loomNumber: e.loomNumber, segmentIndex, payload: e as unknown as Prisma.InputJsonValue },
    })
  }
  return { ids, before: ids.map((id) => stored.get(id)).filter(Boolean) as DailyLoomProductionEntry[] }
}

export type BatchResult = {
  lists: Array<RowSyncResult & { key: RowListKey }>
  days: Array<{ date: string; rows: DailyLoomProductionEntry[]; hashes: RowHashes; before: DailyLoomProductionEntry[] }>
}

/**
 * Several lists and days saved as ONE change: e.g. putting a quality on a loom writes the
 * loom master, the quality list and the loom's row on every day from the start date to
 * today. Either all of it is saved or none of it (a conflict or a lock anywhere refuses
 * the whole change), so a half-written quality pose can never be left behind.
 */
export async function applyBatch(
  input: { lists: ListChangeSet[]; days: Array<{ date: string; rows: SheetRowChange[] }> },
  actor: SheetActor
): Promise<BatchResult> {
  const order = [FLOOR_KEYS.LOOMS, FLOOR_KEYS.BEAMS, FLOOR_KEYS.QUALITY] as string[]
  const lists = [...input.lists].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
  if (new Set(lists.map((l) => l.key)).size !== lists.length) throw new FloorBadRequest('Ek list do dafa bheji gayi.')
  const days = [...input.days].sort((a, b) => a.date.localeCompare(b.date))
  if (new Set(days.map((d) => d.date)).size !== days.length) throw new FloorBadRequest('Ek din do dafa bheja gaya.')
  for (const d of days) await assertDateOpen(d.date)
  for (const l of lists) listIds(l)

  const dayIds = new Map<string, { ids: string[]; before: DailyLoomProductionEntry[] }>()
  const beamChanges: BeamChange[] = []
  await inTx(async (tx) => {
    for (const l of lists) await applyListChangesTx(tx, l, beamChanges)
    // Quality ids / ended runs as they are after the list changes of this same batch.
    const ctx = await sheetContext(tx)
    for (const d of days) dayIds.set(d.date, await applySheetRowsTx(tx, d.date, d.rows, actor, ctx))
  })

  await recordBeamChanges(beamChanges)
  if (lists.some((l) => l.key === FLOOR_KEYS.QUALITY && l.upserts.length)) await rebuildProductionLedger()
  else for (const d of days) await refreshProductionDay(d.date)

  const outLists = []
  for (const l of lists) {
    const { upsertIds } = listIds(l)
    outLists.push(await syncFor(l.key, upsertIds, l.deletes.map((x) => x.id)))
  }
  const outDays = []
  for (const d of days) {
    const info = dayIds.get(d.date)!
    const want = new Set(info.ids)
    const rows = ((await dbGetSheet(d.date)) || []).filter((e) => want.has(sheetRowId(e)))
    outDays.push({ date: d.date, rows, hashes: sheetHashes(rows), before: info.before })
  }
  return { lists: outLists, days: outDays }
}
