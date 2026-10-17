import { LoomCategory, LoomStatus } from '@/types/loom'
import {
  calculateProductionMetrics,
  DailyLoomProductionEntry,
  type MonthlyMatrixDay,
} from '@/types/production'
import {
  PRODUCTION_TODAY,
  PRODUCTION_TODAY_MONTH,
  getProductionToday,
  shiftProductionDate,
  getCalendarToday,
} from '@/constants/productionCalendar'
import { LOOM_STATUS_LABEL, resolveLoomCondition } from '@/constants/loomConditions'
import {
  buildBeamTrackFromEntries,
  beamDailyEntryLot,
  formatSwLotForDailyEntry,
  parseLotKind,
  composeLot,
  type BeamTrackResult,
} from '@/services/beamTrack'
import {
  LoomMaster,
  BeamMaster,
  YarnMovementRecord,
  YarnLoomIssuance,
  YarnMaster,
  QualityMaster,
  MountBeamResult,
} from './productionTypes'
import {
  KEY_LOOMS,
  KEY_BEAMS,
  KEY_YARN,
  KEY_YARN_ISSUANCE,
  KEY_YARN_MOVEMENTS,
  KEY_QUALITY,
  KEY_SHEET,
  MAX_SAME_DAY_QUALITY_SEGMENTS,
  QUALITY_ENDED_REMARK,
} from './productionConstants'
import {
  seedLooms,
  seedBeams,
  seedYarn,
  seedQualities,
  seedYarnIssuances,
  seedYarnMovements,
  completeLoomRoster,
} from './productionSeedData'
import {
  isClient,
  normalizeBeam,
  normalizeLoomPictures,
  getDummyLoomImage,
  getLoomPictures,
  normalizeLoomRef,
  beamOnLoom,
  getMountedBeamsOnLoom,
  loomHasFreeBeamSlot,
  findMountedBeamOnLoom,
  withYarnWeights,
  kgToLbs,
  lbsToKg,
  yarnRecipeForDate,
  applyMidRunYarnChange,
} from './yarnBeamHelpers'
import {
  normalizeFabricType,
  normalizeQuality,
  normalizeQualityStatus,
  qualityNameKey,
  findLiveQualityByName,
  collapseDuplicateActiveQualities,
  remapLoomQualityIdsAfterCollapse,
  matchQualityByNameAndPick,
  orderQualitiesByLoomAllotment,
  qualityLoomAlreadyEnded,
  qualityLoomEndsOnDate,
  mergeLoomEndLists,
  namedQualityOnRow,
  isQualityEndedSheetRow,
  qualityPoseEndedBeforeDay,
  qualityRunThatOwnsSheetEntry,
  sheetRowShowsQuality,
} from './qualityHelpers'
import {
  sheetSegmentIndex,
  sheetRowKey,
  sheetEntryId,
  sortSheetEntries,
  normalizeSheetEntry,
  monthLastEnteredDay,
} from './sheetHelpers'
import {
  loadJson,
  saveJson,
  removeStoreKey,
  memoryStore,
  isFloorHydrated,
  persistKey,
  writeLocalBeamSwLot,
  writeLocalPendingBeam,
  readLocalPendingBeams,
  forgetLocalPendingBeam,
  applyLocalBeamSwLots,
  applyLocalPendingBeams,
  writeLocalPendingQualities,
  forgetLocalPendingQuality,
  rememberLocalPendingQuality,
  applyLocalPendingQualities,
  writeLocalQualityEnds,
  forgetLocalQualityEnd,
  rememberLocalQualityEnd,
  applyLocalQualityEnds,
  persistBeamPatch,
  persistBeamUpsert,
  persistBeamDelete,
  persistQualityStatus,
  persistQualityUpsert,
  persistQualityReuse,
  persistLoomEntry,
  persistDeleteLoomSegment,
  listPersistedSheetDates,
  listPersistedSheetEntries,
} from './productionStorage'

class ProductionMastersService {
  getLooms(): LoomMaster[] {
    const stored = loadJson(KEY_LOOMS, seedLooms)
    const { list, changed } = completeLoomRoster(stored)
    const looms = list.map((l) => ({
      ...l,
      ...normalizeLoomPictures(l),
    }))
    if (changed && isFloorHydrated() && isClient()) {
      saveJson(KEY_LOOMS, looms)
    }
    return looms
  }

  saveLooms(looms: LoomMaster[]) {
    saveJson(
      KEY_LOOMS,
      looms.map((l) => ({
        ...l,
        ...normalizeLoomPictures(l),
      }))
    )
  }

  /** Last forward-fill days skipped because another quality was already on the loom. */
  private lastForwardFillSkips: {
    date: string
    qualityName: string
    loomNumber: number
  }[] = []

  consumeLastForwardFillSkips(): {
    date: string
    qualityName: string
    loomNumber: number
  }[] {
    const out = this.lastForwardFillSkips
    this.lastForwardFillSkips = []
    return out
  }

  /**
   * Quality pose from `fromDate` forward through today on one loom.
   * Days before `fromDate` stay untouched.
   * Start day: replace Part 1 (dropdown change) — never auto-create Part 2.
   * Part 2 only via `addQualitySegmentOnDay` (loom +P button).
   * Later days: fill only if empty/cleared/same quality — never overwrite a busy day.
   */
  private applyQualityOnLoomFromDate(
    loomNumber: number,
    qualityId: string | null,
    fromDate: string,
    baseLoom: LoomMaster
  ): void {
    const from = String(fromDate || '').slice(0, 10)
    const today = getProductionToday()
    if (!from || from > today) return

    this.lastForwardFillSkips = []
    const catalog = this.getQualities()
    const loomForRecipe: LoomMaster = { ...baseLoom, qualityId }
    let cursor = from
    while (cursor <= today) {
      const sheet = this.peekSheetDay(cursor)
      const hasSheet = sheet != null
      // Always write the start day; later days only when a sheet already exists.
      if (cursor === from || hasSheet) {
        if (qualityId) {
          this.writeQualityPoseOnDay(cursor, loomNumber, qualityId, loomForRecipe, catalog, {
            allowNewSegment: false,
            replacePrimary: cursor === from,
          })
        } else {
          // Unassign: clear only segments that still show the *previous* loom quality.
          // Never wipe a same-day dual primary (e.g. DUM DUM) while Bunny sits on part 2.
          const sheet = this.peekSheetDay(cursor) || []
          const prevQ = catalog.find((q) => q.id === baseLoom.qualityId) || null
          const segs = sheet.filter((e) => e.loomNumber === loomNumber)
          const clearPatch = {
            qualityName: '—',
            fabricType: '',
            warpYarn: '',
            weftYarn: '',
            _clearQuality: true,
          } as Partial<DailyLoomProductionEntry> & { _clearQuality?: boolean }
          if (segs.length === 0) {
            this.updateSheetEntry(cursor, loomNumber, clearPatch, undefined, 1)
          } else {
            for (const row of segs) {
              if (prevQ && !sheetRowShowsQuality(row, prevQ, catalog)) continue
              this.updateSheetEntry(
                cursor,
                loomNumber,
                clearPatch,
                undefined,
                sheetSegmentIndex(row)
              )
            }
          }
        }
      }
      cursor = shiftProductionDate(cursor, 1)
    }
  }

  /**
   * Write a quality onto a loom for one day.
   * - Matching segment → update that segment.
   * - Empty / same primary → update Part 1.
   * - `replacePrimary` (loom dropdown): overwrite Part 1 — never auto Part 2.
   * - `allowNewSegment` (+P only): add Part 2 while keeping Part 1.
   * - Else (forward fill): skip busy days.
   */
  private writeQualityPoseOnDay(
    dateStr: string,
    loomNumber: number,
    qualityId: string,
    loomForRecipe: LoomMaster,
    catalog: QualityMaster[],
    opts: { allowNewSegment: boolean; replacePrimary?: boolean }
  ): void {
    const sheet = this.peekSheetDay(dateStr) || this.buildSheetForDate(dateStr, { skipPersist: true })
    const rows = sheet.filter((e) => e.loomNumber === loomNumber)
    const recipe = this.recipeForLoom(loomForRecipe, dateStr)
    // New / replacement quality: always drop stale "Quality Ended" (grey + remark).
    const posePatch = (
      target: DailyLoomProductionEntry | null | undefined
    ): Partial<DailyLoomProductionEntry> => {
      const primaryRow =
        rows.find((r) => sheetSegmentIndex(r) === 1) || rows[0] || null
      const clearEnded =
        isQualityEndedSheetRow(target) || isQualityEndedSheetRow(primaryRow)
      return {
        ...recipe,
        ...(clearEnded ? { remarks: '' } : {}),
      }
    }

    const existingForQuality = rows.find((row) => {
      if (!namedQualityOnRow(row.qualityName)) return false
      const owner = qualityRunThatOwnsSheetEntry({ ...row, date: dateStr }, catalog, dateStr)
      return owner?.id === qualityId
    })
    if (existingForQuality) {
      this.updateSheetEntry(
        dateStr,
        loomNumber,
        posePatch(existingForQuality),
        undefined,
        sheetSegmentIndex(existingForQuality)
      )
      return
    }

    const primary =
      rows.find((r) => sheetSegmentIndex(r) === 1) || rows[0] || null
    const primaryNamed = primary && namedQualityOnRow(primary.qualityName)
    const primaryOwner = primaryNamed
      ? qualityRunThatOwnsSheetEntry({ ...primary!, date: dateStr }, catalog, dateStr)
      : null

    if (!primaryNamed || !primaryOwner || primaryOwner.id === qualityId) {
      this.updateSheetEntry(dateStr, loomNumber, posePatch(primary), undefined, 1)
      return
    }

    // Loom dropdown quality change: replace Part 1 only (Part 2 stays if already added via +P).
    if (opts.replacePrimary) {
      this.updateSheetEntry(dateStr, loomNumber, posePatch(primary), undefined, 1)
      return
    }

    // Busy with another quality — forward-fill skip (unless explicit +P Part 2).
    if (!opts.allowNewSegment) {
      this.lastForwardFillSkips.push({
        date: dateStr,
        qualityName: primaryOwner.name,
        loomNumber,
      })
      return
    }

    // Same-day dual quality via +P only: keep Part 1, add Part 2.
    const maxSeg = rows.reduce((m, r) => Math.max(m, sheetSegmentIndex(r)), 0)
    if (maxSeg >= MAX_SAME_DAY_QUALITY_SEGMENTS) {
      this.lastForwardFillSkips.push({
        date: dateStr,
        qualityName: primaryOwner.name,
        loomNumber,
      })
      return
    }
    const segmentIndex = Math.max(2, maxSeg + 1)
    this.updateSheetEntry(dateStr, loomNumber, posePatch(null), undefined, segmentIndex)
  }

  updateLoom(
    loomNumber: number,
    patch: Partial<LoomMaster>,
    dateStr: string = PRODUCTION_TODAY
  ): LoomMaster[] {
    const previousLoom = this.getLooms().find((l) => l.loomNumber === loomNumber)
    const previousQualityId = previousLoom?.qualityId ?? null
    const isPastProductionDay = dateStr !== getProductionToday()

    let workingPatch: Partial<LoomMaster> = { ...patch }
    if (workingPatch.qualityId) {
      const resolved = this.resolveQualityIdForAssign(workingPatch.qualityId, dateStr)
      if (resolved && resolved !== workingPatch.qualityId) {
        workingPatch = { ...workingPatch, qualityId: resolved }
      }
    }

    const qualityAssign = workingPatch.qualityId !== undefined
    const dayOnlyRpm = isPastProductionDay && workingPatch.defaultRpm !== undefined
    const dayOnlyStatus = isPastProductionDay && workingPatch.status !== undefined

    // Past days: RPM / status stay on that day's sheet only (not forward-filled).
    if (dayOnlyRpm || dayOnlyStatus) {
      const current = previousLoom
      if (current) {
        const sheetPatch: Partial<DailyLoomProductionEntry> = {}
        if (dayOnlyRpm) {
          sheetPatch.rpm = workingPatch.defaultRpm
        }
        if (dayOnlyStatus && workingPatch.status) {
          const label = LOOM_STATUS_LABEL[workingPatch.status] || workingPatch.status
          sheetPatch.status = workingPatch.status
          sheetPatch.remarks = workingPatch.status === 'RUNNING' ? '' : label
          // Do NOT zero rollerHours / meters — Beam End only marks status; day's punch stays.
          if (workingPatch.status === 'BEAM_END' || workingPatch.status === 'BEAM_CUT') {
            this.flagBeamEndFromLoom(loomNumber, dateStr)
            this.reconcileBeamEndsWithLooms(dateStr)
          }
        }
        if (Object.keys(sheetPatch).length > 0) {
          this.updateSheetEntry(dateStr, loomNumber, sheetPatch)
        }
      }
    }

    // Quality: from selected date forward to today (sheets). Days before stay as-is.
    // Later days that already have another quality are skipped (busy loom).
    if (qualityAssign && previousLoom) {
      this.applyQualityOnLoomFromDate(
        loomNumber,
        workingPatch.qualityId ?? null,
        dateStr,
        previousLoom
      )
    }

    const masterPatch: Partial<LoomMaster> = { ...workingPatch }
    if (dayOnlyRpm) delete masterPatch.defaultRpm
    if (dayOnlyStatus) delete masterPatch.status
    // If today still belongs to another quality (skipped forward-fill), do not steal live master.
    if (qualityAssign && workingPatch.qualityId) {
      const today = getProductionToday()
      const todaySkipped = this.lastForwardFillSkips.some(
        (s) => s.loomNumber === loomNumber && s.date === today
      )
      if (todaySkipped) {
        delete masterPatch.qualityId
      } else {
        const todaySheet = this.peekSheetDay(today)
        const todayRow = todaySheet?.find((e) => e.loomNumber === loomNumber)
        if (todayRow) {
          const owner = qualityRunThatOwnsSheetEntry(
            { ...todayRow, date: today },
            this.getQualities(),
            today
          )
          if (owner && owner.id !== workingPatch.qualityId) {
            delete masterPatch.qualityId
          }
        }
      }
    }

    const hasMasterChange = Object.keys(masterPatch).length > 0
    const looms = hasMasterChange
      ? this.getLooms().map((l) => {
          if (l.loomNumber !== loomNumber) return l
          const statusChanged = masterPatch.status && masterPatch.status !== l.status
          const nextStatusSince = statusChanged
            ? masterPatch.status === 'RUNNING'
              ? null
              : dateStr
            : masterPatch.statusSince !== undefined
              ? masterPatch.statusSince
              : l.statusSince

          const qualityChanged = masterPatch.qualityId !== undefined && masterPatch.qualityId !== l.qualityId
          const nextQualityAssignedOn = masterPatch.qualityAssignedOn !== undefined
            ? masterPatch.qualityAssignedOn
            : qualityChanged
              ? (masterPatch.qualityId ? dateStr : null)
              : l.qualityAssignedOn

          const merged = {
            ...l,
            ...masterPatch,
            statusSince: nextStatusSince,
            qualityAssignedOn: nextQualityAssignedOn,
            category: (masterPatch.model || masterPatch.category || l.category) as LoomCategory,
            model: (masterPatch.model || masterPatch.category || l.model) as LoomCategory,
          }
          if (masterPatch.pictureDataUrls) {
            Object.assign(
              merged,
              normalizeLoomPictures({ ...merged, pictureDataUrls: masterPatch.pictureDataUrls })
            )
          } else if (masterPatch.pictureDataUrl !== undefined && !masterPatch.pictureDataUrls) {
            const rest = getLoomPictures(l).filter((u) => u !== masterPatch.pictureDataUrl)
            Object.assign(
              merged,
              normalizeLoomPictures({
                ...merged,
                pictureDataUrls: [masterPatch.pictureDataUrl, ...rest].filter(Boolean) as string[],
              })
            )
          } else {
            Object.assign(merged, normalizeLoomPictures(merged))
          }
          return merged
        })
      : this.getLooms()

    if (hasMasterChange) {
      this.saveLooms(looms)
    }

    // Keep Quality Master list order = loom allotment order (same as production sheet)
    if (masterPatch.qualityId !== undefined) {
      this.saveQualities(orderQualitiesByLoomAllotment(this.getQualities(), looms))
    }

    // RPM on today (quality sheets already written by applyQualityOnLoomFromDate).
    if (masterPatch.defaultRpm !== undefined && !qualityAssign) {
      const loom = looms.find((l) => l.loomNumber === loomNumber)
      if (loom) {
        this.updateSheetEntry(dateStr, loomNumber, { rpm: masterPatch.defaultRpm })
      }
    } else if (masterPatch.defaultRpm !== undefined && qualityAssign) {
      this.updateSheetEntry(dateStr, loomNumber, { rpm: masterPatch.defaultRpm })
    }

    // Clear quality from loom → if no looms left on that quality, mark ENDED.
    // Only on today assign — mid-month past pose must not end a run still on earlier days.
    // Assigning HOLD → resume same run. ENDED is forked above (Ends row stays).
    if (masterPatch.qualityId !== undefined && !isPastProductionDay) {
      if (previousQualityId && previousQualityId !== masterPatch.qualityId) {
        const stillOn = looms.some((l) => l.qualityId === previousQualityId)
        if (!stillOn) {
          const prevQ = this.getQualities().find((q) => q.id === previousQualityId)
          if (prevQ && (prevQ.status ?? 'ACTIVE') !== 'ENDED') {
            this.updateQuality(
              previousQualityId,
              {
                status: 'ENDED',
                endedOn: dateStr,
              },
              dateStr
            )
          }
        }
      }
      if (masterPatch.qualityId) {
        const nextQ = this.getQualities().find((q) => q.id === masterPatch.qualityId)
        if (nextQ && nextQ.status === 'HOLD') {
          this.updateQuality(masterPatch.qualityId, { status: 'ACTIVE', endedOn: null }, dateStr)
        }
      }
    } else if (masterPatch.qualityId && isPastProductionDay) {
      const nextQ = this.getQualities().find((q) => q.id === masterPatch.qualityId)
      if (nextQ && nextQ.status === 'HOLD') {
        this.updateQuality(masterPatch.qualityId, { status: 'ACTIVE', endedOn: null }, dateStr)
      }
    }

    // Loom condition — only this production day (and master when editing today).
    // Do not rewrite past or other future days; next day inherits via sheet carry-forward.
    if (masterPatch.status) {
      const label = LOOM_STATUS_LABEL[masterPatch.status] || masterPatch.status
      const sheetPatch: Partial<DailyLoomProductionEntry> = {
        status: masterPatch.status,
        remarks: masterPatch.status === 'RUNNING' ? '' : label,
      }
      // Beam End / Stopped: status + remarks only — keep roller hours & A/B meters intact.
      if (masterPatch.status === 'BEAM_END' || masterPatch.status === 'BEAM_CUT') {
        this.flagBeamEndFromLoom(loomNumber, dateStr)
        this.reconcileBeamEndsWithLooms(dateStr)
      }
      this.updateSheetEntry(dateStr, loomNumber, sheetPatch)
    }

    return this.getLooms()
  }

  /** Unmount beam on this loom → send to Sizing (empty) for rework. */
  private flagBeamEndFromLoom(loomNumber: number, dateStr: string): void {
    const loomKey = String(loomNumber)
    let changed = false
    const beams = this.getBeams().map((b) => {
      const onThisLoom =
        normalizeLoomRef(b.usedInLoom) === loomKey || Number(b.usedInLoom) === loomNumber
      if (!onThisLoom) return b
      changed = true
      return normalizeBeam({
        ...b,
        usedInLoom: null,
        location: 'SIZING',
        fillStatus: 'EMPTY',
        mountedOn: null,
        beamEndedOn: dateStr,
        endedFromLoom: loomKey,
      })
    })
    if (changed) this.saveBeams(beams)
  }

  /**
   * If any loom is already Beam End but a beam is still mounted on it
   * (legacy data / missed sync), unmount → Sizing + show Ended on Beam table.
   */
  reconcileBeamEndsWithLooms(dateStr: string): BeamMaster[] {
    const looms = this.getLooms().filter((l) => l.status === 'BEAM_END' || l.status === 'BEAM_CUT')
    if (looms.length === 0) return this.getBeams()
    let changed = false
    const beams = this.getBeams().map((b) => {
      const loom = looms.find((l) => beamOnLoom(b, l.loomNumber))
      if (!loom) return b
      changed = true
      return normalizeBeam({
        ...b,
        usedInLoom: null,
        location: 'SIZING',
        fillStatus: 'EMPTY',
        mountedOn: null,
        beamEndedOn: dateStr,
        endedFromLoom: String(loom.loomNumber),
      })
    })
    if (changed) this.saveBeams(beams)
    return this.getBeams()
  }

  addLoom(partial?: Partial<LoomMaster>): LoomMaster[] {
    const looms = this.getLooms()
    const nextNum = looms.reduce((m, l) => Math.max(m, l.loomNumber), 0) + 1
    const model = (partial?.model || 'G6200') as LoomCategory
    const pics = normalizeLoomPictures({
      loomNumber: nextNum,
      pictureDataUrl: partial?.pictureDataUrl,
      pictureDataUrls: partial?.pictureDataUrls,
    })
    looms.push({
      loomNumber: nextNum,
      name: partial?.name || `Loom ${nextNum}`,
      model,
      category: model,
      year: partial?.year ?? new Date().getFullYear(),
      ...pics,
      defaultRpm: partial?.defaultRpm ?? 340,
      shed: partial?.shed || 'Main Floor',
      isActive: partial?.isActive ?? true,
      status: partial?.status || 'RUNNING',
      qualityId: partial?.qualityId ?? null,
      weftYarnId: partial?.weftYarnId ?? null,
      isTwinBeam: Boolean(partial?.isTwinBeam),
    })
    this.saveLooms(looms)
    return looms
  }

  deleteLoom(loomNumber: number): LoomMaster[] {
    const looms = this.getLooms().filter((l) => l.loomNumber !== loomNumber)
    this.saveLooms(looms)
    const beams = this.getBeams().map((b) => {
      if (String(b.usedInLoom) !== String(loomNumber)) return b
      return normalizeBeam({
        ...b,
        usedInLoom: null,
        location: 'STORE',
        mountedOn: null,
      })
    })
    this.saveBeams(beams)
    return looms
  }

  deleteBeam(beamNo: string): BeamMaster[] {
    forgetLocalPendingBeam(beamNo)
    const beams = this.getBeams().filter((b) => b.beamNo !== beamNo)
    // Memory first; DB delete is explicit (avoid full-list stale wipe races).
    try {
      memoryStore.set(KEY_BEAMS, JSON.stringify(beams.map((b) => normalizeBeam(b))))
    } catch {
      // ignore
    }
    void persistBeamDelete(beamNo)
    void persistKey(KEY_BEAMS, beams)
    return beams
  }

  getBeams(): BeamMaster[] {
    const beams = loadJson(KEY_BEAMS, seedBeams).map((b) => normalizeBeam(b))
    return applyLocalBeamSwLots(applyLocalPendingBeams(beams)).map((b) => normalizeBeam(b))
  }

  saveBeams(beams: BeamMaster[]) {
    saveJson(KEY_BEAMS, beams.map((b) => normalizeBeam(b)))
  }

  updateBeam(
    beamNo: string,
    patch: Partial<BeamMaster>,
    opts?: { sheetDate?: string }
  ): BeamMaster[] {
    if (patch.swLot !== undefined) {
      writeLocalBeamSwLot(beamNo, patch.swLot)
    }
    const beams = this.getBeams().map((b) => {
      if (b.beamNo !== beamNo) return b
      return normalizeBeam({ ...b, ...patch, beamNo })
    })
    this.saveBeams(beams)
    const next = beams.find((b) => b.beamNo === beamNo)
    // Sw# must hit DB immediately — also stamps Daily Entry SW # when mounted.
    if (
      patch.swLot !== undefined ||
      patch.qualityId !== undefined ||
      patch.beamRepeat !== undefined ||
      patch.warp !== undefined ||
      patch.reed !== undefined ||
      patch.width !== undefined ||
      patch.length !== undefined ||
      patch.loomType !== undefined ||
      patch.totalThreads !== undefined
    ) {
      void persistBeamPatch(beamNo, {
        ...(patch.swLot !== undefined ? { swLot: next?.swLot ?? null } : {}),
        ...(patch.qualityId !== undefined ? { qualityId: next?.qualityId ?? null } : {}),
        ...(patch.beamRepeat !== undefined ? { beamRepeat: next?.beamRepeat ?? null } : {}),
        ...(patch.warp !== undefined ? { warp: next?.warp } : {}),
        ...(patch.reed !== undefined ? { reed: next?.reed } : {}),
        ...(patch.width !== undefined ? { width: next?.width } : {}),
        ...(patch.length !== undefined ? { length: next?.length } : {}),
        ...(patch.loomType !== undefined ? { loomType: next?.loomType } : {}),
        ...(patch.totalThreads !== undefined || patch.reed !== undefined || patch.width !== undefined
          ? { totalThreads: next?.totalThreads }
          : {}),
      })
    }
    if (patch.swLot !== undefined && next?.usedInLoom) {
      const loomNum = Number(next.usedInLoom)
      if (Number.isFinite(loomNum) && loomNum > 0) {
        const day = String(opts?.sheetDate || getProductionToday()).slice(0, 10)
        const lot = beamDailyEntryLot(next)
        this.updateSheetEntry(day, loomNum, { lot })
        // Also stamp today so Daily Entry always shows the same Sw#.
        const today = getProductionToday()
        if (today !== day) this.updateSheetEntry(today, loomNum, { lot })
      }
    }
    return beams
  }

  addBeam(partial: Partial<BeamMaster> & { beamNo: string }): BeamMaster[] {
    const beams = this.getBeams()
    if (beams.some((b) => b.beamNo === partial.beamNo)) {
      throw new Error(`Beam ${partial.beamNo} already exists`)
    }

    const loomNum =
      partial.usedInLoom != null && partial.usedInLoom !== ''
        ? Number(partial.usedInLoom)
        : NaN
    if (Number.isFinite(loomNum) && loomNum > 0) {
      const loom = this.getLooms().find((l) => l.loomNumber === loomNum)
      const isTwin = Boolean(loom?.isTwinBeam)
      const maxBeams = isTwin ? 2 : 1
      const mountedBeams = getMountedBeamsOnLoom(beams, loomNum)
      if (mountedBeams.length >= maxBeams) {
        const names = mountedBeams.map((b) => `"${b.beamNo}"`).join(' aur ')
        throw new Error(
          isTwin
            ? `Loom ${loomNum} Twin Beam loom hai aur is par pehle se 2 Beams (${names}) lage hain. Pehle kisi ek beam ko Store / Sizing pe shift karein, phir naya beam lagaen.`
            : `Loom ${loomNum} pe pehle se Beam ${names} laga hai. Pehle us beam ko Store / Sizing pe shift karein, phir naya beam lagaen.`
        )
      }
    }

    const added = normalizeBeam({
      beamNo: partial.beamNo,
      warp: partial.warp || '',
      reed: partial.reed ?? 60,
      width: partial.width ?? 66,
      totalThreads: partial.totalThreads,
      length: partial.length ?? 0,
      loomType: partial.loomType || 'G6200',
      fillStatus: partial.fillStatus || 'FULL',
      usedInLoom: partial.usedInLoom ?? null,
      location: partial.location,
      mountedOn: partial.mountedOn,
      qualityId: partial.qualityId ?? null,
      swLot: partial.swLot ?? null,
      beamRepeat: partial.beamRepeat ?? null,
    })
    beams.push(added)
    if (partial.swLot) writeLocalBeamSwLot(partial.beamNo, partial.swLot)
    // Browser backup until DB confirms — survives refresh if network/PUT fails.
    writeLocalPendingBeam(added)
    try {
      memoryStore.set(KEY_BEAMS, JSON.stringify(beams.map((b) => normalizeBeam(b))))
    } catch {
      // ignore
    }
    // Fire upsert immediately; hydrate merge restores from pending if refresh wins the race.
    void (async () => {
      const ok = await persistBeamUpsert(added)
      if (ok) {
        forgetLocalPendingBeam(added.beamNo)
        void persistKey(KEY_BEAMS, this.getBeams())
      } else {
        console.error('[floor] addBeam upsert failed — kept in pending local', added.beamNo)
      }
    })()
    if (added.usedInLoom) {
      const mountedLoom = Number(added.usedInLoom)
      if (Number.isFinite(mountedLoom) && mountedLoom > 0) {
        const mountDay = String(added.mountedOn || getProductionToday()).slice(0, 10)
        this.updateSheetEntry(mountDay, mountedLoom, { lot: beamDailyEntryLot(added) })
      }
    }
    return this.getBeams()
  }

  /** Wait until a pending beam is confirmed in DB (or timeout). */
  async flushPendingBeam(beamNo: string, timeoutMs = 8000): Promise<boolean> {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const pending = readLocalPendingBeams().some((b) => b.beamNo === beamNo)
      if (!pending) return true
      const beam = this.getBeams().find((b) => b.beamNo === beamNo)
      if (beam) {
        const ok = await persistBeamUpsert(beam)
        if (ok) {
          forgetLocalPendingBeam(beamNo)
          return true
        }
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    return !readLocalPendingBeams().some((b) => b.beamNo === beamNo)
  }

  /**
   * Mount beam on loom. Blocked only if another beam is already on that loom.
   * Loom status aap Looms tab se khud change kar sakte ho.
   */
  mountBeam(beamNo: string, loomNumber: number, dateStr: string = PRODUCTION_TODAY): MountBeamResult {
    const current = this.getBeams()
    const beam = current.find((b) => b.beamNo === beamNo)
    if (!beam) {
      return {
        ok: false,
        beams: current,
        loomNumber,
        message: `Beam "${beamNo}" nahi mila.`,
      }
    }

    const loom = this.getLooms().find((l) => l.loomNumber === loomNumber)
    const isTwin = Boolean(loom?.isTwinBeam)
    const maxBeams = isTwin ? 2 : 1
    const mountedBeams = getMountedBeamsOnLoom(current, loomNumber, beamNo)

    if (mountedBeams.length >= maxBeams) {
      const names = mountedBeams.map((b) => `"${b.beamNo}"`).join(' aur ')
      return {
        ok: false,
        beams: current,
        loomNumber,
        blockingBeamNo: mountedBeams[0]?.beamNo,
        message: isTwin
          ? `Loom ${loomNumber} Twin Beam loom hai aur is par pehle se 2 Beams (${names}) lage hain.\n\nPehle kisi ek beam ki location Store ya Sizing pe change karein, phir ye beam lagaen.`
          : `Loom ${loomNumber} pe pehle se Beam ${names} laga hai.\n\nPehle us beam ki location Store ya Sizing pe change karein, phir ye beam lagaen.`,
      }
    }

    const beams = current.map((b) => {
      if (b.beamNo === beamNo) {
        return normalizeBeam({
          ...b,
          usedInLoom: String(loomNumber),
          location: String(loomNumber),
          fillStatus: 'FULL',
          mountedOn: dateStr,
          beamEndedOn: null,
          endedFromLoom: null,
        })
      }
      return b
    })
    this.saveBeams(beams)
    const allMounted = getMountedBeamsOnLoom(beams, loomNumber)
    const lotStr = allMounted.map((b) => beamDailyEntryLot(b) || b.beamNo).filter(Boolean).join(' + ')
    // Stamp Sw# lot on Daily Entry (Excel SW # Lot column).
    this.updateSheetEntry(dateStr, loomNumber, {
      lot: lotStr,
    })
    return { ok: true, beams }
  }

  /** Excel Beem Length model — Length / Consumed / Balance from sheet lot rows. */
  buildBeamTrack(beamNo: string): BeamTrackResult | null {
    const beam = this.getBeams().find((b) => b.beamNo === beamNo)
    if (!beam) return null
    const qualityName = beam.qualityId
      ? this.getQualities().find((q) => q.id === beam.qualityId)?.name || null
      : null
    return buildBeamTrackFromEntries(
      beam,
      listPersistedSheetEntries(),
      getProductionToday(),
      qualityName
    )
  }

  /** Quick consumed meters for Track button gate. */
  beamConsumedMeters(beamNo: string): number {
    return this.buildBeamTrack(beamNo)?.consumed ?? 0
  }

  /** Beam wapas sizing se store me (FULL) — ab loom pe laga sakte ho. */
  receiveBeamFromSizing(beamNo: string): BeamMaster[] {
    return this.updateBeam(beamNo, {
      location: 'STORE',
      usedInLoom: null,
      fillStatus: 'FULL',
      mountedOn: null,
      beamEndedOn: null,
      endedFromLoom: null,
    })
  }

  /** Send beam to sizing (not on loom). */
  sendBeamToSizing(beamNo: string, dateStr?: string): BeamMaster[] {
    return this.updateBeam(beamNo, {
      usedInLoom: null,
      location: 'SIZING',
      mountedOn: null,
      fillStatus: 'EMPTY',
      beamEndedOn: dateStr || null,
    })
  }

  unmountBeam(beamNo: string, location: 'STORE' | 'SIZING' = 'STORE', dateStr?: string): BeamMaster[] {
    const prev = this.getBeams().find((b) => b.beamNo === beamNo)
    const prevLoom = prev?.usedInLoom ? Number(prev.usedInLoom) : NaN
    const patch: Partial<BeamMaster> = {
      usedInLoom: null,
      location,
      mountedOn: null,
      beamEndedOn: dateStr || null,
    }
    if (location === 'SIZING') patch.fillStatus = 'EMPTY'
    const updated = this.updateBeam(beamNo, patch)
    if (Number.isFinite(prevLoom) && prevLoom > 0) {
      const remainingMounted = getMountedBeamsOnLoom(updated, prevLoom)
      const day = String(dateStr || getProductionToday()).slice(0, 10)
      const lotStr = remainingMounted.map((b) => beamDailyEntryLot(b) || b.beamNo).filter(Boolean).join(' + ')
      this.updateSheetEntry(day, prevLoom, { lot: lotStr })
      const today = getProductionToday()
      if (today !== day) this.updateSheetEntry(today, prevLoom, { lot: lotStr })
    }
    return updated
  }

  /**
   * Declare beam EMPTY: unmount + send to Sizing for rework.
   */
  declareBeamEmpty(beamNo: string, dateStr?: string): BeamMaster[] {
    const today = dateStr || PRODUCTION_TODAY
    return this.updateBeam(beamNo, {
      usedInLoom: null,
      location: 'SIZING',
      fillStatus: 'EMPTY',
      mountedOn: null,
      beamEndedOn: today,
      endedFromLoom: undefined,
    })
  }

  /** Clear "ended today" notes from previous days (keeps EMPTY / mounts as-is). */
  clearExpiredBeamEnds(asOfDate: string): BeamMaster[] {
    const beams = this.getBeams()
    let changed = false
    const next = beams.map((b) => {
      if (b.beamEndedOn && b.beamEndedOn < asOfDate) {
        changed = true
        return normalizeBeam({
          ...b,
          beamEndedOn: null,
          endedFromLoom: null,
        })
      }
      return b
    })
    if (changed) this.saveBeams(next)
    return next
  }

  getYarn(): YarnMaster[] {
    return loadJson(KEY_YARN, seedYarn).map((y) => withYarnWeights(y))
  }

  saveYarn(yarn: YarnMaster[]) {
    saveJson(KEY_YARN, yarn.map((y) => withYarnWeights(y)))
  }

  updateYarn(id: string, patch: Partial<YarnMaster>): YarnMaster[] {
    const yarn = this.getYarn().map((y) => {
      if (y.id !== id) return y
      const merged = { ...y, ...patch }
      if (patch.receivedLbs != null && patch.receivedKg == null) {
        merged.receivedKg = lbsToKg(patch.receivedLbs)
      }
      if (patch.issuedLbs != null && patch.issuedKg == null) {
        merged.issuedKg = lbsToKg(patch.issuedLbs)
      }
      if (patch.receivedKg != null) {
        merged.receivedLbs = kgToLbs(patch.receivedKg)
      }
      if (patch.issuedKg != null) {
        merged.issuedLbs = kgToLbs(patch.issuedKg)
      }
      return withYarnWeights(merged)
    })
    this.saveYarn(yarn)
    return yarn
  }

  addYarn(partial?: Partial<YarnMaster>): YarnMaster[] {
    const yarn = this.getYarn()
    yarn.unshift(
      withYarnWeights({
        id: `yarn-${Date.now()}`,
        yarnType: partial?.yarnType || 'New Yarn',
        bags: partial?.bags ?? 0,
        receivedKg: partial?.receivedKg ?? 0,
        issuedKg: partial?.issuedKg ?? 0,
      })
    )
    this.saveYarn(yarn)
    return yarn
  }

  deleteYarn(id: string): YarnMaster[] {
    const yarn = this.getYarn().filter((y) => y.id !== id)
    this.saveYarn(yarn)
    return yarn
  }

  getYarnIssuances(yarnId?: string): YarnLoomIssuance[] {
    const list = loadJson(KEY_YARN_ISSUANCE, seedYarnIssuances)
    if (yarnId) {
      return list.filter((i) => i.yarnId === yarnId)
    }
    return list
  }

  saveYarnIssuances(list: YarnLoomIssuance[]) {
    saveJson(KEY_YARN_ISSUANCE, list)
  }

  issueYarnToLoom(params: {
    yarnId: string
    loomNumber: number
    issuedKg: number
    pick: number
    dateStr?: string
  }): { yarn: YarnMaster[]; issuances: YarnLoomIssuance[] } {
    const { yarnId, loomNumber, issuedKg, pick, dateStr = PRODUCTION_TODAY } = params
    const yarns = this.getYarn()
    const targetYarn = yarns.find((y) => y.id === yarnId)
    if (!targetYarn) throw new Error('Yarn not found')

    const updatedIssued = Number(((targetYarn.issuedKg || 0) + issuedKg).toFixed(2))
    this.updateYarn(yarnId, { issuedKg: updatedIssued })

    const issuances = this.getYarnIssuances()
    const newIssuance: YarnLoomIssuance = {
      id: `iss-${Date.now()}`,
      yarnId,
      yarnType: targetYarn.yarnType,
      loomNumber,
      issuedKg,
      pick,
      date: dateStr,
      createdAt: new Date().toISOString(),
    }
    issuances.unshift(newIssuance)
    this.saveYarnIssuances(issuances)

    // Also record in complete movements ledger
    const movements = this.getYarnMovements()
    movements.unshift({
      id: `mov-iss-${Date.now()}`,
      type: 'OUTWARD',
      yarnId,
      yarnType: targetYarn.yarnType,
      date: dateStr,
      weightKg: issuedKg,
      weightLbs: kgToLbs(issuedKg),
      loomNumber,
      pick,
      createdAt: new Date().toISOString(),
    })
    this.saveYarnMovements(movements)

    this.updateLoom(loomNumber, { weftYarnId: yarnId }, dateStr)

    return {
      yarn: this.getYarn(),
      issuances,
    }
  }

  getYarnMovements(yarnId?: string): YarnMovementRecord[] {
    const list = loadJson(KEY_YARN_MOVEMENTS, seedYarnMovements)
    if (yarnId) {
      return list.filter((i) => i.yarnId === yarnId)
    }
    return list
  }

  saveYarnMovements(list: YarnMovementRecord[]) {
    saveJson(KEY_YARN_MOVEMENTS, list)
  }

  recordYarnInward(params: {
    yarnId?: string
    yarnType: string
    bags: number
    weightKg: number
    dateStr?: string
    lotOrSupplier?: string
  }): { yarn: YarnMaster[]; movements: YarnMovementRecord[] } {
    const { yarnType, bags, weightKg, dateStr = PRODUCTION_TODAY, lotOrSupplier } = params
    const yarns = this.getYarn()
    let target = yarns.find(
      (y) => (params.yarnId ? y.id === params.yarnId : y.yarnType.toLowerCase() === yarnType.toLowerCase())
    )

    if (target) {
      const updatedRec = Number(((target.receivedKg || 0) + weightKg).toFixed(2))
      const updatedBags = (target.bags || 0) + bags
      this.updateYarn(target.id, { receivedKg: updatedRec, bags: updatedBags })
    } else {
      const newYarn = withYarnWeights({
        id: `yarn-${Date.now()}`,
        yarnType,
        bags,
        receivedKg: weightKg,
        issuedKg: 0,
      })
      yarns.push(newYarn)
      this.saveYarn(yarns)
      target = newYarn
    }

    const movements = this.getYarnMovements()
    const newMov: YarnMovementRecord = {
      id: `mov-in-${Date.now()}`,
      type: 'INWARD',
      yarnId: target.id,
      yarnType: target.yarnType,
      date: dateStr,
      weightKg,
      weightLbs: kgToLbs(weightKg),
      bags,
      lotOrSupplier: lotOrSupplier || 'Warehouse Inward',
      createdAt: new Date().toISOString(),
    }
    movements.unshift(newMov)
    this.saveYarnMovements(movements)

    return {
      yarn: this.getYarn(),
      movements,
    }
  }

  getQualities(): QualityMaster[] {
    const before = applyLocalPendingQualities(
      applyLocalQualityEnds(loadJson(KEY_QUALITY, seedQualities).map(normalizeQuality))
    )
    const merged = collapseDuplicateActiveQualities(before)
    // Keep merged Active forks in memory so later PUTs include them.
    try {
      memoryStore.set(KEY_QUALITY, JSON.stringify(merged))
    } catch {
      // ignore
    }
    // If collapse demoted an Active that looms still pointed at, remap to the kept Active.
    const demoted = before.some((q) => {
      const next = merged.find((item) => item.id === q.id)
      return (
        normalizeQualityStatus(q.status) === 'ACTIVE' &&
        next != null &&
        normalizeQualityStatus(next.status) === 'ENDED'
      )
    })
    if (demoted) {
      try {
        const looms = loadJson(KEY_LOOMS, seedLooms)
        const remapped = remapLoomQualityIdsAfterCollapse(looms, before, merged)
        if (remapped !== looms) saveJson(KEY_LOOMS, remapped)
      } catch {
        // ignore
      }
    }
    return merged
  }

  /** Qualities ordered by loom allotment (Loom 1 → N). */
  getQualitiesOrdered(entries?: DailyLoomProductionEntry[]): QualityMaster[] {
    return orderQualitiesByLoomAllotment(this.getQualities(), this.getLooms(), entries)
  }

  saveQualities(qualities: QualityMaster[]) {
    // Memory + merge-upsert PUT (server no longer deleteMany). Prefer row upserts for new forks.
    saveJson(KEY_QUALITY, qualities)
  }

  /** Memory only — avoids racing a full qualities PUT while reuse upsert is in flight. */
  private saveQualitiesMemory(qualities: QualityMaster[]) {
    try {
      memoryStore.set(KEY_QUALITY, JSON.stringify(qualities.map(normalizeQuality)))
    } catch {
      // ignore
    }
  }

  updateQuality(
    id: string,
    patch: Partial<QualityMaster>,
    fromDate: string = getProductionToday()
  ): QualityMaster[] {
    const current = this.getQualities().find((q) => q.id === id)
    const catalogBefore = this.getQualities()
    const nextPatch = { ...patch }
    const currentStatus = normalizeQualityStatus(current?.status)
    // Hold only on production Today — past Hold would wipe / confuse that day's production.
    if (nextPatch.status === 'HOLD') {
      const day = String(fromDate || '').slice(0, 10)
      if (day && day !== getProductionToday()) {
        return catalogBefore
      }
    }
    // Already ended/hold: only allow explicit revive to ACTIVE (or re-stamp date).
    if (currentStatus === 'ENDED' || currentStatus === 'HOLD') {
      if (nextPatch.status === 'ACTIVE') {
        // explicit revive / continue / resume
      } else if (nextPatch.status && nextPatch.status !== currentStatus) {
        // allow HOLD ↔ ENDED switches
      } else if (nextPatch.status) {
        delete nextPatch.status
      }
    }

    /** Continue / Resume: undo End-Hold clear so same meters stay on this run. */
    const reviving =
      Boolean(current) &&
      (currentStatus === 'ENDED' || currentStatus === 'HOLD') &&
      nextPatch.status === 'ACTIVE'
    // Cannot Continue/Resume when another Active already uses this name (Reuse path).
    if (reviving && current && findLiveQualityByName(catalogBefore, current.name, current.id)) {
      return catalogBefore
    }
    // HOLD Resume: only from hold day or later — days before Hold are history-only (H badge).
    if (reviving && currentStatus === 'HOLD') {
      const holdStamp = current?.endedOn ? String(current.endedOn).slice(0, 10) : ''
      const resumeDay = String(fromDate || '').slice(0, 10)
      if (holdStamp && resumeDay && resumeDay < holdStamp) {
        return catalogBefore
      }
    }
    const reviveEndDay = reviving
      ? String(current?.endedOn || fromDate).slice(0, 10)
      : ''
    const restoreLoomNums = reviving
      ? [
          ...new Set([
            ...qualityLoomEndsOnDate(current!, reviveEndDay),
            ...qualityLoomEndsOnDate(current!),
          ]),
        ]
      : []

    // End / Hold: collect looms first, stamp loomEnds, then clear allotment + sheet.
    const clearing = nextPatch.status === 'ENDED' || nextPatch.status === 'HOLD' || Boolean(nextPatch.loomEnds && nextPatch.loomEnds.length > 0)
    const clearLoomNums = new Set<number>()
    if (clearing) {
      if (nextPatch.loomEnds && nextPatch.loomEnds.length > 0) {
        for (const le of nextPatch.loomEnds) {
          clearLoomNums.add(le.loomNumber)
        }
      } else {
        const day = this.peekSheetDay(fromDate) || []
        for (const l of this.getLooms()) {
          if (l.qualityId === id) clearLoomNums.add(l.loomNumber)
        }
        if (current) {
          for (const e of day) {
            if (sheetRowShowsQuality(e, current, catalogBefore)) clearLoomNums.add(e.loomNumber)
          }
        }
      }
    }

    const qualities = this.getQualities().map((q) => {
      if (q.id !== id) return q
      const merged = applyMidRunYarnChange(q, nextPatch, fromDate)
      if (reviving) {
        // Drop the close stamp so L# / Track treat this as the same open run.
        const kept = (q.loomEnds || []).filter((e) => e.date !== reviveEndDay)
        merged.loomEnds = kept.length ? kept : undefined
        merged.endedOn = null
        merged.status = 'ACTIVE'
      } else {
        let loomEnds = nextPatch.loomEnds
          ? mergeLoomEndLists(q.loomEnds, nextPatch.loomEnds)
          : q.loomEnds
        if (clearing && clearLoomNums.size > 0 && (!nextPatch.loomEnds || nextPatch.loomEnds.length === 0)) {
          const stamped = [...clearLoomNums].map((loomNumber) => ({
            date: String(fromDate).slice(0, 10),
            loomNumber,
          }))
          loomEnds = mergeLoomEndLists(loomEnds, stamped)
        }
        if (loomEnds) merged.loomEnds = loomEnds
      }
      return normalizeQuality(merged)
    })

    if (clearing) {
      // HOLD: clear pose on the hold day (history stays on past Active via badge).
      // ENDED: keep end-day sheet as-is; wipe following days to zeros + "Quality Ended"
      // until a new quality is assigned (loom.qualityId cleared below).
      if (nextPatch.status === 'HOLD') {
        const dayRows = this.peekSheetDay(fromDate) || []
        for (const loomNumber of clearLoomNums) {
          const segs = dayRows.filter((e) => e.loomNumber === loomNumber)
          const clearPatch = {
            qualityName: '—',
            fabricType: '',
            warpYarn: '',
            weftYarn: '',
            _clearQuality: true,
          } as Partial<DailyLoomProductionEntry> & { _clearQuality?: boolean }
          if (segs.length === 0) {
            this.updateSheetEntry(fromDate, loomNumber, clearPatch, undefined, 1)
            continue
          }
          // Clear only segments owned by this quality; leave same-day dual segments intact.
          let clearedAny = false
          for (const row of segs) {
            if (current && !sheetRowShowsQuality(row, current, catalogBefore)) continue
            this.updateSheetEntry(
              fromDate,
              loomNumber,
              clearPatch,
              undefined,
              sheetSegmentIndex(row)
            )
            clearedAny = true
          }
          if (
            !clearedAny &&
            this.getLooms().some((l) => l.loomNumber === loomNumber && l.qualityId === id)
          ) {
            this.updateSheetEntry(fromDate, loomNumber, clearPatch, undefined, 1)
          }
        }
      }
      if (nextPatch.status === 'ENDED') {
        const endDay = String(fromDate).slice(0, 10)
        const today = getProductionToday()
        const endedName = (current?.name || '').trim()
        // Wipe through today, and any already-seeded days after today (local override / seed).
        let cursor = shiftProductionDate(endDay, 1)
        const wipeUntil = shiftProductionDate(today, 60)
        while (cursor <= wipeUntil) {
          const exists = this.peekSheetDay(cursor) != null
          if (!exists && cursor > today) break
          if (exists) {
            for (const loomNumber of clearLoomNums) {
              const dayRows = this.peekSheetDay(cursor) || []
              const segs = dayRows.filter((e) => e.loomNumber === loomNumber)
              const targets =
                segs.length > 0
                  ? segs
                  : [{ loomNumber, segmentIndex: 1 } as DailyLoomProductionEntry]
              for (const row of targets) {
                if (
                  current &&
                  segs.length > 0 &&
                  namedQualityOnRow(row.qualityName) &&
                  !sheetRowShowsQuality(row, current, catalogBefore)
                ) {
                  continue
                }
                this.updateSheetEntry(
                  cursor,
                  loomNumber,
                  {
                    qualityName: endedName || '—',
                    fabricType: current?.fabricType || '',
                    warpYarn: '',
                    weftYarn: '',
                    pick: 0,
                    reed: 0,
                    widthInch: 0,
                    gsm: 0,
                    rollerHours: 0,
                    shiftAMeters: 0,
                    shiftBMeters: 0,
                    totalMeters: 0,
                    remarks: QUALITY_ENDED_REMARK,
                    _clearQuality: !endedName,
                  } as Partial<DailyLoomProductionEntry> & { _clearQuality?: boolean },
                  undefined,
                  sheetSegmentIndex(row)
                )
              }
            }
          }
          cursor = shiftProductionDate(cursor, 1)
        }
      }
      const looms = this.getLooms()
      const shouldClearLoom = (l: LoomMaster) => {
        if (l.qualityId !== id) return false
        if (clearLoomNums.size > 0) return clearLoomNums.has(l.loomNumber)
        return true
      }
      if (looms.some(shouldClearLoom)) {
        this.saveLooms(looms.map((l) => (shouldClearLoom(l) ? { ...l, qualityId: null, qualityAssignedOn: null } : l)))
      }
    }
    this.saveQualities(qualities)

    // After End catalog is saved, rebuild post-end days so poseEnded zeros + E remark stick
    // (stale seed meters / demote-restore cannot survive). Include seeded days past today.
    if ((nextPatch.status === 'ENDED' || clearLoomNums.size > 0) && clearLoomNums.size > 0) {
      const endDay = String(fromDate).slice(0, 10)
      const today = getProductionToday()
      let cursor = shiftProductionDate(endDay, 1)
      const rebuildUntil = shiftProductionDate(today, 60)
      while (cursor <= rebuildUntil) {
        const exists = this.peekSheetDay(cursor) != null
        if (!exists && cursor > today) break
        if (exists) {
          this.buildSheetForDate(cursor, { persist: true })
        }
        cursor = shiftProductionDate(cursor, 1)
      }
    }

    // Stale loom.qualityId still pointing at this ENDED run — clear so Daily Entry zeros.
    if (nextPatch.status === 'ENDED' || clearLoomNums.size > 0) {
      const loomsNow = this.getLooms()
      const shouldClearLoom = (l: LoomMaster) => {
        if (l.qualityId !== id) return false
        if (clearLoomNums.size > 0) return clearLoomNums.has(l.loomNumber)
        return true
      }
      if (loomsNow.some(shouldClearLoom)) {
        this.saveLooms(loomsNow.map((l) => (shouldClearLoom(l) ? { ...l, qualityId: null, qualityAssignedOn: null } : l)))
      }
    }

    // Backdated start date must survive refresh until DB upsert confirms createdOn.
    if (nextPatch.createdOn !== undefined) {
      const stamped = qualities.find((q) => q.id === id)
      if (stamped) rememberLocalPendingQuality(stamped)
    }

    if (reviving && restoreLoomNums.length > 0) {
      const looms = this.getLooms()
      const restoredNums: number[] = []
      const nextLooms = looms.map((l) => {
        if (!restoreLoomNums.includes(l.loomNumber)) return l
        // Don't steal a loom already given to another quality after the close.
        if (l.qualityId && l.qualityId !== id) return l
        restoredNums.push(l.loomNumber)
        return { ...l, qualityId: id }
      })
      this.saveLooms(nextLooms)

      const resumeDay = String(fromDate).slice(0, 10)
      for (const loomNumber of restoredNums) {
        const loom = nextLooms.find((l) => l.loomNumber === loomNumber)
        if (!loom) continue
        // Resume from selected date → today (skips days that already have another quality).
        if (resumeDay) {
          this.applyQualityOnLoomFromDate(loomNumber, id, resumeDay, loom)
        } else if (reviveEndDay && this.peekSheetDay(reviveEndDay)) {
          this.updateSheetEntry(
            reviveEndDay,
            loomNumber,
            this.recipeForLoom({ ...loom, qualityId: id }, reviveEndDay)
          )
        }
      }
    }

    const saved = qualities.find((q) => q.id === id)
    if (reviving && saved) {
      // Keep Active revive until DB confirms — otherwise hydrate/local ends snap back to ENDED
      // and Continue looks like success while Ends row never leaves.
      forgetLocalQualityEnd(id)
      rememberLocalPendingQuality(
        normalizeQuality({
          ...saved,
          status: 'ACTIVE',
          endedOn: null,
          loomEnds: saved.loomEnds,
        })
      )
    } else if (saved?.status === 'ENDED' && saved.endedOn) {
      rememberLocalQualityEnd(id, saved.endedOn, saved.name, saved.loomEnds)
    } else if (nextPatch.status === 'ACTIVE' || nextPatch.status === 'HOLD') {
      forgetLocalQualityEnd(id)
    }
    const recipeTouched =
      nextPatch.name !== undefined ||
      nextPatch.fabricType !== undefined ||
      nextPatch.warpYarn !== undefined ||
      nextPatch.weftYarn !== undefined ||
      nextPatch.reed !== undefined ||
      nextPatch.pick !== undefined ||
      nextPatch.widthInch !== undefined ||
      nextPatch.gsm !== undefined
    if (recipeTouched && current && this.peekSheetDay(fromDate)) {
      const day = this.peekSheetDay(fromDate) || []
      for (const row of day) {
        if (!sheetRowShowsQuality(row, current, catalogBefore)) continue
        const loom = this.getLooms().find((l) => l.loomNumber === row.loomNumber)
        if (!loom) continue
        this.updateSheetEntry(
          fromDate,
          row.loomNumber,
          this.recipeForLoom({ ...loom, qualityId: id }, fromDate),
          undefined,
          sheetSegmentIndex(row)
        )
      }
    }
    return this.getQualities()
  }

  addQuality(partial?: Partial<QualityMaster>, createdOn: string = getProductionToday()): QualityMaster[] {
    const qualities = this.getQualities()
    const added = normalizeQuality({
      id: `q-${Date.now()}`,
      name: partial?.name || 'New Quality',
      fabricType: normalizeFabricType(partial?.fabricType),
      weavePlan: partial?.weavePlan != null ? String(partial.weavePlan) : '',
      weftPlan: partial?.weftPlan != null ? String(partial.weftPlan) : '',
      warpYarn: partial?.warpYarn != null ? partial.warpYarn : '20/1',
      weftYarn: partial?.weftYarn != null ? partial.weftYarn : '20/1',
      reed: partial?.reed ?? 120,
      pick: partial?.pick ?? 60,
      widthInch: partial?.widthInch ?? 66,
      gsm: partial?.gsm !== undefined ? Number(Number(partial.gsm).toFixed(2)) : 0,
      status: partial?.status ?? 'ACTIVE',
      createdOn: partial?.createdOn || createdOn,
      endedOn: partial?.endedOn ?? null,
    })
    qualities.push(added)
    this.saveQualities(qualities)
    rememberLocalPendingQuality(added)
    void this.flushNewQuality(added)
    return qualities
  }

  /**
   * Reuse an ENDED quality without losing Ends history:
   * - keep the original ENDED row for Ends tab / month PDF (2→1)
   * - fork a NEW Active id from zero (new createdOn → Track starts at 0)
   */
  reassignEndedQuality(
    id: string,
    createdOn: string = getProductionToday()
  ): { qualities: QualityMaster[]; newQuality: QualityMaster | null; archive: QualityMaster | null } {
    const list = this.getQualities()
    const src = list.find((q) => q.id === id)
    if (!src || normalizeQualityStatus(src.status) !== 'ENDED') {
      return { qualities: list, newQuality: null, archive: null }
    }
    // Frozen archive rows are history only — never fork from them.
    if (String(id).startsWith('q-end-')) {
      return { qualities: list, newQuality: null, archive: null }
    }
    // Same name already live on Active/Hold → Reuse would duplicate the row.
    const liveSame = findLiveQualityByName(list, src.name, src.id)
    if (liveSame) {
      return { qualities: list, newQuality: null, archive: null }
    }
    const day = String(createdOn || getProductionToday()).slice(0, 10)
    const endedOn = src.endedOn ? String(src.endedOn).slice(0, 10) : day

    const newQuality = normalizeQuality({
      id: `q-${Date.now()}`,
      name: src.name,
      fabricType: src.fabricType,
      weavePlan: src.weavePlan || '',
      weftPlan: src.weftPlan || '',
      warpYarn: src.warpYarn,
      weftYarn: src.weftYarn,
      reed: src.reed,
      pick: src.pick,
      widthInch: src.widthInch,
      gsm: src.gsm,
      status: 'ACTIVE',
      createdOn: day,
      endedOn: null,
      loomEnds: [],
    })

    // Keep original ENDED for Ends tab — do NOT revive / forget its local end.
    rememberLocalQualityEnd(src.id, endedOn, src.name, src.loomEnds)
    rememberLocalPendingQuality(newQuality)

    const qualities = collapseDuplicateActiveQualities(
      [...list.filter((q) => q.id !== newQuality.id), newQuality],
      day
    )
    // Memory only — full PUT can race and drop the new Active before upsert lands.
    this.saveQualitiesMemory(qualities)
    return { qualities, newQuality, archive: normalizeQuality({ ...src, status: 'ENDED', endedOn }) }
  }

  /** Persist new Active run; keep original ENDED row in DB (server-atomic). */
  async flushReassign(revived: QualityMaster, archive: QualityMaster | null): Promise<boolean> {
    // Browser backup until hydrate confirms DB has the Active fork.
    rememberLocalPendingQuality(revived)
    if (archive?.id && archive.endedOn) {
      rememberLocalQualityEnd(archive.id, String(archive.endedOn).slice(0, 10), archive.name, archive.loomEnds)
    }

    const createdOn = String(revived.createdOn || getProductionToday()).slice(0, 10)
    let ok = false
    let active = revived

    if (archive?.id) {
      const result = await persistQualityReuse(archive.id, createdOn, revived)
      ok = result.ok
      if (result.active) active = result.active
    } else {
      ok = await persistQualityUpsert(revived)
    }

    // Fallback: plain upsert if atomic call failed (older server / network).
    if (!ok) {
      ok = await persistQualityUpsert(revived)
      if (archive?.id && archive.endedOn) {
        await persistQualityStatus(archive.id, 'ENDED', String(archive.endedOn).slice(0, 10))
      }
    }

    // Merge-safe full list PUT — now upserts rows, never deleteMany.
    const list = this.getQualities()
    const synced = list.some((q) => q.id === active.id)
      ? list.map((q) => (q.id === active.id ? normalizeQuality(active) : q))
      : [...list, normalizeQuality(active)]
    const withEnded = synced.map((q) =>
      archive && q.id === archive.id
        ? normalizeQuality({
            ...q,
            status: 'ENDED',
            endedOn: archive.endedOn ? String(archive.endedOn).slice(0, 10) : q.endedOn,
          })
        : q
    )
    this.saveQualitiesMemory(withEnded)
    // Extra belt: merge-upsert entire catalog so Active cannot vanish on refresh.
    await persistKey(KEY_QUALITY, withEnded)

    // Keep pending if still not confirmed — hydrate drops it when DB has the id.
    if (ok) {
      // Leave pending; hydrate forgets only after DB confirms.
    }
    return ok
  }

  /** @deprecated prefer flushReassign — kept for addQuality path */
  async flushNewQuality(quality: QualityMaster): Promise<boolean> {
    rememberLocalPendingQuality(quality)
    const okUpsert = await persistQualityUpsert(quality)
    // Keep pending until hydrate confirms — protects against stale quality PUT wipe.
    return okUpsert
  }

  /** If user picks an ENDED quality on a loom, fork a new Active run (Ends row stays). */
  private resolveQualityIdForAssign(
    qualityId: string | null | undefined,
    dateStr: string
  ): string | null | undefined {
    if (!qualityId) return qualityId
    const q = this.getQualities().find((item) => item.id === qualityId)
    if (!q) return qualityId
    if (normalizeQualityStatus(q.status) !== 'ENDED') return qualityId
    // Archive ids are already closed history — don't reuse those.
    if (String(qualityId).startsWith('q-end-')) return qualityId
    const { newQuality } = this.reassignEndedQuality(qualityId, dateStr)
    if (newQuality) return newQuality.id
    // Same name already Active (Reuse blocked) — assign that live row instead.
    const live = findLiveQualityByName(this.getQualities(), q.name, q.id)
    return live?.id || qualityId
  }

  /** Push one quality's status/endedOn to DB (await before refresh-safe UI). */
  async flushQualityStatus(id: string): Promise<boolean> {
    const q = this.getQualities().find((item) => item.id === id)
    if (!q) return false
    const status = normalizeQualityStatus(q.status)
    if (status === 'ENDED' && q.endedOn) {
      rememberLocalQualityEnd(id, q.endedOn, q.name, q.loomEnds)
    } else if (status === 'ACTIVE') {
      forgetLocalQualityEnd(id)
    }
    const endedOn = status === 'ACTIVE' ? null : q.endedOn ?? null
    // Row upsert + status patch only — full-table PUT races and can wipe reuse archives.
    const okUpsert = await persistQualityUpsert(q)
    const okPatch = await persistQualityStatus(id, status, endedOn)
    const ok = okPatch || okUpsert
    // Only clear Continue/Resume pending after DB confirms Active.
    if (ok && status === 'ACTIVE') {
      forgetLocalPendingQuality(id)
    }
    return ok
  }

  /** Push full qualities list + status patch for ended/hold rows. */
  async flushQualitiesToDb(): Promise<boolean> {
    const list = this.getQualities()
    const ok = await persistKey(KEY_QUALITY, list)
    for (const q of list) {
      const status = normalizeQualityStatus(q.status)
      if (status === 'ENDED' || status === 'HOLD') {
        await persistQualityStatus(q.id, status, q.endedOn ?? null)
      }
    }
    return ok
  }

  endQuality(id: string, endedOn: string): QualityMaster[] {
    return this.updateQuality(id, { status: 'ENDED', endedOn }, endedOn)
  }

  /**
   * End quality on selected looms for `dateStr`.
   * Always records ENDED + endedOn for that date (so Quality Ends tab shows it),
   * while only clearing the chosen looms — other looms can keep running that day.
   * Call `flushQualityStatus` after this so refresh keeps the record.
   */
  endQualityOnLooms(
    qualityId: string,
    loomNumbers: number[],
    dateStr: string
  ): { qualities: QualityMaster[]; looms: LoomMaster[]; entries: DailyLoomProductionEntry[]; fullyEnded: boolean } {
    const catalog = this.getQualities()
    const quality = catalog.find((q) => q.id === qualityId)
    if (!quality) {
      return {
        qualities: catalog,
        looms: this.getLooms(),
        entries: this.buildSheetForDate(dateStr, { skipPersist: true }),
        fullyEnded: false,
      }
    }

    const chosen = [...new Set(loomNumbers.filter((n) => Number.isFinite(n)))]
    if (chosen.length === 0) {
      return {
        qualities: catalog,
        looms: this.getLooms(),
        entries: this.buildSheetForDate(dateStr, { skipPersist: true }),
        fullyEnded: false,
      }
    }

    for (const loomNumber of chosen) {
      this.updateSheetEntry(dateStr, loomNumber, {
        qualityName: '—',
        fabricType: '',
        warpYarn: '',
        weftYarn: '',
        _clearQuality: true,
      } as Partial<DailyLoomProductionEntry> & { _clearQuality?: boolean })
      const loom = this.getLooms().find((l) => l.loomNumber === loomNumber)
      if (loom?.qualityId === qualityId) {
        this.saveLooms(
          this.getLooms().map((l) =>
            l.loomNumber === loomNumber ? { ...l, qualityId: null, qualityAssignedOn: null } : l
          )
        )
      }
    }

    const newLoomEnds = chosen.map((loomNumber) => ({ date: dateStr, loomNumber }))
    const runningLooms = this.getLooms().filter((l) => l.qualityId === qualityId)
    const remainingRunningLooms = runningLooms.filter((l) => !chosen.includes(l.loomNumber))
    const isFullyEnded = remainingRunningLooms.length === 0

    const qualities = this.updateQuality(
      qualityId,
      {
        status: isFullyEnded ? 'ENDED' : 'ACTIVE',
        endedOn: dateStr,
        loomEnds: mergeLoomEndLists(quality.loomEnds, newLoomEnds),
      },
      dateStr
    )

    return {
      qualities,
      looms: this.getLooms(),
      entries: this.peekSheetDay(dateStr) || this.buildSheetForDate(dateStr, { skipPersist: true }),
      fullyEnded: isFullyEnded,
    }
  }

  deleteQuality(id: string): QualityMaster[] {
    const qualities = this.getQualities().filter((q) => q.id !== id)
    this.saveQualitiesMemory(qualities)
    forgetLocalPendingQuality(id)
    forgetLocalQualityEnd(id)
    const beams = this.getBeams()
    if (beams.some((b) => b.qualityId === id)) {
      this.saveBeams(beams.map((b) => (b.qualityId === id ? { ...b, qualityId: null } : b)))
    }
    if (isClient()) {
      void fetch('/api/floor/store', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteQuality', id }),
      }).catch((err) => console.error('[floor] deleteQuality failed', id, err))
    }
    return qualities
  }

  private sheetKey(dateStr: string) {
    return `${KEY_SHEET}_${dateStr}`
  }

  /** True when a production sheet was explicitly saved/seeded for this date (not a view-only rebuild). */
  hasPersistedSheet(dateStr: string): boolean {
    return this.peekSheetDay(dateStr) != null
  }

  private isCorruptedDummySheet(entries: DailyLoomProductionEntry[]): boolean {
    if (!Array.isArray(entries) || entries.length === 0) return false
    const dummyNames = new Set(['silver-shine', 'eiffel tower', 'parcopv', 'design-2x1'])
    return entries.some((e) => dummyNames.has(String(e.qualityName || '').trim().toLowerCase()))
  }

  private peekSheetDay(dateStr: string): DailyLoomProductionEntry[] | null {
    const key = this.sheetKey(dateStr)
    try {
      const raw = memoryStore.get(key)
      if (raw) {
        const parsed = JSON.parse(raw) as DailyLoomProductionEntry[]
        if (!Array.isArray(parsed) || this.isCorruptedDummySheet(parsed)) return null
        return sortSheetEntries(parsed.map(normalizeSheetEntry))
      }
    } catch {
      // ignore
    }
    return null
  }

  /**
   * Load saved meters for a day from DB. Never fall back to Excel dummy history.
   * If a sheet has not been saved in DB, return empty array.
   */
  private loadSheetDay(dateStr: string): DailyLoomProductionEntry[] {
    const peeked = this.peekSheetDay(dateStr)
    if (peeked) return peeked
    return []
  }

  /** Latest saved primary (segment 1) row for this loom before `dateStr`. */
  private priorSheetRow(dateStr: string, loomNumber: number): DailyLoomProductionEntry | null {
    const priorDates = listPersistedSheetDates().filter((d) => d < dateStr)
    const priorDate = priorDates.length ? priorDates[priorDates.length - 1] : shiftProductionDate(dateStr, -1)
    const rows = this.peekSheetDay(priorDate)
    if (!rows) return null
    const forLoom = rows.filter((e) => e.loomNumber === loomNumber)
    return (
      forLoom.find((e) => sheetSegmentIndex(e) === 1) ||
      forLoom[0] ||
      null
    )
  }

  /** Latest saved lot for this loom before `dateStr`. Empty string is kept; missing day returns null. */
  private carriedLot(dateStr: string, loomNumber: number): string | null {
    const row = this.priorSheetRow(dateStr, loomNumber)
    if (!row) return null
    return row.lot || ''
  }

  /** Quality recipe as it is right now on the loom. Used only for the day being edited or a brand-new day. */
  private recipeForLoom(loom: LoomMaster, dateStr: string): Partial<DailyLoomProductionEntry> {
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
  }

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
        if (!q || normalizeQualityStatus(q.status) !== 'ENDED') return false
        if (q.loomEnds && q.loomEnds.length > 0) {
          return q.loomEnds.some((le) => le.loomNumber === l.loomNumber && String(le.date).slice(0, 10) <= dateStr)
        }
        return true
      })
    ) {
      looms = looms.map((l) => {
        if (!l.qualityId) return l
        const q = catalog.find((item) => item.id === l.qualityId)
        if (!q || normalizeQualityStatus(q.status) !== 'ENDED') return l
        if (q.loomEnds && q.loomEnds.length > 0) {
          const endedOnLoom = q.loomEnds.some((le) => le.loomNumber === l.loomNumber && String(le.date).slice(0, 10) <= dateStr)
          if (!endedOnLoom) return l
        }
        return { ...l, qualityId: null, qualityAssignedOn: null }
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

      // Check if a quality on this loom ended on or before dateStr:
      const endedQForLoom = catalog
        .filter((q) => {
          const hasLoomEnd = (q.loomEnds || []).some(
            (e) => e.loomNumber === loom.loomNumber && String(e.date).slice(0, 10) <= dateStr
          )
          if (hasLoomEnd) return true

          const generalEnd = normalizeQualityStatus(q.status) === 'ENDED' && (!q.loomEnds || q.loomEnds.length === 0)
            ? Boolean(q.endedOn && String(q.endedOn).slice(0, 10) <= dateStr)
            : false
          if (!generalEnd) return false

          // General end only applies to this loom if this loom was actually running/allotted to q!
          const loomWasOnThisQuality =
            loom.qualityId === q.id ||
            (prior && !isQualityEndedSheetRow(prior) && qualityNameKey(prior.qualityName || '') === qualityNameKey(q.name)) ||
            (prev && !isQualityEndedSheetRow(prev) && qualityNameKey(prev.qualityName || '') === qualityNameKey(q.name))
          return Boolean(loomWasOnThisQuality)
        })
        .sort((a, b) => {
          const aEnd = a.endedOn ? String(a.endedOn).slice(0, 10) : ''
          const bEnd = b.endedOn ? String(b.endedOn).slice(0, 10) : ''
          return bEnd.localeCompare(aEnd)
        })[0]

      const qualityAssignedOn = loom.qualityAssignedOn
        ? String(loom.qualityAssignedOn).slice(0, 10)
        : null

      // Quality assigned after this day cannot be live on this day:
      const assignedAfterThisDay = Boolean(qualityAssignedOn && dateStr < qualityAssignedOn)

      // Quality created after this day cannot be live on this day:
      const createdAfterThisDay = Boolean(
        loomQ?.createdOn && dateStr < String(loomQ.createdOn).slice(0, 10)
      )

      // Prev row explicitly saved as Quality Ended:
      const prevWasEnded = isQualityEndedSheetRow(prev)

      // Did quality end before this day on this loom?
      const qualityEndedBeforeDay = Boolean(
        endedQForLoom ||
        qualityPoseEndedBeforeDay(prev, catalog, dateStr) ||
        qualityPoseEndedBeforeDay(prior, catalog, dateStr) ||
        isQualityEndedSheetRow(prior)
      )

      // Live quality is blocked on this date if assigned later, created later, or intermediate ended day:
      const liveQualityBlockedOnDay =
        assignedAfterThisDay ||
        createdAfterThisDay ||
        (qualityEndedBeforeDay && prevWasEnded) ||
        (qualityEndedBeforeDay && !qualityAssignedOn && (
          !prev ||
          isQualityEndedSheetRow(prev) ||
          (prev.rollerHours === 0 && prev.shiftAMeters === 0 && prev.shiftBMeters === 0)
        ))

      // Only ACTIVE/HOLD counts as a live pose for dateStr — stale ENDED id or future assign must not keep meters.
      const loomHasLivePose = Boolean(
        loomQ &&
        (loomQStatus === 'ACTIVE' || loomQStatus === 'HOLD') &&
        !liveQualityBlockedOnDay
      )

      // After Quality End (no new quality on loom): keep ended name for E badge,
      // but force zeros — never carry pick/meters from end-day / stale seed.
      const prevNamed = Boolean(prev && namedQualityOnRow(prev.qualityName))
      const rowLooksEnded =
        prevWasEnded ||
        qualityPoseEndedBeforeDay(prev, catalog, dateStr) ||
        (!prevNamed && qualityPoseEndedBeforeDay(prior, catalog, dateStr)) ||
        // Stale seed: same quality name as ended prior day, loom has no live pose.
        (prevNamed &&
          prior &&
          qualityNameKey(prev!.qualityName) === qualityNameKey(prior.qualityName || '') &&
          qualityPoseEndedBeforeDay(prior, catalog, dateStr)) ||
        // Loom had ended quality and live quality does not apply on dateStr:
        (qualityEndedBeforeDay && !loomHasLivePose)

      const poseEnded = !loomHasLivePose && rowLooksEnded
      const endedLabelSrc = poseEnded
        ? endedQForLoom
          ? {
              qualityName: endedQForLoom.name,
              fabricType: endedQForLoom.fabricType,
              warpYarn: endedQForLoom.warpYarn,
              weftYarn: endedQForLoom.weftYarn,
              pick: endedQForLoom.pick,
              reed: endedQForLoom.reed,
              widthInch: endedQForLoom.widthInch,
              gsm: endedQForLoom.gsm,
            }
          : prev && namedQualityOnRow(prev.qualityName) && (isQualityEndedSheetRow(prev) || !loomQ || qualityNameKey(prev.qualityName) !== qualityNameKey(loomQ.name))
            ? prev
            : prior && namedQualityOnRow(prior.qualityName)
              ? prior
              : prev && namedQualityOnRow(prev.qualityName)
                ? prev
                : null
        : null

      // A saved row keeps the quality stored on that date, including a deliberate clear.
      // Past days must NOT fall back to today's live loom master — factory backfill
      // starts empty / from prior day only (e.g. set up 2 Oct without copying 3 Oct).
      // After Quality End, loom.qualityId is null — do NOT carry prior day's pick/quality
      // onto the next day (show empty / B/End only until a new quality is assigned).
      const cleared = prev ? !namedQualityOnRow(prev.qualityName) && !poseEnded : false

      // Only revive after a real "Quality Ended" stub + new live assign on or after assign date.
      const reviveFromLive =
        Boolean(loomHasLivePose && namedQualityOnRow(live.qualityName)) &&
        isQualityEndedSheetRow(prev) &&
        !assignedAfterThisDay

      const priorQ = prior?.qualityName
        ? matchQualityByNameAndPick(catalog, prior.qualityName, prior.pick)
        : null
      const priorQStatus = priorQ ? normalizeQualityStatus(priorQ.status) : null
      const priorQualityIsLive = Boolean(
        priorQ && (priorQStatus === 'ACTIVE' || priorQStatus === 'HOLD')
      )
      const identity = poseEnded
        ? null
        : cleared
          ? null
          : reviveFromLive
            ? live
            : prev
              ? prev
              : prior &&
                  namedQualityOnRow(prior.qualityName) &&
                  (loomHasLivePose || priorQualityIsLive)
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
  }

  updateSheetEntry(
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
      const rollerHours = merged.rollerHours ?? merged.runningHours ?? 0
      const metrics = calculateProductionMetrics({
        rpm: merged.rpm,
        runningHours: rollerHours,
        pick: merged.pick || 60,
        shiftAMeters: merged.shiftAMeters || 0,
        shiftBMeters: merged.shiftBMeters || 0,
        loomNumber,
      })
      const result: DailyLoomProductionEntry = normalizeSheetEntry({
        ...merged,
        id: sheetEntryId(dateStr, loomNumber, seg),
        date: dateStr,
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
    // Save the patched day once, so an older rebuild cannot put today's quality onto another day.
    saveJson(this.sheetKey(dateStr), sorted)

    // Row-level persist to DB (prevents overwriting other looms / segments)
    if (updatedLoom) {
      void persistLoomEntry(dateStr, loomNumber, updatedLoom)
    }

    return sorted
  }

  /** Explicit same-day dual quality: add next segment for `qualityId` on this loom/date. */
  addQualitySegmentOnDay(
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
  }

  /** Remove same-day Part 2+ row (cannot delete Part 1). */
  removeQualitySegmentOnDay(
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
  }

  /** Zero roller hours + Actual A/B for every loom on this day (after UI confirm). */
  resetDayMeters(dateStr: string, editorName?: string): DailyLoomProductionEntry[] {
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
    saveJson(this.sheetKey(dateStr), next)
    for (const row of next) {
      void persistLoomEntry(dateStr, row.loomNumber, row)
    }
    return next
  }

  async submitSheetForApproval(dateStr: string): Promise<DailyLoomProductionEntry[]> {
    if (!isClient()) return this.buildSheetForDate(dateStr)
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submitForApproval', date: dateStr }),
    })
    const data = await res.json()
    if (data.ok && Array.isArray(data.entries)) {
      memoryStore.set(this.sheetKey(dateStr), JSON.stringify(data.entries))
      return data.entries
    }
    return this.buildSheetForDate(dateStr)
  }

  async approveSheet(dateStr: string): Promise<DailyLoomProductionEntry[]> {
    if (!isClient()) return this.buildSheetForDate(dateStr)
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approveSheet', date: dateStr }),
    })
    const data = await res.json()
    if (data.ok && Array.isArray(data.entries)) {
      memoryStore.set(this.sheetKey(dateStr), JSON.stringify(data.entries))
      return data.entries
    }
    if (!data.ok) {
      throw new Error(data.error || 'Approval failed')
    }
    return this.buildSheetForDate(dateStr)
  }

  async unlockSheet(dateStr: string): Promise<DailyLoomProductionEntry[]> {
    if (!isClient()) return this.buildSheetForDate(dateStr)
    const res = await fetch('/api/floor/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unlockSheet', date: dateStr }),
    })
    const data = await res.json()
    if (data.ok && Array.isArray(data.entries)) {
      memoryStore.set(this.sheetKey(dateStr), JSON.stringify(data.entries))
      return data.entries
    }
    if (!data.ok) {
      throw new Error(data.error || 'Unlock failed')
    }
    return this.buildSheetForDate(dateStr)
  }

  startNewDay(dateStr: string): DailyLoomProductionEntry[] {
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
  }

  /**
   * Loom × day matrix. meters / shiftA / shiftB sum. efficiency is actual ÷ target.
   * active is 1 when the loom was running that day. Empty days stay —.
   * `ownsEntry` keeps a quality track on that quality only: a loom that switched
   * quality mid-month does not carry the previous quality's meters.
   */
  buildMonthlyMatrix(
    monthStr: string = PRODUCTION_TODAY_MONTH,
    metric: 'meters' | 'shiftA' | 'shiftB' | 'efficiency' | 'active' = 'meters',
    ownsEntry?: (entry: DailyLoomProductionEntry, dateStr: string) => boolean
  ): {
    days: MonthlyMatrixDay[]
    loomTotals: Record<number, number>
    grandTotalMeters: number
    avgPerDay: number
    /** Sum of actual meters and running target, used to weight efficiency. */
    loomActual: Record<number, number>
    loomTarget: Record<number, number>
    dayActual: number[]
    dayTarget: number[]
  } {
    const lastDay = monthLastEnteredDay(monthStr)

    const loomNumbers = this.getLooms()
      .filter((l) => l.isActive)
      .map((l) => l.loomNumber)
      .sort((a, b) => a - b)

    const loomTotals: Record<number, number> = {}
    const loomActual: Record<number, number> = {}
    const loomTarget: Record<number, number> = {}
    loomNumbers.forEach((n) => {
      loomTotals[n] = 0
      loomActual[n] = 0
      loomTarget[n] = 0
    })

    const days: MonthlyMatrixDay[] = []
    const dayActual: number[] = []
    const dayTarget: number[] = []
    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`
      const peeked = this.peekSheetDay(dateStr)
      const loomMeters: Record<number, number> = {}
      const dayLoomActual: Record<number, number> = {}
      const dayLoomTarget: Record<number, number> = {}
      const loomCounted: Record<number, boolean> = {}
      loomNumbers.forEach((n) => {
        loomMeters[n] = 0
      })
      let totalMeters = 0
      let actualSum = 0
      let targetSum = 0
      let entries = peeked
      let hasSheet = peeked != null && peeked.length > 0

      if (hasSheet && entries) {
        for (const e of entries) {
          if (ownsEntry && !ownsEntry(e, dateStr)) continue
          if (ownsEntry) loomCounted[e.loomNumber] = true
          const meters =
            e.totalMeters != null
              ? Number(e.totalMeters) || 0
              : (Number(e.shiftAMeters) || 0) + (Number(e.shiftBMeters) || 0)
          const target = Number(e.runningTheoretical) || 0
          actualSum += meters
          targetSum += target
          loomActual[e.loomNumber] = (loomActual[e.loomNumber] || 0) + meters
          loomTarget[e.loomNumber] = (loomTarget[e.loomNumber] || 0) + target
          // Same-day dual segments: sum meters/target per loom (do not overwrite).
          dayLoomActual[e.loomNumber] = (dayLoomActual[e.loomNumber] || 0) + meters
          dayLoomTarget[e.loomNumber] = (dayLoomTarget[e.loomNumber] || 0) + target

          let value = meters
          if (metric === 'shiftA') value = Number(e.shiftAMeters) || 0
          else if (metric === 'shiftB') value = Number(e.shiftBMeters) || 0
          else if (metric === 'active') {
            value = resolveLoomCondition(e.status, e.remarks) === 'RUNNING' ? 1 : 0
            loomMeters[e.loomNumber] = Math.max(loomMeters[e.loomNumber] || 0, value)
            continue
          } else if (metric === 'efficiency') {
            // Defer % until dayLoomActual/Target are fully summed for the loom.
            continue
          }
          loomMeters[e.loomNumber] = (loomMeters[e.loomNumber] || 0) + value
          loomTotals[e.loomNumber] = (loomTotals[e.loomNumber] || 0) + value
          totalMeters += value
        }
        if (metric === 'efficiency') {
          for (const n of loomNumbers) {
            const a = dayLoomActual[n] || 0
            const t = dayLoomTarget[n] || 0
            loomMeters[n] = t > 0 ? Math.round((a / t) * 100) : 0
          }
        }
        if (metric === 'active') {
          totalMeters = 0
          for (const n of loomNumbers) {
            const v = loomMeters[n] || 0
            loomTotals[n] = (loomTotals[n] || 0) + v
            totalMeters += v
          }
        }
      }

      if (metric === 'efficiency') {
        totalMeters = targetSum > 0 ? Math.round((actualSum / targetSum) * 100) : 0
      }

      dayActual.push(actualSum)
      dayTarget.push(targetSum)
      days.push({
        day,
        date: dateStr,
        totalMeters,
        loomMeters,
        hasSheet,
        loomCounted: ownsEntry ? loomCounted : undefined,
        loomActual: metric === 'efficiency' ? dayLoomActual : undefined,
        loomTarget: metric === 'efficiency' ? dayLoomTarget : undefined,
      })
    }

    if (metric === 'efficiency') {
      for (const n of loomNumbers) {
        const target = loomTarget[n] || 0
        loomTotals[n] = target > 0 ? Math.round(((loomActual[n] || 0) / target) * 100) : 0
      }
    }

    const daysWithSheet = days.filter((d) => d.hasSheet).length
    const grandTotalMeters =
      metric === 'efficiency'
        ? (() => {
            const actual = dayActual.reduce((s, n) => s + n, 0)
            const target = dayTarget.reduce((s, n) => s + n, 0)
            return target > 0 ? Math.round((actual / target) * 100) : 0
          })()
        : days.reduce((s, d) => s + (d.totalMeters || 0), 0)
    const avgPerDay =
      metric === 'efficiency'
        ? grandTotalMeters
        : daysWithSheet > 0
          ? grandTotalMeters / daysWithSheet
          : 0
    return {
      days,
      loomTotals,
      grandTotalMeters,
      avgPerDay,
      loomActual,
      loomTarget,
      dayActual,
      dayTarget,
    }
  }
}

export const productionMastersService = new ProductionMastersService()
