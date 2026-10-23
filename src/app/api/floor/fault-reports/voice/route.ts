import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { faultUser } from '@/server/floor/faultAccess'
import { transcribeFault, voiceEnabled } from '@/server/floor/faultVoice'

export const runtime = 'nodejs'
export const maxDuration = 120

/** WAV made in the browser, up to ~2 minutes (16 kHz mono ≈ 4 MB). */
const MAX_BYTES = 6 * 1024 * 1024

const isWav = (b: Buffer) => b.length > 44 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WAVE'

/** Voice note → Roman Urdu text (not saved; it goes into the note box to check / edit). */
export async function POST(request: NextRequest) {
  const check = await faultUser(request, 'CREATE')
  if (check.error) return check.error
  if (!voiceEnabled()) return NextResponse.json({ error: 'Awaz se likhna abhi on nahi (server par Gemini key nahi).' }, { status: 503 })
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Awaz nahi pahunchi' }, { status: 400 })
  }
  const file = form.get('file')
  if (!file || !(file instanceof File) || file.size <= 0 || file.size > MAX_BYTES)
    return NextResponse.json({ error: 'Awaz 2 minute se choti honi chahiye' }, { status: 400 })
  const buffer = Buffer.from(await file.arrayBuffer())
  if (!isWav(buffer)) return NextResponse.json({ error: 'Awaz ka format ghalat' }, { status: 400 })
  try {
    const text = await transcribeFault(buffer, 'audio/wav')
    if (!text) return NextResponse.json({ error: 'Awaz saaf samajh nahi aayi — dobara bolein ya likh dein.' }, { status: 422 })
    return NextResponse.json({ text })
  } catch (e) {
    const status = (e as { status?: number }).status || 0
    console.error('[fault-voice]', status, e instanceof Error ? e.message : e)
    const message =
      status === 401 || status === 403
        ? 'Server ki Gemini key ghalat hai.'
        : status === 429
          ? 'Gemini ki aaj ki hadd poori. Likh kar bhejein.'
          : 'Awaz se likhna abhi nahi hua — likh kar bhejein.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
