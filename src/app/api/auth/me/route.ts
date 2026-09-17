import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('sara_auth_token')?.value

    if (!token) {
      return NextResponse.json({ authenticated: false, user: null })
    }

    const payload = await verifyToken(token)

    if (!payload) {
      return NextResponse.json({ authenticated: false, user: null })
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: payload.userId,
        name: payload.name,
        email: payload.email,
        role: payload.role,
        roleLabel: payload.roleLabel,
        department: payload.department,
      },
    })
  } catch (error) {
    return NextResponse.json({ authenticated: false, user: null })
  }
}
