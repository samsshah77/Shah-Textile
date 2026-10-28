import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdminUser } from '@/server/adminAccess'
import { publicUserSelect } from '@/server/current-user'
import { writeAudit } from '@/server/auditLog'
import { accessForUsers, setAccess } from '@/server/userAccess'
import { AREA_KEYS, type AccessArea } from '@/lib/access'

export const runtime = 'nodejs'

/** Administration → Permissions: every active person with their access per area. Admin only. */
export async function GET(req: NextRequest) {
  const admin = await requireAdminUser(req)
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const users = await prisma.user.findMany({
    where: { isActive: true, status: 'APPROVED' },
    select: publicUserSelect,
    orderBy: { name: 'asc' },
  })
  const rows = await accessForUsers(users)
  const byId = new Map(rows.map((r) => [r.userId, r]))
  return NextResponse.json({
    me: admin.id,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: (u.roleKey || '').toLowerCase(),
      ...byId.get(u.id)!,
    })),
  })
}

const body = z.object({
  userId: z.string().min(1).max(120),
  area: z.enum(AREA_KEYS as [AccessArea, ...AccessArea[]]),
  level: z.enum(['hide', 'view', 'edit']).nullable(),
})

/** One toggle: { userId, area, level } — level null puts it back to the person's old default. */
export async function PUT(req: NextRequest) {
  const admin = await requireAdminUser(req)
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ghalat request' }, { status: 400 })
  const { userId, area, level } = parsed.data
  const target = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect })
  if (!target) return NextResponse.json({ error: 'User nahi mila' }, { status: 404 })
  const [before] = await accessForUsers([target])
  await setAccess(userId, area, level, admin.name || admin.email || 'Admin')
  const [after] = await accessForUsers([target])
  await writeAudit({
    req,
    actor: admin,
    module: 'auth',
    action: 'access.set',
    entityKey: 'user_access',
    entityId: userId,
    changes: { user: target.name, area, from: before.access[area], to: after.access[area] },
  })
  return NextResponse.json({ ok: true, user: { id: target.id, ...after } })
}
