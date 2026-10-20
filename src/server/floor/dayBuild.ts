/**
 * Building a production day on the server, from the database — the same builder the
 * Daily Entry screen uses (src/lib/floor/dayBuilder.ts).
 *
 * "Start new day" runs here: the server builds the day from the stored looms, qualities,
 * beams, yarn and the last saved day, and saves it through the normal row-level save (so
 * every rule there applies: month lock, quality run ids, conflict check). A day that
 * already has rows is never rebuilt here — its rows are returned as they are.
 */
import { prisma } from '@/lib/prisma'
import { getExcelDailyLoomsForDate } from '@/data/productionData'
import { getProductionToday, shiftProductionDate } from '@/constants/productionCalendar'
import { buildDayRows, clearEndedLoomQualities, loomRecipe } from '@/lib/floor/dayBuilder'
import { normalizeQuality } from '@/services/production/masterTypes'
import { normalizeBeam } from '@/services/production/loomBeamHelpers'
import { normalizeSheetEntry, sheetSegmentIndex } from '@/services/production/qualityRuns'
import type { DailyLoomProductionEntry } from '@/types/production'
import { dbGetBeams, dbGetLooms, dbGetQualities, dbGetSheet, dbGetYarn, dbGetYarnIssuances } from '@/server/floorDb'
import { applySheetRows, sheetHashes, type SheetActor } from '@/server/floor/rowSync'

async function lastSavedDayBefore(date: string): Promise<string | null> {
  const r = await prisma.floorDailySheet.findFirst({ where: { date: { lt: date } }, orderBy: { date: 'desc' }, select: { date: true } })
  return r?.date ?? null
}

/** What the day would look like if built now (nothing is saved). */
export async function buildDayOnServer(date: string): Promise<DailyLoomProductionEntry[]> {
  const today = getProductionToday()
  const catalog = (await dbGetQualities()).map(normalizeQuality)
  const looms = clearEndedLoomQualities(await dbGetLooms(), catalog).looms
  const beams = (await dbGetBeams()).map((b) => normalizeBeam(b))
  const yarns = await dbGetYarn()
  const issuances = await dbGetYarnIssuances()
  const stored = await dbGetSheet(date)
  const loaded = (stored ?? (date < today ? getExcelDailyLoomsForDate(date) : [])).map(normalizeSheetEntry)

  const priorDate = (await lastSavedDayBefore(date)) || shiftProductionDate(date, -1)
  const priorRows = (await dbGetSheet(priorDate)) ?? (priorDate < today ? getExcelDailyLoomsForDate(priorDate) : null)
  const prior = (loomNumber: number) => {
    if (!priorRows) return null
    const forLoom = priorRows.filter((e) => e.loomNumber === loomNumber)
    return forLoom.find((e) => sheetSegmentIndex(e) === 1) || forLoom[0] || null
  }
  return buildDayRows({
    dateStr: date,
    today,
    looms,
    catalog,
    beams,
    loaded,
    prior,
    recipe: (loom) => loomRecipe(loom, date, { catalog, beams, yarns, issuances }),
  })
}

/** Start a day: build and save it when it has no rows yet; otherwise return what is saved. */
export async function startDayOnServer(date: string, actor: SheetActor) {
  const existing = await dbGetSheet(date)
  if (existing && existing.length) return { created: false, rows: existing, hashes: sheetHashes(existing) }
  const rows = await buildDayOnServer(date)
  const res = await applySheetRows(
    date,
    rows.map((e) => ({ entry: e as unknown as Record<string, unknown>, base: null })),
    actor
  )
  const all = (await dbGetSheet(date)) || res.rows
  return { created: true, rows: all, hashes: sheetHashes(all) }
}
