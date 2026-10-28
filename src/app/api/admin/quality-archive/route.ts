import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/server/adminAccess'
import { requireAccess } from '@/server/userAccess'
import { writeAudit } from '@/server/auditLog'
import { archiveSealed, listArchive, looksLikeXlsx, previewArchiveFile, saveArchiveBatch } from '@/server/archive/qualityArchive'

export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_FILES = 20
const deny = () => NextResponse.json({ error: 'Quality Archive sirf admin dekh sakta hai.' }, { status: 403 })

/** The archived quality lines (read-only) and whether the one-time import is done. */
export async function GET(request: NextRequest) {
  // Reading: View on "Quality Archive" (Administration → Permissions). Saving stays admin-only.
  if ((await requireAccess(request, 'quality_archive', 'view')).error) return deny()
  const { files, rows } = await listArchive()
  return NextResponse.json({ sealed: files.length > 0, files: files.map(({ id, fileName, year }) => ({ id, fileName, year })), rows })
}

/**
 * One-time import. `action=preview` reads the chosen files (nothing stored); `action=save`
 * stores all of them in one go. Once the archive has files, both are refused — the record is
 * closed. There is no update or delete, by design.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdminUser(request)
  if (!admin) return deny()
  if (await archiveSealed()) return NextResponse.json({ error: 'Archive band hai — ab is mein kuch add nahi ho sakta.' }, { status: 409 })
  const form = await request.formData().catch(() => null)
  const action = form?.get('action') === 'save' ? 'save' : 'preview'
  const list = (form?.getAll('file') ?? []).filter((f): f is File => typeof f !== 'string')
  if (!list.length) return NextResponse.json({ error: 'Excel files chunein' }, { status: 400 })
  if (list.length > MAX_FILES) return NextResponse.json({ error: `Ek dafa mein ${MAX_FILES} se zyada files nahi` }, { status: 400 })
  const files: Array<{ buf: Uint8Array; fileName: string }> = []
  for (const f of list) {
    if (!/\.xlsx$/i.test(f.name)) return NextResponse.json({ error: `${f.name}: sirf .xlsx file (Excel) chalegi` }, { status: 400 })
    if (f.size > MAX_BYTES) return NextResponse.json({ error: `${f.name}: 10 MB se bari hai` }, { status: 413 })
    const buf = new Uint8Array(await f.arrayBuffer())
    if (!looksLikeXlsx(buf)) return NextResponse.json({ error: `${f.name}: asal Excel (.xlsx) file nahi lagti` }, { status: 400 })
    files.push({ buf, fileName: f.name })
  }
  try {
    if (action === 'preview') return NextResponse.json({ previews: await Promise.all(files.map((f) => previewArchiveFile(f.buf, f.fileName))) })
    const saved = await saveArchiveBatch(files, { id: admin.id, name: admin.name || admin.email || '' })
    await writeAudit({
      req: request,
      actor: admin,
      module: 'system',
      action: 'qualityArchive.import',
      entityKey: 'quality_archive_files',
      entityId: saved.map((f) => f.id).join(','),
      changes: { files: saved.map((f) => ({ fileName: f.fileName, sha256: f.sha256 })) },
    })
    return NextResponse.json({ ok: true, saved })
  } catch (err) {
    console.error('[quality-archive]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Files parh nahi saka' }, { status: 400 })
  }
}
