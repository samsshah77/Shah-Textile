import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { cleanMedia, createFaultReport, listFaultReports, loomChoices } from '@/server/floor/faultReports'
import { faultUser, isYmd } from '@/server/floor/faultAccess'
import { hasPermission } from '@/server/permissions'
import { voiceEnabled } from '@/server/floor/faultVoice'

export const runtime = 'nodejs'

/** A day's fault reports (or one loom over from–to), the loom list, and what this user may do. */
export async function GET(request: NextRequest) {
  const check = await faultUser(request, 'VIEW')
  if (check.error) return check.error
  const sp = request.nextUrl.searchParams
  const date = sp.get('date')
  const from = sp.get('from') || date
  const to = sp.get('to') || date
  if (!isYmd(from) || !isYmd(to)) return NextResponse.json({ error: 'date chahiye (YYYY-MM-DD)' }, { status: 400 })
  const loom = Number(sp.get('loom')) || undefined
  const [reports, looms, canPost] = await Promise.all([
    listFaultReports({ from, to, loom }),
    loomChoices(),
    hasPermission(check.user.id, { moduleKey: 'floor', resourceKey: 'production_entries', action: 'CREATE' }),
  ])
  return NextResponse.json({
    reports,
    looms,
    canPost,
    voice: voiceEnabled(),
    me: { id: check.user.id, isAdmin: (check.user.roleKey || '').toLowerCase() === 'admin' },
  })
}

/** Send one report: loom + note and/or pictures / video (uploaded first via /media). */
export async function POST(request: NextRequest) {
  const check = await faultUser(request, 'CREATE')
  if (check.error) return check.error
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const loomNumber = Number(body?.loomNumber)
  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 2000) : ''
  const media = cleanMedia(body?.media)
  if (!isYmd(body?.date)) return NextResponse.json({ error: 'Date ghalat hai' }, { status: 400 })
  if (!Number.isInteger(loomNumber) || loomNumber <= 0) return NextResponse.json({ error: 'Loom chunein' }, { status: 400 })
  if (!text && media.length === 0) return NextResponse.json({ error: 'Photo / video ya fault likhein' }, { status: 400 })
  const report = await createFaultReport({
    date: body.date as string,
    loomNumber,
    text,
    media,
    createdBy: check.user.name || check.user.email || '',
    createdById: check.user.id,
  })
  return NextResponse.json({ report })
}
