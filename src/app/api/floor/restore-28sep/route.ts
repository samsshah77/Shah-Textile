import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { dbSaveQualities, dbSaveSheet } from '@/server/floorDb'
import { ensureFloorPayrollTables } from '@/server/ensureFloorPayrollTables'
import type { DailyLoomProductionEntry } from '@/types/production'
import type { QualityMaster } from '@/services/productionMastersService'
import payload from '@/server/data/restore28Sep2026.json'

export const runtime = 'nodejs'

const DEPLOY_SEED_KEY = 'sara_deploy_secret_key_2026'

type RestorePayload = {
  date: string
  qualities: QualityMaster[]
  loomAssign: { loomNumber: number; qualityId: string; defaultRpm: number | null }[]
  sheet: DailyLoomProductionEntry[]
}

/**
 * One-shot live restore of 28 Sep Excel qualities + L# assignments + daily sheet.
 * GET /api/floor/restore-28sep?key=…&confirm=YES
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  const confirm = req.nextUrl.searchParams.get('confirm')
  if (key !== DEPLOY_SEED_KEY) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (confirm !== 'YES') {
    return NextResponse.json(
      { ok: false, error: 'Add confirm=YES to run this one-shot restore.' },
      { status: 400 }
    )
  }

  try {
    await ensureFloorPayrollTables()

    const data = payload as RestorePayload
    const qualities = data.qualities
    const sheet = (data.sheet || [])
      .filter((e) => e.loomNumber >= 1 && e.loomNumber <= 34)
      .sort((a, b) => a.loomNumber - b.loomNumber)

    await dbSaveQualities(qualities)

    await prisma.$transaction(async (tx) => {
      await tx.floorLoom.updateMany({ data: { qualityId: null } })
      for (const a of data.loomAssign) {
        if (a.loomNumber < 1 || a.loomNumber > 34) continue
        await tx.floorLoom.updateMany({
          where: { loomNumber: a.loomNumber },
          data: {
            qualityId: a.qualityId,
            defaultRpm: a.defaultRpm ?? undefined,
          },
        })
      }
    })

    await dbSaveSheet(data.date, sheet)

    const meters = sheet.reduce((s, e) => s + (Number(e.totalMeters) || 0), 0)
    const assigned = await prisma.floorLoom.count({ where: { qualityId: { not: null } } })

    return NextResponse.json({
      ok: true,
      date: data.date,
      qualities: qualities.length,
      assignedLooms: assigned,
      sheetRows: sheet.length,
      totalMeters: meters,
    })
  } catch (err) {
    console.error('[floor/restore-28sep]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Restore failed' },
      { status: 500 }
    )
  }
}
