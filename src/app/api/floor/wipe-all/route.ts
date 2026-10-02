import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

/** Same one-shot key pattern as restore-28sep — remove this route after use. */
const DEPLOY_SEED_KEY = 'sara_deploy_secret_key_2026'

/**
 * Wipe ALL floor_* tables on the DB this app is connected to.
 * Does NOT touch users / roles / payroll / accounts.
 *
 * GET /api/floor/wipe-all?key=…&confirm=YES
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  const confirm = req.nextUrl.searchParams.get('confirm')
  if (key !== DEPLOY_SEED_KEY) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (confirm !== 'YES') {
    return NextResponse.json(
      { ok: false, error: 'Add confirm=YES to run this one-shot wipe.' },
      { status: 400 }
    )
  }

  try {
    const before = {
      sheets: await prisma.floorDailySheet.count(),
      qualities: await prisma.floorQuality.count(),
      movements: await prisma.floorYarnMovement.count(),
      issuances: await prisma.floorYarnIssuance.count(),
      yarns: await prisma.floorYarn.count(),
      beams: await prisma.floorBeam.count(),
      looms: await prisma.floorLoom.count(),
    }

    const deleted = {
      sheets: (await prisma.floorDailySheet.deleteMany({})).count,
      movements: (await prisma.floorYarnMovement.deleteMany({})).count,
      issuances: (await prisma.floorYarnIssuance.deleteMany({})).count,
      qualities: (await prisma.floorQuality.deleteMany({})).count,
      yarns: (await prisma.floorYarn.deleteMany({})).count,
      beams: (await prisma.floorBeam.deleteMany({})).count,
      looms: (await prisma.floorLoom.deleteMany({})).count,
    }

    const after = {
      sheets: await prisma.floorDailySheet.count(),
      qualities: await prisma.floorQuality.count(),
      movements: await prisma.floorYarnMovement.count(),
      issuances: await prisma.floorYarnIssuance.count(),
      yarns: await prisma.floorYarn.count(),
      beams: await prisma.floorBeam.count(),
      looms: await prisma.floorLoom.count(),
    }

    return NextResponse.json({
      ok: true,
      message: 'Floor wipe complete. Users / payroll / accounts untouched.',
      before,
      deleted,
      after,
    })
  } catch (err) {
    console.error('[wipe-all]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Wipe failed' },
      { status: 500 }
    )
  }
}
