/** Yarn stock: every change is a server action (stock = movements). (Part of productionMastersService — no behaviour change.) */
import {
  PRODUCTION_TODAY,
  getProductionToday,
} from '@/constants/productionCalendar'
import {
  isClient,
  withYarnWeights,
  lbsToKg,
  kgToLbs,
} from '@/services/production/loomBeamHelpers'
import type {
  YarnMaster,
  YarnLoomIssuance,
  YarnMovementRecord,
} from '@/services/production/masterTypes'
import {
  seedYarn,
  seedYarnIssuances,
  seedYarnMovements,
} from '@/services/production/productionSeeds'
import {
  memoryStore,
  notifyFloorSaveProblem,
  setListFromServer,
  enqueue,
  announceReload,
  post as floorPost,
} from '@/services/production/floorSync'
import {
  KEY_YARN,
  KEY_YARN_ISSUANCE,
  KEY_YARN_MOVEMENTS,
  loadJson,
  refreshFloorMastersFromDb,
} from '@/services/production/floorStore'
import type { ProductionMastersService } from '@/services/productionMastersService'

export const yarnMethods = {
  getYarn(this: ProductionMastersService): YarnMaster[] {
    return loadJson(KEY_YARN, seedYarn).map((y) => withYarnWeights(y))
  },

  /** Memory only — yarn is saved by the yarn actions; the server works out the stock. */
  saveYarn(this: ProductionMastersService, yarn: YarnMaster[]) {
    memoryStore.set(KEY_YARN, JSON.stringify(yarn.map((y) => withYarnWeights(y))))
  },

  /**
   * Send one yarn action; the server records the movement, recomputes the stock and
   * returns fresh yarn / movements / issuances, which replace the browser copy.
   */
  yarnServerAction(this: ProductionMastersService, body: Record<string, unknown>): void {
    if (!isClient()) return
    void enqueue('floor:yarn', async () => {
      const { status, data } = await floorPost(body)
      if (status === 200 && data?.ok && data.yarnState) {
        const st = data.yarnState as { yarn: unknown; movements: unknown; issuances: unknown }
        setListFromServer(KEY_YARN, st.yarn, undefined, { force: true })
        setListFromServer(KEY_YARN_MOVEMENTS, st.movements, undefined, { force: true })
        setListFromServer(KEY_YARN_ISSUANCE, st.issuances, undefined, { force: true })
      } else {
        notifyFloorSaveProblem(status === 0 || status >= 500 ? 409 : status, data || { error: 'Yarn save nahi hua — server se raabta nahi.' })
        await refreshFloorMastersFromDb()
      }
      announceReload('yarn')
    })
  },

  updateYarn(this: ProductionMastersService, id: string, patch: Partial<YarnMaster>): YarnMaster[] {
    const before = this.getYarn().find((y) => y.id === id)
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
    const after = yarn.find((y) => y.id === id)
    if (before && after) {
      if (patch.yarnType != null && after.yarnType.trim() && after.yarnType !== before.yarnType) {
        this.yarnServerAction({ action: 'yarnRename', yarnId: id, yarnType: after.yarnType })
      }
      const totals: Record<string, number> = {}
      if ((patch.receivedKg != null || patch.receivedLbs != null) && after.receivedKg !== before.receivedKg) totals.receivedKg = after.receivedKg
      if ((patch.issuedKg != null || patch.issuedLbs != null) && after.issuedKg !== before.issuedKg) totals.issuedKg = after.issuedKg
      if (patch.bags != null && after.bags !== before.bags) totals.bags = Math.max(0, Math.round(after.bags))
      // A typed total is saved as a correction movement of the difference.
      if (Object.keys(totals).length) {
        this.yarnServerAction({ action: 'yarnCorrect', yarnId: id, date: getProductionToday(), ...totals })
      }
    }
    return yarn
  },

  addYarn(this: ProductionMastersService, partial?: Partial<YarnMaster>): YarnMaster[] {
    const yarn = this.getYarn()
    const added = withYarnWeights({
      id: `yarn-${Date.now()}`,
      yarnType: partial?.yarnType || 'New Yarn',
      bags: partial?.bags ?? 0,
      receivedKg: partial?.receivedKg ?? 0,
      issuedKg: 0,
    })
    yarn.unshift(added)
    this.saveYarn(yarn)
    this.yarnServerAction({
      action: 'yarnAdd',
      yarnType: added.yarnType,
      bags: Math.max(0, Math.round(added.bags || 0)),
      receivedKg: Math.max(0, added.receivedKg || 0),
      date: getProductionToday(),
    })
    return yarn
  },

  deleteYarn(this: ProductionMastersService, id: string): YarnMaster[] {
    const yarn = this.getYarn().filter((y) => y.id !== id)
    this.saveYarn(yarn)
    this.yarnServerAction({ action: 'yarnDelete', yarnId: id })
    return yarn
  },

  getYarnIssuances(this: ProductionMastersService, yarnId?: string): YarnLoomIssuance[] {
    const list = loadJson(KEY_YARN_ISSUANCE, seedYarnIssuances)
    if (yarnId) {
      return list.filter((i) => i.yarnId === yarnId)
    }
    return list
  },

  /** Memory only (see saveYarn). */
  saveYarnIssuances(this: ProductionMastersService, list: YarnLoomIssuance[]) {
    memoryStore.set(KEY_YARN_ISSUANCE, JSON.stringify(list))
  },

  issueYarnToLoom(this: ProductionMastersService, params: {
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

    // Show it at once; the server's answer replaces these numbers.
    const updatedIssued = Number(((targetYarn.issuedKg || 0) + issuedKg).toFixed(2))
    this.saveYarn(yarns.map((y) => (y.id === yarnId ? withYarnWeights({ ...y, issuedKg: updatedIssued }) : y)))

    const issuances = this.getYarnIssuances()
    const now = new Date().toISOString()
    issuances.unshift({
      id: `iss-${Date.now()}`,
      yarnId,
      yarnType: targetYarn.yarnType,
      loomNumber,
      issuedKg,
      pick,
      date: dateStr,
      createdAt: now,
    })
    this.saveYarnIssuances(issuances)

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
      createdAt: now,
    })
    this.saveYarnMovements(movements)

    this.yarnServerAction({ action: 'yarnIssue', yarnId, loomNumber, issuedKg, pick: Math.max(0, Math.round(pick || 0)), date: dateStr })
    this.updateLoom(loomNumber, { weftYarnId: yarnId }, dateStr)

    return {
      yarn: this.getYarn(),
      issuances,
    }
  },

  getYarnMovements(this: ProductionMastersService, yarnId?: string): YarnMovementRecord[] {
    const list = loadJson(KEY_YARN_MOVEMENTS, seedYarnMovements)
    if (yarnId) {
      return list.filter((i) => i.yarnId === yarnId)
    }
    return list
  },

  /** Memory only (see saveYarn). */
  saveYarnMovements(this: ProductionMastersService, list: YarnMovementRecord[]) {
    memoryStore.set(KEY_YARN_MOVEMENTS, JSON.stringify(list))
  },

  recordYarnInward(this: ProductionMastersService, params: {
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

    // Show it at once; the server's answer replaces these numbers.
    if (target) {
      const t = target
      this.saveYarn(
        yarns.map((y) =>
          y.id === t.id
            ? withYarnWeights({ ...y, receivedKg: Number(((y.receivedKg || 0) + weightKg).toFixed(2)), bags: (y.bags || 0) + bags })
            : y
        )
      )
    } else {
      const newYarn = withYarnWeights({
        id: `yarn-${Date.now()}`,
        yarnType,
        bags,
        receivedKg: weightKg,
        issuedKg: 0,
      })
      this.saveYarn([...yarns, newYarn])
      target = newYarn
    }

    const movements = this.getYarnMovements()
    movements.unshift({
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
    })
    this.saveYarnMovements(movements)

    this.yarnServerAction({
      action: 'yarnInward',
      // A yarn only known to this browser (just added) is matched by name on the server.
      yarnId: params.yarnId || (yarns.some((y) => y.id === target.id) ? target.id : null),
      yarnType: target.yarnType,
      bags: Math.max(0, Math.round(bags || 0)),
      weightKg,
      date: dateStr,
      lotOrSupplier: lotOrSupplier || null,
    })

    return {
      yarn: this.getYarn(),
      movements,
    }
  },
}

export type YarnMethods = typeof yarnMethods
