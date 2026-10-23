import { randomBytes } from 'crypto'
import { mkdir, readdir, writeFile } from 'fs/promises'
import path from 'path'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { currentUser } from '@/server/current-user'
import { hasPermission } from '@/server/permissions'
import { sniffImage } from '@/server/imageSniff'
import { ScanError, scanProvider, scanRegister } from '@/server/floor/registerScan'

export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_BYTES = 8 * 1024 * 1024
/** Photos a day — keeps the AI bill small even if someone uploads again and again. */
const DAILY_LIMIT = 20
const DIR = path.join(process.cwd(), 'public', 'uploads', 'registers')
const MEDIA: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }

async function mayScan(request: NextRequest) {
  const user = await currentUser(request)
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const ok = await hasPermission(user.id, { moduleKey: 'floor', resourceKey: 'production_entries', action: 'UPDATE' })
  if (!ok) return { error: NextResponse.json({ error: 'Daily Entry badalne ki ijazat nahi.' }, { status: 403 }) }
  return { user }
}

const todayStamp = () => {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

async function usedToday(): Promise<number> {
  const stamp = todayStamp()
  const files = await readdir(DIR).catch(() => [] as string[])
  return files.filter((f) => f.startsWith(`register-${stamp}-`)).length
}

/** Is the photo reader switched on (a key is set on the server)? */
export async function GET(request: NextRequest) {
  const check = await mayScan(request)
  if (check.error) return check.error
  const provider = scanProvider()
  return NextResponse.json({ enabled: Boolean(provider), provider, usedToday: await usedToday(), dailyLimit: DAILY_LIMIT })
}

/** Register photo → rows for the review screen. Saves the photo (for audit), not the numbers. */
export async function POST(request: NextRequest) {
  const check = await mayScan(request)
  if (check.error) return check.error
  if (!scanProvider()) return NextResponse.json({ error: 'Photo se entry abhi on nahi hai (server par key nahi).' }, { status: 503 })
  if ((await usedToday()) >= DAILY_LIMIT)
    return NextResponse.json({ error: `Aaj ki hadd (${DAILY_LIMIT} photos) poori ho gayi. Manual entry karein.` }, { status: 429 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }
  const file = form.get('file')
  if (!file || !(file instanceof File)) return NextResponse.json({ error: 'Photo nahi mili' }, { status: 400 })
  if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: 'Photo 8 MB se choti honi chahiye' }, { status: 400 })
  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = sniffImage(buffer)
  if (!ext || ext === '.gif') return NextResponse.json({ error: 'Sirf JPG, PNG ya WEBP photo.' }, { status: 400 })

  const filename = `register-${todayStamp()}-${randomBytes(6).toString('hex')}${ext}`
  await mkdir(DIR, { recursive: true })
  await writeFile(path.join(DIR, filename), buffer)
  const url = `/uploads/registers/${filename}`

  try {
    const { provider, rows } = await scanRegister(buffer, MEDIA[ext])
    if (rows.length === 0) return NextResponse.json({ error: 'Photo mein koi line nahi parhi gayi. Saaf photo lein ya manual entry karein.', url }, { status: 422 })
    return NextResponse.json({ provider, rows, url })
  } catch (e) {
    const status = e instanceof ScanError ? e.status : 0
    const message =
      status === 401 || status === 403
        ? 'Server ki AI key ghalat hai ya band hai.'
        : status === 429
          ? 'AI service ki hadd / credit khatam. Manual entry karein.'
          : 'Photo nahi parhi gayi (AI service se jawab nahi aaya). Manual entry karein.'
    console.error('[register-scan]', status, e instanceof Error ? e.message : e)
    return NextResponse.json({ error: message, url }, { status: 502 })
  }
}
