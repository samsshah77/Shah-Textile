import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = process.env.JWT_SECRET || 'sara_textile_super_secure_jwt_secret_key_2026'
const secretKey = new TextEncoder().encode(JWT_SECRET)

// Public routes that unauthenticated users can access
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/roles',
]

async function handleAuthRouting(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 1. Allow Next.js internals, static files, and icons
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp)$/)
  ) {
    return NextResponse.next()
  }

  // 2. Check if the current route is public
  const isPublicRoute = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'))

  // 3. Extract auth cookie
  const token = req.cookies.get('sara_auth_token')?.value

  let userPayload: any = null
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secretKey)
      userPayload = payload
    } catch {
      userPayload = null
    }
  }

  // 4. If unauthenticated and trying to access a protected page -> Redirect to /login
  if (!userPayload && !isPublicRoute) {
    const loginUrl = new URL('/login', req.url)
    if (pathname !== '/login') {
      loginUrl.searchParams.set('redirect', pathname)
    }
    return NextResponse.redirect(loginUrl)
  }

  // 5. If already authenticated and trying to access /login -> Redirect to production workspace
  if (userPayload && pathname === '/login') {
    return NextResponse.redirect(new URL('/floor/production', req.url))
  }

  // 6. Role-Based Access Control (RBAC) Route Guards
  if (userPayload) {
    // Quality Controller is blocked from Accounts & Payroll
    if (
      userPayload.role === 'quality_controller' &&
      (pathname.startsWith('/accounts') || pathname.startsWith('/payroll'))
    ) {
      return NextResponse.redirect(new URL('/floor/production', req.url))
    }
  }

  return NextResponse.next()
}

export async function middleware(req: NextRequest) {
  return handleAuthRouting(req)
}

export async function proxy(req: NextRequest) {
  return handleAuthRouting(req)
}

export default async function defaultHandler(req: NextRequest) {
  return handleAuthRouting(req)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
