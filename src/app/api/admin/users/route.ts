import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/jwt'
import { UserStatus } from '@prisma/client'

// Helper to authenticate Admin
async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('sara_auth_token')?.value
  if (!token) return null

  const payload = await verifyToken(token)
  if (!payload || payload.role !== 'admin') return null
  return payload
}

// GET /api/admin/users: List users with counts
export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Admin authorization required.' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const statusFilter = searchParams.get('status') as UserStatus | null

    const whereClause: any = {}
    if (statusFilter && ['PENDING', 'APPROVED', 'REJECTED'].includes(statusFilter)) {
      whereClause.status = statusFilter
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      include: { role: true },
      orderBy: [
        { status: 'asc' }, // PENDING first
        { createdAt: 'desc' },
      ],
    })

    const counts = {
      all: await prisma.user.count(),
      pending: await prisma.user.count({ where: { status: 'PENDING' } }),
      approved: await prisma.user.count({ where: { status: 'APPROVED' } }),
      rejected: await prisma.user.count({ where: { status: 'REJECTED' } }),
    }

    return NextResponse.json({
      success: true,
      counts,
      users: users.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        roleKey: u.roleKey,
        roleLabel: u.role?.label || u.roleKey,
        department: u.department || u.role?.department || 'Sara Textile',
        status: u.status,
        isActive: u.isActive,
        approvedAt: u.approvedAt,
        approvedBy: u.approvedBy,
        createdAt: u.createdAt,
      })),
    })
  } catch (error: any) {
    console.error('Admin users fetch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// PATCH /api/admin/users: Approve, reject, or update user
export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Admin authorization required.' }, { status: 403 })
    }

    const body = await req.json()
    const { userId, action, roleKey, isActive } = body

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 })
    }

    const targetUser = await prisma.user.findUnique({ where: { id: userId } })
    if (!targetUser) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    // Protect main admin account from accidental deactivation/rejection
    if (targetUser.email === 'javed@saratextile.com' && (action === 'REJECT' || isActive === false)) {
      return NextResponse.json(
        { success: false, error: 'Main Admin (Javed Sir) account cannot be rejected or deactivated.' },
        { status: 400 }
      )
    }

    const updateData: any = {}

    if (action === 'APPROVE') {
      updateData.status = UserStatus.APPROVED
      updateData.isActive = true
      updateData.approvedAt = new Date()
      updateData.approvedBy = admin.name
    } else if (action === 'REJECT') {
      updateData.status = UserStatus.REJECTED
      updateData.isActive = false
    }

    if (typeof isActive === 'boolean') {
      updateData.isActive = isActive
    }

    if (roleKey) {
      const roleRecord = await prisma.role.findUnique({ where: { key: roleKey } })
      if (roleRecord) {
        updateData.roleKey = roleKey
        updateData.roleId = roleRecord.id
        updateData.department = roleRecord.department || targetUser.department
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: { role: true },
    })

    return NextResponse.json({
      success: true,
      message: `User "${updatedUser.name}" successfully updated (${updatedUser.status}).`,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        roleKey: updatedUser.roleKey,
        roleLabel: updatedUser.role?.label || updatedUser.roleKey,
        status: updatedUser.status,
        isActive: updatedUser.isActive,
      },
    })
  } catch (error: any) {
    console.error('Admin user update error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
