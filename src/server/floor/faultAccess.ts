import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { PermissionAction } from '@prisma/client'
import { currentUser } from '@/server/current-user'
import { hasPermission } from '@/server/permissions'

/** Fault reports: VIEW to see, CREATE to send (Kamran, Ahmer, Javed). */
export async function faultUser(request: NextRequest, action: PermissionAction) {
  const user = await currentUser(request)
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const ok = await hasPermission(user.id, { moduleKey: 'floor', resourceKey: 'production_entries', action })
  if (!ok) return { error: NextResponse.json({ error: 'Is kaam ki ijazat nahi.' }, { status: 403 }) }
  return { user }
}

export const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

export const localStamp = () => {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
