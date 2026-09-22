import { PrismaClient, UserStatus } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'

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
  const adminPassword = await bcrypt.hash('IVRmUTxljGWnf1uWNfOYZLV2MCcQPKV6', 10)
  const accountantPassword = await bcrypt.hash('rYVCEJjdXcvz88KyggaAQ0DLC4X2pCFx', 10)
  const qcPassword = await bcrypt.hash('1S2615J4Zkyh-xqdT32GAD6vBmJ61vR7', 10)

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

  // 2b. Seed RBAC permission catalog + role module grants
  const {
    PERMISSION_CATALOG,
    PERMISSION_ACTIONS,
    ROLE_MODULE_ACTIONS,
    ROLE_RESOURCE_DENIES,
  } = await import('../src/server/permission-catalog')

  console.log('Seeding permission catalog...')
  for (const moduleDef of PERMISSION_CATALOG) {
    const moduleRecord = await prisma.module.upsert({
      where: { key: moduleDef.key },
      update: {
        label: moduleDef.label,
        description: moduleDef.description,
        sortOrder: moduleDef.sortOrder,
        isActive: true,
      },
      create: {
        key: moduleDef.key,
        label: moduleDef.label,
        description: moduleDef.description,
        sortOrder: moduleDef.sortOrder,
        isActive: true,
      },
    })

    for (const resourceDef of moduleDef.resources) {
      const resource = await prisma.resource.upsert({
        where: { moduleId_key: { moduleId: moduleRecord.id, key: resourceDef.key } },
        update: {
          label: resourceDef.label,
          description: resourceDef.description,
          sensitive: Boolean(resourceDef.sensitive),
        },
        create: {
          moduleId: moduleRecord.id,
          key: resourceDef.key,
          label: resourceDef.label,
          description: resourceDef.description,
          sensitive: Boolean(resourceDef.sensitive),
        },
      })

      for (const action of PERMISSION_ACTIONS) {
        await prisma.permission.upsert({
          where: { resourceId_action: { resourceId: resource.id, action } },
          update: {},
          create: { resourceId: resource.id, action },
        })
      }
    }
  }

  for (const [roleKey, moduleActions] of Object.entries(ROLE_MODULE_ACTIONS)) {
    const roleId = seededRoles[roleKey]
    if (!roleId) continue
    for (const [moduleKey, actions] of Object.entries(moduleActions)) {
      const moduleRecord = await prisma.module.findUnique({ where: { key: moduleKey } })
      if (!moduleRecord || !actions) continue
      for (const action of actions) {
        await prisma.roleModuleGrant.upsert({
          where: {
            roleId_moduleId_action: {
              roleId,
              moduleId: moduleRecord.id,
              action,
            },
          },
          update: { effect: 'ALLOW', scope: 'ALL' },
          create: {
            roleId,
            moduleId: moduleRecord.id,
            action,
            effect: 'ALLOW',
            scope: 'ALL',
          },
        })
      }
    }
  }

  for (const deny of ROLE_RESOURCE_DENIES) {
    const roleId = seededRoles[deny.roleKey]
    const moduleRecord = await prisma.module.findUnique({ where: { key: deny.moduleKey } })
    if (!roleId || !moduleRecord) continue
    const resource = await prisma.resource.findUnique({
      where: { moduleId_key: { moduleId: moduleRecord.id, key: deny.resourceKey } },
    })
    if (!resource) continue
    for (const action of deny.actions) {
      const permission = await prisma.permission.findUnique({
        where: { resourceId_action: { resourceId: resource.id, action } },
      })
      if (!permission) continue
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: permission.id } },
        update: { effect: 'DENY', scope: 'ALL' },
        create: {
          roleId,
          permissionId: permission.id,
          effect: 'DENY',
          scope: 'ALL',
        },
      })
    }
  }

  // Drop stale DENY overrides that are no longer in the catalog (e.g. salary_components VIEW)
  for (const roleKey of Object.keys(ROLE_MODULE_ACTIONS)) {
    const roleId = seededRoles[roleKey]
    if (!roleId) continue
    const catalogDenies = ROLE_RESOURCE_DENIES.filter((d) => d.roleKey === roleKey)
    const existingDenies = await prisma.rolePermission.findMany({
      where: { roleId, effect: 'DENY' },
      include: { permission: { include: { resource: { include: { module: true } } } } },
    })
    for (const row of existingDenies) {
      const keep = catalogDenies.some(
        (d) =>
          d.moduleKey === row.permission.resource.module.key &&
          d.resourceKey === row.permission.resource.key &&
          d.actions.includes(row.permission.action)
      )
      if (!keep) {
        await prisma.rolePermission.delete({
          where: { roleId_permissionId: { roleId, permissionId: row.permissionId } },
        })
      }
    }
  }
  console.log('✓ Permission catalog & role grants ready.')

  // 3. Seed Looms (34 Rapier & PU Looms)
  console.log('Seeding 34 Looms...')
  const loomModels: Record<number, { model: string; category: string; rpm: number }> = {
    // 1 to 20: G6200
    // 21 to 26: PU
    // 27 to 34: G6300
  }
  for (let i = 1; i <= 34; i++) {
    let model = 'G6200'
    let category = 'G6200'
    let defaultRpm = 350
    if (i >= 21 && i <= 26) {
      model = 'PU'
      category = 'PU'
      defaultRpm = 280
    } else if (i >= 27) {
      model = 'G6300'
      category = 'G6300'
      defaultRpm = 360
    }
    await prisma.loom.upsert({
      where: { loomNumber: i },
      update: { model, category, defaultRpm },
      create: {
        loomNumber: i,
        model,
        category,
        defaultRpm,
        shed: i <= 20 ? 'Shed A (Rapier)' : i <= 26 ? 'Shed B (Sulzer PU)' : 'Shed C (High Speed)',
        isActive: true,
        currentStatus: i === 2 ? 'BEAM_END' : i === 15 ? 'KNOTTING' : 'RUNNING',
      },
    })
  }
  console.log('✓ 34 Looms ready in PostgreSQL.')

  // 4. Seed Fabric Qualities
  console.log('Seeding Fabric Qualities...')
  const initialQualities = [
    {
      qualityName: 'PARCOPV',
      fabricType: 'Suiting',
      warpYarn: '20/1-Pv-China',
      weftYarn: '20/1-Pv-China',
      reed: 120,
      pick: 60,
      widthInch: 66,
      gsm: 1.77,
      ratePerPick: 0.95,
      targetMeters: 10000,
      lot: 'Sw # 335',
    },
    {
      qualityName: 'DESIGN-2x1',
      fabricType: 'Ribstop Twill',
      warpYarn: '20/1-Pv-China',
      weftYarn: '20/1-Pv-China',
      reed: 66,
      pick: 53,
      widthInch: 66,
      gsm: 2.04,
      ratePerPick: 0.95,
      targetMeters: 8000,
      lot: 'Sw # 334',
    },
    {
      qualityName: 'SILVER-SHINE',
      fabricType: 'Gabardine Suiting',
      warpYarn: '45/1-Pv-China',
      weftYarn: '45/1-Pv-China',
      reed: 120,
      pick: 95,
      widthInch: 66,
      gsm: 1.26,
      ratePerPick: 0.95,
      targetMeters: 12000,
      lot: 'Sw # 337',
    },
    {
      qualityName: 'SEVEN ELEVEN',
      fabricType: 'Suiting',
      warpYarn: '20/1-Pv-China',
      weftYarn: '20/1-Pv-China',
      reed: 88,
      pick: 62,
      widthInch: 66,
      gsm: 1.65,
      ratePerPick: 0.95,
      targetMeters: 15000,
      lot: 'Sw # 330',
    },
    {
      qualityName: 'EIFFEL TOWER',
      fabricType: 'Gabardine Suiting',
      warpYarn: '40/1-Pv-China',
      weftYarn: '40/1-Pv-China',
      reed: 110,
      pick: 78,
      widthInch: 66,
      gsm: 1.45,
      ratePerPick: 0.95,
      targetMeters: 9000,
      lot: 'Sw # 339',
    },
  ]

  const seededQualities: Record<string, string> = {}
  for (const q of initialQualities) {
    const qRecord = await prisma.fabricQuality.upsert({
      where: { qualityName: q.qualityName },
      update: q,
      create: q,
    })
    seededQualities[q.qualityName] = qRecord.id
  }
  console.log(`✓ ${initialQualities.length} Fabric Qualities ready.`)

  // 5. Seed Beam Stock
  console.log('Seeding Floor Beam Stock...')
  const initialBeams = [
    { beamNo: 'B-001', warpYarn: '20/1-Pv-China', reedWidth: '66"', ends: 4800, lengthMeters: 2400, loomType: 'G6200', status: 'MOUNTED', mountedLoomId: 1 },
    { beamNo: 'B-002', warpYarn: '20/1-Pv-China', reedWidth: '66"', ends: 4800, lengthMeters: 3200, loomType: 'G6200', status: 'IN_STOCK', mountedLoomId: null },
    { beamNo: 'B-003', warpYarn: '45/1-Pv-China', reedWidth: '66"', ends: 6200, lengthMeters: 2800, loomType: 'G6300', status: 'MOUNTED', mountedLoomId: 3 },
    { beamNo: 'B-004', warpYarn: '45/1-Pv-China', reedWidth: '66"', ends: 6200, lengthMeters: 3000, loomType: 'G6300', status: 'IN_STOCK', mountedLoomId: null },
    { beamNo: 'B-005', warpYarn: '20/1-Pv-China', reedWidth: '66"', ends: 4800, lengthMeters: 2600, loomType: 'PU', status: 'MOUNTED', mountedLoomId: 21 },
    { beamNo: 'B-006', warpYarn: '40/1-Pv-China', reedWidth: '66"', ends: 5400, lengthMeters: 3500, loomType: 'G6200', status: 'IN_STOCK', mountedLoomId: null },
  ]

  for (const b of initialBeams) {
    await prisma.beamStock.upsert({
      where: { beamNo: b.beamNo },
      update: b,
      create: b,
    })
  }
  console.log(`✓ ${initialBeams.length} Beams ready.`)

  // 6. Seed Multi-Month Daily Production Entries (August & September 2026 = 61 Days × 34 Looms = 2,074 records)
  console.log('Seeding Multi-Month (August & September 2026) Daily Production logs...')
  const rawDataPath = path.join(process.cwd(), 'src/data/productionExcelData.json')
  const rawJson = JSON.parse(fs.readFileSync(rawDataPath, 'utf-8'))
  const dailyHistory = rawJson.dailyHistory || {}

  // Clear previous sample logs to avoid duplicates
  await prisma.dailyProduction.deleteMany({})

  const dailyProdBatch: any[] = []

  for (const [dateStr, loomsArray] of Object.entries(dailyHistory)) {
    const dayDate = new Date(`${dateStr}T00:00:00.000Z`)

    for (const l of (loomsArray as any[])) {
      const qName = l.qualityName || 'PARCOPV'
      const qId = seededQualities[qName] || Object.values(seededQualities)[0]

      dailyProdBatch.push({
        date: dayDate,
        loomNumber: l.loomNumber,
        qualityId: qId,
        shiftAMeters: l.shiftAMeters || 0,
        shiftBMeters: l.shiftBMeters || 0,
        totalMeters: l.totalMeters || 0,
        rollerHours: l.rollerHours || 24,
        runningHours: l.runningHours !== undefined ? l.runningHours : (l.totalMeters === 0 ? 0 : 24),
        rpm: l.rpm || 340,
        pick: l.pick || 60,
        theoreticalMeters: l.runningTheoretical || l.theoretical24h || 200,
        efficiencyPercentage: l.efficiencyRunning || l.efficiency24h || 0,
        stopLossMeters: l.lossRunning || l.loss24h || 0,
        status: l.status || (l.totalMeters === 0 ? 'BEAM_END' : 'RUNNING'),
        lot: l.lot || `Sw # 33${l.loomNumber % 5}`,
        remarks: l.remarks || '',
      })
    }
  }

  // Insert in chunks of 500
  const chunkSize = 500
  for (let i = 0; i < dailyProdBatch.length; i += chunkSize) {
    const chunk = dailyProdBatch.slice(i, i + chunkSize)
    await prisma.dailyProduction.createMany({
      data: chunk,
      skipDuplicates: true,
    })
  }
  console.log(`✓ Seeded ${dailyProdBatch.length} Daily Production records (August & September 2026) across all 34 looms.`)

  // 6b. Seed Weft Stock Records (August & September)
  console.log('Seeding Multi-Month Weft Yarn Records...')
  const septWeft = rawJson.weftStock?.days || []
  const augWeft = rawJson.augustWeftStock?.days || []
  const allWeftDays = [...augWeft, ...septWeft]
  
  await prisma.weftStockRecord.deleteMany({})

  const weftBatch: any[] = []
  for (const wd of allWeftDays) {
    const wDate = new Date(`${wd.date}T00:00:00.000Z`)
    for (const [yarnType, kg] of Object.entries(wd.consumption || {})) {
      if ((kg as number) > 0) {
        weftBatch.push({
          date: wDate,
          yarnType,
          quantityKg: Number(kg),
        })
      }
    }
  }

  for (let i = 0; i < weftBatch.length; i += chunkSize) {
    const chunk = weftBatch.slice(i, i + chunkSize)
    await prisma.weftStockRecord.createMany({
      data: chunk,
      skipDuplicates: true,
    })
  }
  console.log(`✓ Seeded ${weftBatch.length} Weft Yarn consumption records into PostgreSQL.`)

  // 7. Seed Yarn Stock (Yarn Store Inventory)
  console.log('Seeding Yarn Store inventory...')
  const initialYarnStock = [
    { yarnType: '20/1-Pv-China', fiberBlend: 'Polyester Viscose', lotNumber: 'Lot # 335', totalBags: 120, receivedKg: 6000, issuedKg: 1850, balanceKg: 4150, unitPriceKg: 680, minThresholdKg: 1000 },
    { yarnType: '45/1-Pv-China', fiberBlend: 'Polyester Viscose', lotNumber: 'Lot # 337', totalBags: 90, receivedKg: 4500, issuedKg: 1200, balanceKg: 3300, unitPriceKg: 740, minThresholdKg: 800 },
    { yarnType: '40/1-Pv-China', fiberBlend: 'Polyester Viscose', lotNumber: 'Lot # 339', totalBags: 60, receivedKg: 3000, issuedKg: 950, balanceKg: 2050, unitPriceKg: 710, minThresholdKg: 500 },
    { yarnType: '30/1-Pv-China', fiberBlend: 'Polyester Viscose', lotNumber: 'Lot # 330', totalBags: 80, receivedKg: 4000, issuedKg: 1400, balanceKg: 2600, unitPriceKg: 650, minThresholdKg: 600 },
    { yarnType: '30/1-Carded-C', fiberBlend: '100% Cotton Carded', lotNumber: 'Lot # 112', totalBags: 50, receivedKg: 2500, issuedKg: 800, balanceKg: 1700, unitPriceKg: 620, minThresholdKg: 400 },
    { yarnType: '100/D-Polyester', fiberBlend: 'Polyester Filament', lotNumber: 'Lot # PF-8', totalBags: 40, receivedKg: 2000, issuedKg: 600, balanceKg: 1400, unitPriceKg: 520, minThresholdKg: 300 },
    { yarnType: '150/D-Polyester', fiberBlend: 'Polyester Filament', lotNumber: 'Lot # PF-9', totalBags: 35, receivedKg: 1750, issuedKg: 450, balanceKg: 1300, unitPriceKg: 490, minThresholdKg: 300 },
  ]

  for (const y of initialYarnStock) {
    await prisma.yarnStock.upsert({
      where: { yarnType: y.yarnType },
      update: y,
      create: y,
    })
  }
  console.log(`✓ ${initialYarnStock.length} Yarn Stock items ready in Yarn Store.`)

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
