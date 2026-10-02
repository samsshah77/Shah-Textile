/**
 * Wipe ALL floor_* tables. Users / payroll / accounts untouched.
 *
 * On Plesk (Application Root /httpdocs), Run Node.js command:
 *   CONFIRM_FLOOR_WIPE=YES node scripts/wipe-floor-live.mjs
 *
 * Uses DATABASE_URL from the environment (Plesk Node.js custom vars).
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

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
  const [sheets, qualities, movements, issuances, yarns, beams, looms] =
    await Promise.all([
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
