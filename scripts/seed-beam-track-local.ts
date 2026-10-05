/**
 * LOCAL ONLY — seed demo beams + qualities + daily lot meters for Beam Track testing.
 * Refuses any non-localhost DATABASE_URL (live safe).
 *
 * Usage:
 *   npx tsx scripts/seed-beam-track-local.ts
 *
 * After run: hard-refresh http://localhost:3000 → Beams → Track on DEMO-G201 / DEMO-G202
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

function loadEnvFile(file: string) {
  const full = resolve(process.cwd(), file)
  if (!existsSync(full)) return
  const text = readFileSync(full, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const connectionString = process.env.DATABASE_URL || ''
if (!connectionString) {
  console.error('DATABASE_URL missing')
  process.exit(1)
}

const hostOk =
  /localhost|127\.0\.0\.1|::1/i.test(connectionString) ||
  process.env.ALLOW_REMOTE_BEAM_SEED === 'YES'
if (!hostOk) {
  console.error(
    'Refusing: DATABASE_URL is not localhost. Live pe yeh script nahi chalegi.\n' +
      'Local only. (Emergency override: ALLOW_REMOTE_BEAM_SEED=YES — mat use karo live pe.)'
  )
  process.exit(1)
}

function todayKarachi(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function shiftDate(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + delta)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function sheetEntry(opts: {
  date: string
  loomNumber: number
  qualityName: string
  warpYarn: string
  weftYarn: string
  pick: number
  reed: number
  lot: string
  meters: number
}) {
  const half = Math.round(opts.meters / 2)
  const shiftB = opts.meters - half
  return {
    id: `PROD-${opts.date}-${opts.loomNumber}`,
    date: opts.date,
    loomNumber: opts.loomNumber,
    category: 'G6200' as const,
    model: 'G6200',
    qualityName: opts.qualityName,
    fabricType: 'Suiting',
    warpYarn: opts.warpYarn,
    weftYarn: opts.weftYarn,
    rpm: 340,
    reed: opts.reed,
    pick: opts.pick,
    widthInch: 66,
    gsm: 1.5,
    rollerHours: 22,
    runningHours: 22,
    shiftAMeters: half,
    shiftBMeters: shiftB,
    totalMeters: opts.meters,
    efficiencyPercentage: 85,
    stopLossMeters: 0,
    status: 'RUNNING' as const,
    remarks: '',
    lot: opts.lot,
  }
}

const pool = new pg.Pool({ connectionString })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const today = todayKarachi()
  const d0 = shiftDate(today, -2)
  const d1 = shiftDate(today, -1)
  const d2 = today

  const qualities = [
    {
      id: 'q-demo-beam-mellina',
      name: 'DEMO-MELLINA',
      fabricType: 'Suiting',
      weavePlan: '2/1',
      warpYarn: 'Fr 150 Twisted',
      weftYarn: '20/1 Pv',
      reed: 82,
      pick: 66,
      widthInch: 66,
      gsm: 1.43,
      status: 'ACTIVE',
      createdOn: d0,
      endedOn: null as string | null,
    },
    {
      id: 'q-demo-beam-parco',
      name: 'DEMO-PARCO',
      fabricType: 'Suiting',
      weavePlan: '',
      warpYarn: '20/1 Pv China',
      weftYarn: '20/1 Pv China',
      reed: 120,
      pick: 60,
      widthInch: 66,
      gsm: 1.6,
      status: 'ACTIVE',
      createdOn: d0,
      endedOn: null as string | null,
    },
  ]

  const beams = [
    {
      beamNo: 'DEMO-G201',
      warp: qualities[0].warpYarn,
      reed: qualities[0].reed,
      width: 66,
      totalThreads: Math.round(66 * qualities[0].reed * 0.95),
      length: 2500,
      loomType: 'G6200',
      fillStatus: 'FULL',
      usedInLoom: '1',
      location: '1',
      mountedOn: d0,
      beamEndedOn: null as string | null,
      endedFromLoom: null as string | null,
      qualityId: qualities[0].id,
      swLot: '901',
    },
    {
      beamNo: 'DEMO-G202',
      warp: qualities[1].warpYarn,
      reed: qualities[1].reed,
      width: 66,
      totalThreads: Math.round(66 * qualities[1].reed * 0.95),
      length: 1800,
      loomType: 'G6200',
      fillStatus: 'FULL',
      usedInLoom: '2',
      location: '2',
      mountedOn: d0,
      beamEndedOn: null as string | null,
      endedFromLoom: null as string | null,
      qualityId: qualities[1].id,
      swLot: '902',
    },
  ]

  console.log('Seeding LOCAL beam-track demo…', { today, dbHost: 'localhost' })

  for (const q of qualities) {
    await prisma.floorQuality.upsert({
      where: { id: q.id },
      create: q,
      update: {
        name: q.name,
        fabricType: q.fabricType,
        weavePlan: q.weavePlan,
        warpYarn: q.warpYarn,
        weftYarn: q.weftYarn,
        reed: q.reed,
        pick: q.pick,
        widthInch: q.widthInch,
        gsm: q.gsm,
        status: q.status,
        createdOn: q.createdOn,
        endedOn: q.endedOn,
      },
    })
  }
  console.log('  qualities:', qualities.map((q) => q.name).join(', '))

  for (const b of beams) {
    await prisma.floorBeam.upsert({
      where: { beamNo: b.beamNo },
      create: b,
      update: {
        warp: b.warp,
        reed: b.reed,
        width: b.width,
        totalThreads: b.totalThreads,
        length: b.length,
        loomType: b.loomType,
        fillStatus: b.fillStatus,
        usedInLoom: b.usedInLoom,
        location: b.location,
        mountedOn: b.mountedOn,
        beamEndedOn: b.beamEndedOn,
        endedFromLoom: b.endedFromLoom,
        qualityId: b.qualityId,
        swLot: b.swLot,
      },
    })
  }
  console.log('  beams:', beams.map((b) => `${b.beamNo} Sw#${b.swLot}`).join(', '))

  // Assign looms 1 & 2 if they exist (no wipe of other looms).
  const loom1 = await prisma.floorLoom.findUnique({ where: { loomNumber: 1 } })
  const loom2 = await prisma.floorLoom.findUnique({ where: { loomNumber: 2 } })
  if (loom1) {
    await prisma.floorLoom.update({
      where: { loomNumber: 1 },
      data: { qualityId: qualities[0].id, status: 'RUNNING' },
    })
  }
  if (loom2) {
    await prisma.floorLoom.update({
      where: { loomNumber: 2 },
      data: { qualityId: qualities[1].id, status: 'RUNNING' },
    })
  }
  console.log('  looms:', loom1 ? '1→DEMO-MELLINA' : '1 missing', loom2 ? '2→DEMO-PARCO' : '2 missing')

  const days: { date: string; m1: number; m2: number }[] = [
    { date: d0, m1: 160, m2: 140 },
    { date: d1, m1: 185, m2: 155 },
    { date: d2, m1: 172, m2: 148 },
  ]

  for (const day of days) {
    const e1 = sheetEntry({
      date: day.date,
      loomNumber: 1,
      qualityName: qualities[0].name,
      warpYarn: qualities[0].warpYarn,
      weftYarn: qualities[0].weftYarn,
      pick: qualities[0].pick,
      reed: qualities[0].reed,
      lot: 'Sw # 901',
      meters: day.m1,
    })
    const e2 = sheetEntry({
      date: day.date,
      loomNumber: 2,
      qualityName: qualities[1].name,
      warpYarn: qualities[1].warpYarn,
      weftYarn: qualities[1].weftYarn,
      pick: qualities[1].pick,
      reed: qualities[1].reed,
      lot: 'Sw # 902',
      meters: day.m2,
    })
    for (const e of [e1, e2]) {
      await prisma.floorDailySheet.upsert({
        where: { date_loomNumber: { date: e.date, loomNumber: e.loomNumber } },
        create: {
          date: e.date,
          loomNumber: e.loomNumber,
          payload: e as object,
        },
        update: { payload: e as object },
      })
    }
    console.log(
      `  sheet ${day.date}: L1 Sw#901 ${day.m1}m, L2 Sw#902 ${day.m2}m (beam DEMO-G201/G202)`
    )
  }

  console.log('\nDone. Hard-refresh → Beams (Sw#901/902) → Track · Daily Entry SW # column match')
  console.log('Consumed DEMO-G201 ≈', 160 + 185 + 172, 'm via Sw # 901 · Length 2500')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
