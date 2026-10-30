import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { faultUser, isYmd } from '@/server/floor/faultAccess'
import { beamLoomStints, beamsAsOf } from '@/server/floor/beamHistory'
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
  const check = await faultUser(request, 'VIEW')
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
