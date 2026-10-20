/**
 * Floor masters + daily sheets in the browser. The work is split by subject into
 * src/services/production/service/*.ts and src/services/production/floorStore.ts.
 */
export { normalizeBeamLotKey, buildBeamTrackFromEntries, beamDailyEntryLot, formatSwLotForDailyEntry, displaySwLotPlain, parseLotKind, composeLot } from '@/services/beamTrack'
export type { BeamTrackResult, BeamTrackDay } from '@/services/beamTrack'
export type { LotKind } from '@/services/beamTrack'
export * from '@/services/production/masterTypes'
export * from '@/services/production/floorLocalCache'
export * from '@/services/production/qualityRuns'
export * from '@/services/production/loomBeamHelpers'
export * from '@/services/production/productionSeeds'
export {
  getFloorMonthLocks,
  isFloorMonthLocked,
  setFloorMonthLock,
  hydrateFloorFromDb,
  refreshFloorMastersFromDb,
  preloadAllFloorSheets,
  preloadFloorSheet,
  listPersistedSheetDates,
  listPersistedSheetEntries,
  mergeSheetEntriesForDate,
  mergedSheetEntriesForTotals,
  preloadMonthSheets,
} from '@/services/production/floorStore'
export type { FloorMonthLock } from '@/services/production/floorStore'
import { loomsMethods, type LoomsMethods } from '@/services/production/service/looms'
import { beamsMethods, type BeamsMethods } from '@/services/production/service/beams'
import { yarnMethods, type YarnMethods } from '@/services/production/service/yarn'
import { qualitiesMethods, type QualitiesMethods } from '@/services/production/service/qualities'
import { sheetsMethods, type SheetsMethods } from '@/services/production/service/sheets'
import { matrixMethods, type MatrixMethods } from '@/services/production/service/matrix'

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- methods are attached below
class ProductionMastersService {
  /** Last forward-fill days skipped because another quality was already on the loom. */
  lastForwardFillSkips: {
    date: string
    qualityName: string
    loomNumber: number
  }[] = []
}

// Methods live in ./production/service/* and are attached here, so callers keep using
// productionMastersService.X().
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface ProductionMastersService extends LoomsMethods, BeamsMethods, YarnMethods, QualitiesMethods, SheetsMethods, MatrixMethods {}
Object.assign(ProductionMastersService.prototype, loomsMethods, beamsMethods, yarnMethods, qualitiesMethods, sheetsMethods, matrixMethods)

export type { ProductionMastersService }
export const productionMastersService = new ProductionMastersService()
