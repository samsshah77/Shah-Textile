import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { isYmd } from '@/server/floor/faultAccess'
import {
  BeamHistoryEditError,
  beamLoomStints,
  beamsAsOf,
  hideStint,
  setStintEndDate,
} from '@/server/floor/beamHistory'
import { FloorLockedError, assertDateOpen } from '@/server/floor/locks'
import { getProductionToday } from '@/constants/productionCalendar'
import { requireAccess } from '@/server/userAccess'

export const runtime = 'nodejs'

/**
 * The beams as they stood on one day (Beams tab, past dates), or with ?stints=1&from&to
 * every time a beam sat on a loom in that range (quality tracking). Read-only.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
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
 * Beams → Ended → Edit: { action: 'setEnd', beamNo, firstId, to } changes the day a beam came
 * off; { action: 'remove', beamNo, firstId } hides a record (beam ended twice by mistake).
 * Needs Beams edit; a locked production month cannot be changed.
 */
export async function POST(request: NextRequest) {
  const check = await requireAccess(request, 'prod_beams', 'edit')
  if (check.error) return check.error
  const body = (await request.json().catch(() => null)) as
    | { action?: string; beamNo?: string; firstId?: string; to?: string; from?: string; oldTo?: string }
    | null
  const beamNo = String(body?.beamNo || '').trim()
  const firstId = String(body?.firstId || '').trim()
  if (!beamNo || !/^\d+$/.test(firstId)) return NextResponse.json({ ok: false, error: 'Beam / record nahi mila.' }, { status: 400 })
  try {
    if (body?.action === 'setEnd') {
      const to = String(body.to || '')
      if (!isYmd(to)) return NextResponse.json({ ok: false, error: 'Date sahi nahi.' }, { status: 400 })
      if (isYmd(body.oldTo)) await assertDateOpen(body.oldTo)
      await assertDateOpen(to)
      const stint = await setStintEndDate(beamNo, firstId, to, getProductionToday())
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
