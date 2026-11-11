import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { isYmd } from '@/server/floor/faultAccess'
import {
  BeamHistoryEditError,
  addPastStint,
  setStintDetails,
  beamLoomStints,
  beamRuns,
  beamsAsOf,
  hideStint,
  setStintEndDate,
  setStintStartDate,
} from '@/server/floor/beamHistory'
import { FloorLockedError, assertDateOpen } from '@/server/floor/locks'
import { fillRunLots, planRunLots, runLot } from '@/server/floor/beamLotFill'
import { getProductionToday } from '@/constants/productionCalendar'
import { requireAccess } from '@/server/userAccess'

export const runtime = 'nodejs'

/**
 * The beams as they stood on one day (Beams tab, past dates), or with ?stints=1&from&to
 * every time a beam sat on a loom in that range (quality tracking). Read-only.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const beam = (sp.get('beam') || '').trim()
  if (beam) {
    const check = await requireAccess(request, ['prod_beams', 'tracking', 'prod_quality'], 'view')
    if (check.error) return check.error
    try {
      return NextResponse.json({ beamNo: beam, runs: await beamRuns(beam) })
    } catch (err) {
      console.error('[beam-history runs]', err)
      return NextResponse.json({ error: 'Beam history load nahi ho saki.' }, { status: 500 })
    }
  }
  if (sp.get('stints') === '1') {
    const check = await requireAccess(request, ['tracking', 'prod_beams', 'prod_quality', 'prod_sheet'], 'view')
    if (check.error) return check.error
    const from = sp.get('from')
    const to = sp.get('to')
    if (!isYmd(from) || !isYmd(to)) return NextResponse.json({ error: 'from / to chahiye (YYYY-MM-DD)' }, { status: 400 })
    try {
      return NextResponse.json({ from, to, stints: await beamLoomStints(from, to) })
    } catch (err) {
      console.error('[beam-history stints]', err)
      return NextResponse.json({ error: 'Beam history load nahi ho saki.' }, { status: 500 })
    }
  }
  const check = await requireAccess(request, ['prod_beams', 'prod_looms'], 'view')
  if (check.error) return check.error
  const date = request.nextUrl.searchParams.get('date')
  if (!isYmd(date)) return NextResponse.json({ error: 'date chahiye (YYYY-MM-DD)' }, { status: 400 })
  try {
    return NextResponse.json({ date, beams: await beamsAsOf(date) })
  } catch (err) {
    console.error('[beam-history]', err)
    return NextResponse.json({ error: 'Beam history load nahi ho saki.' }, { status: 500 })
  }
}

/**
 * Beam History / Ended → Edit: { action: 'setStart', beamNo, firstId, from } changes the day a
 * beam went on a loom; 'setEnd' (to) the day it came off; 'remove' hides a run made by mistake.
 * 'add' (loom, from, to, swLot) adds a past run. 'lotPlan' / 'fillLots' (firstId) show / write
 * the run's Sw # into the empty Sw # cells of Daily Entry for its loom and days. Needs Beams edit; a locked production month
 * cannot be changed.
 */
export async function POST(request: NextRequest) {
  const check = await requireAccess(request, 'prod_beams', 'edit')
  if (check.error) return check.error
  const body = (await request.json().catch(() => null)) as
    | {
        action?: string
        beamNo?: string
        firstId?: string
        to?: string
        from?: string
        oldTo?: string
        oldFrom?: string
        loom?: number | string
        swLot?: string | null
        warp?: string
        length?: number | string
      }
    | null
  const beamNo = String(body?.beamNo || '').trim()
  if (body?.action === 'add') {
    if (!beamNo) return NextResponse.json({ ok: false, error: 'Beam nahi mila.' }, { status: 400 })
    try {
      const from = String(body.from || '')
      const to = String(body.to || '')
      if (!isYmd(from) || !isYmd(to)) return NextResponse.json({ ok: false, error: 'Laga aur Utra dono dates chahiye.' }, { status: 400 })
      await assertDateOpen(from)
      await assertDateOpen(to)
      const swLot = String(body.swLot || '').trim().slice(0, 40) || null
      const stint = await addPastStint(beamNo, Number(body.loom), from, to, swLot, getProductionToday())
      return NextResponse.json({ ok: true, stint })
    } catch (err) {
      if (err instanceof FloorLockedError || err instanceof BeamHistoryEditError) {
        return NextResponse.json({ ok: false, error: err.message }, { status: err.status })
      }
      console.error('[beam-history add]', err)
      return NextResponse.json({ ok: false, error: 'Save nahi ho saka.' }, { status: 500 })
    }
  }
  const firstId = String(body?.firstId || '').trim()
  if (!beamNo || !/^\d+$/.test(firstId)) return NextResponse.json({ ok: false, error: 'Beam / record nahi mila.' }, { status: 400 })
  try {
    if (body?.action === 'details') {
      // An ended run's own Sw # / Warp / Length (not the beam as it is now).
      const run = (await beamRuns(beamNo)).find((r) => r.firstId === firstId)
      if (!run) return NextResponse.json({ ok: false, error: 'Ye record nahi mila — page refresh karein.' }, { status: 400 })
      await assertDateOpen(run.from)
      if (run.to) await assertDateOpen(run.to)
      const stint = await setStintDetails(beamNo, firstId, {
        ...('swLot' in body ? { swLot: body.swLot ?? null } : {}),
        ...('warp' in body ? { warp: String(body.warp ?? '') } : {}),
        ...('length' in body ? { length: Number(body.length) } : {}),
      })
      return NextResponse.json({ ok: true, stint })
    }
    if (body?.action === 'lotPlan' || body?.action === 'fillLots') {
      const run = (await beamRuns(beamNo)).find((r) => r.firstId === firstId)
      if (!run) return NextResponse.json({ ok: false, error: 'Ye record nahi mila — page refresh karein.' }, { status: 400 })
      const today = getProductionToday()
      const to = run.to ?? today
      const lot = runLot(beamNo, run.swLot)
      if (body.action === 'lotPlan') {
        return NextResponse.json({ ok: true, loom: run.loom, from: run.from, to, plan: await planRunLots(run.loom, run.from, to, lot) })
      }
      const actor = { name: check.user.name || check.user.email || 'Floor Operator', isAdmin: (check.user.roleKey || '').toLowerCase() === 'admin' }
      const result = await fillRunLots(run.loom, run.from, to, lot, actor)
      return NextResponse.json({ ok: true, loom: run.loom, lot, ...result })
    }
    if (body?.action === 'setEnd') {
      const to = String(body.to || '')
      if (!isYmd(to)) return NextResponse.json({ ok: false, error: 'Date sahi nahi.' }, { status: 400 })
      if (isYmd(body.oldTo)) await assertDateOpen(body.oldTo)
      await assertDateOpen(to)
      const stint = await setStintEndDate(beamNo, firstId, to, getProductionToday())
      return NextResponse.json({ ok: true, stint })
    }
    if (body?.action === 'setStart') {
      const from = String(body.from || '')
      if (!isYmd(from)) return NextResponse.json({ ok: false, error: 'Date sahi nahi.' }, { status: 400 })
      if (isYmd(body.oldFrom)) await assertDateOpen(body.oldFrom)
      await assertDateOpen(from)
      const stint = await setStintStartDate(beamNo, firstId, from, getProductionToday())
      return NextResponse.json({ ok: true, stint })
    }
    if (body?.action === 'remove') {
      if (isYmd(body.oldTo)) await assertDateOpen(body.oldTo)
      const stint = await hideStint(beamNo, firstId)
      return NextResponse.json({ ok: true, stint })
    }
    return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 400 })
  } catch (err) {
    if (err instanceof FloorLockedError || err instanceof BeamHistoryEditError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status })
    }
    console.error('[beam-history edit]', err)
    return NextResponse.json({ ok: false, error: 'Save nahi ho saka.' }, { status: 500 })
  }
}
