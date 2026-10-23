import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { deleteFaultReport, getFaultReport } from '@/server/floor/faultReports'
import { faultUser } from '@/server/floor/faultAccess'

export const runtime = 'nodejs'

/** Remove a report: the person who sent it (same day) or an admin. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await faultUser(request, 'CREATE')
  if (check.error) return check.error
  const { id } = await params
  const report = await getFaultReport(id)
  if (!report) return NextResponse.json({ error: 'Nahi mila' }, { status: 404 })
  const isAdmin = (check.user.roleKey || '').toLowerCase() === 'admin'
  const sentToday = new Date(report.createdAt).toDateString() === new Date().toDateString()
  if (!isAdmin && !(report.createdById === check.user.id && sentToday))
    return NextResponse.json({ error: 'Sirf bhejne wala (usi din) ya Admin hata sakta hai.' }, { status: 403 })
  await deleteFaultReport(id)
  return NextResponse.json({ deleted: id })
}
