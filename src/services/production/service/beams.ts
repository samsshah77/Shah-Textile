/** Beam master: mount / unmount, sizing, beam end and beam track. (Part of productionMastersService — no behaviour change.) */
import {
  getProductionToday,
} from '@/constants/productionCalendar'
import {
  beamDailyEntryLot,
  buildBeamTrackFromEntries,
  type BeamTrackResult,
} from '@/services/beamTrack'
import {
  normalizeBeam,
  getMountedBeamsOnLoom,
} from '@/services/production/loomBeamHelpers'
import type {
  BeamMaster,
} from '@/services/production/masterTypes'
import {
  seedBeams,
} from '@/services/production/productionSeeds'
import type {
  MountBeamResult,
} from '@/services/production/loomBeamHelpers'
import { isBeamUnconfirmed, markBeamConfirmed, markBeamUnconfirmed } from '@/services/production/floorLocalCache'
import {
  memoryStore,
} from '@/services/production/floorSync'
import {
  KEY_BEAMS,
  persistKey,
  persistBeamPatch,
  persistBeamUpsert,
  persistBeamDelete,
  loadJson,
  saveJson,
  listPersistedSheetEntries,
} from '@/services/production/floorStore'
import type { ProductionMastersService } from '@/services/productionMastersService'

export const beamsMethods = {
  deleteBeam(this: ProductionMastersService, beamNo: string): BeamMaster[] {
    markBeamConfirmed(beamNo)
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
  },

  getBeams(this: ProductionMastersService): BeamMaster[] {
    const beams = loadJson(KEY_BEAMS, seedBeams).map((b) => normalizeBeam(b))
    return beams
  },

  saveBeams(this: ProductionMastersService, beams: BeamMaster[]) {
    saveJson(KEY_BEAMS, beams.map((b) => normalizeBeam(b)))
  },

  updateBeam(
    this: ProductionMastersService,
    beamNo: string,
    patch: Partial<BeamMaster>,
    opts?: { sheetDate?: string }
  ): BeamMaster[] {
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
        const today = getProductionToday()
        const mountDay = String(next.mountedOn || '').slice(0, 10)
        const lot = beamDailyEntryLot(next)
        // The beam's Sw# belongs to the days it is on the loom — never a day before its mount.
        const days = new Set([String(opts?.sheetDate || today).slice(0, 10), today])
        for (const day of days) {
          if (!mountDay || day >= mountDay) this.updateSheetEntry(day, loomNum, { lot })
        }
      }
    }
    return beams
  },

  addBeam(this: ProductionMastersService, partial: Partial<BeamMaster> & { beamNo: string }): BeamMaster[] {
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
    // Until the server confirms, Add Beam waits on it (flushPendingBeam) — this tab only.
    markBeamUnconfirmed(added.beamNo)
    try {
      memoryStore.set(KEY_BEAMS, JSON.stringify(beams.map((b) => normalizeBeam(b))))
    } catch {
      // ignore
    }
    void (async () => {
      const ok = await persistBeamUpsert(added)
      if (ok) {
        markBeamConfirmed(added.beamNo)
        void persistKey(KEY_BEAMS, this.getBeams())
      } else {
        console.error('[floor] addBeam upsert failed', added.beamNo)
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
  },

  /** Wait until a pending beam is confirmed in DB (or timeout). */
  async flushPendingBeam(this: ProductionMastersService, beamNo: string, timeoutMs = 8000): Promise<boolean> {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (!isBeamUnconfirmed(beamNo)) return true
      const beam = this.getBeams().find((b) => b.beamNo === beamNo)
      if (beam) {
        const ok = await persistBeamUpsert(beam)
        if (ok) {
          markBeamConfirmed(beamNo)
          return true
        }
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    return !isBeamUnconfirmed(beamNo)
  },

  /**
   * Mount beam on loom. Blocked only if another beam is already on that loom.
   * Loom status aap Looms tab se khud change kar sakte ho.
   */
  mountBeam(this: ProductionMastersService, beamNo: string, loomNumber: number, dateStr: string = getProductionToday()): MountBeamResult {
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
  },

  /** Excel Beem Length model — Length / Consumed / Balance from sheet lot rows. */
  buildBeamTrack(this: ProductionMastersService, beamNo: string): BeamTrackResult | null {
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
  },

  /** Quick consumed meters for Track button gate. */
  beamConsumedMeters(this: ProductionMastersService, beamNo: string): number {
    return this.buildBeamTrack(beamNo)?.consumed ?? 0
  },

  /** Beam wapas sizing se store me (FULL) — ab loom pe laga sakte ho. */
  receiveBeamFromSizing(this: ProductionMastersService, beamNo: string): BeamMaster[] {
    return this.updateBeam(beamNo, {
      location: 'STORE',
      usedInLoom: null,
      fillStatus: 'FULL',
      mountedOn: null,
      beamEndedOn: null,
      endedFromLoom: null,
    })
  },

  /** Send beam to sizing (not on loom). */
  sendBeamToSizing(this: ProductionMastersService, beamNo: string, dateStr?: string): BeamMaster[] {
    return this.updateBeam(beamNo, {
      usedInLoom: null,
      location: 'SIZING',
      mountedOn: null,
      fillStatus: 'EMPTY',
      beamEndedOn: dateStr || null,
    })
  },

  unmountBeam(this: ProductionMastersService, beamNo: string, location: 'STORE' | 'SIZING' = 'STORE', dateStr?: string): BeamMaster[] {
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
  },

  /**
   * Declare beam EMPTY: unmount + send to Sizing for rework.
   */
  declareBeamEmpty(this: ProductionMastersService, beamNo: string, dateStr?: string): BeamMaster[] {
    const today = dateStr || getProductionToday()
    return this.updateBeam(beamNo, {
      usedInLoom: null,
      location: 'SIZING',
      fillStatus: 'EMPTY',
      mountedOn: null,
      beamEndedOn: today,
      endedFromLoom: undefined,
    })
  },

  /** Clear "ended today" notes from previous days (keeps EMPTY / mounts as-is). */
  clearExpiredBeamEnds(this: ProductionMastersService, asOfDate: string): BeamMaster[] {
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
  },
}

export type BeamsMethods = typeof beamsMethods
