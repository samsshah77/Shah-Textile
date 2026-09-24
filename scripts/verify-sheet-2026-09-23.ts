import { config } from 'dotenv'
config()
import { dbGetSheet } from '../src/server/floorDb'
import { prisma } from '../src/lib/prisma'

async function main() {
  const sheet = await dbGetSheet('2026-09-23')
  console.log('rows', sheet?.length)
  for (const n of [1, 6, 8, 13, 21, 23, 27, 31, 34]) {
    const e = sheet?.find((x) => x.loomNumber === n)
    console.log(
      n,
      e?.qualityName,
      'rpm',
      e?.rpm,
      'rh',
      e?.rollerHours,
      'A',
      e?.shiftAMeters,
      'B',
      e?.shiftBMeters,
      'rem',
      JSON.stringify(e?.remarks),
      'tot',
      e?.totalMeters,
      e?.lot
    )
  }
  const total = sheet?.reduce((s, e) => s + e.totalMeters, 0)
  console.log('grand A+B', total)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
