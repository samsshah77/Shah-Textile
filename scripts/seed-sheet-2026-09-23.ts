/**
 * Local CLI: seed 2026-09-23 sheet into DATABASE_URL from .env
 * Usage: npx tsx scripts/seed-sheet-2026-09-23.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { seedSheet20260923 } from '../src/server/seedSheet20260923'

async function main() {
  console.log('Seeding floor masters + sheet for 2026-09-23…')
  const result = await seedSheet20260923()
  console.log(`Sheet ${result.date}: ${result.looms} looms`)
  console.log(`  Actual A=${result.totalA}  B=${result.totalB}  A+B=${result.totalAB}`)
  console.log('Done.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    const { prisma } = await import('../src/lib/prisma')
    await prisma.$disconnect()
  })
