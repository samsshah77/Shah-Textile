/**
 * Beam History → "Daily Entry Sw #": write a past run's Sw # into the Daily Entry rows of its
 * loom for the days it ran — only where the Sw # column is empty (a lot already written, e.g.
 * another beam's, is left as it is). Meters, quality and approval are not touched. Each day is
 * saved through the normal row save (same checks as the screen: month lock, approved sheet,
 * conflict with an open edit), so a day that cannot be saved is skipped and counted.
 */
import { prisma } from '@/lib/prisma'
import { sheetEntryFromDbRow } from '@/server/floorDb'
import { applySheetRows, rowHash, type SheetActor } from '@/server/floor/rowSync'
import { formatSwLotForDailyEntry, normalizeBeamLotKey } from '@/services/beamTrack'
import type { DailyLoomProductionEntry } from '@/types/production'

export type LotFillDay = { date: string; lot: string }
export type LotFillPlan = {
  lot: string
  /** Days whose row(s) have no Sw # — these get it. */
  empty: string[]
  /** Days that already show this Sw #. */
  same: string[]
  /** Days with another Sw # written — left as they are. */
  other: LotFillDay[]
  /** Days with no Daily Entry row for the loom. */
  noRow: string[]
}

/** The text the Daily Entry Sw # column gets — same as when the beam is mounted. */
export function runLot(beamNo: string, swLot: string | null): string {
  return formatSwLotForDailyEntry(swLot) || beamNo
}

function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

async function loomRows(date: string, loom: number): Promise<DailyLoomProductionEntry[]> {
  const rows = await prisma.floorDailySheet.findMany({ where: { date, loomNumber: loom } })
  return rows.map((r) => sheetEntryFromDbRow(r))
}

/** What would change (nothing is written). */
export async function planRunLots(loom: number, from: string, to: string, lot: string): Promise<LotFillPlan> {
  const key = normalizeBeamLotKey(lot)
  const plan: LotFillPlan = { lot, empty: [], same: [], other: [], noRow: [] }
  for (const date of daysBetween(from, to)) {
    const rows = await loomRows(date, loom)
    if (!rows.length) {
      plan.noRow.push(date)
      continue
    }
    const lots = rows.map((e) => String(e.lot || '').trim())
    if (lots.some((l) => !l)) plan.empty.push(date)
    else if (lots.some((l) => normalizeBeamLotKey(l) === key)) plan.same.push(date)
    else plan.other.push({ date, lot: lots.join(' / ') })
  }
  return plan
}

/** Write the Sw # into the empty rows. Returns the days written and the days that could not be. */
export async function fillRunLots(
  loom: number,
  from: string,
  to: string,
  lot: string,
  actor: SheetActor
): Promise<{ filled: string[]; failed: Array<{ date: string; reason: string }> }> {
  const filled: string[] = []
  const failed: Array<{ date: string; reason: string }> = []
  for (const date of daysBetween(from, to)) {
    const rows = (await loomRows(date, loom)).filter((e) => !String(e.lot || '').trim())
    if (!rows.length) continue
    try {
      await applySheetRows(
        date,
        rows.map((e) => ({
          entry: { ...e, lot } as unknown as Record<string, unknown>,
          base: rowHash(e),
          // Not a hand edit: who edited last, approval and meters stay as stored.
          explicit: false,
        })),
        actor
      )
      filled.push(date)
    } catch (err) {
      failed.push({ date, reason: err instanceof Error ? err.message : 'save nahi hua' })
    }
  }
  return { filled, failed }
}
