import { randomBytes } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { sniffImage } from '@/server/imageSniff'
import { faultUser, localStamp } from '@/server/floor/faultAccess'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_IMAGE = 10 * 1024 * 1024
const MAX_VIDEO = 100 * 1024 * 1024

/** Real video type from the first bytes (MP4 / MOV "ftyp", WebM EBML) — the name is never trusted. */
function sniffVideo(buf: Buffer): '.mp4' | '.mov' | '.webm' | null {
  if (buf.length >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    return buf.subarray(8, 10).toString('ascii') === 'qt' ? '.mov' : '.mp4'
  }
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return '.webm'
  return null
}

/** One photo or video for a fault report → /uploads/faults/… */
export async function POST(request: NextRequest) {
  const check = await faultUser(request, 'CREATE')
  if (check.error) return check.error
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'File nahi pahunchi (shayad bohat bari hai)' }, { status: 400 })
  }
  const file = form.get('file')
  if (!file || !(file instanceof File) || file.size <= 0) return NextResponse.json({ error: 'File nahi mili' }, { status: 400 })
  if (file.size > MAX_VIDEO) return NextResponse.json({ error: 'File 100 MB se bari hai — choti video lein' }, { status: 400 })
  const buffer = Buffer.from(await file.arrayBuffer())

  const img = sniffImage(buffer)
  const ext = img && img !== '.gif' ? img : sniffVideo(buffer)
  if (!ext) return NextResponse.json({ error: 'Sirf photo (JPG/PNG/WEBP) ya video (MP4/MOV/WEBM)' }, { status: 400 })
  const kind = img && img !== '.gif' ? 'image' : 'video'
  if (kind === 'image' && buffer.length > MAX_IMAGE) return NextResponse.json({ error: 'Photo 10 MB se bari hai' }, { status: 400 })

  const filename = `fault-${localStamp()}-${randomBytes(8).toString('hex')}${ext}`
  const dir = path.join(process.cwd(), 'public', 'uploads', 'faults')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, filename), buffer)
  return NextResponse.json({ url: `/uploads/faults/${filename}`, kind })
}
