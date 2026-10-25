/**
 * Spoken fault note (Urdu / Punjabi / English) → Roman Urdu text, with Gemini (it hears
 * audio directly). Only when GEMINI_API_KEY is set on the server; otherwise the 🎤 button
 * is hidden and the note is typed.
 */

export const voiceEnabled = () => Boolean(process.env.GROQ_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim())

export const VOICE_PROMPT = `You are listening to a short voice note from a weaving mill (Sara Textile) floor inspector
about a fabric fault on one loom. Write what was said in Roman Urdu (Urdu in English letters, the way
people type on WhatsApp in Pakistan), e.g. "dono taraf kinare tight chale hain, 2 jagah double pick".
Rules: keep weaving words as said (double pick, crack, jaala, kinara, taar, thaan, shot, reed, beam).
Write numbers as digits. Do not add anything that was not said. If nothing clear was said, return "".
Return only JSON: {"text": "..."}`

/**
 * Ultra-fast Whisper on Groq (< 0.5s).
 * If the transcript contains Urdu script, Groq's Llama-3.1-8b-instant converts it to Roman Urdu in ~120ms.
 */
async function askGroq(audio: Buffer, mimeType: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY!.trim()
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), 'voice.wav')
  form.append('model', process.env.GROQ_WHISPER_MODEL?.trim() || 'whisper-large-v3-turbo')
  form.append('response_format', 'json')
  form.append(
    'prompt',
    'Pakistani weaving mill (Sara Textile), Roman Urdu: dono taraf kinare tight chale hain, 2 jagah double pick, crack, jaala, kinara, taar, thaan, shot, reed, beam, shift A, shift B'
  )

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  })

  const body = (await res.json().catch(() => null)) as { text?: string; error?: { message?: string } } | null
  if (!res.ok) {
    const err = new Error(body?.error?.message || `Groq ${res.status}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }

  let text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return ''

  // If transcribed in Arabic/Urdu script, quickly Romanize with Groq Llama 3.1 8B in ~120ms
  if (/[\u0600-\u06FF]/.test(text)) {
    try {
      const romRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content:
                'Convert this Urdu text to Roman Urdu (the way people type on WhatsApp in Pakistan). Keep textile terms like double pick, crack, jaala, kinara, taar, thaan, reed, beam intact. Return ONLY the Roman Urdu text, no extra explanations.',
            },
            { role: 'user', content: text },
          ],
          temperature: 0,
        }),
      })
      if (romRes.ok) {
        const romData = (await romRes.json()) as { choices?: Array<{ message?: { content?: string } }> }
        const romanized = romData?.choices?.[0]?.message?.content?.trim()
        if (romanized) text = romanized
      }
    } catch {
      // Keep original transcript if Romanization fetch times out
    }
  }

  return text.slice(0, 2000)
}

async function askGemini(audio: Buffer, mimeType: string): Promise<string> {
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

export async function transcribeFault(audio: Buffer, mimeType: string): Promise<string> {
  if (process.env.GROQ_API_KEY?.trim()) {
    return askGroq(audio, mimeType)
  }
  return askGemini(audio, mimeType)
}

/** Google's API, or a stand-in for tests (GEMINI_BASE_URL). */
function geminiBase() {
  return (process.env.GEMINI_BASE_URL?.trim() || 'https://generativelanguage.googleapis.com').replace(/\/$/, '')
}

