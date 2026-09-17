import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/jwt'

// GET /api/roles: List all roles available for signup or admin
export async function GET(req: NextRequest) {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      success: true,
      roles: roles.map((r: any) => ({
        id: r.id,
        key: r.key,
        label: r.label,
        department: r.department,
        description: r.description,
        canSignup: r.canSignup,
      })),
    })
  } catch (error: any) {
    console.error('Failed to fetch roles:', error)
    return NextResponse.json(
      {
        success: true,
        // Fallback standard roles if DB is initializing
        roles: [
          {
            id: 'role_acc',
            key: 'accountant',
            label: 'Accountant',
            department: 'Accounts & Payroll',
            description: 'Access to manage salaries, invoices, and payroll.',
            canSignup: true,
          },
          {
            id: 'role_qc',
            key: 'quality_controller',
            label: 'Quality Controller',
            department: 'Floor & Quality Control',
            description: 'Access to manage 34 loom production and quality.',
            canSignup: true,
          },
        ],
      },
      { status: 200 }
    )
  }
}

// POST /api/roles: Main Admin can add a new custom role
export async function POST(req: NextRequest) {
  try {
    // 1. Verify admin token
    const token = req.cookies.get('sara_auth_token')?.value
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload || payload.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Only Main Admin (Javed Sir) can create new mill roles.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { label, department, description, canSignup = true } = body

    if (!label || !label.trim()) {
      return NextResponse.json({ success: false, error: 'Role label/title is required.' }, { status: 400 })
    }

    const key = label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')

    // Check if role already exists
    const existing = await prisma.role.findUnique({ where: { key } })
    if (existing) {
      return NextResponse.json(
        { success: false, error: `A role with key "${key}" already exists.` },
        { status: 400 }
      )
    }

    const createdRole = await prisma.role.create({
      data: {
        key,
        label: label.trim(),
        department: department?.trim() || 'Sara Textile General',
        description: description?.trim() || null,
        canSignup: Boolean(canSignup),
      },
    })

    return NextResponse.json({
      success: true,
      role: createdRole,
      message: `Role "${createdRole.label}" added successfully and is now active for signups!`,
    })
  } catch (error: any) {
    console.error('Error creating role:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create role' },
      { status: 500 }
    )
  }
}
