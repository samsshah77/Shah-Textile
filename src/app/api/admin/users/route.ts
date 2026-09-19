import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { UserStatus } from '@prisma/client'
import { jsonError, readJson, validationError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/server/permissions'

export const runtime = 'nodejs'

function mapUser(u: {
  id: string
  name: string
  email: string
  roleKey: string
  department: string | null
  status: UserStatus
  isActive: boolean
  approvedAt: Date | null
  approvedBy: string | null
  createdAt: Date
  role?: { label: string; department: string | null } | null
}) {
  return {
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
  }
}

export async function GET(request: NextRequest) {
  const admin = await requirePermission(request, {
    moduleKey: 'admin',
    resourceKey: 'users',
    action: 'VIEW',
  })
  if (!admin) return jsonError('Forbidden', 403, 'FORBIDDEN')

  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status') as UserStatus | null
  const whereClause =
    statusFilter && ['PENDING', 'APPROVED', 'REJECTED'].includes(statusFilter)
      ? { status: statusFilter }
      : {}

  const users = await prisma.user.findMany({
    where: whereClause,
    include: { role: true },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
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
    users: users.map(mapUser),
  })
}

const strongPassword = z
  .string()
  .min(12)
  .max(256)
  .regex(/[a-z]/, 'Must include a lowercase letter')
  .regex(/[A-Z]/, 'Must include an uppercase letter')
  .regex(/[0-9]/, 'Must include a number')
  .regex(/[^A-Za-z0-9]/, 'Must include a symbol')

const updateSchema = z
  .object({
    userId: z.string().min(1),
    status: z.enum(['APPROVED', 'REJECTED']).optional(),
    action: z.enum(['APPROVE', 'REJECT', 'UPDATE']).optional(),
    name: z.string().trim().min(2).max(100).optional(),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase())
      .optional(),
    role: z.string().trim().min(1).max(64).optional(),
    roleKey: z.string().trim().min(1).max(64).optional(),
    password: strongPassword.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.status ||
      value.action ||
      value.name ||
      value.email ||
      value.role ||
      value.roleKey ||
      value.password ||
      value.isActive !== undefined,
    { message: 'At least one user field is required' }
  )

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: strongPassword,
  role: z.string().trim().min(1).max(64),
})

export async function POST(request: NextRequest) {
  const admin = await requirePermission(request, {
    moduleKey: 'admin',
    resourceKey: 'users',
    action: 'CREATE',
  })
  if (!admin) return jsonError('Forbidden', 403, 'FORBIDDEN')
  const parsed = createSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)
  const roleKey = parsed.data.role.toLowerCase()
  const role = await prisma.role.findUnique({
    where: { key: roleKey },
    select: { id: true, key: true, department: true },
  })
  if (!role) return jsonError('Role not found', 400, 'ROLE_NOT_FOUND')

  try {
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash: await hash(parsed.data.password, 12),
        roleKey: role.key,
        roleId: role.id,
        department: role.department,
        status: 'APPROVED',
        isActive: true,
        approvedAt: new Date(),
        approvedBy: admin.id,
      },
      include: { role: true },
    })
    return NextResponse.json({ success: true, user: mapUser(user) }, { status: 201 })
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      return jsonError('An account with this email already exists', 409, 'EMAIL_EXISTS')
    }
    throw error
  }
}

export async function PATCH(request: NextRequest) {
  const body = await readJson(request)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  const nextStatus =
    parsed.data.status ||
    (parsed.data.action === 'APPROVE'
      ? 'APPROVED'
      : parsed.data.action === 'REJECT'
        ? 'REJECTED'
        : undefined)

  const admin = await requirePermission(request, {
    moduleKey: 'admin',
    resourceKey: 'users',
    action: nextStatus ? 'APPROVE' : 'UPDATE',
  })
  if (!admin) return jsonError('Forbidden', 403, 'FORBIDDEN')

  const existing = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, roleKey: true },
  })
  if (!existing) return jsonError('User not found', 404, 'USER_NOT_FOUND')

  const nextRole = (parsed.data.role || parsed.data.roleKey)?.toLowerCase()
  if (
    parsed.data.userId === admin.id &&
    (nextStatus === 'REJECTED' ||
      parsed.data.isActive === false ||
      (nextRole && nextRole !== 'admin'))
  ) {
    return jsonError('You cannot remove your own administrator access', 400, 'SELF_PROTECTION')
  }

  const data: Record<string, unknown> = {}
  if (nextStatus) {
    const approved = nextStatus === 'APPROVED'
    data.status = nextStatus
    data.approvedAt = approved ? new Date() : null
    data.approvedBy = approved ? admin.id : null
    if (approved) data.isActive = true
  }
  if (parsed.data.name !== undefined) data.name = parsed.data.name
  if (parsed.data.email !== undefined) data.email = parsed.data.email
  if (parsed.data.password !== undefined) data.passwordHash = await hash(parsed.data.password, 12)
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive
  if (nextRole) {
    const role = await prisma.role.findUnique({
      where: { key: nextRole },
      select: { id: true, key: true, department: true },
    })
    if (!role) return jsonError('Role not found', 400, 'ROLE_NOT_FOUND')
    data.roleId = role.id
    data.roleKey = role.key
    data.department = role.department
  }

  try {
    const user = await prisma.user.update({
      where: { id: parsed.data.userId },
      data,
      include: { role: true },
    })
    return NextResponse.json({ success: true, user: mapUser(user) })
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      return jsonError('An account with this email already exists', 409, 'EMAIL_EXISTS')
    }
    throw error
  }
}
