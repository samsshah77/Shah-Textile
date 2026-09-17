import { DeliveryChallan, FabricPiece } from '@/types/challan'
import { getExcelChallan } from '@/data/productionData'

const STORAGE_KEY_CHALLANS = 'sara_textile_challans_v3'

function getDefaultChallanFromExcel(): DeliveryChallan {
  const excelChallan = getExcelChallan()
  
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
    items,
  }
}

class ChallanService {
  private inMemoryChallans: DeliveryChallan[] = []

  constructor() {
    this.inMemoryChallans = [getDefaultChallanFromExcel()]
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
