/**
 * Wipe ALL floor production tables (live/local via DATABASE_URL).
 * Does NOT touch users, roles, payroll, accounts.
 *
 * Usage:
 *   CONFIRM_FLOOR_WIPE=YES npx tsx scripts/wipe-floor-live.ts
 *
 * Loads .env.local then .env for DATABASE_URL.
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

if (process.env.CONFIRM_FLOOR_WIPE !== 'YES') {
  console.error('Refusing to wipe: set CONFIRM_FLOOR_WIPE=YES')
  process.exit(1)
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL missing')
  process.exit(1)
}

const hostMatch = connectionString.match(/@([^/]+)/)
console.log('Target host:', hostMatch?.[1] || '(unknown)')
console.log('Wiping ALL floor_* tables…')

const pool = new pg.Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function countAll() {
  const [
    sheets,
    qualities,
    movements,
    issuances,
    yarns,
    beams,
    looms,
  ] = await Promise.all([
    prisma.floorDailySheet.count(),
    prisma.floorQuality.count(),
    prisma.floorYarnMovement.count(),
    prisma.floorYarnIssuance.count(),
    prisma.floorYarn.count(),
    prisma.floorBeam.count(),
    prisma.floorLoom.count(),
  ])
  return { sheets, qualities, movements, issuances, yarns, beams, looms }
}

async function main() {
  const before = await countAll()
  console.log('Before:', before)

  const sheets = await prisma.floorDailySheet.deleteMany({})
  const movements = await prisma.floorYarnMovement.deleteMany({})
  const issuances = await prisma.floorYarnIssuance.deleteMany({})
  const qualities = await prisma.floorQuality.deleteMany({})
  const yarns = await prisma.floorYarn.deleteMany({})
  const beams = await prisma.floorBeam.deleteMany({})
  const looms = await prisma.floorLoom.deleteMany({})

  console.log('Deleted:', {
    sheets: sheets.count,
    movements: movements.count,
    issuances: issuances.count,
    qualities: qualities.count,
    yarns: yarns.count,
    beams: beams.count,
    looms: looms.count,
  })

  const after = await countAll()
  console.log('After:', after)

  const leftover = Object.values(after).reduce((a, b) => a + b, 0)
  if (leftover !== 0) {
    console.error('Wipe incomplete — leftover rows:', after)
    process.exit(1)
  }
  console.log('Floor wipe complete. Users / payroll / accounts untouched.')
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
