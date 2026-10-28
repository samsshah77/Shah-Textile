import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAccess } from '@/server/userAccess'
import { getArchiveOriginal, getArchiveSheet } from '@/server/archive/qualityArchive'

export const runtime = 'nodejs'

/** One stored sheet (`?sheet=0`), or the original workbook unchanged (`?download=1`). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if ((await requireAccess(request, 'quality_archive', 'view')).error) return NextResponse.json({ error: 'Ijazat nahi' }, { status: 403 })
  const { id } = await params
  const sp = request.nextUrl.searchParams
  if (sp.get('download') === '1') {
    const file = await getArchiveOriginal(id)
    if (!file) return NextResponse.json({ error: 'Nahi mili' }, { status: 404 })
    return new NextResponse(new Uint8Array(file.content), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        'Cache-Control': 'private, no-store',
      },
    })
  }
  const idx = Number(sp.get('sheet') ?? 0)
  if (!Number.isInteger(idx) || idx < 0) return NextResponse.json({ error: 'sheet ghalat' }, { status: 400 })
  const sheet = await getArchiveSheet(id, idx)
  if (!sheet) return NextResponse.json({ error: 'Nahi mili' }, { status: 404 })
  return NextResponse.json({ sheet })
}
