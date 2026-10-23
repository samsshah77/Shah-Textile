/**
 * Spoken fault note (Urdu / Punjabi / English) → Roman Urdu text, with Gemini (it hears
 * audio directly). Only when GEMINI_API_KEY is set on the server; otherwise the 🎤 button
 * is hidden and the note is typed.
 */

export const voiceEnabled = () => Boolean(process.env.GEMINI_API_KEY?.trim())

export const VOICE_PROMPT = `You are listening to a short voice note from a weaving mill (Sara Textile) floor inspector
about a fabric fault on one loom. Write what was said in Roman Urdu (Urdu in English letters, the way
people type on WhatsApp in Pakistan), e.g. "dono taraf kinare tight chale hain, 2 jagah double pick".
Rules: keep weaving words as said (double pick, crack, jaala, kinara, taar, thaan, shot, reed, beam).
Write numbers as digits. Do not add anything that was not said. If nothing clear was said, return "".
Return only JSON: {"text": "..."}`

export async function transcribeFault(audio: Buffer, mimeType: string): Promise<string> {
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest'
  const res = await fetch(`${geminiBase()}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    signal: AbortSignal.timeout(90_000),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY!.trim() },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mimeType, data: audio.toString('base64') } }, { text: VOICE_PROMPT }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] },
        temperature: 0,
      },
    }),
  })
  const body = (await res.json().catch(() => null)) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    error?: { message?: string }
  } | null
  if (!res.ok) {
    const err = new Error(body?.error?.message || `Gemini ${res.status}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  const raw = body?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
  try {
    const parsed = JSON.parse(raw) as { text?: unknown }
    return typeof parsed.text === 'string' ? parsed.text.trim().slice(0, 2000) : ''
  } catch {
    return ''
  }
}

/** Google's API, or a stand-in for tests (GEMINI_BASE_URL). */
function geminiBase() {
  return (process.env.GEMINI_BASE_URL?.trim() || 'https://generativelanguage.googleapis.com').replace(/\/$/, '')
}
