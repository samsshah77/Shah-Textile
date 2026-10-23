import { createReadStream } from 'fs'
import { readFile, stat } from 'fs/promises'
import path from 'path'
import { Readable } from 'stream'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }
/** Fault-report videos — streamed in parts (Range), so phones can play and seek without loading it all. */
const VIDEO_TYPES: Record<string, string> = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' }

/**
 * Serves pictures uploaded after the app started (public/uploads/…). Next.js serves only the
 * files that existed at build time; on the live server the web server usually serves this
 * folder itself, and this route is the fallback. Only picture files inside public/uploads.
 */
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const parts = (await ctx.params).path || []
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^[\w.-]{1,160}$/.test(p) || p.startsWith('.'))) {
    return new NextResponse('Not found', { status: 404 })
  }
  const ext = path.extname(parts[parts.length - 1]).toLowerCase()
  const videoType = parts[0] === 'faults' ? VIDEO_TYPES[ext] : undefined
  const type = TYPES[ext] || videoType
  if (!type) return new NextResponse('Not found', { status: 404 })
  const root = path.join(process.cwd(), 'public', 'uploads')
  const file = path.join(root, ...parts)
  if (!file.startsWith(root + path.sep)) return new NextResponse('Not found', { status: 404 })
  if (videoType) return serveVideo(req, file, videoType)
  try {
    const body = await readFile(file)
    return new NextResponse(new Uint8Array(body), {
      headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}

async function serveVideo(req: Request, file: string, type: string) {
  let size: number
  try {
    size = (await stat(file)).size
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '')
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
    let end = m[1] && m[2] ? Number(m[2]) : size - 1
    end = Math.min(end, size - 1)
    if (start > end || start >= size) {
      return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    }
    start = Math.max(0, start)
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream
    return new NextResponse(stream, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    })
  }
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream
  return new NextResponse(stream, { headers: { ...headers, 'Content-Length': String(size) } })
}
