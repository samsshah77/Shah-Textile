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
  if (!voiceEnabled()) return NextResponse.json({ error: 'Voice typing is not enabled (no Groq or Gemini key on the server).' }, { status: 503 })
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'No audio received' }, { status: 400 })
  }
  const file = form.get('file')
  if (!file || !(file instanceof File) || file.size <= 0 || file.size > MAX_BYTES)
    return NextResponse.json({ error: 'Audio must be shorter than 2 minutes' }, { status: 400 })
  const buffer = Buffer.from(await file.arrayBuffer())
  if (!isWav(buffer)) return NextResponse.json({ error: 'Invalid audio format' }, { status: 400 })
  try {
    const text = await transcribeFault(buffer, 'audio/wav')
    if (!text) return NextResponse.json({ error: 'Could not understand the audio. Please speak again or type it.' }, { status: 422 })
    return NextResponse.json({ text })
  } catch (e) {
    const status = (e as { status?: number }).status || 0
    console.error('[fault-voice]', status, e instanceof Error ? e.message : e)
    const message =
      status === 401 || status === 403
        ? 'The server AI key (Groq / Gemini) is invalid.'
        : status === 429
          ? 'AI service limit / quota reached. Please type the fault instead.'
          : 'Voice typing failed. Please type the fault instead.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
