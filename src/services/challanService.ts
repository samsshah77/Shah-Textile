import { DeliveryChallan, FabricPiece, ChalanFoiItem } from '@/types/challan'
import { getExcelChallan } from '@/data/productionData'
import { DailyLoomProductionEntry } from '@/types/production'

const STORAGE_KEY_CHALLANS = 'sara_textile_challans_v3'
const STORAGE_KEY_CHALAN_FOI = 'sara_textile_chalan_foi_items_v2'

function getDefaultChalanFoiItems(): ChalanFoiItem[] {
  const excelChallan = getExcelChallan()
  if (!excelChallan || !excelChallan.items) return []

  return excelChallan.items.map((it: any, index: number) => {
    const thaan = it.pieces && it.pieces.length > 0 ? it.pieces.length : it.totalMeters > 0 ? 1 : 0
    const pieceWeight = (it.pieces || []).reduce((s: number, p: any) => s + (p.weightKg || 0), 0)
    const totalKg = pieceWeight > 0 ? pieceWeight : Number(((it.totalMeters || 0) * 0.25).toFixed(1))

    return {
      id: `FOI-${index + 1}`,
      sNo: index + 1,
      name: it.qualityName || 'Plain Weave',
      type: it.fabricType || 'Suiting',
      beam: it.beamNo || `G-${100 + (it.loomNumber || index + 1)}`,
      swlNo: it.lot && it.lot !== '0' ? `${it.lot} (L#${it.loomNumber || index + 1})` : `Loom #${it.loomNumber || index + 1}`,
      loomNumber: it.loomNumber || index + 1,
      thaan,
      totalMeters: it.totalMeters || 0,
      totalKg: Number(totalKg.toFixed(1)),
      gsm: it.gsm || 1.77,
      remarks: it.totalMeters === 0 ? 'Nil Production' : '',
    }
  })
}

function getDefaultChallanFromExcel(): DeliveryChallan {
  const excelChallan = getExcelChallan()
  const foiItems = getDefaultChalanFoiItems()

  // Transform items
  const items = excelChallan.items.map((it: any) => {
    const pieces: FabricPiece[] = (it.pieces || []).map((p: any) => ({
      pieceNumber: p.pieceNo,
      meters: p.meters,
      weightKg: p.weightKg,
    }))

    const totalWeightKg = pieces.reduce((s, p) => s + p.weightKg, 0)

    return {
      loomNumbers: it.loomNumber ? [it.loomNumber] : [],
      qualityName: it.qualityName,
      fabricType: it.fabricType,
      beamNumber: it.beamNo,
      lotNumber: it.lot || '0',
      pieces,
      totalMeters: it.totalMeters,
      totalWeightKg: Number(totalWeightKg.toFixed(1)),
    }
  })

  return {
    challanNumber: '001414',
    date: excelChallan.date || '2026-09-09',
    buyerName: 'Direct Processing Dispatch (Gate Pass)',
    destination: 'CLIENT',
    foiItems,
    items,
  }
}

class ChallanService {
  private inMemoryChallans: DeliveryChallan[] = []
  private inMemoryFoiItems: ChalanFoiItem[] = []

  constructor() {
    this.inMemoryChallans = [getDefaultChallanFromExcel()]
    this.inMemoryFoiItems = getDefaultChalanFoiItems()
  }

  private isClient(): boolean {
    return typeof window !== 'undefined'
  }

  private loadChallans(): DeliveryChallan[] {
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_CHALLANS)
        if (stored) {
          return JSON.parse(stored)
        }
      } catch (err) {
        console.error('Failed to load challans from localStorage', err)
      }
    }
    return this.inMemoryChallans
  }

  private saveChallans(challans: DeliveryChallan[]): void {
    this.inMemoryChallans = challans
    if (this.isClient()) {
      try {
        localStorage.setItem(STORAGE_KEY_CHALLANS, JSON.stringify(challans))
      } catch (err) {
        console.error('Failed to save challans to localStorage', err)
      }
    }
  }

  // =========================================================================
  // CHALAN FOI ITEMS (TABLE MANAGEMENT)
  // =========================================================================
  loadChalanFoiItems(): ChalanFoiItem[] {
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_CHALAN_FOI)
        if (stored) {
          return JSON.parse(stored)
        }
      } catch (err) {
        console.error('Failed to load Chalan FOI items from localStorage', err)
      }
    }
    return this.inMemoryFoiItems
  }

  saveChalanFoiItems(items: ChalanFoiItem[]): void {
    this.inMemoryFoiItems = items
    if (this.isClient()) {
      try {
        localStorage.setItem(STORAGE_KEY_CHALAN_FOI, JSON.stringify(items))
      } catch (err) {
        console.error('Failed to save Chalan FOI items to localStorage', err)
      }
    }
  }

  async getAllChalanFoiItems(): Promise<ChalanFoiItem[]> {
    return this.loadChalanFoiItems()
  }

  async updateChalanFoiItem(id: string, patch: Partial<ChalanFoiItem>): Promise<ChalanFoiItem> {
    const items = this.loadChalanFoiItems()
    const index = items.findIndex((it) => it.id === id)
    if (index === -1) throw new Error(`Chalan FOI item #${id} not found`)

    const updated = { ...items[index], ...patch }
    items[index] = updated
    this.saveChalanFoiItems(items)
    return updated
  }

  async addChalanFoiItem(newItem: Partial<ChalanFoiItem>): Promise<ChalanFoiItem> {
    const items = this.loadChalanFoiItems()
    const nextSNo = items.length + 1
    const created: ChalanFoiItem = {
      id: `FOI-${Date.now()}`,
      sNo: nextSNo,
      name: newItem.name || 'PARCOPV',
      type: newItem.type || 'Suiting',
      beam: newItem.beam || `B-${nextSNo + 100}`,
      swlNo: newItem.swlNo || `Sw # 33${nextSNo % 5}`,
      loomNumber: newItem.loomNumber,
      thaan: newItem.thaan || 1,
      totalMeters: newItem.totalMeters || 120,
      totalKg: newItem.totalKg || 30.5,
      gsm: newItem.gsm || 1.77,
      remarks: newItem.remarks || '',
    }
    items.push(created)
    this.saveChalanFoiItems(items)
    return created
  }

  async removeChalanFoiItem(id: string): Promise<void> {
    const items = this.loadChalanFoiItems()
    const filtered = items.filter((it) => it.id !== id).map((it, idx) => ({ ...it, sNo: idx + 1 }))
    this.saveChalanFoiItems(filtered)
  }

  // Proper wiring / integration: Auto-import from active Loom Daily Production
  async importFromDailyProduction(entries: DailyLoomProductionEntry[]): Promise<ChalanFoiItem[]> {
    const activeEntries = entries.filter((e) => (e.totalMeters || 0) > 0)
    const importedItems: ChalanFoiItem[] = activeEntries.map((e, idx) => {
      const thaan = Math.max(1, Math.round((e.totalMeters || 100) / 100))
      const approxWeight = Number(((e.totalMeters || 0) * (e.gsm || 1.77) * 0.14).toFixed(1))

      return {
        id: `FOI-IMP-${e.loomNumber}-${Date.now()}`,
        sNo: idx + 1,
        name: e.qualityName || 'PARCOPV',
        type: e.fabricType || 'Suiting',
        beam: `G-${100 + e.loomNumber}`,
        swlNo: e.lot || `Sw # 33${e.loomNumber % 5} (L#${e.loomNumber.toString().padStart(2, '0')})`,
        loomNumber: e.loomNumber,
        thaan,
        totalMeters: e.totalMeters || 0,
        totalKg: approxWeight > 0 ? approxWeight : Number(((e.totalMeters || 0) * 0.25).toFixed(1)),
        gsm: e.gsm || 1.77,
        remarks: `Live from Loom #${e.loomNumber}`,
      }
    })

    this.saveChalanFoiItems(importedItems)
    return importedItems
  }

  async getAllChallans(): Promise<DeliveryChallan[]> {
    return this.loadChallans()
  }

  async getChallanById(challanNumber: string): Promise<DeliveryChallan | null> {
    const list = this.loadChallans()
    return list.find((c) => c.challanNumber === challanNumber || c.challanNumber.endsWith(challanNumber)) || null
  }

  async createChallan(challan: DeliveryChallan): Promise<DeliveryChallan> {
    const list = this.loadChallans()
    list.unshift(challan)
    this.saveChallans(list)
    return challan
  }
}

export const challanService = new ChallanService()
