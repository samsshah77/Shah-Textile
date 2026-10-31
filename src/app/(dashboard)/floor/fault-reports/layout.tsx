import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { publicUserSelect } from '@/server/current-user'
import { accessFor } from '@/server/userAccess'
import { allows } from '@/lib/access'

export const dynamic = 'force-dynamic'

/**
 * Fabric Fault → Fault Add (Kamran's form). Someone without it is sent to the Fault Table
 * when they may see that, otherwise to /forbidden (Administration → Permissions decides).
 */
export default async function FaultAddLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const claims = token ? await verifySession(token) : null
  if (!claims) redirect('/login?redirect=%2Ffloor%2Ffault-reports')
  const user = await prisma.user.findUnique({ where: { id: claims.userId }, select: publicUserSelect })
  if (!user?.isActive || user.status !== 'APPROVED') redirect('/login?redirect=%2Ffloor%2Ffault-reports')
  const { access } = await accessFor(user)
  if (!allows(access, 'fault_reports', 'view')) {
    redirect(allows(access, 'prod_fabric_fault', 'view') ? '/floor/production?tab=fabric-fault' : '/forbidden')
  }
  return <>{children}</>
}
