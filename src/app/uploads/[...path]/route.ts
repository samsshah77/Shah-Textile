import { readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }

/**
 * Serves pictures uploaded after the app started (public/uploads/…). Next.js serves only the
 * files that existed at build time; on the live server the web server usually serves this
 * folder itself, and this route is the fallback. Only picture files inside public/uploads.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const parts = (await ctx.params).path || []
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^[\w.-]{1,160}$/.test(p) || p.startsWith('.'))) {
    return new NextResponse('Not found', { status: 404 })
  }
  const type = TYPES[path.extname(parts[parts.length - 1]).toLowerCase()]
  if (!type) return new NextResponse('Not found', { status: 404 })
  const root = path.join(process.cwd(), 'public', 'uploads')
  const file = path.join(root, ...parts)
  if (!file.startsWith(root + path.sep)) return new NextResponse('Not found', { status: 404 })
  try {
    const body = await readFile(file)
    return new NextResponse(new Uint8Array(body), {
      headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
