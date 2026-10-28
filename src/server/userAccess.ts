/**
 * Per-person access (Administration → Permissions). A person with nothing saved gets the
 * access the app gave them before this tab existed, worked out from their role — so turning
 * the feature on changes nothing until Javed Sir changes a toggle.
 *
 * Stored in "user_access" (one row per person and area), created at runtime like the other
 * tables of this app.
 */
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { currentUser } from '@/server/current-user'
import { hasPermission } from '@/server/permissions'
import { canViewFinance, isAccountsController } from '@/lib/accountsAccess'
import { defaultAccess, type AccessFacts } from '@/lib/accessDefaults'
import {
  allows,
  allowsAny,
  clampLevel,
  isAccessArea,
  isAccessLevel,
  type AccessArea,
  type AccessLevel,
  type AccessMap,
} from '@/lib/access'

type AppUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>

const DDL = [
  `CREATE TABLE IF NOT EXISTS "user_access" (
    "userId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    CONSTRAINT "user_access_pkey" PRIMARY KEY ("userId", "area")
  )`,
]

let ready: Promise<void> | null = null
function ensureTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const sql of DDL) await prisma.$executeRawUnsafe(sql)
    })().catch((e) => {
      ready = null
      throw e
    })
  }
  return ready
}

async function factsFor(user: AppUser): Promise<AccessFacts> {
  const who = { ...user, role: user.roleKey }
  const roleKey = (user.roleKey || '').toLowerCase()
  const floor = (action: 'VIEW' | 'UPDATE' | 'CREATE') =>
    hasPermission(user.id, { moduleKey: 'floor', resourceKey: 'production_entries', action }).catch(() => false)
  const [floorView, floorUpdate, floorCreate] = await Promise.all([floor('VIEW'), floor('UPDATE'), floor('CREATE')])
  return {
    roleKey,
    isFaultInspector: roleKey === 'fault' || (user.email || '').toLowerCase() === 'kamran@saratextile.com',
    financeEdit: isAccountsController(who),
    financeView: canViewFinance(who),
    floorView,
    floorUpdate,
    floorCreate,
  }
}

async function savedRows(userIds: string[]): Promise<Map<string, Partial<AccessMap>>> {
  await ensureTable()
  const out = new Map<string, Partial<AccessMap>>()
  if (!userIds.length) return out
  const rows = await prisma.$queryRawUnsafe<Array<{ userId: string; area: string; level: string }>>(
    `SELECT "userId", "area", "level" FROM "user_access" WHERE "userId" = ANY($1::text[])`,
    userIds
  )
  for (const r of rows) {
    if (!isAccessArea(r.area) || !isAccessLevel(r.level)) continue
    const m = out.get(r.userId) || {}
    m[r.area] = clampLevel(r.area, r.level)
    out.set(r.userId, m)
  }
  return out
}

/** A person's access: what Javed Sir saved, and the old default for anything not saved. */
export async function accessFor(user: AppUser): Promise<{ access: AccessMap; defaults: AccessMap; saved: Partial<AccessMap> }> {
  const defaults = defaultAccess(await factsFor(user))
  const saved = (await savedRows([user.id])).get(user.id) || {}
  return { access: { ...defaults, ...saved }, defaults, saved }
}

/** Everyone's access, for the Permissions tab. */
export async function accessForUsers(users: AppUser[]) {
  const saved = await savedRows(users.map((u) => u.id))
  const out: Array<{ userId: string; access: AccessMap; defaults: AccessMap; saved: Partial<AccessMap> }> = []
  for (const u of users) {
    const defaults = defaultAccess(await factsFor(u))
    const s = saved.get(u.id) || {}
    out.push({ userId: u.id, access: { ...defaults, ...s }, defaults, saved: s })
  }
  return out
}

/** Save one toggle. `null` = back to the person's old default. */
export async function setAccess(userId: string, area: AccessArea, level: AccessLevel | null, by: string) {
  await ensureTable()
  if (level === null) {
    await prisma.$executeRawUnsafe(`DELETE FROM "user_access" WHERE "userId" = $1 AND "area" = $2`, userId, area)
    return
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO "user_access" ("userId","area","level","updatedAt","updatedBy") VALUES ($1,$2,$3,CURRENT_TIMESTAMP,$4)
     ON CONFLICT ("userId","area") DO UPDATE SET "level" = EXCLUDED."level", "updatedAt" = CURRENT_TIMESTAMP, "updatedBy" = EXCLUDED."updatedBy"`,
    userId,
    area,
    clampLevel(area, level),
    by
  )
}

/**
 * API guard: the logged-in person needs at least `need` on one of `areas`.
 * Returns the person and their access, or a ready 401/403 response.
 */
export async function requireAccess(
  req: NextRequest,
  areas: AccessArea | AccessArea[],
  need: 'view' | 'edit',
  message?: string
): Promise<{ user: AppUser; access: AccessMap; error?: undefined } | { error: NextResponse; user?: undefined; access?: undefined }> {
  const user = await currentUser(req)
  if (!user) return { error: NextResponse.json({ ok: false, error: 'Login required.' }, { status: 401 }) }
  const { access } = await accessFor(user)
  const list = Array.isArray(areas) ? areas : [areas]
  if (!allowsAny(access, list, need)) {
    const text = message || (need === 'edit' ? 'Aap ke paas is mein tabdeeli ki ijazat nahi (view only).' : 'Aap ke paas is ki ijazat nahi.')
    return { error: NextResponse.json({ ok: false, error: text }, { status: 403 }) }
  }
  return { user, access }
}

export { allows, allowsAny }
