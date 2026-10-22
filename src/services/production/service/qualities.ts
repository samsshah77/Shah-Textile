/** Quality master: create, edit, end, reuse; quality runs on looms. (Part of productionMastersService — no behaviour change.) */
import {
  DailyLoomProductionEntry,
} from '@/types/production'
import {
  getProductionToday,
  shiftProductionDate,
} from '@/constants/productionCalendar'
import {
  isClient,
} from '@/services/production/loomBeamHelpers'
import type {
  QualityMaster,
  LoomMaster,
} from '@/services/production/masterTypes'
import {
  normalizeQuality,
  normalizeQualityStatus,
  normalizeFabricType,
} from '@/services/production/masterTypes'
import {
  sheetSegmentIndex,
  sheetRowShowsQuality,
  isQualityEndedSheetRow,
  namedQualityOnRow,
  orderQualitiesByLoomAllotment,
  collapseDuplicateActiveQualities,
  remapLoomQualityIdsAfterCollapse,
  qualityNameKey,
  findLiveQualityByName,
  qualityLoomEndsOnDate,
  applyMidRunYarnChange,
  QUALITY_ENDED_REMARK,
} from '@/services/production/qualityRuns'
import {
  seedLooms,
  seedQualities,
} from '@/services/production/productionSeeds'
import { mergeLoomEndLists } from '@/services/production/floorLocalCache'
import {
  memoryStore,
  notifyFloorSaveProblem,
  applyServerSync,
  isFloorBatchOpen,
} from '@/services/production/floorSync'
import {
  KEY_LOOMS,
  KEY_QUALITY,
  persistKey,
  floorAction,
  persistQualityStatus,
  persistQualityUpsert,
  persistQualityReuse,
  loadJson,
  saveJson,
} from '@/services/production/floorStore'
import type { ProductionMastersService } from '@/services/productionMastersService'

export const qualitiesMethods = {
  getQualities(this: ProductionMastersService): QualityMaster[] {
    const before = loadJson(KEY_QUALITY, seedQualities).map(normalizeQuality)
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
  },

  /** Qualities ordered by loom allotment (Loom 1 → N). */
  getQualitiesOrdered(this: ProductionMastersService, entries?: DailyLoomProductionEntry[]): QualityMaster[] {
    return orderQualitiesByLoomAllotment(this.getQualities(), this.getLooms(), entries)
  },

  saveQualities(this: ProductionMastersService, qualities: QualityMaster[]) {
    // Memory + merge-upsert PUT (server no longer deleteMany). Prefer row upserts for new forks.
    saveJson(KEY_QUALITY, qualities)
  },

  /** Memory only — avoids racing a full qualities PUT while reuse upsert is in flight. */
  saveQualitiesMemory(this: ProductionMastersService, qualities: QualityMaster[]) {
    try {
      memoryStore.set(KEY_QUALITY, JSON.stringify(qualities.map(normalizeQuality)))
    } catch {
      // ignore
    }
  },

  /**
   * Production of this quality entered on days *after* `endDay` (up to today).
   * Ending on `endDay` would zero these days, so the UI must warn first.
   */
  productionAfterEnd(
    this: ProductionMastersService,
    id: string,
    endDay: string
  ): { lastDay: string; meters: number; days: { date: string; looms: number[]; meters: number }[] } {
    const catalog = this.getQualities()
    const q = catalog.find((item) => item.id === id)
    const out = { lastDay: '', meters: 0, days: [] as { date: string; looms: number[]; meters: number }[] }
    if (!q || !endDay) return out
    const until = getProductionToday()
    let cursor = shiftProductionDate(endDay, 1)
    while (cursor <= until) {
      const rows = (this.peekSheetDay(cursor) || []).filter(
        (e) =>
          !isQualityEndedSheetRow(e) &&
          sheetRowShowsQuality(e, q, catalog) &&
          (Number(e.shiftAMeters) || 0) + (Number(e.shiftBMeters) || 0) > 0
      )
      if (rows.length > 0) {
        const meters = rows.reduce((sum, e) => sum + (Number(e.shiftAMeters) || 0) + (Number(e.shiftBMeters) || 0), 0)
        out.days.push({ date: cursor, looms: [...new Set(rows.map((e) => e.loomNumber))].sort((a, b) => a - b), meters })
        out.meters += meters
        out.lastDay = cursor
      }
      cursor = shiftProductionDate(cursor, 1)
    }
    return out
  },

  updateQuality(
    this: ProductionMastersService,
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
    // Renaming a quality that already ran on earlier days would split its history:
    // those days' rows keep the old name and stop matching. Only allow a rename on the
    // quality's first day (typo fix); otherwise End it and add the new name.
    if (current && nextPatch.name !== undefined) {
      const newKey = qualityNameKey(String(nextPatch.name))
      const oldKey = qualityNameKey(current.name)
      const startDay = current.createdOn ? String(current.createdOn).slice(0, 10) : ''
      const day = String(fromDate || '').slice(0, 10)
      if (newKey && oldKey && newKey !== oldKey && (!startDay || day > startDay)) {
        notifyFloorSaveProblem(409, {
          error:
            `"${current.name}" ${startDay || 'pehle'} se chal rahi hai — naam badalne se pichle dinon ka record alag ho jayega. ` +
            `Naam sirf pehle din (${startDay || 'start date'}) badal sakte hain. Warna is quality ko End karein aur naye naam se nayi quality add karein.`,
        })
        delete nextPatch.name
        if (Object.keys(nextPatch).length === 0) return catalogBefore
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
    // End on a past date wipes production already entered on later days only when the
    // user confirmed it (the Quality table asks first, listing what will be removed).
    const allowWipe = Boolean((nextPatch as { _allowWipe?: boolean })._allowWipe)
    delete (nextPatch as { _allowWipe?: boolean })._allowWipe
    if (nextPatch.status === 'ENDED' && current && currentStatus !== 'ENDED' && !allowWipe) {
      const later = this.productionAfterEnd(id, String(fromDate || '').slice(0, 10))
      if (later.meters > 0) {
        notifyFloorSaveProblem(409, {
          error:
            `"${current.name}" ki production ${later.lastDay} tak darj hai — End nahi hua. ` +
            `Quality table se End dabayein aur warning confirm karein.`,
        })
        return catalogBefore
      }
    }

    const clearing = nextPatch.status === 'ENDED' || nextPatch.status === 'HOLD'
    const clearLoomNums = new Set<number>()
    if (clearing) {
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
        if (clearing && clearLoomNums.size > 0) {
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
        const runEndWipe = () => {
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
        if (allowWipe && isFloorBatchOpen()) {
          // Confirmed wipe of later production, saved as one change: the server stores the
          // ENDED status first and then the zeroed days, in the same transaction.
          this.saveQualities(qualities)
          runEndWipe()
          if (isClient()) window.dispatchEvent(new CustomEvent('floor:sheets-changed'))
        } else if (allowWipe) {
          // Confirmed wipe of later production: the server accepts those zeros only once it
          // knows the quality is ENDED, so store the status first, then write the days.
          this.saveQualities(qualities)
          const endDay = String(fromDate).slice(0, 10)
          void persistQualityStatus(id, 'ENDED', endDay).then(() => {
            runEndWipe()
            if (isClient()) window.dispatchEvent(new CustomEvent('floor:sheets-changed'))
          })
        } else {
          runEndWipe()
        }
      }
      const looms = this.getLooms()
      if (looms.some((l) => l.qualityId === id)) {
        this.saveLooms(looms.map((l) => (l.qualityId === id ? { ...l, qualityId: null } : l)))
      }
    }
    this.saveQualities(qualities)

    // After End catalog is saved, rebuild post-end days so poseEnded zeros + E remark stick
    // (stale seed meters / demote-restore cannot survive). Include seeded days past today.
    if (nextPatch.status === 'ENDED' && clearLoomNums.size > 0) {
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
    if (nextPatch.status === 'ENDED') {
      const loomsNow = this.getLooms()
      if (loomsNow.some((l) => l.qualityId === id)) {
        this.saveLooms(loomsNow.map((l) => (l.qualityId === id ? { ...l, qualityId: null } : l)))
      }
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
  },

  addQuality(this: ProductionMastersService, partial?: Partial<QualityMaster>, createdOn: string = getProductionToday()): QualityMaster[] {
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
    void this.flushNewQuality(added)
    return qualities
  },

  /**
   * Reuse an ENDED quality without losing Ends history:
   * - keep the original ENDED row for Ends tab / month PDF (2→1)
   * - fork a NEW Active id from zero (new createdOn → Track starts at 0)
   */
  reassignEndedQuality(
    this: ProductionMastersService,
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

    const qualities = collapseDuplicateActiveQualities(
      [...list.filter((q) => q.id !== newQuality.id), newQuality],
      day
    )
    // Memory only — full PUT can race and drop the new Active before upsert lands.
    this.saveQualitiesMemory(qualities)
    return { qualities, newQuality, archive: normalizeQuality({ ...src, status: 'ENDED', endedOn }) }
  },

  /** Persist new Active run; keep original ENDED row in DB (server-atomic). */
  async flushReassign(this: ProductionMastersService, revived: QualityMaster, archive: QualityMaster | null): Promise<boolean> {

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
  },

  /** @deprecated prefer flushReassign — kept for addQuality path */
  async flushNewQuality(this: ProductionMastersService, quality: QualityMaster): Promise<boolean> {
    const okUpsert = await persistQualityUpsert(quality)
    // Keep pending until hydrate confirms — protects against stale quality PUT wipe.
    return okUpsert
  },

  /** If user picks an ENDED quality on a loom, fork a new Active run (Ends row stays). */
  resolveQualityIdForAssign(
    this: ProductionMastersService,
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
  },

  /** Push one quality's status/endedOn to DB (await before refresh-safe UI). */
  async flushQualityStatus(this: ProductionMastersService, id: string): Promise<boolean> {
    const q = this.getQualities().find((item) => item.id === id)
    if (!q) return false
    const status = normalizeQualityStatus(q.status)
    const endedOn = status === 'ACTIVE' ? null : q.endedOn ?? null
    // Row upsert + status patch only — full-table PUT races and can wipe reuse archives.
    const okUpsert = await persistQualityUpsert(q)
    const okPatch = await persistQualityStatus(id, status, endedOn)
    return okPatch || okUpsert
  },

  /** Push full qualities list + status patch for ended/hold rows. */
  async flushQualitiesToDb(this: ProductionMastersService): Promise<boolean> {
    const list = this.getQualities()
    const ok = await persistKey(KEY_QUALITY, list)
    for (const q of list) {
      const status = normalizeQualityStatus(q.status)
      if (status === 'ENDED' || status === 'HOLD') {
        await persistQualityStatus(q.id, status, q.endedOn ?? null)
      }
    }
    return ok
  },

  endQuality(this: ProductionMastersService, id: string, endedOn: string): QualityMaster[] {
    return this.updateQuality(id, { status: 'ENDED', endedOn })
  },

  /**
   * End quality on selected looms for `dateStr`.
   * Always records ENDED + endedOn for that date (so Quality Ends tab shows it),
   * while only clearing the chosen looms — other looms can keep running that day.
   * Call `flushQualityStatus` after this so refresh keeps the record.
   */
  endQualityOnLooms(
    this: ProductionMastersService,
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
            l.loomNumber === loomNumber ? { ...l, qualityId: null } : l
          )
        )
      }
    }

    const newLoomEnds = chosen.map((loomNumber) => ({ date: dateStr, loomNumber }))
    const qualities = this.updateQuality(
      qualityId,
      {
        status: 'ENDED',
        endedOn: dateStr,
        loomEnds: mergeLoomEndLists(quality.loomEnds, newLoomEnds),
      },
      dateStr
    )

    return {
      qualities,
      looms: this.getLooms(),
      entries: this.peekSheetDay(dateStr) || this.buildSheetForDate(dateStr, { skipPersist: true }),
      fullyEnded: true,
    }
  },

  deleteQuality(this: ProductionMastersService, id: string): QualityMaster[] {
    const qualities = this.getQualities().filter((q) => q.id !== id)
    this.saveQualitiesMemory(qualities)
    const beams = this.getBeams()
    if (beams.some((b) => b.qualityId === id)) {
      this.saveBeams(beams.map((b) => (b.qualityId === id ? { ...b, qualityId: null } : b)))
    }
    if (isClient()) {
      void floorAction(KEY_QUALITY, { action: 'deleteQuality', id }, `deleteQuality ${id}`).then((data) => {
        // The server also unlinked beams from this quality.
        if (data?.beamSync) applyServerSync(data.beamSync)
      })
    }
    return qualities
  },
}

export type QualitiesMethods = typeof qualitiesMethods
