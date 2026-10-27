import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { deleteFaultReport, getFaultReport, updateFaultReport } from '@/server/floor/faultReports'
import { faultUser } from '@/server/floor/faultAccess'
import { writeAudit } from '@/server/auditLog'

export const runtime = 'nodejs'

/** Remove a report (soft delete): anyone who may send fault reports. Logged in the audit. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await faultUser(request, 'CREATE')
  if (check.error) return check.error
  const { id } = await params
  const report = await getFaultReport(id)
  if (!report) return NextResponse.json({ error: 'Nahi mila' }, { status: 404 })

  await deleteFaultReport(id)
  await writeAudit({ req: request, actor: check.user, module: 'floor', action: 'deleteFaultReport', entityKey: 'floor_fault_reports', entityId: id, before: report, after: null })
  return NextResponse.json({ deleted: id })
}

/** Edit a report's note, loom or shift. The old values stay in the audit log. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await faultUser(request, 'CREATE')
  if (check.error) return check.error
  const { id } = await params
  const report = await getFaultReport(id)
  if (!report) return NextResponse.json({ error: 'Nahi mila' }, { status: 404 })

  const body = (await request.json().catch(() => null)) as { text?: unknown; loomNumber?: unknown; shift?: unknown } | null
  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 2000) : undefined
  const loomNumber = body?.loomNumber === undefined ? undefined : Number(body.loomNumber)
  const shift = body?.shift === 'A' || body?.shift === 'B' ? body.shift : undefined
  if (loomNumber !== undefined && (!Number.isInteger(loomNumber) || loomNumber <= 0)) {
    return NextResponse.json({ error: 'Loom number ghalat hai' }, { status: 400 })
  }
  // A report must keep something: a note or its photos / video.
  if (text !== undefined && !text && report.media.length === 0) {
    return NextResponse.json({ error: 'Fault likhein — khali report nahi reh sakti' }, { status: 400 })
  }

  const updated = await updateFaultReport(id, { text, loomNumber, shift })
  if (!updated) return NextResponse.json({ error: 'Nahi mila' }, { status: 404 })
  await writeAudit({ req: request, actor: check.user, module: 'floor', action: 'editFaultReport', entityKey: 'floor_fault_reports', entityId: id, before: report, after: updated })
  return NextResponse.json({ report: updated })
}
