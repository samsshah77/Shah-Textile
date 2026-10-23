/**
 * Register photo → Daily Entry numbers (loom, weight, shift A, shift B).
 *
 * The photo goes to an AI vision model (Claude when ANTHROPIC_API_KEY is set, else Gemini
 * when GEMINI_API_KEY is set). Nothing is saved from here: the rows go back to the browser,
 * a person checks them on the review screen, and only then are they put in the table.
 * Keys stay on the server (Plesk environment) — never in the browser or in git.
 */

export interface ScannedRow {
  loom: number
  weightKg: number | null
  shiftA: number | null
  shiftB: number | null
  /** The register's own total (circled), used only to check A + B. */
  total: number | null
  /** Anything written that is not a plain number (Urdu note, "FP", extra pieces) — in English. */
  note: string
  /** The model was not sure about a digit. */
  unsure: boolean
}

export type ScanProvider = 'claude' | 'gemini'

export function scanProvider(): ScanProvider | null {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return 'claude'
  if (process.env.GEMINI_API_KEY?.trim()) return 'gemini'
  return null
}

export const SCAN_PROMPT = `This is a photo of a handwritten daily production register from a weaving mill (Sara Textile).
Each line is one loom. Typical columns, left to right:
  L = loom number
  M = metres tally (may include extra notes like "23 + 78", "FP", ticks) — ignore for numbers, but copy notes
  W = fabric weight in kg (e.g. 34.50)
  A = shift A metres
  B = shift B metres
  T = total metres (often circled)
Return one entry per written line, top to bottom, using the report_rows tool.
Rules:
- Read digits exactly as written. Never invent a line or a value.
- If a cell has text instead of a number (Urdu or English, e.g. "shift nahi chali"), set that number to null
  and put a short English translation in "note".
- If a digit is unclear, use T (= A + B) to decide when that makes it certain, and set "unsure": true.
- Ticks (✓) are only check marks — ignore them.
- weightKg: number with decimals as written. Missing → null.`

const ROW_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          loom: { type: 'integer', description: 'Loom number (column L)' },
          weightKg: { type: ['number', 'null'], description: 'Column W, kg' },
          shiftA: { type: ['number', 'null'], description: 'Column A, metres' },
          shiftB: { type: ['number', 'null'], description: 'Column B, metres' },
          total: { type: ['number', 'null'], description: 'Column T, metres' },
          note: { type: 'string', description: 'Non-number writing, translated to English; empty if none' },
          unsure: { type: 'boolean', description: 'True if any digit on this line was hard to read' },
        },
        required: ['loom', 'weightKg', 'shiftA', 'shiftB', 'total', 'note', 'unsure'],
      },
    },
  },
  required: ['rows'],
} as const

/** Gemini's schema dialect: upper-case types, "nullable" instead of type arrays. */
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    rows: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          loom: { type: 'INTEGER' },
          weightKg: { type: 'NUMBER', nullable: true },
          shiftA: { type: 'NUMBER', nullable: true },
          shiftB: { type: 'NUMBER', nullable: true },
          total: { type: 'NUMBER', nullable: true },
          note: { type: 'STRING' },
          unsure: { type: 'BOOLEAN' },
        },
        required: ['loom', 'weightKg', 'shiftA', 'shiftB', 'total', 'note', 'unsure'],
      },
    },
  },
  required: ['rows'],
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

/** Whatever the model sent → clean rows (bad lines dropped, numbers checked). */
export function normalizeScan(raw: unknown): ScannedRow[] {
  const list = (raw as { rows?: unknown })?.rows
  if (!Array.isArray(list)) return []
  const out: ScannedRow[] = []
  for (const r of list as Array<Record<string, unknown>>) {
    const loom = num(r?.loom)
    if (loom === null || !Number.isInteger(loom) || loom <= 0 || loom > 999) continue
    const row: ScannedRow = {
      loom,
      weightKg: num(r.weightKg),
      shiftA: num(r.shiftA),
      shiftB: num(r.shiftB),
      total: num(r.total),
      note: typeof r.note === 'string' ? r.note.trim().slice(0, 200) : '',
      unsure: r.unsure === true,
    }
    // Metres per shift / kg beyond any loom's day are misreads.
    if (row.shiftA !== null && row.shiftA > 2000) row.shiftA = null
    if (row.shiftB !== null && row.shiftB > 2000) row.shiftB = null
    if (row.weightKg !== null && row.weightKg > 1000) row.weightKg = null
    out.push(row)
  }
  return out
}

const TIMEOUT_MS = 90_000

async function askClaude(base64: string, mediaType: string): Promise<unknown> {
  const base = (process.env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com').replace(/\/$/, '')
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!.trim(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5',
      max_tokens: 4000,
      tools: [{ name: 'report_rows', description: 'Report every register line that was read.', input_schema: ROW_SCHEMA }],
      tool_choice: { type: 'tool', name: 'report_rows' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: SCAN_PROMPT },
          ],
        },
      ],
    }),
  })
  const body = (await res.json().catch(() => null)) as {
    content?: Array<{ type: string; input?: unknown }>
    error?: { message?: string }
  } | null
  if (!res.ok) throw new ScanError(res.status, body?.error?.message || `Claude ${res.status}`)
  const tool = body?.content?.find((c) => c.type === 'tool_use')
  return tool?.input
}

async function askGemini(base64: string, mediaType: string): Promise<unknown> {
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest'
  const res = await fetch(`${geminiBase()}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY!.trim() },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mediaType, data: base64 } }, { text: SCAN_PROMPT }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA, temperature: 0 },
    }),
  })
  const body = (await res.json().catch(() => null)) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    error?: { message?: string }
  } | null
  if (!res.ok) throw new ScanError(res.status, body?.error?.message || `Gemini ${res.status}`)
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export class ScanError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

export async function scanRegister(image: Buffer, mediaType: string): Promise<{ provider: ScanProvider; rows: ScannedRow[] }> {
  const provider = scanProvider()
  if (!provider) throw new ScanError(503, 'not-configured')
  const base64 = image.toString('base64')
  const raw = provider === 'claude' ? await askClaude(base64, mediaType) : await askGemini(base64, mediaType)
  return { provider, rows: normalizeScan(raw) }
}

/** Google's API, or a stand-in for tests (GEMINI_BASE_URL). */
function geminiBase() {
  return (process.env.GEMINI_BASE_URL?.trim() || 'https://generativelanguage.googleapis.com').replace(/\/$/, '')
}
