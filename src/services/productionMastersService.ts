import { LoomCategory, LoomStatus } from '@/types/loom'
import { BeamStockItem, calculateProductionMetrics, DailyLoomProductionEntry } from '@/types/production'
import { INITIAL_34_LOOMS_CONFIG } from '@/constants/looms-init'
import { getExcelBeamStock, getExcelWeftStock } from '@/data/productionData'
import { PRODUCTION_TODAY } from '@/constants/productionCalendar'

const KEY_LOOMS = 'sara_textile_loom_master_v7'
const KEY_BEAMS = 'sara_textile_beam_master_v7'
const KEY_YARN = 'sara_textile_yarn_master_v7'
const KEY_SHEET = 'sara_textile_production_sheet_v7'

export interface LoomMaster {
  loomNumber: number
  name: string
  model: LoomCategory
  category: LoomCategory
  defaultRpm: number
  shed: string
  isActive: boolean
  status: LoomStatus
  defaultPick: number
}

export interface YarnMaster {
  id: string
  yarnType: string
  bags: number
  receivedKg: number
  issuedKg: number
  balanceKg: number
}

export type BeamMaster = BeamStockItem & {
  status: 'IN_STOCK' | 'MOUNTED' | 'EXHAUSTED'
}

function isClient() {
  return typeof window !== 'undefined'
}

function seedLooms(): LoomMaster[] {
  return INITIAL_34_LOOMS_CONFIG.map((l) => ({
    loomNumber: l.loomNumber,
    name: `Loom ${l.loomNumber}`,
    model: l.category,
    category: l.category,
    defaultRpm: l.defaultRpm,
    shed: 'Main Floor',
    isActive: true,
    status: 'RUNNING' as LoomStatus,
    defaultPick: 60,
  }))
}

function seedBeams(): BeamMaster[] {
  return getExcelBeamStock().map((b) => ({
    ...b,
    status: b.usedInLoom ? 'MOUNTED' : 'IN_STOCK',
  }))
}

function seedYarn(): YarnMaster[] {
  const cols = getExcelWeftStock().yarnColumns || []
  return cols.slice(0, 12).map((yarnType, i) => {
    const receivedKg = 800 + i * 40
    const issuedKg = 120 + i * 15
    return {
      id: `yarn-${i + 1}`,
      yarnType,
      bags: Math.max(1, Math.round(receivedKg / 25)),
      receivedKg,
      issuedKg,
      balanceKg: Number((receivedKg - issuedKg).toFixed(1)),
    }
  })
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

  updateLoom(loomNumber: number, patch: Partial<LoomMaster>): LoomMaster[] {
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
    return looms
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
      defaultRpm: partial?.defaultRpm ?? 340,
      shed: partial?.shed || 'Main Floor',
      isActive: partial?.isActive ?? true,
      status: partial?.status || 'RUNNING',
      defaultPick: partial?.defaultPick ?? 60,
    })
    this.saveLooms(looms)
    return looms
  }

  getBeams(): BeamMaster[] {
    return loadJson(KEY_BEAMS, seedBeams)
  }

  saveBeams(beams: BeamMaster[]) {
    saveJson(KEY_BEAMS, beams)
  }

  updateBeam(beamNo: string, patch: Partial<BeamMaster>): BeamMaster[] {
    const beams = this.getBeams().map((b) => {
      if (b.beamNo !== beamNo) return b
      const next = { ...b, ...patch }
      if (patch.usedInLoom !== undefined) {
        next.status = patch.usedInLoom ? 'MOUNTED' : 'IN_STOCK'
      }
      return next
    })
    this.saveBeams(beams)
    return beams
  }

  addBeam(partial: Partial<BeamMaster> & { beamNo: string }): BeamMaster[] {
    const beams = this.getBeams()
    if (beams.some((b) => b.beamNo === partial.beamNo)) {
      throw new Error(`Beam ${partial.beamNo} already exists`)
    }
    beams.push({
      beamNo: partial.beamNo,
      warp: partial.warp || '',
      reedWidth: partial.reedWidth || '',
      ends: partial.ends ?? 0,
      length: partial.length ?? 0,
      loomType: partial.loomType || 'G6200',
      quantity: partial.quantity ?? 1,
      usedInLoom: partial.usedInLoom ?? null,
      status: partial.usedInLoom ? 'MOUNTED' : 'IN_STOCK',
    })
    this.saveBeams(beams)
    return beams
  }

  mountBeam(beamNo: string, loomNumber: number): BeamMaster[] {
    const beams = this.getBeams().map((b) => {
      if (b.usedInLoom === String(loomNumber) && b.beamNo !== beamNo) {
        return { ...b, usedInLoom: null, status: 'IN_STOCK' as const }
      }
      if (b.beamNo === beamNo) {
        return { ...b, usedInLoom: String(loomNumber), status: 'MOUNTED' as const }
      }
      return b
    })
    this.saveBeams(beams)
    return beams
  }

  unmountBeam(beamNo: string): BeamMaster[] {
    return this.updateBeam(beamNo, { usedInLoom: null, status: 'IN_STOCK' })
  }

  getYarn(): YarnMaster[] {
    return loadJson(KEY_YARN, seedYarn)
  }

  saveYarn(yarn: YarnMaster[]) {
    saveJson(KEY_YARN, yarn)
  }

  updateYarn(id: string, patch: Partial<YarnMaster>): YarnMaster[] {
    const yarn = this.getYarn().map((y) => {
      if (y.id !== id) return y
      const next = { ...y, ...patch }
      const received = next.receivedKg ?? 0
      const issued = next.issuedKg ?? 0
      next.balanceKg = Number((received - issued).toFixed(1))
      return next
    })
    this.saveYarn(yarn)
    return yarn
  }

  addYarn(partial?: Partial<YarnMaster>): YarnMaster[] {
    const yarn = this.getYarn()
    const receivedKg = partial?.receivedKg ?? 0
    const issuedKg = partial?.issuedKg ?? 0
    yarn.push({
      id: `yarn-${Date.now()}`,
      yarnType: partial?.yarnType || 'New Yarn',
      bags: partial?.bags ?? 0,
      receivedKg,
      issuedKg,
      balanceKg: Number((receivedKg - issuedKg).toFixed(1)),
    })
    this.saveYarn(yarn)
    return yarn
  }

  private sheetKey(dateStr: string) {
    return `${KEY_SHEET}_${dateStr}`
  }

  private loadSheetDay(dateStr: string): DailyLoomProductionEntry[] | null {
    if (!isClient()) return null
    try {
      const raw = localStorage.getItem(this.sheetKey(dateStr))
      if (raw) return JSON.parse(raw) as DailyLoomProductionEntry[]
    } catch {
      // ignore
    }
    return null
  }

  private saveSheetDay(dateStr: string, entries: DailyLoomProductionEntry[]) {
    saveJson(this.sheetKey(dateStr), entries)
  }

  /** Build sheet rows from masters; preserve meters already entered for the date. */
  buildSheetForDate(dateStr: string = PRODUCTION_TODAY): DailyLoomProductionEntry[] {
    const looms = this.getLooms().filter((l) => l.isActive)
    const beams = this.getBeams()
    const yarn = this.getYarn()
    const existing = this.loadSheetDay(dateStr) || []
    const byLoom = new Map(existing.map((e) => [e.loomNumber, e]))
    const defaultWeft = yarn[0]?.yarnType || ''

    const entries = looms.map((loom) => {
      const prev = byLoom.get(loom.loomNumber)
      const beam = beams.find((b) => b.usedInLoom === String(loom.loomNumber))
      const pick = loom.defaultPick || 60
      const reed = beam?.reedWidth
        ? Number(String(beam.reedWidth).split('/')[0]) || 60
        : 60
      const rpm = loom.defaultRpm
      const shiftA = prev?.shiftAMeters ?? 0
      const shiftB = prev?.shiftBMeters ?? 0
      const status = (prev?.status || loom.status) as LoomStatus
      const runningHours = status === 'BEAM_END' || status === 'STOPPED' ? 0 : 24
      const metrics = calculateProductionMetrics({
        rpm,
        runningHours,
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
        qualityName: prev?.qualityName || loom.name,
        fabricType: prev?.fabricType || '',
        warpYarn: beam?.warp || prev?.warpYarn || '',
        weftYarn: prev?.weftYarn || defaultWeft,
        rpm,
        reed,
        pick,
        widthInch: prev?.widthInch || 66,
        gsm: prev?.gsm || 0,
        rollerHours: 24,
        runningHours,
        runningTheoretical: metrics.theoreticalMeters,
        shiftAMeters: shiftA,
        shiftBMeters: shiftB,
        totalMeters: metrics.totalMeters,
        efficiencyPercentage: metrics.efficiencyPercentage,
        stopLossMeters: metrics.stopLossMeters,
        theoretical24h: metrics.theoreticalMeters,
        efficiency24h: metrics.efficiencyPercentage,
        loss24h: metrics.stopLossMeters,
        status,
        remarks: prev?.remarks || '',
        lot: beam?.beamNo || prev?.lot || '',
      } satisfies DailyLoomProductionEntry
    })

    this.saveSheetDay(dateStr, entries)
    return entries
  }

  updateSheetEntry(
    dateStr: string,
    loomNumber: number,
    patch: Partial<DailyLoomProductionEntry>
  ): DailyLoomProductionEntry[] {
    const entries = this.buildSheetForDate(dateStr).map((e) => {
      if (e.loomNumber !== loomNumber) return e
      const next = { ...e, ...patch }
      const runningHours =
        next.status === 'BEAM_END' || next.status === 'STOPPED' ? 0 : next.runningHours || 24
      const metrics = calculateProductionMetrics({
        rpm: next.rpm,
        runningHours,
        pick: next.pick || 60,
        shiftAMeters: next.shiftAMeters || 0,
        shiftBMeters: next.shiftBMeters || 0,
      })
      return {
        ...next,
        runningHours,
        totalMeters: metrics.totalMeters,
        efficiencyPercentage: metrics.efficiencyPercentage,
        stopLossMeters: metrics.stopLossMeters,
        runningTheoretical: metrics.theoreticalMeters,
        theoretical24h: metrics.theoreticalMeters,
        efficiency24h: metrics.efficiencyPercentage,
        loss24h: metrics.stopLossMeters,
      }
    })
    this.saveSheetDay(dateStr, entries)
    return entries
  }

  startNewDay(dateStr: string): DailyLoomProductionEntry[] {
    const existing = this.loadSheetDay(dateStr)
    if (existing?.some((e) => (e.totalMeters || 0) > 0)) {
      return this.buildSheetForDate(dateStr)
    }
    // wipe meters for new blank day but keep master sync
    if (isClient()) {
      localStorage.removeItem(this.sheetKey(dateStr))
    }
    return this.buildSheetForDate(dateStr)
  }

  getSheetSummary(dateStr: string) {
    const entries = this.buildSheetForDate(dateStr)
    const totalShiftA = entries.reduce((s, e) => s + (e.shiftAMeters || 0), 0)
    const totalShiftB = entries.reduce((s, e) => s + (e.shiftBMeters || 0), 0)
    const grand = entries.reduce((s, e) => s + (e.totalMeters || 0), 0)
    const theo = entries.reduce((s, e) => s + (e.runningTheoretical || 0), 0)
    const running = entries.filter((e) => e.status === 'RUNNING').length
    return {
      date: dateStr,
      totalLooms: entries.length,
      runningLooms: running,
      totalShiftAMeters: totalShiftA,
      totalShiftBMeters: totalShiftB,
      grandTotalMeters: grand,
      totalTheoreticalMeters: theo,
      averageEfficiency: theo > 0 ? (grand / theo) * 100 : 0,
    }
  }
}

export const productionMastersService = new ProductionMastersService()
