/**
 * Default: same-origin Next API on your Hostinger VPS.
 * Optional override: NEXT_PUBLIC_UPLOAD_URL (e.g. external CDN).
 */
export const DEFAULT_UPLOAD_URL = '/api/upload'

export function getUploadUrl(): string {
  const fromEnv =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_UPLOAD_URL?.trim()
      : undefined
  return fromEnv || DEFAULT_UPLOAD_URL
}

/** Keep absolute URLs; leave relative (/uploads/...) as-is for same-origin. */
function normalizeMediaUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  if (trimmed.startsWith('/')) return trimmed
  return `/${trimmed.replace(/^\//, '')}`
}

function extractUploadedUrl(body: unknown): string | null {
  if (!body) return null
  if (typeof body === 'string') return normalizeMediaUrl(body)
  if (Array.isArray(body) && typeof body[0] === 'string') return normalizeMediaUrl(body[0])
  if (typeof body !== 'object') return null

  const obj = body as Record<string, unknown>

  if (typeof obj.data === 'string') return normalizeMediaUrl(obj.data)
  if (Array.isArray(obj.data) && typeof obj.data[0] === 'string') {
    return normalizeMediaUrl(obj.data[0])
  }
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    const data = obj.data as Record<string, unknown>
    if (typeof data.url === 'string') return normalizeMediaUrl(data.url)
    if (typeof data.fileUrl === 'string') return normalizeMediaUrl(data.fileUrl)
  }
  if (typeof obj.url === 'string') return normalizeMediaUrl(obj.url)
  if (typeof obj.fileUrl === 'string') return normalizeMediaUrl(obj.fileUrl)
  return null
}

function parseUploadResponseBody(raw: string): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw.startsWith('http') || raw.startsWith('/') ? raw : null
  }
}

export type UploadKind = 'loom' | 'profile' | 'bill'

const MAX_SIDE = 1600
const TARGET_BYTES = 450 * 1024

/**
 * Phone photos are 3–8 MB. Before upload the picture is made smaller in the browser
 * (longest side 1600 px, JPEG ~80%), so pages with many pictures stay fast. GIFs and
 * pictures that are already small are sent as they are; if shrinking fails, the original goes.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (typeof window === 'undefined' || !/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size <= TARGET_BYTES) {
      bitmap.close?.()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

/**
 * Upload an image file via multipart FormData field `"file"`.
 * `kind` decides the folder and who may upload (looms: production, profile / bill: accounts).
 * @returns Public URL path (e.g. `/uploads/looms/...`) or absolute URL
 */
export async function uploadImageFile(original: File, kind: UploadKind = 'loom'): Promise<string> {
  const file = await shrinkImage(original)
  const form = new FormData()
  form.append('file', file)

  const base = getUploadUrl()
  const res = await fetch(base === DEFAULT_UPLOAD_URL ? `${base}?kind=${kind}` : base, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: form,
    credentials: 'same-origin',
  })

  const rawText = await res.text()
  const body = parseUploadResponseBody(rawText)
  const url = extractUploadedUrl(body)

  if (res.ok && url) return url

  let message = `Upload failed (HTTP ${res.status}).`
  if (body && typeof body === 'object') {
    const rec = body as Record<string, unknown>
    const raw = rec.message ?? rec.error
    if (typeof raw === 'string' && raw.trim()) message = raw.trim()
    else if (raw != null && String(raw).trim()) message = String(raw).trim()
  } else if (typeof body === 'string' && body.trim()) {
    message = body.trim()
  }

  throw new Error(message)
}
