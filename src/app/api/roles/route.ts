import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { jsonError, readJson, validationError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/server/permissions'

export const runtime = 'nodejs'

/** Public signup role list + admin-compatible full list. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const signupOnly = searchParams.get('signup') === '1'

  if (signupOnly) {
    const roles = await prisma.role.findMany({
      where: { canSignup: true, NOT: { key: 'admin' } },
      select: {
        id: true,
        key: true,
        label: true,
        department: true,
        description: true,
        canSignup: true,
      },
      orderBy: { label: 'asc' },
    })
    return NextResponse.json({ success: true, roles })
  }

  // Prefer permission-gated full list for admin UI; fall back to signup roles.
  const admin = await requirePermission(request, {
    moduleKey: 'admin',
    resourceKey: 'roles',
    action: 'VIEW',
  })

  const roles = await prisma.role.findMany({
    where: admin ? undefined : { canSignup: true, NOT: { key: 'admin' } },
    select: {
      id: true,
      key: true,
      label: true,
      department: true,
      description: true,
      canSignup: true,
    },
    orderBy: { label: 'asc' },
  })
  return NextResponse.json({ success: true, roles })
}

const createRoleSchema = z.object({
  label: z.string().trim().min(2).max(80),
  department: z.string().trim().max(80).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  canSignup: z.boolean().optional(),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, numbers, and underscores')
    .optional(),
})

export async function POST(request: NextRequest) {
  const admin = await requirePermission(request, {
    moduleKey: 'admin',
    resourceKey: 'roles',
    action: 'MANAGE',
  })
  if (!admin) return jsonError('Forbidden', 403, 'FORBIDDEN')

  const parsed = createRoleSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)

  const label = parsed.data.label
  const key =
    parsed.data.key ||
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')

  try {
    const role = await prisma.role.create({
      data: {
        key,
        label,
        department: parsed.data.department || null,
        description: parsed.data.description || null,
        canSignup: parsed.data.canSignup ?? true,
      },
    })
    return NextResponse.json({ success: true, role }, { status: 201 })
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      return jsonError('That role key already exists', 409, 'ROLE_EXISTS')
    }
    throw error
  }
}
