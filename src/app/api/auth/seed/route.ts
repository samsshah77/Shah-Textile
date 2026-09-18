import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function ensureDatabaseSeeded() {
  // 1. Create tables if they do not exist
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `)
  } catch {
    // Enum might already exist or not supported, continue
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "roles" (
        "id" TEXT PRIMARY KEY,
        "key" TEXT UNIQUE NOT NULL,
        "label" TEXT NOT NULL,
        "department" TEXT,
        "description" TEXT,
        "canSignup" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "email" TEXT UNIQUE NOT NULL,
        "passwordHash" TEXT NOT NULL,
        "roleKey" TEXT DEFAULT 'ACCOUNTANT',
        "roleId" TEXT,
        "department" TEXT,
        "status" TEXT DEFAULT 'APPROVED',
        "isActive" BOOLEAN DEFAULT true,
        "approvedAt" TIMESTAMP(3),
        "approvedBy" TEXT,
        "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
      );
    `)
  } catch (err) {
    console.error('Table creation error:', err)
  }

  // 2. Seed Default Roles
  const rolesData = [
    {
      id: 'role_admin',
      key: 'admin',
      label: 'Main Admin',
      department: 'Executive Management',
      description: 'Full executive control over all accounts, production, payroll, and users.',
      canSignup: false,
    },
    {
      id: 'role_accountant',
      key: 'accountant',
      label: 'Accountant',
      department: 'Accounts & Payroll',
      description: 'Access to manage salaries, invoices, payroll, and financial reports.',
      canSignup: true,
    },
    {
      id: 'role_qc',
      key: 'quality_controller',
      label: 'Quality Controller',
      department: 'Floor & Quality Control',
      description: 'Access to manage 34 loom production, quality logs, and warp records.',
      canSignup: true,
    },
  ]

  for (const r of rolesData) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "roles" ("id", "key", "label", "department", "description", "canSignup", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT ("key") DO NOTHING`,
        r.id,
        r.key,
        r.label,
        r.department,
        r.description,
        r.canSignup
      )
    } catch {}
  }

  // 3. Seed Default Admin & Manager Users
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
      roleId: 'role_admin',
      department: 'Executive Management',
      status: 'APPROVED',
    },
    {
      id: 'usr_acc_tufail',
      name: 'Tufail',
      email: 'tufail@saratextile.com',
      passwordHash: accountantPassword,
      roleKey: 'accountant',
      roleId: 'role_accountant',
      department: 'Accounts & Payroll',
      status: 'APPROVED',
    },
    {
      id: 'usr_qc_ahmer',
      name: 'Ahmer',
      email: 'ahmer@saratextile.com',
      passwordHash: qcPassword,
      roleKey: 'quality_controller',
      roleId: 'role_qc',
      department: 'Floor & Quality Control',
      status: 'APPROVED',
    },
  ]

  const seeded = []
  for (const u of users) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "users" ("id", "name", "email", "passwordHash", "roleKey", "roleId", "department", "status", "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW())
         ON CONFLICT ("email") DO UPDATE SET "passwordHash" = $4, "status" = 'APPROVED'`,
        u.id,
        u.name,
        u.email,
        u.passwordHash,
        u.roleKey,
        u.roleId,
        u.department,
        u.status
      )
      seeded.push(u.email)
    } catch {}
  }

  return seeded
}

export async function GET() {
  try {
    const seeded = await ensureDatabaseSeeded()
    return NextResponse.json({
      success: true,
      message: 'Database tables and default users initialized successfully!',
      users: seeded,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST() {
  return GET()
}
