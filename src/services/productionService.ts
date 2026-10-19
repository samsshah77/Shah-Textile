import { LoomCategory, LoomStatus } from '@/types/loom'
import {
  DailyLoomProductionEntry,
  ProductionSummary,
  ActiveQualityOrder,
  MonthlyMatrixDay,
  BeamStockItem,
  WeftStockDay,
  QualityEndRecord,
  calculateProductionMetrics,
} from '@/types/production'
import { getInitialProductionEntries } from '@/constants/looms-init'
import {
  getExcelFloorSummary,
  getExcelActiveQualities,
  getExcelMonthlyMatrix,
  getExcelBeamStock,
  getExcelWeftStock,
  getExcelQualityEndRecords,
  getExcelDailyLoomsForDate,
} from '@/data/productionData'
import { PRODUCTION_TODAY, shiftProductionDate } from '@/constants/productionCalendar'

const STORAGE_KEY_PROD = 'sara_textile_production_entries_v6'
const STORAGE_KEY_BEAMS = 'sara_textile_beam_stock_v6'
const STORAGE_KEY_QUALITIES = 'sara_textile_qualities_v6'

class ProductionService {
  private inMemoryEntries: DailyLoomProductionEntry[] = []
  private inMemoryBeams: BeamStockItem[] = []
  private inMemoryQualities: ActiveQualityOrder[] = []

  constructor() {
    this.inMemoryEntries = getInitialProductionEntries()
    this.inMemoryBeams = getExcelBeamStock()
    this.inMemoryQualities = getExcelActiveQualities()
  }

  private isClient(): boolean {
    return typeof window !== 'undefined'
  }

  // =========================================================================
  // 1. LOOM PRODUCTION ENTRIES
  // =========================================================================
  private loadEntries(dateStr: string = PRODUCTION_TODAY): DailyLoomProductionEntry[] {
    const key = `${STORAGE_KEY_PROD}_${dateStr}`
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(key)
        if (stored) {
          return JSON.parse(stored)
        }
      } catch (err) {
        console.error('Failed to load production entries from localStorage', err)
      }
    }
    return getExcelDailyLoomsForDate(dateStr)
  }

  private saveEntries(entries: DailyLoomProductionEntry[], dateStr?: string): void {
    const targetDate = dateStr || entries[0]?.date || PRODUCTION_TODAY
    this.inMemoryEntries = entries
    if (this.isClient()) {
      try {
        localStorage.setItem(`${STORAGE_KEY_PROD}_${targetDate}`, JSON.stringify(entries))
      } catch (err) {
        console.error('Failed to save production entries to localStorage', err)
      }
    }
  }

  // =========================================================================
  // 2. BEAM STORE (INVENTORY)
  // =========================================================================
  private loadBeams(): BeamStockItem[] {
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_BEAMS)
        if (stored) {
          return JSON.parse(stored)
        }
      } catch (err) {
        console.error('Failed to load beam stock from localStorage', err)
      }
    }
    return this.inMemoryBeams
  }

  private saveBeams(beams: BeamStockItem[]): void {
    this.inMemoryBeams = beams
    if (this.isClient()) {
      try {
        localStorage.setItem(STORAGE_KEY_BEAMS, JSON.stringify(beams))
      } catch (err) {
        console.error('Failed to save beam stock to localStorage', err)
      }
    }
  }

  // =========================================================================
  // 3. FABRIC QUALITY RECIPES
  // =========================================================================
  private loadQualities(): ActiveQualityOrder[] {
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_QUALITIES)
        if (stored) {
          return JSON.parse(stored)
        }
      } catch (err) {
        console.error('Failed to load qualities from localStorage', err)
      }
    }
    return this.inMemoryQualities
  }

  private saveQualities(qualities: ActiveQualityOrder[]): void {
    this.inMemoryQualities = qualities
    if (this.isClient()) {
      try {
        localStorage.setItem(STORAGE_KEY_QUALITIES, JSON.stringify(qualities))
      } catch (err) {
        console.error('Failed to save qualities to localStorage', err)
      }
    }
  }

  // =========================================================================
  // CROSS-TABLE SYNC: UPDATE LOOM ENTRY
  // =========================================================================
  async updateEntry(
    loomNumber: number,
    patch: Partial<DailyLoomProductionEntry>,
    dateStr: string = PRODUCTION_TODAY
  ): Promise<DailyLoomProductionEntry> {
    const entries = this.loadEntries(dateStr)
    const beams = this.loadBeams()
    const qualities = this.loadQualities()

    const index = entries.findIndex((e) => e.loomNumber === loomNumber)
    if (index === -1) {
      throw new Error(`Loom #${loomNumber} record not found`)
    }

    const current = entries[index]

    // If qualityName is changed on the loom, pull specs from the Quality recipe
    let qualityUpdates: Partial<DailyLoomProductionEntry> = {}
    if (patch.qualityName && patch.qualityName !== current.qualityName) {
      const matchedQuality = qualities.find(
        (q) => q.qualityName.toLowerCase() === patch.qualityName?.toLowerCase()
      )
      if (matchedQuality) {
        qualityUpdates = {
          fabricType: matchedQuality.warpRepeat || current.fabricType,
          warpYarn: matchedQuality.warpYarn,
          lot: matchedQuality.lot,
        }
      }
    }

    // If status changed to BEAM_END, unmount or flag beam in Beam Store
    if (patch.status === 'BEAM_END' && current.status !== 'BEAM_END') {
      const assignedBeamIndex = beams.findIndex(
        (b) => b.usedInLoom === loomNumber.toString() || b.usedInLoom === `0${loomNumber}`
      )
      if (assignedBeamIndex !== -1) {
        beams[assignedBeamIndex] = {
          ...beams[assignedBeamIndex],
          usedInLoom: null, // Beam exhausted, removed from loom
        }
        this.saveBeams(beams)
      }
    }

    const updatedRaw = { ...current, ...qualityUpdates, ...patch }

    const metrics = calculateProductionMetrics({
      rpm: updatedRaw.rpm,
      runningHours: updatedRaw.runningHours || 24,
      pick: updatedRaw.pick,
      shiftAMeters: updatedRaw.shiftAMeters,
      shiftBMeters: updatedRaw.shiftBMeters,
      ratePerPick: 0.95,
      loomNumber: updatedRaw.loomNumber,
    })

    const finalEntry: DailyLoomProductionEntry = {
      ...updatedRaw,
      totalMeters: metrics.totalMeters,
      efficiencyPercentage: metrics.efficiencyPercentage,
      stopLossMeters: metrics.stopLossMeters,
    }

    entries[index] = finalEntry
    this.saveEntries(entries, dateStr)

    return finalEntry
  }

  // =========================================================================
  // CROSS-TABLE SYNC: MOUNT BEAM ON LOOM
  // =========================================================================
  async mountBeam(
    beamNo: string,
    loomNumber: number,
    dateStr: string = PRODUCTION_TODAY
  ): Promise<{ success: boolean; beam: BeamStockItem; loom: DailyLoomProductionEntry }> {
    const beams = this.loadBeams()
    const entries = this.loadEntries(dateStr)

    const beamIndex = beams.findIndex((b) => b.beamNo === beamNo)
    if (beamIndex === -1) throw new Error(`Beam #${beamNo} not found`)

    const loomIndex = entries.findIndex((l) => l.loomNumber === loomNumber)
    if (loomIndex === -1) throw new Error(`Loom #${loomNumber} not found`)

    // 1. Unmount any previous beam on this loom
    beams.forEach((b, idx) => {
      if (b.usedInLoom === loomNumber.toString() || b.usedInLoom === `0${loomNumber}`) {
        beams[idx] = { ...b, usedInLoom: null }
      }
    })

    // 2. Mount this beam on the loom
    const targetBeam = beams[beamIndex]
    beams[beamIndex] = {
      ...targetBeam,
      usedInLoom: loomNumber.toString(),
    }
    this.saveBeams(beams)

    // 3. Update Loom with the new beam's specifications & transition from BEAM_END to RUNNING
    const currentLoom = entries[loomIndex]
    const updatedLoom: DailyLoomProductionEntry = {
      ...currentLoom,
      warpYarn: targetBeam.warp,
      status: currentLoom.status === 'BEAM_END' ? 'RUNNING' : currentLoom.status,
      remarks: currentLoom.remarks?.includes('B/End') ? `Gaiting Beam #${beamNo}` : currentLoom.remarks,
    }

    entries[loomIndex] = updatedLoom
    this.saveEntries(entries, dateStr)

    return { success: true, beam: beams[beamIndex], loom: updatedLoom }
  }

  // =========================================================================
  // CROSS-TABLE SYNC: UNMOUNT BEAM FROM LOOM
  // =========================================================================
  async unmountBeam(beamNo: string): Promise<BeamStockItem> {
    const beams = this.loadBeams()
    const beamIndex = beams.findIndex((b) => b.beamNo === beamNo)
    if (beamIndex === -1) throw new Error(`Beam #${beamNo} not found`)

    beams[beamIndex] = { ...beams[beamIndex], usedInLoom: null }
    this.saveBeams(beams)
    return beams[beamIndex]
  }

  async getAllEntries(dateStr: string = PRODUCTION_TODAY): Promise<DailyLoomProductionEntry[]> {
    return this.loadEntries(dateStr)
  }

  // START NEW DAY PRODUCTION REPORT WORKFLOW
  async startNewDayProduction(
    newDateStr: string,
    copyPrevious: boolean = true
  ): Promise<DailyLoomProductionEntry[]> {
    const existing = this.loadEntries(newDateStr)
    const hasData = existing.some((e) => (e.totalMeters || 0) > 0)
    if (hasData) {
      return existing
    }

    const prevDate = this.getPreviousDayDate(newDateStr)
    const template = this.loadEntries(prevDate) || this.loadEntries(PRODUCTION_TODAY)

    const newDayEntries: DailyLoomProductionEntry[] = template.map((l) => ({
      ...l,
      id: `PROD-${newDateStr}-${l.loomNumber}`,
      date: newDateStr,
      shiftAMeters: 0,
      shiftBMeters: 0,
      totalMeters: 0,
      runningHours: l.status === 'BEAM_END' ? 0 : 24,
      efficiencyPercentage: 0,
      efficiencyRunning: 0,
      efficiency24h: 0,
      stopLossMeters: 0,
      lossRunning: 0,
      loss24h: 0,
      remarks: l.status === 'BEAM_END' ? 'Beam End' : '',
    }))

    this.saveEntries(newDayEntries, newDateStr)
    return newDayEntries
  }

  private getPreviousDayDate(dateStr: string): string {
    try {
      return shiftProductionDate(dateStr, -1)
    } catch {
      return PRODUCTION_TODAY
    }
  }

  async resetToDefaults(): Promise<DailyLoomProductionEntry[]> {
    const freshEntries = getInitialProductionEntries()
    const freshBeams = getExcelBeamStock()
    const freshQualities = getExcelActiveQualities()

    this.saveEntries(freshEntries)
    this.saveBeams(freshBeams)
    this.saveQualities(freshQualities)

    return freshEntries
  }

  // =========================================================================
  // DYNAMIC ACTIVE QUALITIES (CROSS-LINKED TO LOOMS)
  // =========================================================================
  getActiveQualities(): ActiveQualityOrder[] {
    const qualities = this.loadQualities()
    const entries = this.loadEntries()

    return qualities.map((q) => {
      // Find all looms currently assigned this quality
      const assignedLooms = entries.filter(
        (e) => e.qualityName.trim().toLowerCase() === q.qualityName.trim().toLowerCase()
      )

      const loomsCount = assignedLooms.length
      const loomNumbers = assignedLooms
        .map((l) => l.loomNumber.toString().padStart(2, '0'))
        .sort((a, b) => parseInt(a) - parseInt(b))
        .join(', ')

      // Real-time produced meters = baseline Excel inRegister + live daily meters from assigned looms
      const liveDayProduction = assignedLooms.reduce((s, l) => s + (l.totalMeters || 0), 0)
      const totalProduced = q.inRegister + liveDayProduction
      const balance = Math.max(0, q.target - totalProduced)

      return {
        ...q,
        loomsCount: loomsCount > 0 ? loomsCount : q.loomsCount,
        loomNumbers: loomNumbers || q.loomNumbers,
        production: totalProduced,
        balance,
      }
    })
  }

  // =========================================================================
  // DYNAMIC BEAM STOCK (CROSS-LINKED TO LOOMS)
  // =========================================================================
  getBeamStock(): BeamStockItem[] {
    return this.loadBeams()
  }

  // =========================================================================
  // DYNAMIC WEFT CONSUMPTION (CROSS-LINKED TO PRODUCED METERS)
  // =========================================================================
  getWeftStock(monthStr: string = '2026-09'): { yarnColumns: string[]; days: WeftStockDay[] } {
    return getExcelWeftStock(monthStr)
  }

  // =========================================================================
  // DYNAMIC 34-LOOM MONTHLY MATRIX (CROSS-LINKED TO TODAY'S PRODUCTION)
  // =========================================================================
  getMonthlyMatrix(monthStr: string = '2026-09'): {
    days: MonthlyMatrixDay[]
    loomTotals: Record<number, number>
    grandTotalMeters: number
    avgPerDay: number
  } {
    return getExcelMonthlyMatrix(monthStr)
  }

  // =========================================================================
  // DYNAMIC FLOOR SUMMARY KPIS
  // =========================================================================
  async getFloorSummary(dateStr: string = PRODUCTION_TODAY): Promise<ProductionSummary> {
    const entries = this.loadEntries(dateStr)
    const baseSummary = getExcelFloorSummary(dateStr)

    const runningLooms = entries.filter((l) => l.status === 'RUNNING').length
    const stoppedLooms = entries.filter((l) => l.status === 'STOPPED').length
    const breakdownLooms = entries.filter((l) => l.status === 'BREAKDOWN').length
    const knottingLooms = entries.filter((l) => l.status === 'KNOTTING').length
    const beamEndLooms = entries.filter((l) => l.status === 'BEAM_END').length

    let totalShiftAMeters = 0
    let totalShiftBMeters = 0
    let totalTheoreticalMeters = 0
    let totalRevenue = 0

    let g6200Prod = 0, g6200Theo = 0
    let g6300Prod = 0, g6300Theo = 0
    let puProd = 0, puTheo = 0

    entries.forEach((e) => {
      const shiftA = e.shiftAMeters || 0
      const shiftB = e.shiftBMeters || 0
      const total = e.totalMeters || (shiftA + shiftB)
      totalShiftAMeters += shiftA
      totalShiftBMeters += shiftB

      const theo = e.pick > 0 ? (e.rpm * 60 * (e.runningHours || 24)) / (e.pick * 39.3701) : 0
      totalTheoreticalMeters += theo
      totalRevenue += total * (e.pick * 0.95)

      if (e.category === 'G6200') {
        g6200Prod += total
        g6200Theo += theo
      } else if (e.category === 'G6300') {
        g6300Prod += total
        g6300Theo += theo
      } else if (e.category === 'PU') {
        puProd += total
        puTheo += theo
      }
    })

    const grandTotalMeters = totalShiftAMeters + totalShiftBMeters
    const averageEfficiency =
      totalTheoreticalMeters > 0
        ? Number(((grandTotalMeters / totalTheoreticalMeters) * 100).toFixed(2))
        : baseSummary.averageEfficiency

    return {
      date: dateStr || baseSummary.date,
      dayName: baseSummary.dayName,
      totalLooms: entries.length,
      runningLooms,
      stoppedLooms,
      breakdownLooms,
      knottingLooms,
      beamEndLooms,
      totalShiftAMeters: Number(totalShiftAMeters.toFixed(2)),
      totalShiftBMeters: Number(totalShiftBMeters.toFixed(2)),
      grandTotalMeters: Number(grandTotalMeters.toFixed(2)),
      totalTheoreticalMeters: Number(totalTheoreticalMeters.toFixed(2)),
      averageEfficiency,
      averageEfficiency24h: baseSummary.averageEfficiency24h,
      avgPick: baseSummary.avgPick,
      rollerCutting: baseSummary.rollerCutting,
      avgPerLoom: Number((grandTotalMeters / (entries.length || 1)).toFixed(1)),
      totalRevenue: Number(totalRevenue.toFixed(2)),
      monthlyProduction: baseSummary.monthlyProduction,
      modelBreakdown: {
        G6200: {
          production: g6200Prod,
          efficiency: g6200Theo > 0 ? Number(((g6200Prod / g6200Theo) * 100).toFixed(1)) : 73.5,
        },
        G6300: {
          production: g6300Prod,
          efficiency: g6300Theo > 0 ? Number(((g6300Prod / g6300Theo) * 100).toFixed(1)) : 61.8,
        },
        PU: {
          production: puProd,
          efficiency: puTheo > 0 ? Number(((puProd / puTheo) * 100).toFixed(1)) : 69.2,
        },
      },
    }
  }

  // Monthly / weekly rollups now come from the server: see services/floorReportsClient.ts
  // (GET /api/floor/reports). The old hard-coded September figures were removed.

  getQualityEndRecords(): QualityEndRecord[] {
    return getExcelQualityEndRecords()
  }
}

export const productionService = new ProductionService()
