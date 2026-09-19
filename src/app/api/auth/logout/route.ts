import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Logged out successfully' })
  response.cookies.set('sara_auth_token', '', {
    path: '/',
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  response.cookies.delete('sara_auth_token')
  return response
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const response = NextResponse.redirect(new URL('/login?logout=true', url.origin))
  response.cookies.set('sara_auth_token', '', {
    path: '/',
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  response.cookies.delete('sara_auth_token')
  return response
}

