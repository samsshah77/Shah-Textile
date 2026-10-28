import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/server/adminAccess'
import { writeAudit } from '@/server/auditLog'
import { listArchive, looksLikeXlsx, previewArchiveFile, saveArchiveFile } from '@/server/archive/qualityArchive'

export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024
const deny = () => NextResponse.json({ error: 'Quality Archive sirf admin dekh sakta hai.' }, { status: 403 })

/** Everything in the archive: the stored workbooks and their quality lines (read-only). */
export async function GET(request: NextRequest) {
  if (!(await requireAdminUser(request))) return deny()
  return NextResponse.json(await listArchive())
}

/**
 * Add a workbook. `action=preview` only reads it (nothing is stored); `action=save` stores it
 * for good. There is no update or delete — by design.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdminUser(request)
  if (!admin) return deny()
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const action = form?.get('action') === 'save' ? 'save' : 'preview'
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Excel file chunein' }, { status: 400 })
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: 'Sirf .xlsx file (Excel) chalegi' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File 10 MB se bari hai' }, { status: 413 })
  const buf = new Uint8Array(await file.arrayBuffer())
  if (!looksLikeXlsx(buf)) return NextResponse.json({ error: 'Yeh asal Excel (.xlsx) file nahi lagti' }, { status: 400 })
  try {
    if (action === 'preview') return NextResponse.json({ preview: await previewArchiveFile(buf, file.name) })
    const saved = await saveArchiveFile(buf, file.name, { id: admin.id, name: admin.name || admin.email || '' })
    if (saved.created) {
      const p = await previewArchiveFile(buf, file.name)
      await writeAudit({
        req: request,
        actor: admin,
        module: 'system',
        action: 'qualityArchive.add',
        entityKey: 'quality_archive_files',
        entityId: saved.id,
        changes: { fileName: file.name, sha256: p.sha256, sheets: p.sheets },
      })
    }
    return NextResponse.json({ ok: true, ...saved })
  } catch (err) {
    console.error('[quality-archive]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'File parh nahi saka' }, { status: 400 })
  }
}
