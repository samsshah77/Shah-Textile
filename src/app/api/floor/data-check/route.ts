import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@/server/current-user'
import { hasPermission } from '@/server/permissions'
import { prisma } from '@/lib/prisma'
import { sheetEntryFromDbRow } from '@/server/floorDb'
import { productionReport } from '@/server/productionLedger'
import { findFloorProblems } from '@/lib/floor/dataCheck'
import { getProductionToday } from '@/constants/productionCalendar'
import type { DailyLoomProductionEntry } from '@/types/production'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** GET /api/floor/data-check?from&to — read-only list of rows / days to look at. */
export async function GET(req: NextRequest) {
  try {
    const user = await currentUser(req)
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    const allowed = await hasPermission(user.id, { moduleKey: 'floor', resourceKey: 'production_entries', action: 'VIEW' })
    if (!allowed) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    const today = getProductionToday()
    const from = req.nextUrl.searchParams.get('from') || `${today.slice(0, 7)}-01`
    const to = req.nextUrl.searchParams.get('to') || today
    if (!ISO.test(from) || !ISO.test(to) || from > to)
      return NextResponse.json({ ok: false, error: 'from/to must be YYYY-MM-DD and from <= to' }, { status: 400 })

    const raw = await prisma.floorDailySheet.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: [{ date: 'asc' }, { loomNumber: 'asc' }, { segmentIndex: 'asc' }],
    })
    const byDate = new Map<string, DailyLoomProductionEntry[]>()
    for (const r of raw) {
      const e = sheetEntryFromDbRow(r)
      byDate.set(r.date, [...(byDate.get(r.date) || []), e])
    }
    const problems = findFloorProblems([...byDate].map(([date, rows]) => ({ date, rows })), today)
    const report = await productionReport(from, to)
    return NextResponse.json({
      ok: true,
      from,
      to,
      days: byDate.size,
      problems,
      unlinked: report.unlinked,
      outsideRun: report.outsideRun,
      mismatches: report.mismatches,
    })
  } catch (err) {
    console.error('[floor/data-check]', err)
    return NextResponse.json({ ok: false, error: 'Check failed' }, { status: 500 })
  }
}
