import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { currentUser } from '@/server/current-user'
import { accessFor } from '@/server/userAccess'
import { allowsAny } from '@/lib/access'

/**
 * Fault reports (Administration → Permissions): View on "Kamran Fault" or "Fabric Fault" to
 * see them, Edit on either to send / change one (the Fabric Fault dialog sends them too).
 */
export async function faultUser(request: NextRequest, action: 'VIEW' | 'CREATE') {
  const user = await currentUser(request)
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { access } = await accessFor(user)
  const ok = allowsAny(access, ['fault_reports', 'prod_fabric_fault'], action === 'CREATE' ? 'edit' : 'view')
  if (!ok) return { error: NextResponse.json({ error: 'Is kaam ki ijazat nahi.' }, { status: 403 }) }
  return { user, access }
}

export const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

export const localStamp = () => {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
