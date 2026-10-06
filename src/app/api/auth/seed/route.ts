import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { ensurePermissionCatalog } from '@/server/ensure-permission-catalog'

const ACCOUNTANT_PASSWORD = 'rYVCEJjdXcvz88KyggaAQ0DLC4X2pCFx'
const ADMIN_PASSWORD = 'IVRmUTxljGWnf1uWNfOYZLV2MCcQPKV6'
const QC_PASSWORD = '1S2615J4Zkyh-xqdT32GAD6vBmJ61vR7'
const DEPLOY_SEED_KEY = 'sara_deploy_secret_key_2026'

export async function ensureDatabaseSeeded() {
  const rolesData = [
    {
      key: 'admin',
      label: 'Main Admin',
      department: 'Executive Management',
      description: 'Full executive control over all accounts, production, payroll, and users.',
      canSignup: false,
    },
    {
      key: 'accountant',
      label: 'Accountant',
      department: 'Accounts & Payroll',
      description: 'Access to manage salaries, invoices, payroll, and financial reports.',
      canSignup: true,
    },
    {
      key: 'quality_controller',
      label: 'Quality Controller',
      department: 'Floor & Quality Control',
      description: 'Access to manage 34 loom production, quality logs, and warp records.',
      canSignup: true,
    },
  ]

  const seededRoles: Record<string, string> = {}
  for (const r of rolesData) {
    const role = await prisma.role.upsert({
      where: { key: r.key },
      update: {
        label: r.label,
        department: r.department,
        description: r.description,
        canSignup: r.canSignup,
      },
      create: r,
    })
    seededRoles[r.key] = role.id
  }

  const [adminPassword, accountantPassword, qcPassword] = await Promise.all([
    bcrypt.hash(ADMIN_PASSWORD, 10),
    bcrypt.hash(ACCOUNTANT_PASSWORD, 10),
    bcrypt.hash(QC_PASSWORD, 10),
  ])

  const users = [
    {
      id: 'usr_admin_javed',
      name: 'Javed Sir',
      email: 'javed@saratextile.com',
      passwordHash: adminPassword,
      roleKey: 'admin',
      roleId: seededRoles.admin,
      department: 'Executive Management',
    },
    {
      id: 'usr_acc_tufail',
      name: 'Tufail',
      email: 'tufail@saratextile.com',
      passwordHash: accountantPassword,
      roleKey: 'accountant',
      roleId: seededRoles.accountant,
      department: 'Accounts & Payroll',
    },
    {
      id: 'usr_qc_ahmer',
      name: 'Ahmer',
      email: 'ahmer@saratextile.com',
      passwordHash: qcPassword,
      roleKey: 'quality_controller',
      roleId: seededRoles.quality_controller,
      department: 'Floor & Quality Control',
    },
  ]

  const seeded: string[] = []
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        // Never overwrite live passwords on seed — only fill identity/role fields.
        roleKey: u.roleKey,
        roleId: u.roleId,
        department: u.department,
        status: 'APPROVED',
        isActive: true,
        approvedAt: new Date(),
      },
      create: {
        ...u,
        status: 'APPROVED',
        isActive: true,
        approvedAt: new Date(),
        approvedBy: 'SYSTEM_SEED',
      },
    })
    seeded.push(u.email)
  }

  await ensurePermissionCatalog()
  return seeded
}

function unauthorized() {
  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
}

async function handleSeed(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')
  if (key !== DEPLOY_SEED_KEY) return unauthorized()

  try {
    const seeded = await ensureDatabaseSeeded()
    return NextResponse.json({
      success: true,
      message: 'Database roles, users, and permissions ready.',
      users: seeded,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Seed failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handleSeed(request)
}

export async function POST(request: NextRequest) {
  return handleSeed(request)
}
