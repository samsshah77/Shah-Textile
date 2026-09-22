import { LoomCategory, LoomStatus } from '@/types/loom'
import { calculateProductionMetrics, DailyLoomProductionEntry } from '@/types/production'
import { INITIAL_34_LOOMS_CONFIG } from '@/constants/looms-init'
import { getExcelBeamStock, getExcelWeftStock } from '@/data/productionData'
import { PRODUCTION_TODAY } from '@/constants/productionCalendar'

/** 1 kg = 2.2046 lbs → kg = lbs / 2.2046 */
export const LBS_PER_KG = 2.2046

const KEY_LOOMS = 'sara_textile_loom_master_v8'
const KEY_BEAMS = 'sara_textile_beam_master_v8'
const KEY_YARN = 'sara_textile_yarn_master_v8'
const KEY_QUALITY = 'sara_textile_quality_master_v8'
const KEY_SHEET = 'sara_textile_production_sheet_v8'

export interface LoomMaster {
  loomNumber: number
  name: string
  model: LoomCategory
  category: LoomCategory
  year: number
  pictureDataUrl: string
  defaultRpm: number
  shed: string
  isActive: boolean
  status: LoomStatus
  qualityId: string | null
  weftYarnId: string | null
}

export interface BeamMaster {
  beamNo: string
  warp: string
  reed: number
  width: number
  totalThreads: number
  length: number
  loomType: string
  fillStatus: 'EMPTY' | 'FULL'
  usedInLoom: string | null
  status: 'EMPTY' | 'FULL' | 'MOUNTED'
  /** YYYY-MM-DD when beam ended today — cleared automatically on next day */
  beamEndedOn: string | null
  /** Loom it ended on (for Beam table note) */
  endedFromLoom: string | null
}

export interface YarnMaster {
  id: string
  yarnType: string
  bags: number
  receivedKg: number
  issuedKg: number
  balanceKg: number
  receivedLbs: number
  issuedLbs: number
  balanceLbs: number
}

export interface QualityMaster {
  id: string
  name: string
  fabricType: string
  warpYarn: string
  weftYarn: string
  reed: number
  pick: number
  widthInch: number
  gsm: number
}

export function kgToLbs(kg: number) {
  return Number((kg * LBS_PER_KG).toFixed(2))
}

export function lbsToKg(lbs: number) {
  return Number((lbs / LBS_PER_KG).toFixed(2))
}

export function calcTotalThreads(reed: number, width: number) {
  return Math.round((reed || 0) * (width || 0))
}

function isClient() {
  return typeof window !== 'undefined'
}

function withYarnWeights(partial: Partial<YarnMaster> & { yarnType: string; id: string }): YarnMaster {
  const receivedKg = partial.receivedKg ?? (partial.receivedLbs != null ? lbsToKg(partial.receivedLbs) : 0)
  const issuedKg = partial.issuedKg ?? (partial.issuedLbs != null ? lbsToKg(partial.issuedLbs) : 0)
  const balanceKg = Number((receivedKg - issuedKg).toFixed(2))
  return {
    id: partial.id,
    yarnType: partial.yarnType,
    bags: partial.bags ?? 0,
    receivedKg,
    issuedKg,
    balanceKg,
    receivedLbs: kgToLbs(receivedKg),
    issuedLbs: kgToLbs(issuedKg),
    balanceLbs: kgToLbs(balanceKg),
  }
}

function normalizeLoomRef(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null
  return String(value)
}

function beamOnLoom(beam: BeamMaster, loomNumber: number) {
  return normalizeLoomRef(beam.usedInLoom) === String(loomNumber)
}

function normalizeBeam(b: Partial<BeamMaster> & { beamNo: string }): BeamMaster {
  const reed = b.reed ?? 0
  const width = b.width ?? 0
  const usedInLoom = normalizeLoomRef(b.usedInLoom as string | number | null | undefined)
  const fillStatus = b.fillStatus || (usedInLoom ? 'FULL' : b.status === 'EMPTY' ? 'EMPTY' : 'FULL')
  const status: BeamMaster['status'] = usedInLoom ? 'MOUNTED' : fillStatus
  return {
    beamNo: b.beamNo,
    warp: b.warp || '',
    reed,
    width,
    totalThreads: calcTotalThreads(reed, width),
    length: b.length ?? 0,
    loomType: b.loomType || 'G6200',
    fillStatus,
    usedInLoom,
    status,
    beamEndedOn: b.beamEndedOn ?? null,
    endedFromLoom: normalizeLoomRef(b.endedFromLoom as string | number | null | undefined),
  }
}

function seedLooms(): LoomMaster[] {
  return INITIAL_34_LOOMS_CONFIG.map((l) => ({
    loomNumber: l.loomNumber,
    name: `Loom ${l.loomNumber}`,
    model: l.category,
    category: l.category,
    year: 2018 + (l.loomNumber % 6),
    pictureDataUrl: '',
    defaultRpm: l.defaultRpm,
    shed: 'Main Floor',
    isActive: true,
    status: 'RUNNING' as LoomStatus,
    qualityId: null,
    weftYarnId: null,
  }))
}

function seedBeams(): BeamMaster[] {
  return getExcelBeamStock().map((b) => {
    const parts = String(b.reedWidth || '').split(/[xX/]/)
    const reed = Number(parts[0]) || 60
    const width = Number(parts[1]) || 66
    return normalizeBeam({
      beamNo: b.beamNo,
      warp: b.warp,
      reed,
      width,
      length: b.length,
      loomType: b.loomType,
      fillStatus: b.usedInLoom ? 'FULL' : 'FULL',
      usedInLoom: b.usedInLoom,
    })
  })
}

function seedYarn(): YarnMaster[] {
  const cols = getExcelWeftStock().yarnColumns || []
  return cols.slice(0, 12).map((yarnType, i) => {
    const receivedKg = 800 + i * 40
    const issuedKg = 120 + i * 15
    return withYarnWeights({
      id: `yarn-${i + 1}`,
      yarnType,
      bags: Math.max(1, Math.round(receivedKg / 25)),
      receivedKg,
      issuedKg,
    })
  })
}

function seedQualities(): QualityMaster[] {
  return [
    {
      id: 'q-everest',
      name: 'Everest',
      fabricType: 'Suiting',
      warpYarn: '20/1 Pv China',
      weftYarn: '20/1 Pv China',
      reed: 120,
      pick: 60,
      widthInch: 66,
      gsm: 1.77,
    },
    {
      id: 'q-parcopv',
      name: 'PARCOPV',
      fabricType: 'Suiting',
      warpYarn: '20/1-Pv-China',
      weftYarn: '20/1-Pv-China',
      reed: 120,
      pick: 60,
      widthInch: 66,
      gsm: 1.77,
    },
    {
      id: 'q-silver',
      name: 'SILVER-SHINE',
      fabricType: 'Gabardine',
      warpYarn: '45/1-Pv-China',
      weftYarn: '45/1-Pv-China',
      reed: 120,
      pick: 95,
      widthInch: 66,
      gsm: 1.26,
    },
  ]
}

function loadJson<T>(key: string, fallback: () => T): T {
  if (isClient()) {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw) as T
    } catch {
      // ignore
    }
  }
  return fallback()
}

function saveJson<T>(key: string, value: T) {
  if (!isClient()) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

class ProductionMastersService {
  getLooms(): LoomMaster[] {
    return loadJson(KEY_LOOMS, seedLooms)
  }

  saveLooms(looms: LoomMaster[]) {
    saveJson(KEY_LOOMS, looms)
  }

  updateLoom(
    loomNumber: number,
    patch: Partial<LoomMaster>,
    dateStr: string = PRODUCTION_TODAY
  ): LoomMaster[] {
    const looms = this.getLooms().map((l) =>
      l.loomNumber === loomNumber
        ? {
            ...l,
            ...patch,
            category: (patch.model || patch.category || l.category) as LoomCategory,
            model: (patch.model || patch.category || l.model) as LoomCategory,
          }
        : l
    )
    this.saveLooms(looms)

    // Status is controlled only from Loom table → Beam table only shows "Ended today"
    if (patch.status === 'BEAM_END') {
      this.flagBeamEndFromLoom(loomNumber, dateStr)
      this.updateSheetEntry(dateStr, loomNumber, {
        status: 'BEAM_END',
        remarks: 'Beam End',
        rollerHours: 0,
      })
    }

    return looms
  }

  /** Unmount beam on this loom and flag it for Beam table display (does not set loom status). */
  private flagBeamEndFromLoom(loomNumber: number, dateStr: string): void {
    const beam = this.getBeams().find((b) => beamOnLoom(b, loomNumber))
    if (!beam) return
    const beams = this.getBeams().map((b) => {
      if (b.beamNo !== beam.beamNo) return b
      return normalizeBeam({
        ...b,
        usedInLoom: null,
        beamEndedOn: dateStr,
        endedFromLoom: String(loomNumber),
      })
    })
    this.saveBeams(beams)
  }

  /**
   * If any loom is already Beam End but a beam is still mounted on it
   * (legacy data / missed sync), unmount + show Ended today on Beam table.
   */
  reconcileBeamEndsWithLooms(dateStr: string): BeamMaster[] {
    const looms = this.getLooms().filter((l) => l.status === 'BEAM_END')
    if (looms.length === 0) return this.getBeams()
    let changed = false
    const beams = this.getBeams().map((b) => {
      const loom = looms.find((l) => beamOnLoom(b, l.loomNumber))
      if (!loom) return b
      changed = true
      return normalizeBeam({
        ...b,
        usedInLoom: null,
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
    looms.push({
      loomNumber: nextNum,
      name: partial?.name || `Loom ${nextNum}`,
      model,
      category: model,
      year: partial?.year ?? new Date().getFullYear(),
      pictureDataUrl: partial?.pictureDataUrl || '',
      defaultRpm: partial?.defaultRpm ?? 340,
      shed: partial?.shed || 'Main Floor',
      isActive: partial?.isActive ?? true,
      status: partial?.status || 'RUNNING',
      qualityId: partial?.qualityId ?? null,
      weftYarnId: partial?.weftYarnId ?? null,
    })
    this.saveLooms(looms)
    return looms
  }

  getBeams(): BeamMaster[] {
    return loadJson(KEY_BEAMS, seedBeams).map((b) => normalizeBeam(b))
  }

  saveBeams(beams: BeamMaster[]) {
    saveJson(KEY_BEAMS, beams.map((b) => normalizeBeam(b)))
  }

  updateBeam(beamNo: string, patch: Partial<BeamMaster>): BeamMaster[] {
    const beams = this.getBeams().map((b) => {
      if (b.beamNo !== beamNo) return b
      return normalizeBeam({ ...b, ...patch, beamNo })
    })
    this.saveBeams(beams)
    return beams
  }

  addBeam(partial: Partial<BeamMaster> & { beamNo: string }): BeamMaster[] {
    const beams = this.getBeams()
    if (beams.some((b) => b.beamNo === partial.beamNo)) {
      throw new Error(`Beam ${partial.beamNo} already exists`)
    }
    beams.push(
      normalizeBeam({
        beamNo: partial.beamNo,
        warp: partial.warp || '',
        reed: partial.reed ?? 60,
        width: partial.width ?? 66,
        length: partial.length ?? 0,
        loomType: partial.loomType || 'G6200',
        fillStatus: partial.fillStatus || 'FULL',
        usedInLoom: partial.usedInLoom ?? null,
      })
    )
    this.saveBeams(beams)
    return beams
  }

  mountBeam(beamNo: string, loomNumber: number): BeamMaster[] {
    const beams = this.getBeams().map((b) => {
      if (beamOnLoom(b, loomNumber) && b.beamNo !== beamNo) {
        return normalizeBeam({
          ...b,
          usedInLoom: null,
          fillStatus: b.fillStatus || 'FULL',
        })
      }
      if (b.beamNo === beamNo) {
        // Remount mid-life clears the daily end note — loom Status stays loom-table only
        return normalizeBeam({
          ...b,
          usedInLoom: String(loomNumber),
          fillStatus: 'FULL',
          beamEndedOn: null,
          endedFromLoom: null,
        })
      }
      return b
    })
    this.saveBeams(beams)
    return beams
  }

  unmountBeam(beamNo: string): BeamMaster[] {
    return this.updateBeam(beamNo, { usedInLoom: null })
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
    yarn.push(
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

  getQualities(): QualityMaster[] {
    return loadJson(KEY_QUALITY, seedQualities)
  }

  saveQualities(qualities: QualityMaster[]) {
    saveJson(KEY_QUALITY, qualities)
  }

  updateQuality(id: string, patch: Partial<QualityMaster>): QualityMaster[] {
    const qualities = this.getQualities().map((q) => (q.id === id ? { ...q, ...patch } : q))
    this.saveQualities(qualities)
    return qualities
  }

  addQuality(partial?: Partial<QualityMaster>): QualityMaster[] {
    const qualities = this.getQualities()
    qualities.push({
      id: `q-${Date.now()}`,
      name: partial?.name || 'New Quality',
      fabricType: partial?.fabricType || 'Suiting',
      warpYarn: partial?.warpYarn || '20/1',
      weftYarn: partial?.weftYarn || '20/1',
      reed: partial?.reed ?? 120,
      pick: partial?.pick ?? 60,
      widthInch: partial?.widthInch ?? 66,
      gsm: partial?.gsm ?? 0,
    })
    this.saveQualities(qualities)
    return qualities
  }

  private sheetKey(dateStr: string) {
    return `${KEY_SHEET}_${dateStr}`
  }

  private loadSheetDay(dateStr: string): DailyLoomProductionEntry[] {
    return loadJson(this.sheetKey(dateStr), () => [] as DailyLoomProductionEntry[])
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
   */
  buildSheetForDate(dateStr: string = PRODUCTION_TODAY): DailyLoomProductionEntry[] {
    const looms = this.getLooms().filter((l) => l.isActive)
    const beams = this.getBeams()
    const yarns = this.getYarn()
    const qualities = this.getQualities()
    const prevByLoom = new Map(this.loadSheetDay(dateStr).map((e) => [e.loomNumber, e]))

    const entries = looms.map((loom) => {
      const prev = prevByLoom.get(loom.loomNumber)
      const beam = beams.find((b) => beamOnLoom(b, loom.loomNumber))
      const quality = qualities.find((q) => q.id === loom.qualityId) || null
      const weft = yarns.find((y) => y.id === loom.weftYarnId)
      const pick = quality?.pick || 60
      const reed = beam?.reed || quality?.reed || 60
      const rpm = loom.defaultRpm
      const status = loom.status as LoomStatus

      const rollerHours =
        prev?.rollerHours != null
          ? prev.rollerHours
          : status === 'BEAM_END' || status === 'STOPPED'
            ? 0
            : 24
      const shiftA = prev?.shiftAMeters ?? 0
      const shiftB = prev?.shiftBMeters ?? 0

      const metrics = calculateProductionMetrics({
        rpm,
        runningHours: rollerHours,
        pick,
        shiftAMeters: shiftA,
        shiftBMeters: shiftB,
      })

      return {
        id: `PROD-${dateStr}-${loom.loomNumber}`,
        date: dateStr,
        loomNumber: loom.loomNumber,
        category: loom.category,
        model: loom.model,
        qualityName: quality?.name || '—',
        fabricType: quality?.fabricType || '',
        warpYarn: beam?.warp || quality?.warpYarn || '',
        weftYarn: weft?.yarnType || quality?.weftYarn || '',
        rpm,
        reed,
        pick,
        widthInch: beam?.width || quality?.widthInch || 66,
        gsm: quality?.gsm ?? prev?.gsm ?? 0,
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
        remarks: prev?.remarks ?? '',
        lot: prev?.lot || beam?.beamNo || '',
      } satisfies DailyLoomProductionEntry
    })

    saveJson(this.sheetKey(dateStr), entries)
    return entries
  }

  updateSheetEntry(
    dateStr: string,
    loomNumber: number,
    patch: Partial<DailyLoomProductionEntry>
  ): DailyLoomProductionEntry[] {
    const current = this.buildSheetForDate(dateStr)
    const next = current.map((e) => {
      if (e.loomNumber !== loomNumber) return e
      const merged = { ...e, ...patch }
      const rollerHours = merged.rollerHours ?? merged.runningHours ?? 0
      const metrics = calculateProductionMetrics({
        rpm: merged.rpm,
        runningHours: rollerHours,
        pick: merged.pick || 60,
        shiftAMeters: merged.shiftAMeters || 0,
        shiftBMeters: merged.shiftBMeters || 0,
      })
      return {
        ...merged,
        rollerHours,
        runningHours: rollerHours,
        runningTheoretical: metrics.theoreticalMeters,
        totalMeters: metrics.totalMeters,
        efficiencyPercentage: metrics.efficiencyPercentage,
        stopLossMeters: metrics.stopLossMeters,
        theoretical24h: metrics.theoretical24h,
        efficiency24h: metrics.efficiency24h,
        loss24h: metrics.loss24h,
      }
    })
    saveJson(this.sheetKey(dateStr), next)
    return next
  }

  startNewDay(dateStr: string): DailyLoomProductionEntry[] {
    // Clear yesterday's "beam ended today" notes; blank Actual A/B for new day
    this.clearExpiredBeamEnds(dateStr)
    if (isClient()) {
      try {
        localStorage.removeItem(this.sheetKey(dateStr))
      } catch {
        // ignore
      }
    }
    return this.buildSheetForDate(dateStr)
  }
}

export const productionMastersService = new ProductionMastersService()
