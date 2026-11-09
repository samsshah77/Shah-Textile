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
  try {
    return await createRole(req)
  } catch (err) {
    // Any other failure: say why (admin-only screen), instead of a bare 500.
    const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : ''
    console.error('[roles/simple] failed', err)
    const reason = err instanceof Error ? err.message.split('\n').filter(Boolean).pop()?.slice(0, 160) : ''
    return NextResponse.json({ error: `Role nahi bana${code ? ` (${code})` : ''}${reason ? `: ${reason}` : ''}` }, { status: 500 })
  }
}

async function createRole(req: NextRequest) {
  const admin = await requireAdminUser(req)
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Naam aur ijazat chunein' }, { status: 400 })
  const { label, department, access } = parsed.data
  if (await prisma.role.findFirst({ where: { label: { equals: label, mode: 'insensitive' } }, select: { id: true } }))
    return NextResponse.json({ error: 'Is naam ka role pehle se hai' }, { status: 409 })

  const preset = ROLE_ACCESS[access]
  // Ready-made module grants, where the database has the permission catalog tables. The live
  // database has no "modules" table: the role is still made (no grants) and what each person sees
  // is set on Administration → Permissions, which works without them.
  const modules = await prisma.module
    .findMany({ where: { key: { in: Object.keys(preset.grants) } }, select: { id: true, key: true } })
    .catch((err: unknown) => {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : ''
      if (code === 'P2021') return [] as Array<{ id: string; key: string }>
      throw err
    })
  // Worked out before the transaction: a query on the plain client inside it waits for a second
  // database connection, and with a small pool (live server) that never comes → timeout → 500.
  const key = await keyFor(label)
  let role: { id: string; key: string; label: string; department: string | null; description: string | null }
  try {
    role = await prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: { key, label, department: department || null, description: 'Permissions page se set', canSignup: false },
        select: { id: true, key: true, label: true, department: true, description: true },
      })
      for (const m of modules)
        for (const action of preset.grants[m.key] || [])
          await tx.roleModuleGrant.create({ data: { roleId: created.id, moduleId: m.id, action, effect: 'ALLOW', scope: 'ALL' } })
      return created
    })
  } catch (err) {
    const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : ''
    if (code === 'P2002') return NextResponse.json({ error: 'Is naam ka role pehle se hai — doosra naam rakhein' }, { status: 409 })
    console.error('[roles/simple] create failed', err)
    // Admin-only screen: show the database's reason (first line, no data values) so it can be fixed.
    const reason = err instanceof Error ? err.message.split('\n').filter(Boolean).pop()?.slice(0, 160) : ''
    return NextResponse.json({ error: `Role nahi bana${code ? ` (${code})` : ''}${reason ? `: ${reason}` : ''}` }, { status: 500 })
  }
  // The role is made; a failed log line must not turn that into an error.
  await writeAudit({ req, actor: admin, module: 'auth', action: 'role.create', entityKey: 'roles', entityId: role.id, changes: { label, access: preset.label } })
  return NextResponse.json({ role }, { status: 201 })
}
