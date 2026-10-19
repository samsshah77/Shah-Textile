/** Workshops ledger: list, add, delete, record a job bill. */
import { InventoryPurchaseEntry, MachineExpenseCategory } from '@/types/expense'
import { accountsData, WorkshopSynopsisItem, DailyInwardItem } from '@/data/accountsData'
import { accountsRead, accountsRemove, accountsWrite } from '@/services/accountsStore'
import { ACCOUNTS_KEYS } from '@/lib/accountsKeys'
import { slugifyPartyName } from '@/services/accounts/expenseSeeds'
import type { WorkshopSummary, RecordWorkshopJobInput } from '@/services/accounts/expenseTypes'
import type { ExpenseService } from '@/services/expenseService'

export const workshopMethods = {
  getDeletedWorkshops(this: ExpenseService): string[] {
    const primary = accountsRead<string[]>(ACCOUNTS_KEYS.DELETED_WORKSHOPS, [])
    const legacy = accountsRead<string[]>('sara_deleted_workshops_v1', [])
    return Array.from(new Set([...primary, ...legacy]))
  },

  saveDeletedWorkshops(this: ExpenseService, list: string[]): void {
    accountsWrite(ACCOUNTS_KEYS.DELETED_WORKSHOPS, list)
    if (this.isClient()) {
      try {
        localStorage.removeItem('sara_deleted_workshops_v1')
      } catch {}
    }
  },

  // --- Workshops & Engineering ---
  getWorkshopsList(this: ExpenseService, monthFilter?: string): WorkshopSummary[] {
    const synList = accountsRead<WorkshopSynopsisItem[]>(
      ACCOUNTS_KEYS.WORKSHOPS_STORE,
      accountsData.workshops.synopsis
    )

    const map = new Map<string, WorkshopSummary>()

    synList.forEach((syn) => {
      const slug = slugifyPartyName(syn.workshopName)
      const storageKey = `${ACCOUNTS_KEYS.WORKSHOP_PREFIX}${slug}`
      const customEntries = accountsRead<InventoryPurchaseEntry[] | null>(storageKey, null)

      let type: WorkshopSummary['type'] = 'Workshop / Engineering'
      const name = syn.workshopName.toLowerCase()
      if (name.includes('lathe') || name.includes('turning')) type = 'Lathe / Turning'
      else if (name.includes('weld')) type = 'Welding'
      else if (name.includes('motor') || name.includes('rewind')) type = 'Motor Rewinding'
      else if (name.includes('repair')) type = 'General Repair'

      if (customEntries && customEntries.length > 0) {
        // Deduplicate legacy duplicate clones
        const cleanCustomEntries = customEntries.filter((entry, idx, arr) => {
          return !arr.slice(0, idx).some((prev) =>
            (prev.id && entry.id && prev.id === entry.id) ||
            (prev.billNo && entry.billNo && prev.billNo.trim().toLowerCase() === entry.billNo.trim().toLowerCase() &&
             prev.inwardNo && entry.inwardNo && prev.inwardNo.trim().toLowerCase() === entry.inwardNo.trim().toLowerCase() &&
             prev.itemDescription.trim().toLowerCase() === entry.itemDescription.trim().toLowerCase() &&
             prev.totalPrice === entry.totalPrice)
          )
        })

        const totalPurchases = cleanCustomEntries.reduce((s, e) => s + (Number(e.totalPrice) || 0), 0)
        const totalItems = cleanCustomEntries.reduce((s, e) => s + (Number(e.quantity) || 1), 0)
        const billSet = new Set(cleanCustomEntries.map((e) => e.billNo).filter(Boolean))
        const paidAmount = syn.foiPayable || 0
        const lastDate = cleanCustomEntries[cleanCustomEntries.length - 1].date || '2026-08-31'

        map.set(slug, {
          workshopName: syn.workshopName,
          slug,
          type,
          totalBills: billSet.size || syn.noOfBills,
          totalItems,
          totalPurchases,
          paidAmount,
          currentBalance: totalPurchases - paidAmount,
          lastDate,
          remarks: syn.remarks,
          entries: cleanCustomEntries,
        })
      } else {
        const seed = accountsData.workshops.ledgers.find(
          (l) =>
            l.slug === slug ||
            slugifyPartyName(l.workshopName) === slug ||
            l.workshopName.toLowerCase() === syn.workshopName.toLowerCase()
        )

        const entries: InventoryPurchaseEntry[] = seed
          ? seed.items.map((it, idx) => ({
              id: `ws-${seed.slug}-${idx + 1}`,
              date: it.date || '2026-08-01',
              billNo: it.billNo,
              inwardNo: it.inwardNo,
              partyName: seed.workshopName,
              itemDescription: it.itemName,
              machineCategory: 'PU',
              quantity: it.quantity,
              costPerItem: it.rate,
              totalPrice: it.amount,
            }))
          : []

        const totalPurchases = syn.saraPayable || (seed ? seed.totalPayable : 0)
        const totalItems = seed ? seed.items.reduce((s, i) => s + (Number(i.quantity) || 1), 0) : 0
        const paidAmount = syn.foiPayable || 0
        const lastDate = entries.length > 0 ? entries[entries.length - 1].date : '2026-08-31'

        map.set(slug, {
          workshopName: syn.workshopName,
          slug,
          type,
          totalBills: syn.noOfBills || (seed ? seed.billsCount : 0),
          totalItems,
          totalPurchases,
          paidAmount,
          currentBalance: totalPurchases - paidAmount,
          lastDate,
          remarks: syn.remarks,
          entries,
        })
      }
    })

    // 2. Check seed ledgers not in synopsis
    accountsData.workshops.ledgers.forEach((seed) => {
      const slug = seed.slug || slugifyPartyName(seed.workshopName)
      if (!map.has(slug)) {
        const storageKey = `${ACCOUNTS_KEYS.WORKSHOP_PREFIX}${slug}`
        const customEntries = accountsRead<InventoryPurchaseEntry[] | null>(storageKey, null)
        const entries = customEntries || seed.items.map((it, idx) => ({
          id: `ws-${seed.slug}-${idx + 1}`,
          date: it.date || '2026-08-01',
          billNo: it.billNo,
          inwardNo: it.inwardNo,
          partyName: seed.workshopName,
          itemDescription: it.itemName,
          machineCategory: 'PU' as MachineExpenseCategory,
          quantity: it.quantity,
          costPerItem: it.rate,
          totalPrice: it.amount,
        }))

        const totalPurchases = customEntries
          ? customEntries.reduce((s, e) => s + (Number(e.totalPrice) || 0), 0)
          : seed.totalPayable
        const totalItems = entries.reduce((s, e) => s + (Number(e.quantity) || 1), 0)
        const lastDate = entries.length > 0 ? entries[entries.length - 1].date : '2026-08-31'

        map.set(slug, {
          workshopName: seed.workshopName,
          slug,
          type: 'Workshop / Engineering',
          totalBills: seed.billsCount || new Set(entries.map((e) => e.billNo).filter(Boolean)).size,
          totalItems,
          totalPurchases,
          paidAmount: 0,
          currentBalance: totalPurchases,
          lastDate,
          entries,
        })
      }
    })

    const deletedWorkshops = this.getDeletedWorkshops()

    // 3. Scan Store Inward / Expense master entries (INVENTORY_CONTROL) for workshop jobs
    const storedInventoryMonths = accountsRead<Record<string, { items?: any[] }> | null>(
      ACCOUNTS_KEYS.INVENTORY_CONTROL,
      null
    )
    if (storedInventoryMonths) {
      Object.entries(storedInventoryMonths).forEach(([mKey, sheet]) => {
        if (!sheet?.items) return
        sheet.items.forEach((it: any, itIdx: number) => {
          const party = (it.companyName || it.partyName || '').trim()
          if (!party) return
          if (deletedWorkshops.includes(slugifyPartyName(party))) return
          if (it.partyType === 'Trader') return
          const isWs =
            it.partyType === 'Workshop' ||
            party.toLowerCase().includes('engineering') ||
            party.toLowerCase().includes('workshop') ||
            party.toLowerCase().includes('repair') ||
            party.toLowerCase().includes('lathe') ||
            party.toLowerCase().includes('rewind') ||
            accountsData.workshops.synopsis.some(
              (w) => slugifyPartyName(w.workshopName) === slugifyPartyName(party)
            )
          if (!isWs) return

          const s = slugifyPartyName(party)
          const existing = map.get(s)
          const entryId = it.id || `ws-inv-${mKey}-${it.sNo || itIdx + 1}`
          const entry: InventoryPurchaseEntry = {
            id: entryId,
            date: it.date || '2026-09-01',
            billNo: it.billNo || '',
            inwardNo: it.inwardNo || '',
            partyName: party,
            itemDescription: it.itemDescription || '',
            machineCategory: (it.machineName || 'PU') as MachineExpenseCategory,
            quantity: Number(it.quantity) || 1,
            costPerItem: Number(it.costPerItem || it.rate) || 0,
            totalPrice: Number(it.totalPrice || it.totalAmount) || 0,
          }

          if (existing) {
            const existingIdx = existing.entries.findIndex(
              (e) =>
                e.id === entryId ||
                (e.billNo && entry.billNo &&
                  e.billNo.trim().toLowerCase() === entry.billNo.trim().toLowerCase() &&
                  (e.inwardNo === entry.inwardNo || e.itemDescription.trim().toLowerCase() === entry.itemDescription.trim().toLowerCase()) &&
                  e.totalPrice === entry.totalPrice)
            )
            if (existingIdx >= 0) {
              existing.entries[existingIdx] = entry
            } else {
              existing.entries.push(entry)
            }
            existing.totalPurchases = existing.entries.reduce((sum, e) => sum + (Number(e.totalPrice) || 0), 0)
            existing.totalItems = existing.entries.reduce((sum, e) => sum + (Number(e.quantity) || 1), 0)
            existing.currentBalance = existing.totalPurchases - existing.paidAmount
            existing.totalBills = new Set(existing.entries.map((e) => e.billNo).filter(Boolean)).size
            if (entry.date) existing.lastDate = entry.date
          } else {
            map.set(s, {
              workshopName: party,
              slug: s,
              type: 'Workshop / Engineering',
              totalBills: entry.billNo ? 1 : 0,
              totalItems: entry.quantity,
              totalPurchases: entry.totalPrice,
              paidAmount: Number(it.foiCashCheque || 0),
              currentBalance: entry.totalPrice - Number(it.foiCashCheque || 0),
              lastDate: entry.date || '2026-09-01',
              entries: [entry],
            })
          }
        })
      })
    }

    const allWorkshops = Array.from(map.values()).filter((w) => !deletedWorkshops.includes(w.slug))

    if (!monthFilter || monthFilter === 'ALL' || monthFilter.toLowerCase() === 'all months') {
      return allWorkshops.sort((a, b) => b.totalPurchases - a.totalPurchases)
    }

    const mFilterLower = monthFilter.toLowerCase().replace(' 2026', '').trim()
    const monthNum =
      mFilterLower.includes('jan') ? '01' :
      mFilterLower.includes('feb') ? '02' :
      mFilterLower.includes('mar') ? '03' :
      mFilterLower.includes('apr') ? '04' :
      mFilterLower.includes('may') ? '05' :
      mFilterLower.includes('jun') ? '06' :
      mFilterLower.includes('jul') ? '07' :
      mFilterLower.includes('aug') ? '08' :
      mFilterLower.includes('sep') ? '09' :
      mFilterLower.includes('oct') ? '10' :
      mFilterLower.includes('nov') ? '11' :
      mFilterLower.includes('dec') ? '12' : ''

    const scopedWorkshops = allWorkshops.map((w) => {
      const monthEntries = w.entries.filter((e) => {
        if (!e.date) return false
        if (monthNum && e.date.includes(`-${monthNum}-`)) return true
        if (e.date.toLowerCase().includes(mFilterLower)) return true
        return false
      })
      const totalPurchases = monthEntries.reduce((s, e) => s + (Number(e.totalPrice) || 0), 0)
      const totalItems = monthEntries.reduce((s, e) => s + (Number(e.quantity) || 1), 0)
      const billCount = new Set(monthEntries.map((e) => e.billNo).filter(Boolean)).size
      const lastDate = monthEntries.length > 0 ? monthEntries[monthEntries.length - 1].date : w.lastDate

      return {
        ...w,
        totalBills: billCount,
        totalItems,
        totalPurchases,
        paidAmount: 0,
        currentBalance: totalPurchases,
        lastDate,
        entries: monthEntries,
      }
    })

    return scopedWorkshops.sort((a, b) => b.totalPurchases - a.totalPurchases)
  },

  addNewWorkshop(
    this: ExpenseService,
    workshopName: string,
    specialization: string = 'Workshop / Engineering',
    remarks?: string
  ): WorkshopSummary {
    const trimmed = workshopName.trim()
    const slug = slugifyPartyName(trimmed)
    const currentSynopsis = accountsRead<WorkshopSynopsisItem[]>(
      ACCOUNTS_KEYS.WORKSHOPS_STORE,
      accountsData.workshops.synopsis
    )
    const deleted = this.getDeletedWorkshops()
    const updatedDeleted = deleted.filter((d) => d !== slug)
    this.saveDeletedWorkshops(updatedDeleted)

    const existingIdx = currentSynopsis.findIndex((s) => slugifyPartyName(s.workshopName) === slug)
    if (existingIdx >= 0) {
      currentSynopsis[existingIdx] = {
        ...currentSynopsis[existingIdx],
        workshopName: trimmed,
        remarks: remarks || currentSynopsis[existingIdx].remarks,
      }
    } else {
      currentSynopsis.push({
        sNo: currentSynopsis.length + 1,
        noOfBills: 0,
        workshopName: trimmed,
        saraPayable: 0,
        foiPayable: 0,
        remarks: remarks || specialization || '',
      })
    }
    accountsWrite(ACCOUNTS_KEYS.WORKSHOPS_STORE, currentSynopsis)
    this.notifyDataChanged()
    return this.getWorkshopBySlug(slug) || {
      workshopName: trimmed,
      slug,
      type: specialization,
      totalBills: 0,
      totalItems: 0,
      totalPurchases: 0,
      paidAmount: 0,
      currentBalance: 0,
      lastDate: new Date().toISOString().slice(0, 10),
      remarks: remarks || specialization || '',
      entries: [],
    }
  },

  deleteWorkshop(this: ExpenseService, slug: string): boolean {
    const s = slugifyPartyName(slug)
    const deleted = this.getDeletedWorkshops()
    if (!deleted.includes(s)) {
      deleted.push(s)
      this.saveDeletedWorkshops(deleted)
    }

    const currentSynopsis = accountsRead<WorkshopSynopsisItem[]>(
      ACCOUNTS_KEYS.WORKSHOPS_STORE,
      accountsData.workshops.synopsis
    )
    const filtered = currentSynopsis.filter((syn) => slugifyPartyName(syn.workshopName) !== s)
    accountsWrite(ACCOUNTS_KEYS.WORKSHOPS_STORE, filtered)
    accountsRemove(`${ACCOUNTS_KEYS.WORKSHOP_PREFIX}${s}`)
    this.notifyDataChanged()
    return true
  },

  getWorkshopBySlug(this: ExpenseService, slug: string, monthFilter?: string): WorkshopSummary | null {
    const workshops = this.getWorkshopsList(monthFilter)
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, '')
    return (
      workshops.find(
        (w) =>
          w.slug === slug ||
          w.slug.replace(/[^a-z0-9]/g, '') === cleanSlug ||
          slugifyPartyName(w.workshopName) === slug ||
          w.workshopName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .includes(cleanSlug)
      ) || null
    )
  },

  recordWorkshopBill(this: ExpenseService, params: RecordWorkshopJobInput): { entry: InventoryPurchaseEntry; workshop: WorkshopSummary } {
    const workshopName = params.workshopName.trim()
    const slug = slugifyPartyName(workshopName)
    const total = params.totalAmount ?? Math.round(params.quantity * params.rate)
    const saraAp = params.saraPayable ?? total
    const foiPaid = params.foiPaid || 0

    // 1. Update workshop ledger
    const storageKey = `${ACCOUNTS_KEYS.WORKSHOP_PREFIX}${slug}`
    const existingWs = this.getWorkshopBySlug(slug)
    const currentEntries: InventoryPurchaseEntry[] = existingWs ? [...existingWs.entries] : []

    const itemDesc = params.machineName
      ? `${params.jobDescription} (${params.machineName})`
      : params.jobDescription

    const newEntry: InventoryPurchaseEntry = {
      id: `ws-${slug}-${Date.now()}`,
      date: params.date,
      billNo: params.billNo || '',
      inwardNo: params.inwardNo || '',
      partyName: workshopName,
      itemDescription: itemDesc,
      machineCategory: 'PU',
      quantity: params.quantity,
      costPerItem: params.rate,
      totalPrice: total,
    }
    currentEntries.push(newEntry)
    if (this.isClient()) {
      accountsWrite(storageKey, currentEntries)
    }

    // 2. Update Workshops Synopsis Store
    const currentSynopsis = accountsRead<WorkshopSynopsisItem[]>(
      ACCOUNTS_KEYS.WORKSHOPS_STORE,
      accountsData.workshops.synopsis
    )
    const synIndex = currentSynopsis.findIndex(
      (s) => slugifyPartyName(s.workshopName) === slug || s.workshopName.toLowerCase() === workshopName.toLowerCase()
    )

    if (synIndex >= 0) {
      const syn = currentSynopsis[synIndex]
      currentSynopsis[synIndex] = {
        ...syn,
        saraPayable: (syn.saraPayable || 0) + saraAp,
        foiPayable: (syn.foiPayable || 0) + foiPaid,
        noOfBills: (syn.noOfBills || 0) + (params.billNo ? 1 : 0),
        remarks: params.remarks || syn.remarks || '',
      }
    } else {
      currentSynopsis.push({
        sNo: currentSynopsis.length + 1,
        noOfBills: 1,
        workshopName,
        saraPayable: saraAp,
        foiPayable: foiPaid,
        remarks: params.remarks || '',
      })
    }
    if (this.isClient()) {
      accountsWrite(ACCOUNTS_KEYS.WORKSHOPS_STORE, currentSynopsis)
    }

    // 3. Mirror into Daily Inward Expenses
    const dailyInward = accountsRead<DailyInwardItem[]>(
      ACCOUNTS_KEYS.DAILY_INWARD,
      accountsData.dailyExpense.inward
    )
    const newDailyItem: DailyInwardItem = {
      sNo: dailyInward.length + 1,
      date: params.date,
      billNo: params.billNo || '',
      inwardNo: params.inwardNo || '',
      partyName: workshopName,
      itemDescription: itemDesc,
      quantity: params.quantity,
      rate: params.rate,
      totalAmount: total,
      saraAp,
      foiCashCheque: foiPaid,
      balance: 0,
    }
    dailyInward.push(newDailyItem)
    if (this.isClient()) {
      accountsWrite(ACCOUNTS_KEYS.DAILY_INWARD, dailyInward)
      this.notifyDataChanged(params.date.slice(0, 7))
    }

    const updatedWorkshop = this.getWorkshopBySlug(slug) || {
      workshopName,
      slug,
      type: 'Workshop / Engineering',
      totalBills: 1,
      totalItems: params.quantity,
      totalPurchases: saraAp,
      paidAmount: foiPaid,
      currentBalance: saraAp - foiPaid,
      lastDate: params.date,
      remarks: params.remarks,
      entries: currentEntries,
    }

    return { entry: newEntry, workshop: updatedWorkshop }
  },

}

export type WorkshopMethods = typeof workshopMethods
