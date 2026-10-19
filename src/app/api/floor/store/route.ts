import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { currentUser } from '@/server/current-user'
import {
  dbDeleteSheet,
  dbFloorIsEmpty,
  dbGetBeams,
  dbGetLooms,
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
  dbSaveSheet,
  dbSaveYarn,
  dbSaveYarnIssuances,
  dbSaveYarnMovements,
  dbUpdateLoomEntry,
  dbDeleteLoomSegment,
  dbSetSheetApproval,
} from '@/server/floorDb'
import { buildFloorSeedPayload } from '@/server/floorSeed'
import { ensureFloorPayrollTables } from '@/server/ensureFloorPayrollTables'
import { hasPermission } from '@/server/permissions'
import { writeAudit } from '@/server/auditLog'
import {
  FloorGuardError,
  rowMeters,
  keepStoredApproval,
  keepStoredApprovalForSheet,
  sheetIsApproved,
} from '@/server/floorGuards'
import type { DailyLoomProductionEntry } from '@/types/production'

export const runtime = 'nodejs'

const KEY_LOOMS = 'sara_textile_loom_master_v8'
const KEY_BEAMS = 'sara_textile_beam_master_v9'
const KEY_YARN = 'sara_textile_yarn_master_v8'
const KEY_YARN_ISSUANCE = 'sara_textile_yarn_issuance_v8'
const KEY_QUALITY = 'sara_textile_quality_master_v8'
const KEY_YARN_MOVEMENTS = 'sara_textile_yarn_movements_v8'
const SHEET_PREFIX = 'sara_textile_production_sheet_v8_'

async function requireSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  return token ? await verifySession(token) : null
}

type FloorActor = NonNullable<Awaited<ReturnType<typeof currentUser>>>

/** Floor edits need UPDATE on floor/production_entries (QC + admin by default; accountant is view-only). */
async function requireFloorWriter(req: NextRequest): Promise<FloorActor | null> {
  const user = await currentUser(req)
  if (!user) return null
  const allowed = await hasPermission(user.id, {
    moduleKey: 'floor',
    resourceKey: 'production_entries',
    action: 'UPDATE',
  })
  return allowed ? user : null
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

async function collectionSnapshot(key: string): Promise<unknown> {
  if (key === KEY_LOOMS) return dbGetLooms()
  if (key === KEY_BEAMS) return dbGetBeams()
  if (key === KEY_YARN) return dbGetYarn()
  if (key === KEY_YARN_ISSUANCE) return dbGetYarnIssuances()
  if (key === KEY_YARN_MOVEMENTS) return dbGetYarnMovements()
  if (key === KEY_QUALITY) return dbGetQualities()
  return null
}

function errorResponse(scope: string, err: unknown) {
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

export async function GET() {
  try {
    // Heal missing columns (e.g. weavePlan) before any quality upsert/read.
    await ensureFloorPayrollTables()

    if (await dbFloorIsEmpty()) {
      const seed = buildFloorSeedPayload()
      await dbSaveLooms(seed.looms)
      await dbSaveBeams(seed.beams)
      await dbSaveYarn(seed.yarn)
      await dbSaveYarnIssuances(seed.issuances)
      await dbSaveYarnMovements(seed.movements)
      await dbSaveQualities(seed.qualities)
    }

    const [looms, beams, yarn, issuances, movements, qualities] = await Promise.all([
      dbGetLooms(),
      dbGetBeams(),
      dbGetYarn(),
      dbGetYarnIssuances(),
      dbGetYarnMovements(),
      dbGetQualities(),
    ])

    return NextResponse.json({
      ok: true,
      store: {
        [KEY_LOOMS]: looms,
        [KEY_BEAMS]: beams,
        [KEY_YARN]: yarn,
        [KEY_YARN_ISSUANCE]: issuances,
        [KEY_YARN_MOVEMENTS]: movements,
        [KEY_QUALITY]: qualities,
      },
    })
  } catch (err) {
    console.error('[floor/bootstrap]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Bootstrap failed' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const claims = await requireSession(req)
    if (!claims) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const user = await requireFloorWriter(req)
    if (!user) return forbidden()

    // Ensure new columns (swLot, qualityId) exist before any beam write.
    await ensureFloorPayrollTables()

    const body = await req.json()
    const key = String(body?.key || '')
    const value = body?.value

    if (!key) {
      return NextResponse.json({ ok: false, error: 'key required' }, { status: 400 })
    }

    if (key.startsWith(SHEET_PREFIX)) {
      const dateStr = key.slice(SHEET_PREFIX.length)
      const existing = await dbGetSheet(dateStr)
      if (sheetIsApproved(existing) && !isAdminUser(user)) return approvedLocked()
      if (value == null) {
        if (sheetHasProduction(existing) && !isAdminUser(user)) return productionDeleteBlocked()
        await dbDeleteSheet(dateStr)
        await writeAudit({ req, actor: user, module: 'floor', action: 'deleteSheet', entityKey: `sheet:${dateStr}`, before: existing, after: null })
      } else {
        let entries = value as DailyLoomProductionEntry[]
        if (Array.isArray(entries) && !isAdminUser(user)) {
          entries = keepStoredApprovalForSheet(entries, existing)
        }
        await dbSaveSheet(dateStr, entries)
        await writeAudit({ req, actor: user, module: 'floor', action: 'saveSheet', entityKey: `sheet:${dateStr}`, before: existing, after: await dbGetSheet(dateStr) })
      }
      return NextResponse.json({ ok: true })
    }

    const known = [KEY_LOOMS, KEY_BEAMS, KEY_YARN, KEY_YARN_ISSUANCE, KEY_YARN_MOVEMENTS, KEY_QUALITY]
    if (!known.includes(key)) {
      return NextResponse.json({ ok: false, error: `Unknown key: ${key}` }, { status: 400 })
    }

    const before = await collectionSnapshot(key)
    if (key === KEY_LOOMS) await dbSaveLooms(value)
    else if (key === KEY_BEAMS) await dbSaveBeams(value)
    else if (key === KEY_YARN) await dbSaveYarn(value)
    else if (key === KEY_YARN_ISSUANCE) await dbSaveYarnIssuances(value)
    else if (key === KEY_YARN_MOVEMENTS) await dbSaveYarnMovements(value)
    else if (key === KEY_QUALITY) await dbSaveQualities(value)
    await writeAudit({ req, actor: user, module: 'floor', action: 'save', entityKey: key, before, after: await collectionSnapshot(key) })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse('floor/store PUT', err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const claims = await requireSession(req)
    if (!claims) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const action = String(body?.action || '')

    if (action === 'getSheet') {
      const dateStr = String(body?.date || '')
      const entries = await dbGetSheet(dateStr)
      return NextResponse.json({ ok: true, entries })
    }

    if (action === 'getAllSheets') {
      const sheets = await dbListAllSheets()
      return NextResponse.json({ ok: true, sheets })
    }

    // ---- Everything below changes data ----
    const writer = await requireFloorWriter(req)
    if (!writer) return forbidden()
    const writerIsAdmin = isAdminUser(writer)

    if (action === 'deleteSheet') {
      const dateStr = String(body?.date || '')
      const existing = await dbGetSheet(dateStr)
      if (sheetIsApproved(existing) && !writerIsAdmin) return approvedLocked()
      if (sheetHasProduction(existing) && !writerIsAdmin) return productionDeleteBlocked()
      await dbDeleteSheet(dateStr)
      await writeAudit({ req, actor: writer, module: 'floor', action: 'deleteSheet', entityKey: `sheet:${dateStr}`, before: existing, after: null })
      return NextResponse.json({ ok: true })
    }

    if (action === 'patchBeam') {
      await ensureFloorPayrollTables()
      const beamNo = String(body?.beamNo || '').trim()
      const patch = body?.patch || {}
      if (!beamNo) {
        return NextResponse.json({ ok: false, error: 'beamNo required' }, { status: 400 })
      }
      const beforeBeam = (await dbGetBeams()).find((b) => b.beamNo === beamNo)
      const beam = await dbPatchBeam(beamNo, patch)
      if (!beam) {
        return NextResponse.json({ ok: false, error: 'Beam not found' }, { status: 404 })
      }
      await writeAudit({ req, actor: writer, module: 'floor', action: 'patchBeam', entityKey: KEY_BEAMS, entityId: beamNo, before: beforeBeam ? [beforeBeam] : [], after: [beam] })
      return NextResponse.json({ ok: true, beam })
    }

    if (action === 'upsertBeam') {
      await ensureFloorPayrollTables()
      const beam = body?.beam
      if (!beam?.beamNo) {
        return NextResponse.json({ ok: false, error: 'beam with beamNo required' }, { status: 400 })
      }
      const beforeBeam = (await dbGetBeams()).find((b) => b.beamNo === beam.beamNo)
      const saved = await dbUpsertBeam(beam)
      await writeAudit({ req, actor: writer, module: 'floor', action: 'upsertBeam', entityKey: KEY_BEAMS, entityId: String(beam.beamNo), before: beforeBeam ? [beforeBeam] : [], after: [saved] })
      return NextResponse.json({ ok: true, beam: saved })
    }

    if (action === 'deleteBeam') {
      await ensureFloorPayrollTables()
      const beamNo = String(body?.beamNo || '').trim()
      if (!beamNo) {
        return NextResponse.json({ ok: false, error: 'beamNo required' }, { status: 400 })
      }
      const beforeBeam = (await dbGetBeams()).find((b) => b.beamNo === beamNo)
      await dbDeleteBeam(beamNo)
      await writeAudit({ req, actor: writer, module: 'floor', action: 'deleteBeam', entityKey: KEY_BEAMS, entityId: beamNo, before: beforeBeam ? [beforeBeam] : [], after: [] })
      return NextResponse.json({ ok: true })
    }

    if (action === 'updateLoomEntry') {
      const dateStr = String(body?.date || '')
      const loomNumber = Number(body?.loomNumber)
      const entry = body?.entry
      if (!dateStr || !loomNumber || !entry) {
        return NextResponse.json({ ok: false, error: 'date, loomNumber, entry required' }, { status: 400 })
      }

      const user = writer
      const currentSheet = await dbGetSheet(dateStr)
      const isAdmin = writerIsAdmin
      if (sheetIsApproved(currentSheet) && !isAdmin) return approvedLocked()

      const segmentIndex = Math.max(
        1,
        Math.floor(Number(body?.segmentIndex ?? entry?.segmentIndex) || 1)
      )
      const storedRow = currentSheet?.find(
        (e) => e.loomNumber === loomNumber && segmentOf(e) === segmentIndex
      )
      const safeEntry = isAdmin ? entry : keepStoredApproval(entry, storedRow)
      // Track editor
      const stampedEntry = {
        ...safeEntry,
        loomNumber,
        segmentIndex,
        lastEditedBy: user?.name || entry.lastEditedBy || 'Floor Operator',
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
      const dateStr = String(body?.date || '')
      const loomNumber = Number(body?.loomNumber)
      const segmentIndex = Math.max(1, Math.floor(Number(body?.segmentIndex) || 1))
      if (!dateStr || !loomNumber || segmentIndex <= 1) {
        return NextResponse.json(
          { ok: false, error: 'date, loomNumber, segmentIndex (>1) required' },
          { status: 400 }
        )
      }

      const currentSheet = await dbGetSheet(dateStr)
      if (sheetIsApproved(currentSheet) && !writerIsAdmin) return approvedLocked()
      const storedRow = currentSheet?.find(
        (e) => e.loomNumber === loomNumber && segmentOf(e) === segmentIndex
      )
      const deleted = await dbDeleteLoomSegment(dateStr, loomNumber, segmentIndex)
      await writeAudit({ req, actor: writer, module: 'floor', action: 'deleteLoomSegment', entityKey: `sheet:${dateStr}`, entityId: `${loomNumber}:${segmentIndex}`, before: storedRow ? [storedRow] : [], after: [] })
      return NextResponse.json({ ok: true, deleted })
    }

    if (action === 'patchQualityStatus') {
      const id = String(body?.id || '')
      const status =
        body?.status === 'ENDED' ? 'ENDED' : body?.status === 'HOLD' ? 'HOLD' : 'ACTIVE'
      const endedOn = body?.endedOn != null ? String(body.endedOn) : null
      if (!id) {
        return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
      }
      const beforeQ = await dbGetQualities()
      await dbPatchQualityStatus(id, status, status === 'ACTIVE' ? null : endedOn)
      await writeAudit({ req, actor: writer, module: 'floor', action: 'patchQualityStatus', entityKey: KEY_QUALITY, entityId: id, before: beforeQ, after: await dbGetQualities() })
      return NextResponse.json({ ok: true })
    }

    if (action === 'upsertQuality') {
      const q = body?.quality
      if (!q?.id || !q?.name) {
        return NextResponse.json({ ok: false, error: 'quality with id+name required' }, { status: 400 })
      }
      const beforeQ = await dbGetQualities()
      await dbUpsertQuality(q)
      await writeAudit({ req, actor: writer, module: 'floor', action: 'upsertQuality', entityKey: KEY_QUALITY, entityId: String(q.id), before: beforeQ, after: await dbGetQualities() })
      return NextResponse.json({ ok: true })
    }

    if (action === 'reuseQuality') {
      const endedId = String(body?.endedId || '')
      const createdOn = String(body?.createdOn || '').slice(0, 10)
      if (!endedId || !createdOn) {
        return NextResponse.json(
          { ok: false, error: 'endedId and createdOn required' },
          { status: 400 }
        )
      }
      const beforeQ = await dbGetQualities()
      const result = await dbReuseQuality({
        endedId,
        createdOn,
        newQuality: body?.newQuality || null,
      })
      await writeAudit({ req, actor: writer, module: 'floor', action: 'reuseQuality', entityKey: KEY_QUALITY, entityId: endedId, before: beforeQ, after: await dbGetQualities() })
      return NextResponse.json({ ok: true, ...result })
    }

    if (action === 'deleteQuality') {
      const id = String(body?.id || '')
      if (!id) {
        return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
      }
      const beforeQ = await dbGetQualities()
      await dbDeleteQuality(id)
      await writeAudit({ req, actor: writer, module: 'floor', action: 'deleteQuality', entityKey: KEY_QUALITY, entityId: id, before: beforeQ, after: await dbGetQualities() })
      return NextResponse.json({ ok: true })
    }

    if (action === 'submitForApproval') {
      const dateStr = String(body?.date || '')
      if (!dateStr) {
        return NextResponse.json({ ok: false, error: 'date required' }, { status: 400 })
      }

      // Re-submitting an approved sheet would silently unlock it — admin only.
      if (sheetIsApproved(await dbGetSheet(dateStr)) && !writerIsAdmin) return approvedLocked()
      const entries = await dbSetSheetApproval(dateStr, 'DRAFT', {
        name: writer.name || 'Ahmer',
        role: writer.roleKey || 'quality_controller',
      })
      await writeAudit({ req, actor: writer, module: 'floor', action: 'submitForApproval', entityKey: `sheet:${dateStr}`, changes: { status: 'DRAFT' } })
      return NextResponse.json({ ok: true, entries })
    }

    if (action === 'approveSheet') {
      const user = await currentUser(req)
      const isAdmin = (user?.roleKey || '').toLowerCase() === 'admin'
      if (!isAdmin) {
        return NextResponse.json(
          { ok: false, error: 'Only Javed Sir (Main Admin) can approve production sheets.' },
          { status: 403 }
        )
      }

      const dateStr = String(body?.date || '')
      if (!dateStr) {
        return NextResponse.json({ ok: false, error: 'date required' }, { status: 400 })
      }

      const entries = await dbSetSheetApproval(dateStr, 'APPROVED', {
        name: user?.name || 'Javed Sir',
        role: 'admin',
      })
      await writeAudit({ req, actor: user, module: 'floor', action: 'approveSheet', entityKey: `sheet:${dateStr}`, changes: { status: 'APPROVED' } })
      return NextResponse.json({ ok: true, entries })
    }

    if (action === 'unlockSheet') {
      const user = await currentUser(req)
      const isAdmin = (user?.roleKey || '').toLowerCase() === 'admin'
      if (!isAdmin) {
        return NextResponse.json(
          { ok: false, error: 'Only Javed Sir (Main Admin) can unlock production sheets.' },
          { status: 403 }
        )
      }

      const dateStr = String(body?.date || '')
      if (!dateStr) {
        return NextResponse.json({ ok: false, error: 'date required' }, { status: 400 })
      }

      const entries = await dbSetSheetApproval(dateStr, 'DRAFT', {
        name: user?.name || 'Javed Sir',
        role: 'admin',
      })
      await writeAudit({ req, actor: user, module: 'floor', action: 'unlockSheet', entityKey: `sheet:${dateStr}`, changes: { status: 'DRAFT' } })
      return NextResponse.json({ ok: true, entries })
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return errorResponse('floor/store POST', err)
  }
}
