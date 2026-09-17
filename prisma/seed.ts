import { PrismaClient, UserStatus } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import bcrypt from 'bcryptjs'

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/sara_textile?schema=public'
const pool = new pg.Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding Sara Textile Mill initial roles & users into PostgreSQL...')

  // 1. Seed Roles
  const rolesData = [
    {
      key: 'admin',
      label: 'Main Admin',
      department: 'Executive Management',
      description: 'Full executive control over all accounts, production, payroll, and users.',
      canSignup: false, // Only existing admin or direct assignment
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
    const roleRecord = await prisma.role.upsert({
      where: { key: r.key },
      update: {
        label: r.label,
        department: r.department,
        description: r.description,
        canSignup: r.canSignup,
      },
      create: r,
    })
    seededRoles[r.key] = roleRecord.id
    console.log(`✓ Role ready: ${roleRecord.label} (${roleRecord.key})`)
  }

  // 2. Seed Default Pre-approved Users
  const adminPassword = await bcrypt.hash('admin123', 10)
  const accountantPassword = await bcrypt.hash('tufail123', 10)
  const qcPassword = await bcrypt.hash('ahmer123', 10)

  const users = [
    {
      id: 'usr_admin_javed',
      name: 'Javed Sir',
      email: 'javed@saratextile.com',
      passwordHash: adminPassword,
      roleKey: 'admin',
      roleId: seededRoles['admin'],
      department: 'Executive Management',
      status: UserStatus.APPROVED,
      isActive: true,
      approvedAt: new Date(),
      approvedBy: 'SYSTEM_ROOT',
    },
    {
      id: 'usr_acc_tufail',
      name: 'Tufail',
      email: 'tufail@saratextile.com',
      passwordHash: accountantPassword,
      roleKey: 'accountant',
      roleId: seededRoles['accountant'],
      department: 'Accounts & Payroll',
      status: UserStatus.APPROVED,
      isActive: true,
      approvedAt: new Date(),
      approvedBy: 'usr_admin_javed',
    },
    {
      id: 'usr_qc_ahmer',
      name: 'Ahmer',
      email: 'ahmer@saratextile.com',
      passwordHash: qcPassword,
      roleKey: 'quality_controller',
      roleId: seededRoles['quality_controller'],
      department: 'Floor & Quality Control',
      status: UserStatus.APPROVED,
      isActive: true,
      approvedAt: new Date(),
      approvedBy: 'usr_admin_javed',
    },
  ]

  for (const user of users) {
    const upserted = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        passwordHash: user.passwordHash,
        roleKey: user.roleKey,
        roleId: user.roleId,
        department: user.department,
        status: user.status,
        isActive: user.isActive,
        approvedAt: user.approvedAt,
        approvedBy: user.approvedBy,
      },
      create: user,
    })
    console.log(`✓ Seeded user: ${upserted.name} (${upserted.roleKey}) -> ${upserted.email} [Status: ${upserted.status}]`)
  }

  console.log('Seeding finished successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
