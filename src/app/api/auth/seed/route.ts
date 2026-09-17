import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { UserStatus } from '@prisma/client'

export async function POST() {
  try {
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
        department: 'Executive Management',
        status: UserStatus.APPROVED,
        isActive: true,
      },
      {
        id: 'usr_acc_tufail',
        name: 'Tufail',
        email: 'tufail@saratextile.com',
        passwordHash: accountantPassword,
        roleKey: 'accountant',
        department: 'Accounts & Payroll',
        status: UserStatus.APPROVED,
        isActive: true,
      },
      {
        id: 'usr_qc_ahmer',
        name: 'Ahmer',
        email: 'ahmer@saratextile.com',
        passwordHash: qcPassword,
        roleKey: 'quality_controller',
        department: 'Floor & Quality Control',
        status: UserStatus.APPROVED,
        isActive: true,
      },
    ]

    const results = []
    for (const user of users) {
      const upserted = await prisma.user.upsert({
        where: { email: user.email },
        update: {
          name: user.name,
          passwordHash: user.passwordHash,
          roleKey: user.roleKey,
          department: user.department,
          status: user.status,
          isActive: user.isActive,
        },
        create: user,
      })
      results.push({ name: upserted.name, email: upserted.email, roleKey: upserted.roleKey, status: upserted.status })
    }

    return NextResponse.json({
      success: true,
      message: 'PostgreSQL database seeded successfully with Mill users.',
      users: results,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Database seeding error. Ensure PostgreSQL is running.',
      },
      { status: 500 }
    )
  }
}
