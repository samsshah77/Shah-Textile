import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { UserStatus } from '@prisma/client'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, password, roleKey } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: 'Full name is required.' }, { status: 400 })
    }

    if (!email || !email.trim() || !email.includes('@')) {
      return NextResponse.json({ success: false, error: 'A valid email address is required.' }, { status: 400 })
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      )
    }

    if (!roleKey) {
      return NextResponse.json({ success: false, error: 'Please select a role for your account.' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // 1. Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (existingUser) {
      if (existingUser.status === 'PENDING') {
        return NextResponse.json(
          {
            success: false,
            error: 'An account with this email is already registered and waiting for Admin approval.',
          },
          { status: 400 }
        )
      }
      return NextResponse.json(
        {
          success: false,
          error: 'An account with this email already exists. Please sign in instead.',
        },
        { status: 400 }
      )
    }

    // 2. Fetch role information
    const roleRecord = await prisma.role.findUnique({
      where: { key: roleKey },
    })

    const roleId = roleRecord ? roleRecord.id : null
    const department = roleRecord?.department || 'Sara Textile Mill'
    const roleLabel = roleRecord?.label || roleKey

    // 3. Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // 4. Create new user with PENDING status
    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        roleKey: roleKey,
        roleId,
        department,
        status: UserStatus.PENDING,
        isActive: true,
      },
    })

    return NextResponse.json({
      success: true,
      status: 'PENDING',
      message: `Registration submitted successfully! Your account for "${roleLabel}" is currently pending approval from Main Admin (Javed Sir). You will be able to sign in once approved.`,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.roleKey,
        roleLabel,
        department: newUser.department,
        status: newUser.status,
      },
    })
  } catch (error: any) {
    console.error('Signup error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'An error occurred during account registration.' },
      { status: 500 }
    )
  }
}
