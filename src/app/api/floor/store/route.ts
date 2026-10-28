import { NextRequest, NextResponse } from 'next/server'
import { startDayOnServer } from '@/server/floor/dayBuild'
import { ensureBeamHistoryTable, recordBeamChanges } from '@/server/floor/beamHistory'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { currentUser } from '@/server/current-user'
import {
  dbDeleteSheet,
  dbFloorIsEmpty,
  dbGetBeams,
  dbGetQualities,
  dbGetSheet,
  dbListAllSheets,
  dbGetYarn,
  dbGetYarnIssuances,
  dbGetYarnMovements,
  dbSaveBeams,
  dbUpsertBeam,
  dbDeleteBeam,
  dbPatchBeam,
  dbSaveLooms,
  dbSaveQualities,
  dbPatchQualityStatus,
  dbUpsertQuality,
  dbReuseQuality,
  dbDeleteQuality,
  dbSaveYarn,
  dbSaveYarnIssuances,
  dbSaveYarnMovements,
  dbUpdateLoomEntry,
  dbDeleteLoomSegment,
  dbSetSheetApproval,
} from '@/server/floorDb'
import { buildFloorSeedPayload } from '@/server/floorSeed'
import { accessFor } from '@/server/userAccess'
import { PRODUCTION_AREAS, allowsAny } from '@/lib/access'
import { writeAudit } from '@/server/auditLog'
import { rebuildProductionLedger } from '@/server/productionLedger'
import { FloorGuardError, rowMeters, keepStoredApproval, sheetIsApproved } from '@/server/floorGuards'
import { ensureFloorSetup } from '@/server/floor/setup'
import { FloorLockedError, assertDateOpen, listMonthLocks, setMonthLock } from '@/server/floor/locks'
import {
  FloorApprovalLockedError,
  FloorBadRequest,
  FloorConflictError,
  applyListChanges,
  applySheetRows,
  applyBatch,
  listsWithHashes,
  sheetHashes,
  syncFor,
} from '@/server/floor/rowSync'
import { YarnError, yarnAdd, yarnCorrect, yarnDelete, yarnInward, yarnIssue, yarnRename, yarnSnapshot } from '@/server/floor/yarn'
import { FLOOR_KEYS, STALE_PAGE_MESSAGE, sheetRowId } from '@/lib/floor/rowSync'
import {
  beamRowSchema,
  isoDate,
  listChangesSchema,
  batchSchema,
  monthLockSchema,
  qualityRowSchema,
  sheetChangesSchema,
  sheetEntrySchema,
  yarnAddSchema,
  yarnCorrectSchema,
  yarnDeleteSchema,
  yarnInwardSchema,
  yarnIssueSchema,
  yarnRenameSchema,
  zodMessage,
} from '@/lib/floor/schemas'
import type { z } from 'zod'
import type { DailyLoomProductionEntry } from '@/types/production'

export const runtime = 'nodejs'

const KEY_LOOMS = FLOOR_KEYS.LOOMS
const KEY_BEAMS = FLOOR_KEYS.BEAMS
const KEY_YARN = FLOOR_KEYS.YARN
const KEY_YARN_ISSUANCE = FLOOR_KEYS.YARN_ISSUANCE
const KEY_QUALITY = FLOOR_KEYS.QUALITY
const KEY_YARN_MOVEMENTS = FLOOR_KEYS.YARN_MOVEMENTS

async function requireSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  return token ? await verifySession(token) : null
}

type FloorActor = NonNullable<Awaited<ReturnType<typeof currentUser>>>

/**
 * Floor edits need Edit on at least one production tab (Administration → Permissions).
 * The tabs share the same saves (a beam mount writes the day's Sw #, a loom status writes the
 * day row …), so the server checks "may change production" and each tab is locked on screen.
 */
async function requireFloorWriter(req: NextRequest): Promise<FloorActor | null> {
  const user = await currentUser(req)
  if (!user) return null
  const { access } = await accessFor(user)
  return allowsAny(access, PRODUCTION_AREAS, 'edit') ? user : null
}

function forbidden() {
  return NextResponse.json(
    { ok: false, error: 'You have view-only access to the production floor.' },
    { status: 403 }
  )
}

function isAdminUser(user: { roleKey?: string | null } | null | undefined) {
  return (user?.roleKey || '').toLowerCase() === 'admin'
}

const APPROVED_LOCK_MESSAGE =
  'This production sheet has been finalized & approved by Javed Sir. Changes are locked.'

function approvedLocked() {
  return NextResponse.json({ ok: false, locked: true, error: APPROVED_LOCK_MESSAGE }, { status: 403 })
}

/** Deleting a whole day that has production on it is admin-only. */
function sheetHasProduction(entries: DailyLoomProductionEntry[] | null | undefined) {
  return Boolean(entries?.some((e) => rowMeters(e) > 0))
}

function productionDeleteBlocked() {
  return NextResponse.json(
    {
      ok: false,
      blocked: true,
      error: 'This day already has production meters. Only the admin can delete a whole day.',
    },
    { status: 409 }
  )
}

function segmentOf(e: { segmentIndex?: number }) {
  return Math.max(1, Math.floor(Number(e.segmentIndex) || 1))
}

function bad(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 })
}

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value)
  if (!r.success) throw new FloorBadRequest(zodMessage(r.error))
  return r.data
}

function dateParam(value: unknown): string {
  return parse(isoDate, String(value || ''))
}

function errorResponse(scope: string, err: unknown) {
  if (err instanceof FloorConflictError) {
    console.warn(`[${scope}] conflict:`, JSON.stringify(err.conflicts))
    return NextResponse.json({ ok: false, conflict: true, conflicts: err.conflicts, error: err.message }, { status: 409 })
  }
  if (err instanceof FloorLockedError) {
    return NextResponse.json({ ok: false, monthLocked: true, error: err.message }, { status: 423 })
  }
  if (err instanceof FloorApprovalLockedError) {
    return NextResponse.json({ ok: false, locked: true, error: err.message }, { status: 403 })
  }
  if (err instanceof FloorBadRequest || err instanceof YarnError) {
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status })
  }
  if (err instanceof FloorGuardError) {
    console.warn(`[${scope}] blocked:`, err.message)
    return NextResponse.json({ ok: false, blocked: true, error: err.message }, { status: err.status })
  }
  console.error(`[${scope}]`, err)
  return NextResponse.json(
    { ok: false, error: err instanceof Error ? err.message : 'Request failed' },
    { status: 500 }
  )
}

export async function GET(req: NextRequest) {
  try {
    if (!(await requireSession(req))) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    await ensureFloorSetup()

    if (await dbFloorIsEmpty()) {
      const seed = buildFloorSeedPayload()
      await dbSaveLooms(seed.looms)
      await dbSaveBeams(seed.beams)
      await dbSaveYarn(seed.yarn)
      await dbSaveYarnIssuances(seed.issuances)
      await dbSaveYarnMovements(seed.movements)
      await dbSaveQualities(seed.qualities)
    }
    // Starting point of the beam day-history (first load after deploy only).
    await ensureBeamHistoryTable().catch((err) => console.error('[beamHistory] setup failed', err))

    const [lists, yarn, issuances, movements, monthLocks] = await Promise.all([
      listsWithHashes(),
      dbGetYarn(),
      dbGetYarnIssuances(),
      dbGetYarnMovements(),
      listMonthLocks(),
    ])

    return NextResponse.json({
      ok: true,
      store: {
        [KEY_LOOMS]: lists.looms,
        [KEY_BEAMS]: lists.beams,
        [KEY_YARN]: yarn,
        [KEY_YARN_ISSUANCE]: issuances,
        [KEY_YARN_MOVEMENTS]: movements,
        [KEY_QUALITY]: lists.qualities,
      },
      hashes: lists.hashes,
      monthLocks,
    })
  } catch (err) {
    console.error('[floor/bootstrap]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Bootstrap failed' },
      { status: 500 }
    )
  }
}

/**
 * Whole-list / whole-sheet saves are no longer accepted: they overwrote other people's
 * work. Only a page loaded before the update still sends them — it is asked to refresh.
 */
export async function PUT(req: NextRequest) {
  if (!(await requireSession(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ ok: false, stale: true, error: STALE_PAGE_MESSAGE }, { status: 409 })
}

export async function POST(req: NextRequest) {
  try {
    const claims = await requireSession(req)
    if (!claims) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    await ensureFloorSetup()

    const body = await req.json()
    const action = String(body?.action || '')

    if (action === 'getSheet') {
      const dateStr = dateParam(body?.date)
      const entries = await dbGetSheet(dateStr)
      return NextResponse.json({ ok: true, entries, hashes: sheetHashes(entries) })
    }

    if (action === 'getAllSheets') {
      const sheets = await dbListAllSheets()
      return NextResponse.json({
        ok: true,
        sheets: sheets.map((s) => ({ ...s, hashes: sheetHashes(s.entries) })),
      })
    }

    if (action === 'getMonthLocks') {
      return NextResponse.json({ ok: true, monthLocks: await listMonthLocks() })
    }

    if (action === 'approveSheet' || action === 'unlockSheet') {
      const user = await currentUser(req)
      if (!isAdminUser(user) || !user) {
        return NextResponse.json(
          { ok: false, error: `Only Javed Sir (Main Admin) can ${action === 'approveSheet' ? 'approve' : 'unlock'} production sheets.` },
          { status: 403 }
        )
      }
      const dateStr = dateParam(body?.date)
      await assertDateOpen(dateStr)
      const status = action === 'approveSheet' ? 'APPROVED' : 'DRAFT'
      const entries = await dbSetSheetApproval(dateStr, status, {
        name: user.name || 'Javed Sir',
        role: 'admin',
      })
      await writeAudit({ req, actor: user, module: 'floor', action, entityKey: `sheet:${dateStr}`, changes: { status } })
      return NextResponse.json({ ok: true, entries, hashes: sheetHashes(entries) })
    }

    if (action === 'setMonthLock') {
      const admin = await currentUser(req)
      if (!admin || !isAdminUser(admin)) {
        return NextResponse.json({ ok: false, error: 'Production mahina sirf Javed Sir lock / unlock kar sakte hain.' }, { status: 403 })
      }
      const p = parse(monthLockSchema, body)
      const lock = await setMonthLock(p.month, p.locked, admin.name || admin.email || 'Admin')
      await writeAudit({ req, actor: admin, module: 'floor', action: p.locked ? 'lockMonth' : 'unlockMonth', entityKey: 'floor_month_locks', entityId: p.month, changes: { locked: p.locked } })
      return NextResponse.json({ ok: true, lock, monthLocks: await listMonthLocks() })
    }

    // ---- Everything below changes data ----
    const writer = await requireFloorWriter(req)
    if (!writer) return forbidden()
    const writerIsAdmin = isAdminUser(writer)
    const writerName = writer.name || writer.email || 'Floor Operator'

    // Changed rows of looms / beams / qualities, each with the hash it started from.
    if (action === 'saveRows') {
      const cs = parse(listChangesSchema, body)
      const ids = cs.upserts.map((u) => String(cs.key === KEY_LOOMS ? u.row.loomNumber : cs.key === KEY_BEAMS ? u.row.beamNo : u.row.id))
      const before = await syncFor(cs.key, [...ids, ...cs.deletes.map((d) => d.id)])
      const result = await applyListChanges(cs)
      await writeAudit({ req, actor: writer, module: 'floor', action: 'saveRows', entityKey: cs.key, before: before.rows, after: result.rows, meta: { upserts: cs.upserts.length, deletes: result.deleted } })
      return NextResponse.json({ ok: true, sync: result })
    }

    // Changed rows of one day sheet.
    if (action === 'saveSheetRows') {
      const p = parse(sheetChangesSchema, body)
      const result = await applySheetRows(p.date, p.rows, { name: writerName, isAdmin: writerIsAdmin })
      await writeAudit({ req, actor: writer, module: 'floor', action: 'saveSheetRows', entityKey: `sheet:${p.date}`, before: result.before, after: result.after, meta: { rows: p.rows.length } })
      return NextResponse.json({ ok: true, sync: { date: p.date, rows: result.rows, hashes: result.hashes, deleted: [] } })
    }

    // ---- Several lists / days as one all-or-nothing change (quality pose, End …) ----
    if (action === 'saveBatch') {
      const p = parse(batchSchema, body)
      if (!p.lists.length && !p.days.length) return bad('Kuch bheja nahi gaya.')
      const listBefore = []
      for (const cs of p.lists) {
        const ids = cs.upserts.map((u) => String(cs.key === KEY_LOOMS ? u.row.loomNumber : cs.key === KEY_BEAMS ? u.row.beamNo : u.row.id))
        listBefore.push(await syncFor(cs.key, [...ids, ...cs.deletes.map((d) => d.id)]))
      }
      const result = await applyBatch(p, { name: writerName, isAdmin: writerIsAdmin })
      for (const [i, l] of result.lists.entries())
        await writeAudit({ req, actor: writer, module: 'floor', action: 'saveBatch', entityKey: l.key, before: listBefore[i]?.rows, after: l.rows, meta: { batch: true } })
      for (const d of result.days)
        await writeAudit({ req, actor: writer, module: 'floor', action: 'saveBatch', entityKey: `sheet:${d.date}`, before: d.before, after: d.rows, meta: { batch: true } })
      return NextResponse.json({
        ok: true,
        lists: result.lists,
        days: result.days.map((d) => ({ date: d.date, rows: d.rows, hashes: d.hashes, deleted: [] })),
      })
    }

    // ---- Start a new day: the server builds it from the database ----
    if (action === 'startDay') {
      const dateStr = dateParam(body?.date)
      const result = await startDayOnServer(dateStr, { name: writerName, isAdmin: writerIsAdmin })
      if (result.created)
        await writeAudit({ req, actor: writer, module: 'floor', action: 'startDay', entityKey: `sheet:${dateStr}`, before: [], after: result.rows, meta: { rows: result.rows.length } })
      return NextResponse.json({ ok: true, created: result.created, sync: { date: dateStr, rows: result.rows, hashes: result.hashes, deleted: [] } })
    }

    // ---- Yarn: the server records movements and works out the stock ----
    if (action.startsWith('yarn')) {
      let result: unknown
      if (action === 'yarnInward') result = await yarnInward(parse(yarnInwardSchema, body))
      else if (action === 'yarnIssue') result = await yarnIssue(parse(yarnIssueSchema, body))
      else if (action === 'yarnCorrect') result = await yarnCorrect(parse(yarnCorrectSchema, body))
      else if (action === 'yarnAdd') result = await yarnAdd(parse(yarnAddSchema, body))
      else if (action === 'yarnRename') result = await yarnRename(parse(yarnRenameSchema, body))
      else if (action === 'yarnDelete') result = await yarnDelete(parse(yarnDeleteSchema, body))
      else return bad('Unknown yarn action')
      const { action: _a, ...input } = body as Record<string, unknown>
      void _a
      await writeAudit({ req, actor: writer, module: 'floor', action, entityKey: KEY_YARN_MOVEMENTS, changes: { input, result } })
      return NextResponse.json({ ok: true, result, yarnState: await yarnSnapshot() })
    }

    if (action === 'deleteSheet') {
      const dateStr = dateParam(body?.date)
      await assertDateOpen(dateStr)
      const existing = await dbGetSheet(dateStr)
      if (sheetIsApproved(existing) && !writerIsAdmin) return approvedLocked()
      if (sheetHasProduction(existing) && !writerIsAdmin) return productionDeleteBlocked()
      await dbDeleteSheet(dateStr)
      await writeAudit({ req, actor: writer, module: 'floor', action: 'deleteSheet', entityKey: `sheet:${dateStr}`, before: existing, after: null })
      return NextResponse.json({ ok: true })
    }

    if (action === 'patchBeam') {
      const beamNo = String(body?.beamNo || '').trim()
      const patch = body?.patch || {}
      if (!beamNo) return bad('beamNo required')
      parse(beamRowSchema, { ...patch, beamNo })
      const beforeBeam = (await dbGetBeams()).find((b) => b.beamNo === beamNo)
      const beam = await dbPatchBeam(beamNo, patch)
      if (!beam) {
        return NextResponse.json({ ok: false, error: 'Beam not found' }, { status: 404 })
      }
      await recordBeamChanges([{ before: beforeBeam ?? null, after: beam }])
      await writeAudit({ req, actor: writer, module: 'floor', action: 'patchBeam', entityKey: KEY_BEAMS, entityId: beamNo, before: beforeBeam ? [beforeBeam] : [], after: [beam] })
      return NextResponse.json({ ok: true, beam, sync: await syncFor(KEY_BEAMS, [beamNo]) })
    }

    if (action === 'upsertBeam') {
      const beam = body?.beam
      if (!beam?.beamNo) return bad('beam with beamNo required')
      parse(beamRowSchema, beam)
      const beforeBeam = (await dbGetBeams()).find((b) => b.beamNo === beam.beamNo)
      const saved = await dbUpsertBeam(beam)
      await recordBeamChanges([{ before: beforeBeam ?? null, after: saved }])
      await writeAudit({ req, actor: writer, module: 'floor', action: 'upsertBeam', entityKey: KEY_BEAMS, entityId: String(beam.beamNo), before: beforeBeam ? [beforeBeam] : [], after: [saved] })
      return NextResponse.json({ ok: true, beam: saved, sync: await syncFor(KEY_BEAMS, [saved.beamNo]) })
    }

    if (action === 'deleteBeam') {
      const beamNo = String(body?.beamNo || '').trim()
      if (!beamNo) return bad('beamNo required')
      const beforeBeam = (await dbGetBeams()).find((b) => b.beamNo === beamNo)
      await dbDeleteBeam(beamNo)
      if (beforeBeam) await recordBeamChanges([{ before: beforeBeam, after: null }])
      await writeAudit({ req, actor: writer, module: 'floor', action: 'deleteBeam', entityKey: KEY_BEAMS, entityId: beamNo, before: beforeBeam ? [beforeBeam] : [], after: [] })
      return NextResponse.json({ ok: true, sync: await syncFor(KEY_BEAMS, [], [beamNo]) })
    }

    if (action === 'updateLoomEntry') {
      const dateStr = dateParam(body?.date)
      const loomNumber = Number(body?.loomNumber)
      const entry = body?.entry
      if (!loomNumber || !entry) return bad('date, loomNumber, entry required')
      parse(sheetEntrySchema, { ...entry, loomNumber })
      await assertDateOpen(dateStr)

      const currentSheet = await dbGetSheet(dateStr)
      if (sheetIsApproved(currentSheet) && !writerIsAdmin) return approvedLocked()

      const segmentIndex = Math.max(
        1,
        Math.floor(Number(body?.segmentIndex ?? entry?.segmentIndex) || 1)
      )
      const storedRow = currentSheet?.find(
        (e) => e.loomNumber === loomNumber && segmentOf(e) === segmentIndex
      )
      const safeEntry = writerIsAdmin ? entry : keepStoredApproval(entry, storedRow)
      const stampedEntry = {
        ...safeEntry,
        loomNumber,
        segmentIndex,
        lastEditedBy: writer.name || entry.lastEditedBy || 'Floor Operator',
        lastEditedAt: new Date().toISOString(),
      }

      await dbUpdateLoomEntry(dateStr, loomNumber, stampedEntry)
      await writeAudit({
        req,
        actor: writer,
        module: 'floor',
        action: 'updateLoomEntry',
        entityKey: `sheet:${dateStr}`,
        entityId: `${loomNumber}:${segmentIndex}`,
        before: storedRow ? [storedRow] : [],
        after: [stampedEntry],
      })
      return NextResponse.json({ ok: true, entry: stampedEntry })
    }

    if (action === 'deleteLoomSegment') {
      const dateStr = dateParam(body?.date)
      const loomNumber = Number(body?.loomNumber)
      const segmentIndex = Math.max(1, Math.floor(Number(body?.segmentIndex) || 1))
      if (!loomNumber || segmentIndex <= 1) return bad('date, loomNumber, segmentIndex (>1) required')
      await assertDateOpen(dateStr)

      const currentSheet = await dbGetSheet(dateStr)
      if (sheetIsApproved(currentSheet) && !writerIsAdmin) return approvedLocked()
      const storedRow = currentSheet?.find(
        (e) => e.loomNumber === loomNumber && segmentOf(e) === segmentIndex
      )
      const deleted = await dbDeleteLoomSegment(dateStr, loomNumber, segmentIndex)
      await writeAudit({ req, actor: writer, module: 'floor', action: 'deleteLoomSegment', entityKey: `sheet:${dateStr}`, entityId: `${loomNumber}:${segmentIndex}`, before: storedRow ? [storedRow] : [], after: [] })
      return NextResponse.json({
        ok: true,
        deleted,
        sync: { date: dateStr, rows: [], hashes: {}, deleted: [sheetRowId({ loomNumber, segmentIndex })] },
      })
    }

    if (action === 'patchQualityStatus') {
      const id = String(body?.id || '')
      const status =
        body?.status === 'ENDED' ? 'ENDED' : body?.status === 'HOLD' ? 'HOLD' : 'ACTIVE'
      const endedOn = body?.endedOn != null ? String(body.endedOn) : null
      if (!id) return bad('id required')
      const beforeQ = await dbGetQualities()
      await dbPatchQualityStatus(id, status, status === 'ACTIVE' ? null : endedOn)
      await writeAudit({ req, actor: writer, module: 'floor', action: 'patchQualityStatus', entityKey: KEY_QUALITY, entityId: id, before: beforeQ.filter((q) => q.id === id), after: (await dbGetQualities()).filter((q) => q.id === id) })
      return NextResponse.json({ ok: true, sync: await syncFor(KEY_QUALITY, [id]) })
    }

    if (action === 'upsertQuality') {
      const q = body?.quality
      if (!q?.id || !q?.name) return bad('quality with id+name required')
      parse(qualityRowSchema, q)
      const beforeQ = await dbGetQualities()
      await dbUpsertQuality(q)
      await rebuildProductionLedger()
      await writeAudit({ req, actor: writer, module: 'floor', action: 'upsertQuality', entityKey: KEY_QUALITY, entityId: String(q.id), before: beforeQ.filter((x) => x.id === q.id), after: (await dbGetQualities()).filter((x) => x.id === q.id) })
      return NextResponse.json({ ok: true, sync: await syncFor(KEY_QUALITY, [String(q.id)]) })
    }

    if (action === 'reuseQuality') {
      const endedId = String(body?.endedId || '')
      const createdOn = String(body?.createdOn || '').slice(0, 10)
      if (!endedId || !createdOn) return bad('endedId and createdOn required')
      dateParam(createdOn)
      if (body?.newQuality) parse(qualityRowSchema, body.newQuality)
      const beforeQ = await dbGetQualities()
      const result = await dbReuseQuality({
        endedId,
        createdOn,
        newQuality: body?.newQuality || null,
      })
      await writeAudit({ req, actor: writer, module: 'floor', action: 'reuseQuality', entityKey: KEY_QUALITY, entityId: endedId, before: beforeQ.filter((x) => x.id === endedId), after: [result.ended, result.active] })
      return NextResponse.json({ ok: true, ...result, sync: await syncFor(KEY_QUALITY, [endedId, result.active.id]) })
    }

    if (action === 'deleteQuality') {
      const id = String(body?.id || '')
      if (!id) return bad('id required')
      const beforeQ = await dbGetQualities()
      const linkedBeams = (await dbGetBeams()).filter((b) => b.qualityId === id).map((b) => b.beamNo)
      await dbDeleteQuality(id)
      await writeAudit({ req, actor: writer, module: 'floor', action: 'deleteQuality', entityKey: KEY_QUALITY, entityId: id, before: beforeQ.filter((x) => x.id === id), after: [] })
      return NextResponse.json({
        ok: true,
        sync: await syncFor(KEY_QUALITY, [], [id]),
        beamSync: linkedBeams.length ? await syncFor(KEY_BEAMS, linkedBeams) : null,
      })
    }

    if (action === 'submitForApproval') {
      const dateStr = dateParam(body?.date)
      await assertDateOpen(dateStr)

      // Re-submitting an approved sheet would silently unlock it — admin only.
      if (sheetIsApproved(await dbGetSheet(dateStr)) && !writerIsAdmin) return approvedLocked()
      const entries = await dbSetSheetApproval(dateStr, 'DRAFT', {
        name: writer.name || 'Ahmer',
        role: writer.roleKey || 'quality_controller',
      })
      await writeAudit({ req, actor: writer, module: 'floor', action: 'submitForApproval', entityKey: `sheet:${dateStr}`, changes: { status: 'DRAFT' } })
      return NextResponse.json({ ok: true, entries, hashes: sheetHashes(entries) })
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return errorResponse('floor/store POST', err)
  }
}
