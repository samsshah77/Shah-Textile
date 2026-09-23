import { randomBytes } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { currentUser } from '@/server/current-user'

export const runtime = 'nodejs'

const MAX_BYTES = 8 * 1024 * 1024 // 8 MB
const ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'])

function extFor(mime: string, filename: string): string {
  const fromName = path.extname(filename || '').toLowerCase()
  if (fromName && fromName.length <= 5) return fromName
  if (mime === 'image/png') return '.png'
  if (mime === 'image/webp') return '.webp'
  if (mime === 'image/gif') return '.gif'
  return '.jpg'
}

/** Same-origin upload — saves under public/uploads (Hostinger / own VPS). */
export async function POST(request: NextRequest) {
  const user = await currentUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file field' }, { status: 400 })
  }

  if (!ALLOWED.has(file.type) && !file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
  }

  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be between 1 byte and 8 MB' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const id = randomBytes(8).toString('hex')
  const ext = extFor(file.type, file.name)
  const filename = `loom-${stamp}-${id}${ext}`

  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'looms')
  await mkdir(uploadsDir, { recursive: true })
  await writeFile(path.join(uploadsDir, filename), buffer)

  const url = `/uploads/looms/${filename}`
  return NextResponse.json({ url, data: url })
}
