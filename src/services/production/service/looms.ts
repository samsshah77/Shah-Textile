/** Loom master: list, edit, add / remove, quality pose on a loom. (Part of productionMastersService — no behaviour change.) */
import {
  LoomCategory,
} from '@/types/loom'
import {
  DailyLoomProductionEntry,
} from '@/types/production'
import {
  PRODUCTION_TODAY,
  getProductionToday,
  shiftProductionDate,
} from '@/constants/productionCalendar'
import {
  LOOM_STATUS_LABEL,
} from '@/constants/loomConditions'
import {
  isClient,
  normalizeBeam,
  normalizeLoomPictures,
  getLoomPictures,
  normalizeLoomRef,
  beamOnLoom,
} from '@/services/production/loomBeamHelpers'
import type {
  BeamMaster,
  QualityMaster,
  LoomMaster,
} from '@/services/production/masterTypes'
import {
  sheetSegmentIndex,
  sheetRowShowsQuality,
  isQualityEndedSheetRow,
  namedQualityOnRow,
  qualityRunThatOwnsSheetEntry,
  MAX_SAME_DAY_QUALITY_SEGMENTS,
  orderQualitiesByLoomAllotment,
} from '@/services/production/qualityRuns'
import {
  seedLooms,
  completeLoomRoster,
} from '@/services/production/productionSeeds'
import {
  notifyFloorSaveProblem,
} from '@/services/production/floorSync'
import {
  KEY_LOOMS,
  hydrated,
  loadJson,
  saveJson,
} from '@/services/production/floorStore'
import type { ProductionMastersService } from '@/services/productionMastersService'

export const loomsMethods = {
  getLooms(this: ProductionMastersService): LoomMaster[] {
    const stored = loadJson(KEY_LOOMS, seedLooms)
    const { list, changed } = completeLoomRoster(stored)
    const looms = list.map((l) => ({
      ...l,
      ...normalizeLoomPictures(l),
    }))
    if (changed && hydrated && isClient()) {
      saveJson(KEY_LOOMS, looms)
    }
    return looms
  },

  saveLooms(this: ProductionMastersService, looms: LoomMaster[]) {
    saveJson(
      KEY_LOOMS,
      looms.map((l) => ({
        ...l,
        ...normalizeLoomPictures(l),
      }))
    )
  },


  consumeLastForwardFillSkips(this: ProductionMastersService): {
    date: string
    qualityName: string
    loomNumber: number
  }[] {
    const out = this.lastForwardFillSkips
    this.lastForwardFillSkips = []
    return out
  },

  /**
   * Quality pose from `fromDate` forward through today on one loom.
   * Days before `fromDate` stay untouched.
   * Start day: replace Part 1 (dropdown change) — never auto-create Part 2.
   * Part 2 only via `addQualitySegmentOnDay` (loom +P button).
   * Later days: fill only if empty/cleared/same quality — never overwrite a busy day.
   */
  applyQualityOnLoomFromDate(
    this: ProductionMastersService,
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
  },

  /**
   * Write a quality onto a loom for one day.
   * - Matching segment → update that segment.
   * - Empty / same primary → update Part 1.
   * - `replacePrimary` (loom dropdown): overwrite Part 1 — never auto Part 2.
   * - `allowNewSegment` (+P only): add Part 2 while keeping Part 1.
   * - Else (forward fill): skip busy days.
   */
  writeQualityPoseOnDay(
    this: ProductionMastersService,
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
  },

  updateLoom(
    this: ProductionMastersService,
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

    // A quality run cannot be put on a loom before the day it started — otherwise the
    // days between an old End and the new start get back-filled with the new quality.
    if (workingPatch.qualityId) {
      const target = this.getQualities().find((q) => q.id === workingPatch.qualityId)
      const startDay = target?.createdOn ? String(target.createdOn).slice(0, 10) : ''
      const day = String(dateStr || '').slice(0, 10)
      if (target && startDay && day && day < startDay) {
        notifyFloorSaveProblem(409, {
          error:
            `"${target.name}" ki start date ${startDay} hai — ${day} par loom ${loomNumber} par nahi lag sakti. ` +
            `Upar se ${startDay} (ya baad ki) date chunein, ya Quality Master mein start date theek karein.`,
        })
        return this.getLooms()
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
          // B/End / B/Cut no longer take the beam off by themselves: the Looms table asks, and
          // the Beams table flags the beam until it is ended there.
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

          const merged = {
            ...l,
            ...masterPatch,
            statusSince: nextStatusSince,
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
      // The beam is ended separately (Looms table asks; Beams table flags it).
      this.updateSheetEntry(dateStr, loomNumber, sheetPatch)
    }

    return this.getLooms()
  },

  /** Unmount beam on this loom → send to Sizing (empty) for rework. */
  flagBeamEndFromLoom(this: ProductionMastersService, loomNumber: number, dateStr: string): void {
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
  },

  /**
   * If any loom is already Beam End but a beam is still mounted on it
   * (legacy data / missed sync), unmount → Sizing + show Ended on Beam table.
   */
  reconcileBeamEndsWithLooms(this: ProductionMastersService, dateStr: string): BeamMaster[] {
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
  },

  addLoom(this: ProductionMastersService, partial?: Partial<LoomMaster>): LoomMaster[] {
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
  },

  deleteLoom(this: ProductionMastersService, loomNumber: number): LoomMaster[] {
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
  },
}

export type LoomsMethods = typeof loomsMethods
