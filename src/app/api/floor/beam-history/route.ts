import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { faultUser, isYmd } from '@/server/floor/faultAccess'
import { beamsAsOf } from '@/server/floor/beamHistory'

export const runtime = 'nodejs'

/** The beams as they stood on one day (Beams tab, past dates). Read-only. */
export async function GET(request: NextRequest) {
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
