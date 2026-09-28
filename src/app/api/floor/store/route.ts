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
  dbSaveLooms,
  dbSaveQualities,
  dbSaveSheet,
  dbSaveYarn,
  dbSaveYarnIssuances,
  dbSaveYarnMovements,
  dbUpdateLoomEntry,
  dbSetSheetApproval,
} from '@/server/floorDb'
import { buildFloorSeedPayload } from '@/server/floorSeed'

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

export async function GET() {
  try {
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

    const body = await req.json()
    const key = String(body?.key || '')
    const value = body?.value

    if (!key) {
      return NextResponse.json({ ok: false, error: 'key required' }, { status: 400 })
    }

    if (key === KEY_LOOMS) await dbSaveLooms(value)
    else if (key === KEY_BEAMS) await dbSaveBeams(value)
    else if (key === KEY_YARN) await dbSaveYarn(value)
    else if (key === KEY_YARN_ISSUANCE) await dbSaveYarnIssuances(value)
    else if (key === KEY_YARN_MOVEMENTS) await dbSaveYarnMovements(value)
    else if (key === KEY_QUALITY) await dbSaveQualities(value)
    else if (key.startsWith(SHEET_PREFIX)) {
      const dateStr = key.slice(SHEET_PREFIX.length)
      if (value == null) await dbDeleteSheet(dateStr)
      else await dbSaveSheet(dateStr, value)
    } else {
      return NextResponse.json({ ok: false, error: `Unknown key: ${key}` }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[floor/store PUT]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Save failed' },
      { status: 500 }
    )
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

    if (action === 'deleteSheet') {
      const dateStr = String(body?.date || '')
      await dbDeleteSheet(dateStr)
      return NextResponse.json({ ok: true })
    }

    if (action === 'updateLoomEntry') {
      const dateStr = String(body?.date || '')
      const loomNumber = Number(body?.loomNumber)
      const entry = body?.entry
      if (!dateStr || !loomNumber || !entry) {
        return NextResponse.json({ ok: false, error: 'date, loomNumber, entry required' }, { status: 400 })
      }

      const user = await currentUser(req)
      const currentSheet = await dbGetSheet(dateStr)
      const isAlreadyApproved = currentSheet?.some((e) => e.approvalStatus === 'APPROVED')
      const isAdmin = (user?.roleKey || '').toLowerCase() === 'admin'

      if (isAlreadyApproved && !isAdmin) {
        return NextResponse.json(
          { ok: false, error: 'This production sheet has been finalized & approved by Javed Sir. Changes are locked.' },
          { status: 403 }
        )
      }

      // Track editor
      const stampedEntry = {
        ...entry,
        lastEditedBy: user?.name || entry.lastEditedBy || 'Floor Operator',
        lastEditedAt: new Date().toISOString(),
      }

      await dbUpdateLoomEntry(dateStr, loomNumber, stampedEntry)
      return NextResponse.json({ ok: true, entry: stampedEntry })
    }

    if (action === 'submitForApproval') {
      const dateStr = String(body?.date || '')
      if (!dateStr) {
        return NextResponse.json({ ok: false, error: 'date required' }, { status: 400 })
      }

      const user = await currentUser(req)
      const entries = await dbSetSheetApproval(dateStr, 'DRAFT', {
        name: user?.name || 'Ahmer',
        role: user?.roleKey || 'quality_controller',
      })
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
      return NextResponse.json({ ok: true, entries })
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[floor/store POST]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Request failed' },
      { status: 500 }
    )
  }
}
