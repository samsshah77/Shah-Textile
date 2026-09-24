import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session'

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/forbidden',
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/seed',
  '/api/roles',
  '/api/floor/store',
  '/api/floor/seed-sheet',
  '/api/payroll/store',
  '/api/db/ensure-floor',
]

async function handleAuthRouting(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp)$/)
  ) {
    return NextResponse.next()
  }

  const isPublicRoute = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + '/')
  )

  if (req.nextUrl.searchParams.get('logout') === 'true') {
    const cleanUrl = req.nextUrl.clone()
    cleanUrl.searchParams.delete('logout')
    const res = NextResponse.redirect(cleanUrl)
    res.cookies.set(SESSION_COOKIE, '', {
      path: '/',
      maxAge: 0,
      expires: new Date(0),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
    res.cookies.delete(SESSION_COOKIE)
    return res
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value
  const claims = token ? await verifySession(token) : null

  if (!claims && !isPublicRoute) {
    const loginUrl = new URL('/login', req.url)
    if (pathname !== '/login') {
      loginUrl.searchParams.set('redirect', pathname)
    }
    return NextResponse.redirect(loginUrl)
  }

  if (claims && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
}

export async function proxy(req: NextRequest) {
  return handleAuthRouting(req)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
