import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@/server/current-user'
import { hasPermission } from '@/server/permissions'
import { productionReport } from '@/server/productionLedger'
import { getProductionToday, productionMonthBounds, productionMonthOf } from '@/constants/productionCalendar'

export const runtime = 'nodejs'

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/floor/reports?from=2026-10-01&to=2026-10-31
 * Server-side production totals by day, quality and loom (from floor_production),
 * plus a reconcile check against the raw sheets (`mismatches` should be empty).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await currentUser(req)
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    const allowed = await hasPermission(user.id, {
      moduleKey: 'floor',
      resourceKey: 'production_entries',
      action: 'VIEW',
    })
    if (!allowed) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

    const today = getProductionToday()
    const from = req.nextUrl.searchParams.get('from') || productionMonthBounds(productionMonthOf(today)).from
    const to = req.nextUrl.searchParams.get('to') || today
    if (!ISO.test(from) || !ISO.test(to) || from > to) {
      return NextResponse.json({ ok: false, error: 'from/to must be YYYY-MM-DD and from <= to' }, { status: 400 })
    }

    const report = await productionReport(from, to)
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    console.error('[floor/reports]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Report failed' },
      { status: 500 }
    )
  }
}
