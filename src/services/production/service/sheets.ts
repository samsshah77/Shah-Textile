/** Daily production sheet: building a day, editing rows, approval. (Part of productionMastersService — no behaviour change.) */
import { buildDayRows, clearEndedLoomQualities, loomRecipe } from '@/lib/floor/dayBuilder'
import { withRowMetrics } from '@/lib/floor/rowMetrics'
import {
  LoomStatus,
} from '@/types/loom'
import {
  calculateProductionMetrics,
  DailyLoomProductionEntry,
} from '@/types/production'
import {
  getExcelDailyLoomsForDate,
} from '@/data/productionData'
import {
  PRODUCTION_TODAY,
  getProductionToday,
  shiftProductionDate,
} from '@/constants/productionCalendar'
import {
  isClient,
} from '@/services/production/loomBeamHelpers'
import type {
  LoomMaster,
} from '@/services/production/masterTypes'
import {
  normalizeSheetEntry,
  sheetSegmentIndex,
  sortSheetEntries,
  qualityRunThatOwnsSheetEntry,
  MAX_SAME_DAY_QUALITY_SEGMENTS,
  sheetEntryId,
} from '@/services/production/qualityRuns'
import {
  memoryStore,
  setSheetFromServer,
  runAction,
  enqueue,
  notifyFloorSaveProblem,
  post as floorPost,
} from '@/services/production/floorSync'
import type {
  RowHashes,
} from '@/lib/floor/rowSync'
import {
  KEY_SHEET,
  KEY_BEAMS,
  persistLoomEntry,
  persistDeleteLoomSegment,
  saveJson,
  listPersistedSheetDates,
} from '@/services/production/floorStore'
import type { ProductionMastersService } from '@/services/productionMastersService'

export const sheetsMethods = {
  sheetKey(this: ProductionMastersService, dateStr: string) {
    return `${KEY_SHEET}_${dateStr}`
  },

  /** True when a production sheet was explicitly saved/seeded for this date (not a view-only rebuild). */
  hasPersistedSheet(this: ProductionMastersService, dateStr: string): boolean {
    return this.peekSheetDay(dateStr) != null
  },

  peekSheetDay(this: ProductionMastersService, dateStr: string): DailyLoomProductionEntry[] | null {
    const key = this.sheetKey(dateStr)
    try {
      const raw = memoryStore.get(key)
      if (raw) {
        const parsed = JSON.parse(raw) as DailyLoomProductionEntry[]
        if (!Array.isArray(parsed)) return null
        return sortSheetEntries(parsed.map(normalizeSheetEntry))
      }
    } catch {
      // ignore
    }
    return null
  },

  /**
   * Load saved meters for a day. Prefer persisted sheet; for past dates without a DB sheet,
   * fall back to Excel history. Never invent a blank "today" file just by opening the date.
   */
  loadSheetDay(this: ProductionMastersService, dateStr: string): DailyLoomProductionEntry[] {
    const peeked = this.peekSheetDay(dateStr)
    if (peeked) return peeked
    if (dateStr < PRODUCTION_TODAY) {
      return getExcelDailyLoomsForDate(dateStr)
    }
    return []
  },

  /** Latest saved primary (segment 1) row for this loom before `dateStr`. */
  priorSheetRow(this: ProductionMastersService, dateStr: string, loomNumber: number): DailyLoomProductionEntry | null {
    const priorDates = listPersistedSheetDates().filter((d) => d < dateStr)
    const priorDate = priorDates.length ? priorDates[priorDates.length - 1] : shiftProductionDate(dateStr, -1)
    const rows =
      this.peekSheetDay(priorDate) ??
      (priorDate < getProductionToday() ? getExcelDailyLoomsForDate(priorDate) : null)
    if (!rows) return null
    const forLoom = rows.filter((e) => e.loomNumber === loomNumber)
    return (
      forLoom.find((e) => sheetSegmentIndex(e) === 1) ||
      forLoom[0] ||
      null
    )
  },

  /** Latest saved lot for this loom before `dateStr`. Empty string is kept; missing day returns null. */
  carriedLot(this: ProductionMastersService, dateStr: string, loomNumber: number): string | null {
    const row = this.priorSheetRow(dateStr, loomNumber)
    if (!row) return null
    return row.lot || ''
  },

  /** Quality recipe as it is right now on the loom. Used only for the day being edited or a brand-new day. */
  recipeForLoom(this: ProductionMastersService, loom: LoomMaster, dateStr: string): Partial<DailyLoomProductionEntry> {
    return loomRecipe(loom, dateStr, {
      catalog: this.getQualities(),
      beams: this.getBeams(),
      yarns: this.getYarn(),
      issuances: this.getYarnIssuances(),
    })
  },

  /**
   * Build sheet from masters + preserved Actual A/B & Roller Hours.
   * Excel formulas:
   *   100% Running = RPM/Pick * 60/39.38 * RollerHours
   *   A+B = ActualA + ActualB
   *   Eff Running = (A+B) / 100%Running * 100
   *   Loss Running = 100%Running - (A+B)
   *   100% 24h = RPM/Pick * 60/39.38 * 24
   *   Eff 24h = (A+B) / 100%24h * 100
   *   Loss 24h = 100%24h - (A+B)
   *
   * Viewing a date does NOT create a blank DB/local sheet. Persist only when:
   * - a sheet already exists for that date, or
   * - `{ persist: true }` (Start New Day / first edit).
   */
  buildSheetForDate(
    this: ProductionMastersService,
    dateStr: string = PRODUCTION_TODAY,
    opts?: { persist?: boolean; skipPersist?: boolean }
  ): DailyLoomProductionEntry[] {
    const catalog = this.getQualities()
    const repaired = clearEndedLoomQualities(this.getLooms(), catalog)
    const looms = repaired.looms
    if (repaired.changed) this.saveLooms(looms)
    const beams = this.getBeams()
    const hadPersisted = this.peekSheetDay(dateStr) != null
    const loaded = this.loadSheetDay(dateStr).map(normalizeSheetEntry)
    const entries = buildDayRows({
      dateStr,
      today: getProductionToday(),
      looms,
      catalog,
      beams,
      loaded,
      prior: (loomNumber) => this.priorSheetRow(dateStr, loomNumber),
      recipe: (loom) => this.recipeForLoom(loom, dateStr),
    })
    if (!opts?.skipPersist && (opts?.persist || hadPersisted)) {
      saveJson(this.sheetKey(dateStr), entries)
    }
    return entries
  },

  updateSheetEntry(
    this: ProductionMastersService,
    dateStr: string,
    loomNumber: number,
    patch: Partial<DailyLoomProductionEntry>,
    editorName?: string,
    segmentIndex: number = sheetSegmentIndex(patch)
  ): DailyLoomProductionEntry[] {
    const seg = sheetSegmentIndex({ segmentIndex })
    const forceClear = Boolean(
      (patch as Partial<DailyLoomProductionEntry> & { _clearQuality?: boolean })._clearQuality
    )
    const current = this.buildSheetForDate(dateStr, { skipPersist: true })
    let updatedLoom: (DailyLoomProductionEntry & { _clearQuality?: boolean }) | null = null
    let found = false
    const next = current.map((e) => {
      if (e.loomNumber !== loomNumber || sheetSegmentIndex(e) !== seg) return e
      found = true
      const { _clearQuality: _drop, ...patchRest } = patch as Partial<DailyLoomProductionEntry> & {
        _clearQuality?: boolean
      }
      void _drop
      const merged = {
        ...e,
        ...patchRest,
        loomNumber,
        segmentIndex: seg,
        lastEditedBy: editorName || e.lastEditedBy || 'Floor Operator',
        lastEditedAt: new Date().toISOString(),
      }
      // Same sum the server does on save (src/lib/floor/rowMetrics.ts).
      const result: DailyLoomProductionEntry = normalizeSheetEntry(
        withRowMetrics({
          ...merged,
          id: sheetEntryId(dateStr, loomNumber, seg),
          date: dateStr,
        })
      )
      updatedLoom = forceClear ? { ...result, _clearQuality: true } : result
      return result
    })

    if (!found) {
      const loom = this.getLooms().find((l) => l.loomNumber === loomNumber)
      const base =
        current.find((e) => e.loomNumber === loomNumber && sheetSegmentIndex(e) === 1) ||
        current.find((e) => e.loomNumber === loomNumber)
      const { _clearQuality: _drop2, ...patchRest2 } = patch as Partial<DailyLoomProductionEntry> & {
        _clearQuality?: boolean
      }
      void _drop2
      const seed: DailyLoomProductionEntry = normalizeSheetEntry({
        id: sheetEntryId(dateStr, loomNumber, seg),
        date: dateStr,
        loomNumber,
        segmentIndex: seg,
        category: base?.category || loom?.category || 'G6200',
        model: base?.model || loom?.model,
        qualityName: '—',
        fabricType: '',
        warpYarn: '',
        weftYarn: '',
        rpm: base?.rpm || loom?.defaultRpm || 340,
        reed: base?.reed || 60,
        pick: base?.pick || 60,
        widthInch: base?.widthInch || 66,
        gsm: base?.gsm ?? 0,
        rollerHours: 0,
        runningHours: 0,
        shiftAMeters: 0,
        shiftBMeters: 0,
        totalMeters: 0,
        efficiencyPercentage: 0,
        stopLossMeters: 0,
        status: (base?.status || loom?.status || 'RUNNING') as LoomStatus,
        remarks: '',
        fabricFault: '',
        lot: base?.lot || '',
        ...patchRest2,
        lastEditedBy: editorName || 'Floor Operator',
        lastEditedAt: new Date().toISOString(),
      })
      const rollerHours = seed.rollerHours ?? seed.runningHours ?? 0
      const metrics = calculateProductionMetrics({
        rpm: seed.rpm,
        runningHours: rollerHours,
        pick: seed.pick || 60,
        shiftAMeters: seed.shiftAMeters || 0,
        shiftBMeters: seed.shiftBMeters || 0,
        loomNumber,
      })
      const seeded = normalizeSheetEntry({
        ...seed,
        rollerHours,
        runningHours: rollerHours,
        runningTheoretical: metrics.theoreticalMeters,
        totalMeters: metrics.totalMeters,
        efficiencyPercentage: metrics.efficiencyPercentage,
        stopLossMeters: metrics.stopLossMeters,
        theoretical24h: metrics.theoretical24h,
        efficiency24h: metrics.efficiency24h,
        loss24h: metrics.loss24h,
      })
      updatedLoom = forceClear ? { ...seeded, _clearQuality: true } : seeded
      next.push(seeded)
    }

    const sorted = sortSheetEntries(next)
    // This row was edited by hand (server keeps its quality unless cleared on purpose).
    if (updatedLoom) persistLoomEntry(dateStr, loomNumber, updatedLoom)
    // Save the patched day: only rows that differ from the server copy are sent.
    saveJson(this.sheetKey(dateStr), sorted)

    return sorted
  },

  /** Explicit same-day dual quality: add next segment for `qualityId` on this loom/date. */
  addQualitySegmentOnDay(
    this: ProductionMastersService,
    dateStr: string,
    loomNumber: number,
    qualityId: string
  ): DailyLoomProductionEntry[] {
    const loom = this.getLooms().find((l) => l.loomNumber === loomNumber)
    if (!loom) return this.buildSheetForDate(dateStr, { skipPersist: true })
    const before = this.buildSheetForDate(dateStr, { skipPersist: true })
    const maxSeg = before
      .filter((e) => e.loomNumber === loomNumber)
      .reduce((m, r) => Math.max(m, sheetSegmentIndex(r)), 0)
    if (maxSeg >= MAX_SAME_DAY_QUALITY_SEGMENTS) {
      return before
    }
    const catalog = this.getQualities()
    this.writeQualityPoseOnDay(
      dateStr,
      loomNumber,
      qualityId,
      { ...loom, qualityId },
      catalog,
      { allowNewSegment: true }
    )
    return this.buildSheetForDate(dateStr, { skipPersist: true })
  },

  /** Remove same-day Part 2+ row (cannot delete Part 1). */
  removeQualitySegmentOnDay(
    this: ProductionMastersService,
    dateStr: string,
    loomNumber: number,
    segmentIndex: number
  ): DailyLoomProductionEntry[] {
    const seg = sheetSegmentIndex({ segmentIndex })
    const current = this.buildSheetForDate(dateStr, { skipPersist: true })
    if (seg <= 1) return current

    const removed = current.find(
      (e) => e.loomNumber === loomNumber && sheetSegmentIndex(e) === seg
    )
    if (!removed) return current

    const next = sortSheetEntries(
      current.filter(
        (e) => !(e.loomNumber === loomNumber && sheetSegmentIndex(e) === seg)
      )
    )
    saveJson(this.sheetKey(dateStr), next)
    void persistDeleteLoomSegment(dateStr, loomNumber, seg)

    const catalog = this.getQualities()
    const removedQ = qualityRunThatOwnsSheetEntry(
      { ...removed, date: dateStr },
      catalog,
      dateStr
    )
    const loom = this.getLooms().find((l) => l.loomNumber === loomNumber)
    if (loom && removedQ && loom.qualityId === removedQ.id) {
      const p1 = next.find(
        (e) => e.loomNumber === loomNumber && sheetSegmentIndex(e) === 1
      )
      const p1Q = p1
        ? qualityRunThatOwnsSheetEntry({ ...p1, date: dateStr }, catalog, dateStr)
        : null
      if (p1Q) {
        this.saveLooms(
          this.getLooms().map((l) =>
            l.loomNumber === loomNumber ? { ...l, qualityId: p1Q.id } : l
          )
        )
      }
    }

    return next
  },

  /** Zero roller hours + Actual A/B for every loom on this day (after UI confirm). */
  resetDayMeters(this: ProductionMastersService, dateStr: string, editorName?: string): DailyLoomProductionEntry[] {
    const current = this.buildSheetForDate(dateStr, { skipPersist: true })
    const editor = editorName || 'Floor Operator'
    const now = new Date().toISOString()
    const next = current.map((e) => {
      const metrics = calculateProductionMetrics({
        rpm: e.rpm,
        runningHours: 0,
        pick: e.pick || 60,
        shiftAMeters: 0,
        shiftBMeters: 0,
        loomNumber: e.loomNumber,
      })
      return {
        ...e,
        rollerHours: 0,
        runningHours: 0,
        shiftAMeters: 0,
        shiftBMeters: 0,
        runningTheoretical: metrics.theoreticalMeters,
        totalMeters: metrics.totalMeters,
        efficiencyPercentage: metrics.efficiencyPercentage,
        stopLossMeters: metrics.stopLossMeters,
        theoretical24h: metrics.theoretical24h,
        efficiency24h: metrics.efficiency24h,
        loss24h: metrics.loss24h,
        lastEditedBy: editor,
        lastEditedAt: now,
      } satisfies DailyLoomProductionEntry
    })
    for (const row of next) persistLoomEntry(dateStr, row.loomNumber, row)
    saveJson(this.sheetKey(dateStr), next)
    return next
  },

  async submitSheetForApproval(this: ProductionMastersService, dateStr: string): Promise<DailyLoomProductionEntry[]> {
    if (!isClient()) return this.buildSheetForDate(dateStr)
    // In the day's save order, after any edits still on their way.
    const { data: reply } = await runAction(this.sheetKey(dateStr), { action: 'submitForApproval', date: dateStr })
    const data = (reply || { ok: false, error: 'Server se raabta nahi ho saka.' }) as {
      ok?: boolean
      error?: string
      entries?: DailyLoomProductionEntry[]
      hashes?: RowHashes
    }
    if (data.ok && Array.isArray(data.entries)) {
      setSheetFromServer(dateStr, data.entries, data.hashes, { force: true })
      return data.entries
    }
    return this.buildSheetForDate(dateStr)
  },

  async approveSheet(this: ProductionMastersService, dateStr: string): Promise<DailyLoomProductionEntry[]> {
    if (!isClient()) return this.buildSheetForDate(dateStr)
    // In the day's save order, after any edits still on their way.
    const { data: reply } = await runAction(this.sheetKey(dateStr), { action: 'approveSheet', date: dateStr })
    const data = (reply || { ok: false, error: 'Server se raabta nahi ho saka.' }) as {
      ok?: boolean
      error?: string
      entries?: DailyLoomProductionEntry[]
      hashes?: RowHashes
    }
    if (data.ok && Array.isArray(data.entries)) {
      setSheetFromServer(dateStr, data.entries, data.hashes, { force: true })
      return data.entries
    }
    if (!data.ok) {
      throw new Error(data.error || 'Approval failed')
    }
    return this.buildSheetForDate(dateStr)
  },

  async unlockSheet(this: ProductionMastersService, dateStr: string): Promise<DailyLoomProductionEntry[]> {
    if (!isClient()) return this.buildSheetForDate(dateStr)
    // In the day's save order, after any edits still on their way.
    const { data: reply } = await runAction(this.sheetKey(dateStr), { action: 'unlockSheet', date: dateStr })
    const data = (reply || { ok: false, error: 'Server se raabta nahi ho saka.' }) as {
      ok?: boolean
      error?: string
      entries?: DailyLoomProductionEntry[]
      hashes?: RowHashes
    }
    if (data.ok && Array.isArray(data.entries)) {
      setSheetFromServer(dateStr, data.entries, data.hashes, { force: true })
      return data.entries
    }
    if (!data.ok) {
      throw new Error(data.error || 'Unlock failed')
    }
    return this.buildSheetForDate(dateStr)
  },

  /**
   * Start a day: the server builds it from the database (src/server/floor/dayBuild.ts) with
   * the same builder this screen uses, and saves it. A day that already has rows is kept.
   */
  async startNewDay(this: ProductionMastersService, dateStr: string): Promise<DailyLoomProductionEntry[]> {
    // Clear yesterday's "beam ended today" notes, and let those beam saves reach the server first.
    this.clearExpiredBeamEnds(dateStr)
    await enqueue(KEY_BEAMS, async () => undefined)
    const r = await enqueue(this.sheetKey(dateStr), () => floorPost({ action: 'startDay', date: dateStr }))
    const sync = r.status === 200 && r.data?.ok ? (r.data.sync as { rows?: DailyLoomProductionEntry[]; hashes?: RowHashes } | undefined) : undefined
    if (sync?.rows) setSheetFromServer(dateStr, sync.rows, sync.hashes, { force: true })
    else
      notifyFloorSaveProblem([400, 403, 409, 423].includes(r.status) ? r.status : 409, r.data?.error ? r.data : { error: 'Naya din server par nahi bana — internet check karke dobara koshish karein.' })
    return this.buildSheetForDate(dateStr, { skipPersist: true })
  },

  /**
   * Loom × day matrix. meters / shiftA / shiftB sum. efficiency is actual ÷ target.
   * active is 1 when the loom was running that day. Empty days stay —.
   * `ownsEntry` keeps a quality track on that quality only: a loom that switched
   * quality mid-month does not carry the previous quality's meters.
   */
}

export type SheetsMethods = typeof sheetsMethods
