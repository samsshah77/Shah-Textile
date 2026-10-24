import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdminUser } from '@/server/adminAccess'
import { writeAudit } from '@/server/auditLog'
import { ROLE_ACCESS } from '@/server/roleAccess'

export const runtime = 'nodejs'

const schema = z.object({
  label: z.string().trim().min(2, 'Naam kam se kam 2 harf').max(60),
  department: z.string().trim().max(60).optional().default(''),
  access: z.enum(['fault', 'view']),
})

/** "Fault Inspector" → "fault_inspector" (unique). */
async function keyFor(label: string) {
  let base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  if (!/^[a-z]/.test(base)) base = `role_${base || 'new'}`
  let key = base
  for (let i = 2; await prisma.role.findUnique({ where: { key }, select: { id: true } }); i++) key = `${base}_${i}`
  return key
}

/** Create a role from a plain name and one of the ready-made access choices. Admin only. */
export async function POST(req: NextRequest) {
  const admin = await requireAdminUser(req)
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Naam aur ijazat chunein' }, { status: 400 })
  const { label, department, access } = parsed.data
  if (await prisma.role.findFirst({ where: { label: { equals: label, mode: 'insensitive' } }, select: { id: true } }))
    return NextResponse.json({ error: 'Is naam ka role pehle se hai' }, { status: 409 })

  const preset = ROLE_ACCESS[access]
  const modules = await prisma.module.findMany({ where: { key: { in: Object.keys(preset.grants) } }, select: { id: true, key: true } })
  const role = await prisma.$transaction(async (tx) => {
    const created = await tx.role.create({
      data: { key: await keyFor(label), label, department: department || null, description: preset.label, canSignup: false },
      select: { id: true, key: true, label: true, department: true, description: true },
    })
    for (const m of modules)
      for (const action of preset.grants[m.key] || [])
        await tx.roleModuleGrant.create({ data: { roleId: created.id, moduleId: m.id, action, effect: 'ALLOW', scope: 'ALL' } })
    return created
  })
  await writeAudit({ req, actor: admin, module: 'auth', action: 'role.create', entityKey: 'roles', entityId: role.id, changes: { label, access: preset.label } })
  return NextResponse.json({ role }, { status: 201 })
}
