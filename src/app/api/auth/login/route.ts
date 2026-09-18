import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken } from '@/lib/jwt'
import { UserRole } from '@/types/auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required.' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()

    // 1. Query user from PostgreSQL with related Role (auto-seed if table is new)
    let dbUser: any = null
    try {
      dbUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: { role: true },
      })
    } catch (dbErr: any) {
      console.log('Encountered DB query issue, auto-initializing database tables...', dbErr.message)
      const { ensureDatabaseSeeded } = await import('@/app/api/auth/seed/route')
      await ensureDatabaseSeeded()
      
      dbUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: { role: true },
      })
    }

    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: 'User with this email was not found. Please check your credentials or register.' },
        { status: 401 }
      )
    }

    // 2. Check Admin Approval Status Gate
    if (dbUser.status === 'PENDING') {
      return NextResponse.json(
        {
          success: false,
          error:
            'Your account is currently pending approval by Main Admin (Javed Sir). You will be able to log in as soon as it is approved.',
        },
        { status: 403 }
      )
    }

    if (dbUser.status === 'REJECTED') {
      return NextResponse.json(
        {
          success: false,
          error: 'Your account registration was rejected. Please contact Javed Sir (Main Admin) for assistance.',
        },
        { status: 403 }
      )
    }

    if (!dbUser.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: 'This account has been deactivated by administration.',
        },
        { status: 403 }
      )
    }

    // 3. Verify password hash with bcrypt
    const isPasswordValid = await bcrypt.compare(password, dbUser.passwordHash)

    if (!isPasswordValid) {
      return NextResponse.json(
        { success: false, error: 'Incorrect password. Please verify your mill credentials.' },
        { status: 401 }
      )
    }

    // 4. Resolve role info
    const roleKey = dbUser.roleKey || dbUser.role?.key || 'accountant'
    const roleLabel = dbUser.role?.label || roleKey.replace(/_/g, ' ').toUpperCase()

    // 5. Generate JWT Token
    const payload = {
      userId: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: roleKey as UserRole,
      roleLabel,
      department: dbUser.department || dbUser.role?.department || 'Sara Textile',
    }

    const token = await signToken(payload)

    // 6. Response with HTTP-Only Cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: roleKey,
        roleLabel,
        department: dbUser.department || 'Sara Textile',
      },
    })

    response.cookies.set('sara_auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error during authentication.' },
      { status: 500 }
    )
  }
}
