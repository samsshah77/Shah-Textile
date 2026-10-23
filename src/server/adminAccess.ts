import type { NextRequest } from 'next/server'
import { currentUser } from '@/server/current-user'

/** System / audit pages are for the admin role only (Javed). */
export async function requireAdminUser(req: NextRequest) {
  const user = await currentUser(req)
  return user && (user.roleKey || '').toLowerCase() === 'admin' ? user : null
}
