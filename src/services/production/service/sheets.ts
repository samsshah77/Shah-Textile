/** Daily production sheet: building a day, editing rows, approval. (Part of productionMastersService — no behaviour change.) */
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
  LOOM_STATUS_LABEL,
  resolveLoomCondition,
} from '@/constants/loomConditions'
import {
  beamDailyEntryLot,
} from '@/services/beamTrack'
import {
  isClient,
  beamOnLoom,
  getMountedBeamsOnLoom,
} from '@/services/production/loomBeamHelpers'
import type {
  LoomMaster,
} from '@/services/production/masterTypes'
import {
  normalizeQualityStatus,
} from '@/services/production/masterTypes'
import {
  normalizeSheetEntry,
  sheetSegmentIndex,
  sortSheetEntries,
  sheetRowKey,
  isQualityEndedSheetRow,
  namedQualityOnRow,
  qualityRunThatOwnsSheetEntry,
  MAX_SAME_DAY_QUALITY_SEGMENTS,
  qualityNameKey,
  QUALITY_ENDED_REMARK,
  yarnRecipeForDate,
  qualityPoseEndedBeforeDay,
  sheetEntryId,
} from '@/services/production/qualityRuns'
import {
  memoryStore,
  setSheetFromServer,
  runAction,
} from '@/services/production/floorSync'
import type {
  RowHashes,
} from '@/lib/floor/rowSync'
import {
  KEY_SHEET,
  persistLoomEntry,
  persistDeleteLoomSegment,
  saveJson,
  removeStoreKey,
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
    const quality = this.getQualities().find((q) => q.id === loom.qualityId) || null
    const beam = this.getBeams().find((b) => beamOnLoom(b, loom.loomNumber))
    const yarns = this.getYarn()
    const issuances = this.getYarnIssuances()
    const loomIss = issuances.find((iss) => iss.loomNumber === loom.loomNumber)
    const weft =
      (loomIss ? yarns.find((y) => y.id === loomIss.yarnId) : null) ||
      yarns.find((y) => y.id === loom.weftYarnId)
    const yarnRecipe = yarnRecipeForDate(quality, dateStr)
    return {
      qualityName: quality?.name || '—',
      fabricType: quality?.fabricType || '',
      warpYarn: yarnRecipe?.warpYarn || beam?.warp || '',
      weftYarn: yarnRecipe?.weftYarn || weft?.yarnType || '',
      rpm: loom.defaultRpm,
      reed: quality?.reed || beam?.reed || 60,
      pick: quality?.pick || loomIss?.pick || 60,
      widthInch: quality?.widthInch || beam?.width || 66,
      gsm: quality?.gsm ?? 0,
    }
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
    // Repair: loom still allotted to an ENDED quality → clear so post-end days zero + E.
    let looms = this.getLooms()
    if (
      looms.some((l) => {
        if (!l.qualityId) return false
        const q = catalog.find((item) => item.id === l.qualityId)
        return Boolean(q && normalizeQualityStatus(q.status) === 'ENDED')
      })
    ) {
      looms = looms.map((l) => {
        if (!l.qualityId) return l
        const q = catalog.find((item) => item.id === l.qualityId)
        if (q && normalizeQualityStatus(q.status) === 'ENDED') {
          return { ...l, qualityId: null }
        }
        return l
      })
      this.saveLooms(looms)
    }
    const beams = this.getBeams()
    const hadPersisted = this.peekSheetDay(dateStr) != null
    const loaded = this.loadSheetDay(dateStr).map(normalizeSheetEntry)
    const prevByKey = new Map(
      loaded.map((e) => [sheetRowKey(e.loomNumber, sheetSegmentIndex(e)), e])
    )

    const primaryEntries = looms.map((loom) => {
      const prev = prevByKey.get(sheetRowKey(loom.loomNumber, 1))
      const beam = beams.find((b) => beamOnLoom(b, loom.loomNumber))
      const live = this.recipeForLoom(loom, dateStr)
      const prior = this.priorSheetRow(dateStr, loom.loomNumber)
      const isPastDay = dateStr !== getProductionToday()
      const loomQ = loom.qualityId
        ? catalog.find((q) => q.id === loom.qualityId)
        : undefined
      const loomQStatus = loomQ ? normalizeQualityStatus(loomQ.status) : null
      // Only ACTIVE/HOLD counts as a live pose — stale ENDED id must not keep meters.
      const loomHasLivePose = Boolean(
        loomQ && (loomQStatus === 'ACTIVE' || loomQStatus === 'HOLD')
      )
      // After Quality End (no new quality on loom): keep ended name for E badge,
      // but force zeros — never carry pick/meters from end-day / stale seed.
      const prevNamed = Boolean(prev && namedQualityOnRow(prev.qualityName))
      const rowLooksEnded =
        isQualityEndedSheetRow(prev) ||
        qualityPoseEndedBeforeDay(prev, catalog, dateStr) ||
        (!prevNamed && qualityPoseEndedBeforeDay(prior, catalog, dateStr)) ||
        // Stale seed: same quality name as ended prior day, loom has no live pose.
        (prevNamed &&
          prior &&
          qualityNameKey(prev!.qualityName) === qualityNameKey(prior.qualityName || '') &&
          qualityPoseEndedBeforeDay(prior, catalog, dateStr))
      // On a past day the loom's *current* quality does not apply (it starts on the day it
      // was assigned and is written forward from there), so an End before this day wins.
      // A saved row that already has production is never blanked by a rebuild: the stored
      // meters win (an explicit End writes its zeros itself). Otherwise a quality ended "before"
      // this day would wipe real entries just by opening the sheet.
      const prevHasProduction = Boolean(
        prev && (Number(prev.shiftAMeters) || 0) + (Number(prev.shiftBMeters) || 0) > 0
      )
      const poseEnded = rowLooksEnded && (!loomHasLivePose || isPastDay) && !prevHasProduction
      // Quality Ended *on this day*: the day itself still belongs to it (entry allowed),
      // even though the loom master was already cleared by the End.
      const priorOwner = prior
        ? qualityRunThatOwnsSheetEntry({ ...prior, date: dateStr }, catalog, dateStr)
        : null
      const priorEndsToday = Boolean(
        priorOwner &&
          normalizeQualityStatus(priorOwner.status) === 'ENDED' &&
          String(priorOwner.endedOn || '').slice(0, 10) === dateStr
      )
      // Carry yesterday's quality forward only while that quality is still running.
      const priorStillRuns = Boolean(
        prior && namedQualityOnRow(prior.qualityName) && !qualityPoseEndedBeforeDay(prior, catalog, dateStr)
      )
      const endedLabelSrc = poseEnded
        ? prev && (namedQualityOnRow(prev.qualityName) || isQualityEndedSheetRow(prev))
          ? prev
          : prior && namedQualityOnRow(prior.qualityName)
            ? prior
            : null
        : null
      // A saved row keeps the quality stored on that date, including a deliberate clear.
      // Past days must NOT fall back to today's live loom master — factory backfill
      // starts empty / from prior day only (e.g. set up 2 Oct without copying 3 Oct).
      // After Quality End, loom.qualityId is null — do NOT carry prior day's pick/quality
      // onto the next day (show empty / B/End only until a new quality is assigned).
      const cleared = prev ? !namedQualityOnRow(prev.qualityName) && !poseEnded : false
      // Only revive after a real "Quality Ended" stub + new live assign.
      // Do NOT treat Part1≠loom.qualityId as revive — that is normal dual quality (P1/P2)
      // and overwriting P1 with live destroyed live Part 1/2 rows after deploy.
      const reviveFromLive =
        Boolean(loomHasLivePose && namedQualityOnRow(live.qualityName)) &&
        isQualityEndedSheetRow(prev)
      const identity = poseEnded
        ? null
        : cleared
          ? null
          : reviveFromLive
            ? live
            : prev
              ? prev
              : priorStillRuns && (loomHasLivePose || priorEndsToday)
                ? prior
                : !isPastDay && loomHasLivePose && namedQualityOnRow(live.qualityName)
                  ? live
                  : null
      const hasPose = Boolean(identity && namedQualityOnRow(identity.qualityName))
      const pick = hasPose
        ? identity?.pick || (!isPastDay ? live.pick : undefined) || 60
        : 0
      const reed = hasPose
        ? identity?.reed || (!isPastDay ? live.reed : undefined) || 60
        : 0
      const rpm =
        identity?.rpm ||
        (hasPose && !isPastDay ? live.rpm : undefined) ||
        (prev || prior ? undefined : loom.defaultRpm) ||
        loom.defaultRpm
      const masterStatus = (loom.status || 'RUNNING') as LoomStatus
      // Day-wise status: saved row for this date → else prior day (auto carry) → else master.
      // Ignore "Quality Ended" as a condition source once a live quality is on the loom.
      const statusSource =
        loomHasLivePose && isQualityEndedSheetRow(prev)
          ? prior && !isQualityEndedSheetRow(prior)
            ? prior
            : null
          : prev || prior
      const status = statusSource
        ? resolveLoomCondition(statusSource.status, statusSource.remarks)
        : masterStatus
      const statusLabel =
        status === 'RUNNING' ? '' : LOOM_STATUS_LABEL[status] || status
      const prevRemarks = (statusSource?.remarks || '').trim()
      const prevIsStatusLabel =
        !prevRemarks ||
        (Object.values(LOOM_STATUS_LABEL) as string[]).some(
          (label) => label.toLowerCase() === prevRemarks.toLowerCase()
        )
      // Grey + "Quality Ended" only while loom has no new quality; clear once attached.
      const remarks = poseEnded
        ? QUALITY_ENDED_REMARK
        : loomHasLivePose && isQualityEndedSheetRow(prev)
          ? statusLabel
          : statusSource
            ? prevIsStatusLabel
              ? statusLabel
              : statusSource.remarks || ''
            : statusLabel

      const rollerHours = poseEnded
        ? 0
        : prev?.rollerHours != null
          ? prev.rollerHours
          : status === 'BEAM_END' || status === 'STOPPED' || dateStr >= getProductionToday()
            ? 0
            : 24
      const shiftA = poseEnded ? 0 : (prev?.shiftAMeters ?? 0)
      const shiftB = poseEnded ? 0 : (prev?.shiftBMeters ?? 0)

      const metrics = calculateProductionMetrics({
        rpm,
        runningHours: rollerHours,
        pick,
        shiftAMeters: shiftA,
        shiftBMeters: shiftB,
        loomNumber: loom.loomNumber,
      })
      const mountedBeams = getMountedBeamsOnLoom(beams, loom.loomNumber)
      const fromBeam = mountedBeams.map((b) => beamDailyEntryLot(b)).filter(Boolean).join(' + ')
      // Mounted beam owns SW # (read-only in Daily Entry). Beam Identity is never the lot.
      const lot = fromBeam || (beam ? beamDailyEntryLot(beam) : '')

      const built: DailyLoomProductionEntry = {
        id: sheetEntryId(dateStr, loom.loomNumber, 1),
        date: dateStr,
        loomNumber: loom.loomNumber,
        segmentIndex: 1,
        category: prev?.category || loom.category,
        model: prev?.model || loom.model,
        qualityName: poseEnded
          ? endedLabelSrc?.qualityName || '—'
          : identity?.qualityName || '—',
        fabricType: poseEnded
          ? endedLabelSrc?.fabricType || ''
          : hasPose
            ? identity?.fabricType || ''
            : '',
        warpYarn: hasPose ? identity?.warpYarn || '' : '',
        weftYarn: hasPose ? identity?.weftYarn || '' : '',
        rpm,
        reed,
        pick,
        widthInch: hasPose
          ? identity?.widthInch || (!isPastDay ? live.widthInch : undefined) || 66
          : 0,
        gsm: hasPose
          ? identity?.gsm ?? (!isPastDay ? live.gsm : undefined) ?? 0
          : 0,
        rollerHours,
        runningHours: rollerHours,
        runningTheoretical: metrics.theoreticalMeters,
        shiftAMeters: shiftA,
        shiftBMeters: shiftB,
        totalMeters: metrics.totalMeters,
        efficiencyPercentage: metrics.efficiencyPercentage,
        stopLossMeters: metrics.stopLossMeters,
        theoretical24h: metrics.theoretical24h,
        efficiency24h: metrics.efficiency24h,
        loss24h: metrics.loss24h,
        status,
        remarks,
        fabricFault: prev?.fabricFault || '',
        // Same-day values typed on Daily Entry — keep them when the day is rebuilt.
        ...(prev?.fabricFaultA != null ? { fabricFaultA: prev.fabricFaultA } : {}),
        ...(prev?.fabricFaultB != null ? { fabricFaultB: prev.fabricFaultB } : {}),
        ...(!poseEnded && prev?.weightKg != null ? { weightKg: prev.weightKg } : {}),
        // Server-stamped quality run id — kept while the row keeps the same quality.
        ...(hasPose && identity?.qualityId ? { qualityId: identity.qualityId } : {}),
        lot,
      }
      // Guard: never demote a saved named primary to "—" on rebuild (dual-quality wipe).
      // Skip when quality ended before this day — zeros + E remark must stick.
      if (
        !poseEnded &&
        prev &&
        namedQualityOnRow(prev.qualityName) &&
        !namedQualityOnRow(built.qualityName)
      ) {
        built.qualityName = prev.qualityName
        built.fabricType = prev.fabricType || built.fabricType
        built.warpYarn = prev.warpYarn || built.warpYarn
        built.weftYarn = prev.weftYarn || built.weftYarn
        built.reed = prev.reed || built.reed
        built.pick = prev.pick || built.pick
        built.widthInch = prev.widthInch || built.widthInch
        built.gsm = prev.gsm ?? built.gsm
      }
      return built
    })

    // Preserve same-day dual-quality segments (2+) — never drop on rebuild.
    const extraSegments = loaded
      .filter((e) => sheetSegmentIndex(e) > 1)
      .map((prev) => {
        const loom =
          looms.find((l) => l.loomNumber === prev.loomNumber) ||
          ({
            loomNumber: prev.loomNumber,
            category: prev.category,
            model: prev.model,
            defaultRpm: prev.rpm,
            status: prev.status,
          } as LoomMaster)
        const rollerHours = prev.rollerHours ?? prev.runningHours ?? 0
        const shiftA = prev.shiftAMeters ?? 0
        const shiftB = prev.shiftBMeters ?? 0
        const metrics = calculateProductionMetrics({
          rpm: prev.rpm || loom.defaultRpm || 340,
          runningHours: rollerHours,
          pick: prev.pick || 60,
          shiftAMeters: shiftA,
          shiftBMeters: shiftB,
          loomNumber: prev.loomNumber,
        })
        const seg = sheetSegmentIndex(prev)
        return normalizeSheetEntry({
          ...prev,
          id: sheetEntryId(dateStr, prev.loomNumber, seg),
          date: dateStr,
          segmentIndex: seg,
          rollerHours,
          runningHours: rollerHours,
          runningTheoretical: metrics.theoreticalMeters,
          shiftAMeters: shiftA,
          shiftBMeters: shiftB,
          totalMeters: metrics.totalMeters,
          efficiencyPercentage: metrics.efficiencyPercentage,
          stopLossMeters: metrics.stopLossMeters,
          theoretical24h: metrics.theoretical24h,
          efficiency24h: metrics.efficiency24h,
          loss24h: metrics.loss24h,
        })
      })

    const entries = sortSheetEntries([...primaryEntries, ...extraSegments])
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

  startNewDay(this: ProductionMastersService, dateStr: string): DailyLoomProductionEntry[] {
    // Clear yesterday's "beam ended today" notes; blank Actual A/B for new day
    this.clearExpiredBeamEnds(dateStr)
    if (isClient()) {
      try {
        removeStoreKey(this.sheetKey(dateStr))
      } catch {
        // ignore
      }
    }
    return this.buildSheetForDate(dateStr, { persist: true })
  },

  /**
   * Loom × day matrix. meters / shiftA / shiftB sum. efficiency is actual ÷ target.
   * active is 1 when the loom was running that day. Empty days stay —.
   * `ownsEntry` keeps a quality track on that quality only: a loom that switched
   * quality mid-month does not carry the previous quality's meters.
   */
}

export type SheetsMethods = typeof sheetsMethods
