import { randomBytes } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { currentUser } from '@/server/current-user'
import { accessFor } from '@/server/userAccess'
import { allows } from '@/lib/access'
import { sniffImage } from '@/server/imageSniff'
import { uploadDirFor } from '@/server/uploadPaths'

export const runtime = 'nodejs'

const MAX_BYTES = 8 * 1024 * 1024 // 8 MB

/**
 * Where a picture goes and who may upload it:
 *  - loom    → /uploads/looms     (production editors)
 *  - profile → /uploads/profiles  (salary editor: Tufail)   — private, see uploadPaths.ts
 *  - bill    → /uploads/bills     (accounts editor: Tufail) — private, see uploadPaths.ts
 */
const KINDS = {
  loom: { dir: 'looms', prefix: 'loom' },
  profile: { dir: 'profiles', prefix: 'profile' },
  bill: { dir: 'bills', prefix: 'bill' },
} as const
type Kind = keyof typeof KINDS

async function mayUpload(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>, kind: Kind): Promise<boolean> {
  const { access } = await accessFor(user)
  if (kind === 'loom') return allows(access, 'prod_looms', 'edit')
  if (kind === 'profile') return allows(access, 'payroll', 'edit')
  return allows(access, 'accounts', 'edit')
}

/** Same-origin upload — looms under public/uploads, bills / profiles under private-uploads. */
export async function POST(request: NextRequest) {
  const user = await currentUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const kindParam = request.nextUrl.searchParams.get('kind') || 'loom'
  if (!(kindParam in KINDS)) return NextResponse.json({ error: 'Unknown upload kind' }, { status: 400 })
  const kind = kindParam as Kind
  if (!(await mayUpload(user, kind))) return NextResponse.json({ error: 'Is cheez ki tasveer lagane ki ijazat nahi.' }, { status: 403 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }
  const file = form.get('file')
  if (!file || !(file instanceof File)) return NextResponse.json({ error: 'Missing file field' }, { status: 400 })
  if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be between 1 byte and 8 MB' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = sniffImage(buffer)
  if (!ext) return NextResponse.json({ error: 'Sirf JPG, PNG, WEBP ya GIF tasveer lag sakti hai.' }, { status: 400 })

  const { dir, prefix } = KINDS[kind]
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const filename = `${prefix}-${stamp}-${randomBytes(8).toString('hex')}${ext}`
  const uploadsDir = uploadDirFor(dir)
  await mkdir(uploadsDir, { recursive: true })
  await writeFile(path.join(uploadsDir, filename), buffer)

  const url = `/uploads/${dir}/${filename}`
  return NextResponse.json({ url, data: url })
}
