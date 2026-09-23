import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { prisma } from '../src/lib/prisma'
import { ensurePermissionCatalog } from '../src/server/ensure-permission-catalog'
import { resolvePermission } from '../src/server/permissions'

async function main() {
  await ensurePermissionCatalog()
  const tufail = await prisma.user.findFirst({
    where: { email: 'tufail@saratextile.com' },
    include: { role: true },
  })
  console.log('tufail', {
    id: tufail?.id,
    roleKey: tufail?.roleKey,
    roleId: tufail?.roleId,
    role: tufail?.role?.key,
    status: tufail?.status,
  })
  if (!tufail) {
    console.log('Tufail user missing — run seed')
    return
  }
  const grants = await prisma.roleModuleGrant.findMany({
    where: { roleId: tufail.roleId! },
    include: { module: true },
  })
  console.log(
    'grants',
    grants.map((g) => `${g.module.key}:${g.action}=${g.effect}`),
  )
  for (const target of [
    { moduleKey: 'payroll', resourceKey: 'payroll_runs', action: 'VIEW' as const },
    { moduleKey: 'accounts', resourceKey: 'financial_reports', action: 'VIEW' as const },
    { moduleKey: 'floor', resourceKey: 'production_entries', action: 'VIEW' as const },
  ]) {
    const d = await resolvePermission(tufail.id, target)
    console.log('check', target.moduleKey, d)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
