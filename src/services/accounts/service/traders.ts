/** Traders ledger: list, add, delete, record a bill. */
import { InventoryPurchaseEntry, MachineExpenseCategory } from '@/types/expense'
import { accountsData, TraderSynopsisItem, DailyInwardItem } from '@/data/accountsData'
import { accountsRead, accountsRemove, accountsWrite } from '@/services/accountsStore'
import { ACCOUNTS_KEYS } from '@/lib/accountsKeys'
import { slugifyPartyName } from '@/services/accounts/expenseSeeds'
import type { TraderSummary, RecordTraderBillInput } from '@/services/accounts/expenseTypes'
import type { ExpenseService } from '@/services/expenseService'

export const traderMethods = {
  getDeletedTraders(this: ExpenseService): string[] {
    const primary = accountsRead<string[]>(ACCOUNTS_KEYS.DELETED_TRADERS, [])
    const legacy = accountsRead<string[]>('sara_deleted_traders_v1', [])
    return Array.from(new Set([...primary, ...legacy]))
  },

  saveDeletedTraders(this: ExpenseService, list: string[]): void {
    accountsWrite(ACCOUNTS_KEYS.DELETED_TRADERS, list)
    if (this.isClient()) {
      try {
        localStorage.removeItem('sara_deleted_traders_v1')
      } catch {}
    }
  },

  getTradersList(this: ExpenseService, monthFilter?: string): TraderSummary[] {
    const synList = accountsRead<TraderSynopsisItem[]>(
      ACCOUNTS_KEYS.TRADERS_STORE,
      accountsData.traders.synopsis
    )

    const map = new Map<string, TraderSummary>()

    // 1. Process from synopsis list
    synList.forEach((syn) => {
      const slug = slugifyPartyName(syn.traderName)
      const storageKey = `${ACCOUNTS_KEYS.TRADER_PREFIX}${slug}`
      const customEntries = accountsRead<InventoryPurchaseEntry[] | null>(storageKey, null)

      let type: TraderSummary['type'] = 'Trader'
      const name = syn.traderName.toLowerCase()
      if (name.includes('petroleum') || name.includes('oil')) type = 'Petroleum & Oil'
      else if (name.includes('smd') || name.includes('electronic') || name.includes('textile engineering')) type = 'Electronics'
      else if (name.includes('fire')) type = 'Safety / Fire'

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
          partyName: syn.traderName,
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
        // Fall back to seed ledger
        const seed = accountsData.traders.ledgers.find(
          (l) =>
            l.slug === slug ||
            slugifyPartyName(l.partyName) === slug ||
            l.partyName.toLowerCase() === syn.traderName.toLowerCase()
        )

        const entries: InventoryPurchaseEntry[] = seed
          ? seed.items.map((it, idx) => ({
              id: `tr-${seed.slug}-${idx + 1}`,
              date: it.date || '2026-08-01',
              billNo: it.billNo,
              inwardNo: it.inwardNo,
              partyName: seed.partyName,
              itemDescription: it.itemName,
              machineCategory: 'All',
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
          partyName: syn.traderName,
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

    // 2. Check any seed ledgers not in synopsis
    accountsData.traders.ledgers.forEach((seed) => {
      const slug = seed.slug || slugifyPartyName(seed.partyName)
      if (!map.has(slug)) {
        const storageKey = `${ACCOUNTS_KEYS.TRADER_PREFIX}${slug}`
        const customEntries = accountsRead<InventoryPurchaseEntry[] | null>(storageKey, null)
        const entries = customEntries || seed.items.map((it, idx) => ({
          id: `tr-${seed.slug}-${idx + 1}`,
          date: it.date || '2026-08-01',
          billNo: it.billNo,
          inwardNo: it.inwardNo,
          partyName: seed.partyName,
          itemDescription: it.itemName,
          machineCategory: 'All' as MachineExpenseCategory,
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
          partyName: seed.partyName,
          slug,
          type: 'Trader',
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

    const deletedTraders = this.getDeletedTraders()

    // 3. Scan Store Inward / Expense master entries (INVENTORY_CONTROL) for trader bills
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
          if (deletedTraders.includes(slugifyPartyName(party))) return
          if (it.partyType === 'Workshop') return
          if (it.partyType !== 'Trader') {
            const isWs =
              party.toLowerCase().includes('engineering') ||
              party.toLowerCase().includes('workshop') ||
              party.toLowerCase().includes('repair') ||
              party.toLowerCase().includes('lathe') ||
              party.toLowerCase().includes('rewind') ||
              accountsData.workshops.synopsis.some(
                (w) => slugifyPartyName(w.workshopName) === slugifyPartyName(party)
              )
            if (isWs) return
          }

          const s = slugifyPartyName(party)
          const existing = map.get(s)
          const entryId = it.id || `inv-${mKey}-${it.sNo || itIdx + 1}`
          const entry: InventoryPurchaseEntry = {
            id: entryId,
            date: it.date || '2026-09-01',
            billNo: it.billNo || '',
            inwardNo: it.inwardNo || '',
            partyName: party,
            itemDescription: it.itemDescription || '',
            machineCategory: (it.machineName || 'All') as MachineExpenseCategory,
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
              partyName: party,
              slug: s,
              type: 'Trader',
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

    const allTraders = Array.from(map.values()).filter((t) => !deletedTraders.includes(t.slug))

    if (!monthFilter || monthFilter === 'ALL' || monthFilter.toLowerCase() === 'all months') {
      return allTraders.sort((a, b) => b.totalPurchases - a.totalPurchases)
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

    const scopedTraders = allTraders.map((t) => {
      const monthEntries = t.entries.filter((e) => {
        if (!e.date) return false
        if (monthNum && e.date.includes(`-${monthNum}-`)) return true
        if (e.date.toLowerCase().includes(mFilterLower)) return true
        return false
      })
      const totalPurchases = monthEntries.reduce((s, e) => s + (Number(e.totalPrice) || 0), 0)
      const totalItems = monthEntries.reduce((s, e) => s + (Number(e.quantity) || 1), 0)
      const billCount = new Set(monthEntries.map((e) => e.billNo).filter(Boolean)).size
      const lastDate = monthEntries.length > 0 ? monthEntries[monthEntries.length - 1].date : t.lastDate

      return {
        ...t,
        totalBills: billCount,
        totalItems,
        totalPurchases,
        paidAmount: 0,
        currentBalance: totalPurchases,
        lastDate,
        entries: monthEntries,
      }
    })

    return scopedTraders.sort((a, b) => b.totalPurchases - a.totalPurchases)
  },

  addNewTrader(this: ExpenseService, partyName: string, category: string = 'Trader', remarks?: string): TraderSummary {
    const trimmed = partyName.trim()
    const slug = slugifyPartyName(trimmed)
    const currentSynopsis = accountsRead<TraderSynopsisItem[]>(
      ACCOUNTS_KEYS.TRADERS_STORE,
      accountsData.traders.synopsis
    )
    const deleted = this.getDeletedTraders()
    const updatedDeleted = deleted.filter((d) => d !== slug)
    this.saveDeletedTraders(updatedDeleted)

    const existingIdx = currentSynopsis.findIndex((s) => slugifyPartyName(s.traderName) === slug)
    if (existingIdx >= 0) {
      currentSynopsis[existingIdx] = {
        ...currentSynopsis[existingIdx],
        traderName: trimmed,
        remarks: remarks || currentSynopsis[existingIdx].remarks,
      }
    } else {
      currentSynopsis.push({
        sNo: currentSynopsis.length + 1,
        noOfBills: 0,
        traderName: trimmed,
        saraPayable: 0,
        foiPayable: 0,
        remarks: remarks || category || '',
      })
    }
    accountsWrite(ACCOUNTS_KEYS.TRADERS_STORE, currentSynopsis)
    this.notifyDataChanged()
    return this.getTraderBySlug(slug) || {
      partyName: trimmed,
      slug,
      type: category,
      totalBills: 0,
      totalItems: 0,
      totalPurchases: 0,
      paidAmount: 0,
      currentBalance: 0,
      lastDate: new Date().toISOString().slice(0, 10),
      remarks: remarks || category || '',
      entries: [],
    }
  },

  deleteTrader(this: ExpenseService, slug: string): boolean {
    const s = slugifyPartyName(slug)
    const deleted = this.getDeletedTraders()
    if (!deleted.includes(s)) {
      deleted.push(s)
      this.saveDeletedTraders(deleted)
    }

    const currentSynopsis = accountsRead<TraderSynopsisItem[]>(
      ACCOUNTS_KEYS.TRADERS_STORE,
      accountsData.traders.synopsis
    )
    const filtered = currentSynopsis.filter((syn) => slugifyPartyName(syn.traderName) !== s)
    accountsWrite(ACCOUNTS_KEYS.TRADERS_STORE, filtered)
    accountsRemove(`${ACCOUNTS_KEYS.TRADER_PREFIX}${s}`)
    this.notifyDataChanged()
    return true
  },

  getTraderBySlug(this: ExpenseService, slug: string, monthFilter?: string): TraderSummary | null {
    const traders = this.getTradersList(monthFilter)
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, '')
    return (
      traders.find(
        (t) =>
          t.slug === slug ||
          t.slug.replace(/[^a-z0-9]/g, '') === cleanSlug ||
          slugifyPartyName(t.partyName) === slug ||
          t.partyName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .includes(cleanSlug)
      ) || null
    )
  },

  recordTraderBill(this: ExpenseService, params: RecordTraderBillInput): { entry: InventoryPurchaseEntry; trader: TraderSummary } {
    const partyName = params.partyName.trim()
    const slug = slugifyPartyName(partyName)
    const total = params.totalAmount ?? Math.round(params.quantity * params.rate)
    const saraAp = params.saraPayable ?? total
    const foiPaid = params.foiPaid || 0

    // 1. Update party ledger
    const storageKey = `${ACCOUNTS_KEYS.TRADER_PREFIX}${slug}`
    const existingTrader = this.getTraderBySlug(slug)
    const currentEntries: InventoryPurchaseEntry[] = existingTrader ? [...existingTrader.entries] : []

    const newEntry: InventoryPurchaseEntry = {
      id: `tr-${slug}-${Date.now()}`,
      date: params.date,
      billNo: params.billNo || '',
      inwardNo: params.inwardNo || '',
      partyName,
      itemDescription: params.itemName,
      machineCategory: params.machineCategory || 'All',
      quantity: params.quantity,
      costPerItem: params.rate,
      totalPrice: total,
    }
    currentEntries.push(newEntry)
    if (this.isClient()) {
      accountsWrite(storageKey, currentEntries)
    }

    // 2. Update Traders Synopsis Store
    const currentSynopsis = accountsRead<TraderSynopsisItem[]>(
      ACCOUNTS_KEYS.TRADERS_STORE,
      accountsData.traders.synopsis
    )
    const synIndex = currentSynopsis.findIndex(
      (s) => slugifyPartyName(s.traderName) === slug || s.traderName.toLowerCase() === partyName.toLowerCase()
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
        traderName: partyName,
        saraPayable: saraAp,
        foiPayable: foiPaid,
        remarks: params.remarks || '',
      })
    }
    if (this.isClient()) {
      accountsWrite(ACCOUNTS_KEYS.TRADERS_STORE, currentSynopsis)
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
      partyName,
      itemDescription: params.itemName,
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

    const updatedTrader = this.getTraderBySlug(slug) || {
      partyName,
      slug,
      type: 'Trader',
      totalBills: 1,
      totalItems: params.quantity,
      totalPurchases: saraAp,
      paidAmount: foiPaid,
      currentBalance: saraAp - foiPaid,
      lastDate: params.date,
      remarks: params.remarks,
      entries: currentEntries,
    }

    return { entry: newEntry, trader: updatedTrader }
  },

}

export type TraderMethods = typeof traderMethods
