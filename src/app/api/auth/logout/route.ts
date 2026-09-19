import { NextResponse } from 'next/server'
import { expiredSessionCookie } from '@/lib/session'

function clearSession() {
  const response = NextResponse.json({ ok: true, success: true })
  response.cookies.set(expiredSessionCookie())
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function POST() {
  return clearSession()
}

/** Kept for Header / legacy clients that still issue GET logout. */
export async function GET() {
  return clearSession()
}
