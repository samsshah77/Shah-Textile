'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { accountsData, InventoryItem, MonthlyInventorySheet } from '@/data/accountsData'
import { expenseService } from '@/services/expenseService'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import {
  Search,
  CheckCircle2,
  Printer,
  Download,
  Calendar,
  Filter,
  PlusCircle,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Building2,
  Receipt,
  Check,
  AlertTriangle,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { accountsRead, accountsWrite } from '@/services/accountsStore'
import { ACCOUNTS_KEYS } from '@/lib/accountsKeys'

const STORAGE_KEY_INVENTORY = ACCOUNTS_KEYS.INVENTORY_CONTROL

const ALL_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const MACHINE_OPTIONS = ['G-6200', 'G-6300', 'PU', 'Electronic', 'ALL'] as const

interface ItemDraftRow {
  id: string
  description: string
  quantity: number | string
  machineName: string
  costPerItem: number | string
  totalPrice: number
}

const DEFAULT_INVENTORY_COL_WIDTHS: Record<string, number> = {
  sNo: 50,
  date: 95,
  billNo: 85,
  inwardNo: 85,
  partyName: 200,
  description: 300,
  machineName: 120,
  quantity: 70,
  costPerItem: 105,
  totalPrice: 130,
  balance: 140,
  actions: 95,
}

export default function DailyInwardExpenseUnifiedPage() {
  // Load months data directly from database-backed accounts store
  const [monthsData, setMonthsData] = useState<Record<string, MonthlyInventorySheet>>(() => {
    const raw = accountsRead<Record<string, MonthlyInventorySheet> | null>(
      STORAGE_KEY_INVENTORY,
      null
    )
    if (raw && typeof raw === 'object' && Object.keys(raw).length > 0) {
      return raw
    }

    // Authentic seed months as non-destructive in-memory fallback
    const initialMonths = { ...accountsData.inventoryControl.months }
    if (!initialMonths['September']) {
      initialMonths['September'] = {
        month: 'September',
        itemsCount: 0,
        totalAmount: 0,
        items: [],
      }
    }
    return initialMonths
  })

  // Selected Month state (synchronized globally across Daily Inward, Traders, and Workshops)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('sara_accounts_selected_month')
        if (saved) return saved
      } catch {}
    }
    return 'September'
  })
  const [search, setSearch] = useState('')
  const [filterMachine, setFilterMachine] = useState<string>('ALL')
  const [filterPartyType, setFilterPartyType] = useState<'ALL' | 'Trader' | 'Workshop'>('ALL')
  const [isSaved, setIsSaved] = useState(false)

  const handleSelectMonth = (month: string) => {
    setSelectedMonth(month)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('sara_accounts_selected_month', month)
        window.dispatchEvent(new CustomEvent('accounts_month_changed', { detail: month }))
      } catch {}
    }
  }

  // Listen for real-time cross-tab sync & month change events
  useEffect(() => {
    const handleSync = () => {
      const stored = accountsRead<Record<string, MonthlyInventorySheet> | null>(
        STORAGE_KEY_INVENTORY,
        null
      )
      if (stored && typeof stored === 'object') {
        setMonthsData(stored)
      }
    }
    const handleMonthChange = (e: Event) => {
      const customEvt = e as CustomEvent<string>
      if (customEvt.detail && customEvt.detail !== selectedMonth) {
        setSelectedMonth(customEvt.detail)
      }
    }
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_INVENTORY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          if (parsed && typeof parsed === 'object') {
            setMonthsData(parsed)
          }
        } catch {}
      }
      if (e.key === 'sara_accounts_selected_month' && e.newValue && e.newValue !== selectedMonth) {
        setSelectedMonth(e.newValue)
      }
    }
    window.addEventListener('accounts_synced', handleSync)
    window.addEventListener('accounts_month_changed', handleMonthChange)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('accounts_synced', handleSync)
      window.removeEventListener('accounts_month_changed', handleMonthChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [selectedMonth])

  const availableMonths = useMemo(() => {
    return Object.keys(monthsData)
  }, [monthsData])

  // =========================================================================
  // MULTI-ITEM "ADD ENTRY" MODAL STATE (New Bill)
  // =========================================================================
  const [showAddModal, setShowAddModal] = useState(false)
  const [entryDate, setEntryDate] = useState(() => {
    const now = new Date()
    return `2026-09-${String(now.getDate()).padStart(2, '0')}`
  })
  const [entryBillNo, setEntryBillNo] = useState('')
  const [entryInwardNo, setEntryInwardNo] = useState('')
  const [entryPartyName, setEntryPartyName] = useState('')
  const [entryPartyType, setEntryPartyType] = useState<'Trader' | 'Workshop'>('Trader')
  const [isCustomParty, setIsCustomParty] = useState(false)
  const [entryRemarks, setEntryRemarks] = useState('')

  // Dynamic description rows state: user provides count or adds rows
  const [descriptionCount, setDescriptionCount] = useState<number>(1)
  const [itemRows, setItemRows] = useState<ItemDraftRow[]>([
    {
      id: 'row-1',
      description: '',
      quantity: 1,
      machineName: 'G-6200',
      costPerItem: '',
      totalPrice: 0,
    },
  ])

  // Auto-calculated next sequential inward number: starts from 7654
  const getNextInwardNo = useCallback(() => {
    const rawSheet = monthsData[selectedMonth]
    const items = rawSheet?.items || []
    let maxNum = 7653
    items.forEach((it) => {
      const raw = String(it.inwardNo || '').replace(/[^0-9]/g, '')
      const n = parseInt(raw, 10)
      if (!isNaN(n) && n > maxNum) {
        maxNum = n
      }
    })
    return String(maxNum + 1)
  }, [monthsData, selectedMonth])

  // Direct table inline editing row ID (No modal needed!)
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null)

  // Sync itemRows count when descriptionCount input changes in Add Entry modal
  const handleDescriptionCountChange = (count: number) => {
    const validCount = Math.max(1, Math.min(20, count || 1))
    setDescriptionCount(validCount)
    setItemRows((prev) => {
      const next = [...prev]
      while (next.length < validCount) {
        next.push({
          id: `row-${Date.now()}-${next.length + 1}`,
          description: '',
          quantity: 1,
          machineName: 'G-6200',
          costPerItem: '',
          totalPrice: 0,
        })
      }
      return next.slice(0, validCount)
    })
  }

  const addItemDraftRow = () => {
    setItemRows((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}-${prev.length + 1}`,
        description: '',
        quantity: 1,
        machineName: 'G-6200',
        costPerItem: '',
        totalPrice: 0,
      },
    ])
    setDescriptionCount((c) => c + 1)
  }

  const removeItemDraftRow = (index: number) => {
    if (itemRows.length <= 1) return
    setItemRows((prev) => prev.filter((_, idx) => idx !== index))
    setDescriptionCount((c) => Math.max(1, c - 1))
  }

  const updateItemDraftRow = (index: number, field: keyof ItemDraftRow, value: any) => {
    setItemRows((prev) => {
      const next = [...prev]
      const current = { ...next[index], [field]: value }
      const q = Number(current.quantity) || 0
      const c = Number(current.costPerItem) || 0
      current.totalPrice = Math.round(q * c)
      next[index] = current
      return next
    })
  }



  // Floating feedback notification toast
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showFeedback = (message: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ type, message })
    setTimeout(() => setFeedbackMsg(null), 3500)
  }

  // Delete Confirmation Modal state
  const [deleteTarget, setDeleteTarget] = useState<{ index: number; item: InventoryItem } | null>(null)

  // =========================================================================
  // GENERATE NEW MONTH MODAL STATE
  // =========================================================================
  const [showGenerateMonthModal, setShowGenerateMonthModal] = useState(false)
  const [genMonthName, setGenMonthName] = useState('September')
  const [genYear, setGenYear] = useState('2026')

  // =========================================================================
  // COLUMN RESIZING STATE (DRAGGABLE RESIZE WITH LOCALSTORAGE MEMORY)
  // =========================================================================
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('sara_daily_inward_col_widths_v3')
        if (saved) return { ...DEFAULT_INVENTORY_COL_WIDTHS, ...JSON.parse(saved) }
      } catch {}
    }
    return DEFAULT_INVENTORY_COL_WIDTHS
  })

  const startColResize = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = colWidths[colKey] || DEFAULT_INVENTORY_COL_WIDTHS[colKey] || 80

    const onMouseMove = (moveEvt: MouseEvent) => {
      const delta = moveEvt.clientX - startX
      const minW = colKey === 'sNo' ? 40 : 55
      const newW = Math.max(minW, startW + delta)
      setColWidths((prev) => ({ ...prev, [colKey]: newW }))
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      setColWidths((latest) => {
        try {
          localStorage.setItem('sara_daily_inward_col_widths_v3', JSON.stringify(latest))
        } catch {}
        return latest
      })
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const resetColWidths = () => {
    setColWidths(DEFAULT_INVENTORY_COL_WIDTHS)
    try {
      localStorage.removeItem('sara_daily_inward_col_widths_v3')
    } catch {}
  }

  const totalTableWidth = useMemo(() => {
    return Object.values(colWidths).reduce((sum, w) => sum + w, 0)
  }, [colWidths])

  // Color helper for party background tint (exact Excel aesthetic)
  const getCompanyTintStyle = (company: string) => {
    const c = (company || '').toLowerCase()
    if (c.includes('textile traders')) return 'bg-[#ede9fe] text-purple-950 font-bold dark:bg-purple-950/40 dark:text-purple-200'
    if (c.includes('a.a.i') || c.includes('aai')) return 'bg-[#fed7aa] text-amber-950 font-bold dark:bg-amber-950/40 dark:text-amber-200'
    if (c.includes('a.a engineering') || c.includes('aa engineering')) return 'bg-[#bae6fd] text-sky-950 font-bold dark:bg-sky-950/40 dark:text-sky-200'
    if (c.includes('textile engineering')) return 'bg-[#dcfce7] text-emerald-950 font-bold dark:bg-emerald-950/40 dark:text-emerald-200'
    if (c.includes('smd traders') || c.includes('smd')) return 'bg-[#fef08a] text-yellow-950 font-bold dark:bg-yellow-950/40 dark:text-yellow-200'
    if (c.includes('gq fire')) return 'bg-[#e8dac8] text-amber-950 font-bold dark:bg-amber-900/40 dark:text-amber-200'
    if (c.includes('muhammad ali')) return 'bg-[#ede9fe] text-purple-950 font-bold dark:bg-purple-950/40 dark:text-purple-200'
    if (c.includes('vip petroleum')) return 'bg-[#e0f2fe] text-sky-950 font-bold dark:bg-sky-950/40 dark:text-sky-200'
    if (c.includes('janjoha')) return 'bg-[#ffedd5] text-orange-950 font-bold dark:bg-orange-950/40 dark:text-orange-200'
    if (c.includes('f.t') || c.includes('ft traders')) return 'bg-[#fed7aa] text-amber-950 font-bold dark:bg-amber-950/40 dark:text-amber-200'
    if (c.includes('blue reed')) return 'bg-[#bfdbfe] text-blue-950 font-bold dark:bg-blue-950/40 dark:text-blue-200'
    if (c.includes('marhaba')) return 'bg-[#d1fae5] text-emerald-950 font-bold dark:bg-emerald-950/40 dark:text-emerald-200'
    return 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold'
  }

  // Machine Type badge style
  const getMachineBadgeStyle = (machine: string) => {
    const m = (machine || '').trim().toUpperCase()
    if (m === 'ALL') return 'bg-red-600 text-white font-bold'
    if (m === 'PU') return 'bg-[#15803d] text-white font-bold'
    if (m.includes('6300')) return 'bg-[#0284c7] text-white font-bold'
    if (m.includes('6200')) return 'bg-[#84cc16] text-white font-bold'
    if (m.toLowerCase().includes('electron')) return 'bg-[#64748b] text-white font-bold'
    return 'bg-slate-500 text-white font-semibold'
  }

  // Separate lists of Trader Parties & Workshop Vendors
  const traderOptions = useMemo(() => {
    const set = new Set<string>()
    try {
      expenseService.getTradersList().forEach((t) => set.add(t.partyName.trim()))
    } catch {}
    accountsData.traders.synopsis.forEach((t) => set.add(t.traderName.trim()))
    Object.values(monthsData).forEach((m) => {
      ;(m.items || []).forEach((it) => {
        const name = (it.companyName || it.partyName || '').trim()
        if (name) {
          const lower = name.toLowerCase()
          const isWs =
            lower.includes('engineering') ||
            lower.includes('workshop') ||
            lower.includes('repair') ||
            lower.includes('lathe') ||
            lower.includes('rewind')
          if (!isWs) set.add(name)
        }
      })
    })
    return Array.from(set).filter(Boolean).sort()
  }, [monthsData])

  const workshopOptions = useMemo(() => {
    const set = new Set<string>()
    try {
      expenseService.getWorkshopsList().forEach((w) => set.add(w.workshopName.trim()))
    } catch {}
    accountsData.workshops.synopsis.forEach((w) => set.add(w.workshopName.trim()))
    Object.values(monthsData).forEach((m) => {
      ;(m.items || []).forEach((it) => {
        const name = (it.companyName || it.partyName || '').trim()
        if (name) {
          const lower = name.toLowerCase()
          const isWs =
            lower.includes('engineering') ||
            lower.includes('workshop') ||
            lower.includes('repair') ||
            lower.includes('lathe') ||
            lower.includes('rewind')
          if (isWs) set.add(name)
        }
      })
    })
    return Array.from(set).filter(Boolean).sort()
  }, [monthsData])

  // Backward compatibility list
  const allPartySuggestions = useMemo(() => {
    return Array.from(new Set([...traderOptions, ...workshopOptions])).sort()
  }, [traderOptions, workshopOptions])

  // When party name is typed in Add Entry modal, auto-detect Trader vs Workshop
  const handlePartyNameInput = (name: string) => {
    setEntryPartyName(name)
    const lower = name.toLowerCase()
    const isWs =
      lower.includes('engineering') ||
      lower.includes('workshop') ||
      lower.includes('repair') ||
      lower.includes('lathe') ||
      lower.includes('rewind') ||
      accountsData.workshops.synopsis.some((w) => w.workshopName.toLowerCase() === lower) ||
      workshopOptions.some((w) => w.toLowerCase() === lower)
    setEntryPartyType(isWs ? 'Workshop' : 'Trader')
  }

  // Save helper to database
  const persistMonths = (updated: Record<string, MonthlyInventorySheet>) => {
    setMonthsData(updated)
    accountsWrite(STORAGE_KEY_INVENTORY, updated)
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('accounts_synced', { detail: { source: 'inventory' } }))
      } catch (err) {
        console.error(err)
      }
    }
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  // =========================================================================
  // REACTIVE FORMULAS COMPUTATION & RUNNING BALANCE
  // =========================================================================
  const computedActiveSheet = useMemo(() => {
    const rawSheet = monthsData[selectedMonth] || {
      month: selectedMonth,
      itemsCount: 0,
      totalAmount: 0,
      items: [],
    }

    let runningSum = 0
    const rawItems = rawSheet.items || []

    const computedItems: InventoryItem[] = rawItems.map((it, idx) => {
      const qty = Number(it.quantity) || 0
      const cost = Number(it.costPerItem || it.rate) || 0
      const totalPrice = qty * cost
      runningSum += totalPrice

      return {
        ...it,
        sNo: idx + 1,
        quantity: qty,
        costPerItem: cost,
        rate: cost,
        totalPrice,
        totalAmount: totalPrice,
        saraAp: totalPrice,
        foiCashCheque: 0,
        balance: runningSum,
        companyName: it.companyName || it.partyName || '',
        partyName: it.partyName || it.companyName || '',
        machineName: it.machineName || 'G-6200',
      }
    })

    const totalAmount = computedItems.reduce((s, it) => s + (it.totalPrice || 0), 0)

    return {
      month: selectedMonth,
      itemsCount: computedItems.length,
      totalAmount,
      closingBalance: runningSum,
      items: computedItems,
    }
  }, [monthsData, selectedMonth])

  // Filter items based on search and selected machine / party
  const filteredItems = useMemo(() => {
    return computedActiveSheet.items.filter((item) => {
      const q = search.toLowerCase().trim()
      const matchSearch =
        !q ||
        item.itemDescription.toLowerCase().includes(q) ||
        (item.companyName || '').toLowerCase().includes(q) ||
        (item.billNo || '').toLowerCase().includes(q) ||
        (item.inwardNo || '').toLowerCase().includes(q) ||
        (item.machineName || '').toLowerCase().includes(q)

      const matchMachine = filterMachine === 'ALL' || (item.machineName || '').trim() === filterMachine

      const partyLower = (item.companyName || '').toLowerCase()
      const isWorkshop =
        partyLower.includes('engineering') ||
        partyLower.includes('workshop') ||
        partyLower.includes('repair') ||
        partyLower.includes('lathe')
      const matchPartyType =
        filterPartyType === 'ALL' ||
        (filterPartyType === 'Workshop' && isWorkshop) ||
        (filterPartyType === 'Trader' && !isWorkshop)

      return matchSearch && matchMachine && matchPartyType
    })
  }, [computedActiveSheet, search, filterMachine, filterPartyType])

  // Group consecutive rows sharing the exact same Invoice / Bill No & Party
  const billGroups = useMemo(() => {
    const result: {
      invoiceIndex: number
      isFirstInBill: boolean
      isLastInBill: boolean
      rowSpan: number
      billTotal: number
    }[] = []

    let i = 0
    let currentInvoiceIndex = 0

    while (i < filteredItems.length) {
      const current = filteredItems[i]
      const hasBillNo = current.billNo && current.billNo.trim() !== '' && current.billNo.trim() !== '-'

      if (!hasBillNo) {
        result.push({
          invoiceIndex: currentInvoiceIndex,
          isFirstInBill: true,
          isLastInBill: true,
          rowSpan: 1,
          billTotal: current.totalPrice,
        })
        currentInvoiceIndex++
        i++
        continue
      }

      let j = i + 1
      while (
        j < filteredItems.length &&
        filteredItems[j].billNo &&
        filteredItems[j].billNo.trim().toLowerCase() === current.billNo.trim().toLowerCase() &&
        filteredItems[j].companyName.trim().toLowerCase() === current.companyName.trim().toLowerCase()
      ) {
        j++
      }

      const count = j - i
      let sumBill = 0
      for (let k = i; k < j; k++) {
        sumBill += filteredItems[k].totalPrice
      }

      result.push({
        invoiceIndex: currentInvoiceIndex,
        isFirstInBill: true,
        isLastInBill: count === 1,
        rowSpan: count,
        billTotal: sumBill,
      })

      for (let k = i + 1; k < j; k++) {
        result.push({
          invoiceIndex: currentInvoiceIndex,
          isFirstInBill: false,
          isLastInBill: k === j - 1,
          rowSpan: 0,
          billTotal: sumBill,
        })
      }

      currentInvoiceIndex++
      i = j
    }

    return result
  }, [filteredItems])



  // =========================================================================
  // INLINE MACHINE CHANGE (Right inside table cell!)
  // =========================================================================
  const handleInlineMachineChange = (idx: number, machine: string) => {
    const sheet = { ...computedActiveSheet }
    const updated = [...sheet.items]
    if (!updated[idx]) return
    updated[idx] = {
      ...updated[idx],
      machineName: machine,
    }
    const updatedMonths = {
      ...monthsData,
      [selectedMonth]: {
        ...sheet,
        items: updated,
      },
    }
    persistMonths(updatedMonths)
  }

  // =========================================================================
  // SUBMIT MULTI-ITEM "ADD ENTRY" (New Bill)
  // =========================================================================
  const handleAddEntrySubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!entryBillNo.trim() || !entryPartyName.trim()) {
      alert('Please enter Bill No and Party Name.')
      return
    }

    const validRows = itemRows.filter((r) => r.description.trim() && Number(r.costPerItem) >= 0)
    if (validRows.length === 0) {
      alert('Please enter at least one item description with rate.')
      return
    }

    const currentSheet = { ...computedActiveSheet }
    const currentList = [...currentSheet.items]
    const baseSNo = currentList.length

    // Construct InventoryItem objects for each description
    const newItems: InventoryItem[] = validRows.map((row, idx) => {
      const q = Number(row.quantity) || 1
      const rate = Number(row.costPerItem) || 0
      const total = Math.round(q * rate)

      return {
        id: `inw-${Date.now()}-${idx + 1}`,
        sNo: baseSNo + idx + 1,
        date: entryDate,
        billNo: entryBillNo.trim(),
        inwardNo: entryInwardNo.trim(),
        itemDescription: row.description.trim(),
        companyName: entryPartyName.trim(),
        partyName: entryPartyName.trim(),
        machineName: row.machineName || 'G-6200',
        quantity: q,
        costPerItem: rate,
        rate,
        totalPrice: total,
        totalAmount: total,
        saraAp: total,
        foiCashCheque: 0,
        remarks: entryRemarks.trim(),
      }
    })

    const updatedItems = [...currentList, ...newItems]
    const updatedMonths = {
      ...monthsData,
      [selectedMonth]: {
        ...currentSheet,
        items: updatedItems,
        itemsCount: updatedItems.length,
        totalAmount: updatedItems.reduce((s, it) => s + it.totalPrice, 0),
      },
    }

    persistMonths(updatedMonths)

    // Automatically synchronize into Trader or Workshop Ledgers
    try {
      expenseService.recordUnifiedMasterBill({
        date: entryDate,
        partyName: entryPartyName.trim(),
        billNo: entryBillNo.trim(),
        inwardNo: entryInwardNo.trim(),
        items: validRows.map((r) => ({
          description: r.description.trim(),
          machineName: r.machineName || 'G-6200',
          quantity: Number(r.quantity) || 1,
          rate: Number(r.costPerItem) || 0,
          totalAmount: Math.round((Number(r.quantity) || 1) * (Number(r.costPerItem) || 0)),
        })),
        foiPaid: 0,
        remarks: entryRemarks.trim(),
        isWorkshop: entryPartyType === 'Workshop',
      })
    } catch (err) {
      console.error('Error auto-syncing to trader/workshop ledger:', err)
    }

    // Reset Add Entry Form
    setEntryBillNo('')
    setEntryInwardNo('')
    setEntryRemarks('')
    setEntryPartyName('')
    setEntryPartyType('Trader')
    setIsCustomParty(false)
    setDescriptionCount(1)
    setItemRows([
      {
        id: 'row-1',
        description: '',
        quantity: 1,
        machineName: 'G-6200',
        costPerItem: '',
        totalPrice: 0,
      },
    ])
    setShowAddModal(false)
  }

  // =========================================================================
  // DIRECT INLINE ROW INSERTION (Table Hover / Plus Icon - No Dialog Box!)
  // =========================================================================
  const handleDirectInlineAddRow = (targetItem: InventoryItem) => {
    const sheet = { ...computedActiveSheet }
    const currentList = [...sheet.items]

    // Find the last index of this bill in currentList so new row is inserted directly into the same bill group
    let insertIndex = -1
    for (let i = currentList.length - 1; i >= 0; i--) {
      const it = currentList[i]
      if (
        (it.billNo || '').trim().toLowerCase() === (targetItem.billNo || '').trim().toLowerCase() &&
        (it.companyName || it.partyName || '').trim().toLowerCase() === (targetItem.companyName || targetItem.partyName || '').trim().toLowerCase()
      ) {
        insertIndex = i
        break
      }
    }
    if (insertIndex === -1) {
      insertIndex = currentList.findIndex((it) => it.sNo === targetItem.sNo)
    }
    if (insertIndex === -1) {
      insertIndex = currentList.length - 1
    }

    const newRowId = `inw-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
    const newRow: InventoryItem = {
      id: newRowId,
      sNo: insertIndex + 2,
      date: targetItem.date,
      billNo: targetItem.billNo,
      inwardNo: targetItem.inwardNo,
      companyName: targetItem.companyName || targetItem.partyName || '',
      partyName: targetItem.partyName || targetItem.companyName || '',
      itemDescription: '',
      machineName: targetItem.machineName || 'G-6200',
      quantity: 1,
      costPerItem: 0,
      rate: 0,
      totalPrice: 0,
      totalAmount: 0,
      saraAp: 0,
      foiCashCheque: 0,
      balance: 0,
    }

    currentList.splice(insertIndex + 1, 0, newRow)

    let runBal = 0
    const reIndexed = currentList.map((it, idx) => {
      const q = Number(it.quantity) || 0
      const c = Number(it.costPerItem || it.rate) || 0
      const tot = Math.round(q * c)
      runBal += tot
      return {
        ...it,
        sNo: idx + 1,
        totalPrice: tot,
        totalAmount: tot,
        balance: runBal,
      }
    })

    const updatedMonths = {
      ...monthsData,
      [selectedMonth]: {
        ...sheet,
        items: reIndexed,
        itemsCount: reIndexed.length,
        totalAmount: runBal,
      },
    }

    persistMonths(updatedMonths)
    setInlineEditingId(newRowId)
  }

  // Handle live inline editing of cell values directly inside the table row
  const handleInlineCellChange = (
    rowIdx: number,
    field: 'itemDescription' | 'quantity' | 'costPerItem' | 'machineName',
    val: any
  ) => {
    const sheet = { ...computedActiveSheet }
    const items = [...sheet.items]
    if (!items[rowIdx]) return

    const current = { ...items[rowIdx], [field]: val }
    if (field === 'costPerItem') current.rate = val
    const q = Number(current.quantity) || 0
    const c = Number(current.costPerItem || current.rate) || 0
    current.totalPrice = Math.round(q * c)
    current.totalAmount = current.totalPrice
    items[rowIdx] = current

    let runBal = 0
    const reindexed = items.map((it, idx) => {
      const itemQ = Number(it.quantity) || 0
      const itemC = Number(it.costPerItem || it.rate) || 0
      const tot = Math.round(itemQ * itemC)
      runBal += tot
      return {
        ...it,
        sNo: idx + 1,
        totalPrice: tot,
        totalAmount: tot,
        balance: runBal,
      }
    })

    const updatedMonths = {
      ...monthsData,
      [selectedMonth]: {
        ...sheet,
        items: reindexed,
        itemsCount: reindexed.length,
        totalAmount: runBal,
      },
    }

    persistMonths(updatedMonths)
  }

  // =========================================================================
  // CONFIRMED DELETE HANDLER
  // =========================================================================
  const handleConfirmDelete = () => {
    if (!deleteTarget) return
    const idx = deleteTarget.index
    const itemToDelete = deleteTarget.item
    const sheet = { ...computedActiveSheet }
    const updated = sheet.items.filter((_, i) => i !== idx)

    // Re-index sNo and recalculate running balances
    let runBal = 0
    const reindexed = updated.map((it, i) => {
      const q = Number(it.quantity) || 0
      const c = Number(it.costPerItem || it.rate) || 0
      const tot = Math.round(q * c)
      runBal += tot
      return {
        ...it,
        sNo: i + 1,
        totalPrice: tot,
        totalAmount: tot,
        balance: runBal,
      }
    })

    const updatedMonths = {
      ...monthsData,
      [selectedMonth]: {
        ...sheet,
        items: reindexed,
        itemsCount: reindexed.length,
        totalAmount: runBal,
      },
    }
    persistMonths(updatedMonths)
    setDeleteTarget(null)
    showFeedback(`Purchase item #${itemToDelete.sNo} (${itemToDelete.itemDescription || 'Entry'}) deleted successfully!`)
  }

  // =========================================================================
  // GENERATE MONTH (Clean Database-backed month initialization)
  // =========================================================================
  const handleGenerateMonth = (e: React.FormEvent) => {
    e.preventDefault()
    const monthKey = genMonthName.trim()
    const fullKey = genYear === '2026' ? monthKey : `${monthKey} ${genYear}`

    if (monthsData[fullKey] && monthsData[fullKey].items && monthsData[fullKey].items.length > 0) {
      if (!confirm(`Month "${fullKey}" already exists with ${monthsData[fullKey].items.length} records. Switch to it?`)) {
        return
      }
      setSelectedMonth(fullKey)
      setShowGenerateMonthModal(false)
      return
    }

    const updatedMonths: Record<string, MonthlyInventorySheet> = {
      ...monthsData,
      [fullKey]: {
        month: fullKey,
        itemsCount: 0,
        totalAmount: 0,
        items: [],
      },
    }

    persistMonths(updatedMonths)
    setSelectedMonth(fullKey)
    setShowGenerateMonthModal(false)
  }

  // Export CSV
  const exportCSV = () => {
    const headers = [
      'S.No',
      'Date',
      'Bill No',
      'Inw No',
      'Party Name',
      'Description',
      'Machine Type',
      'Qty',
      'Rate (PKR)',
      'Total Amount (PKR)',
      'Balance (PKR)',
    ]
    const rows = filteredItems.map((it) => [
      it.sNo,
      `"${it.date || ''}"`,
      `"${it.billNo || ''}"`,
      `"${it.inwardNo || ''}"`,
      `"${it.companyName || ''}"`,
      `"${it.itemDescription || ''}"`,
      `"${it.machineName || ''}"`,
      it.quantity,
      it.costPerItem,
      it.totalPrice,
      it.balance || 0,
    ])
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Sara_Textile_Daily_Inward_${selectedMonth}_2026.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print()
  }

  // Calculated Add Entry totals
  const addModalTotalAmount = useMemo(() => {
    return itemRows.reduce((sum, r) => {
      const q = Number(r.quantity) || 0
      const c = Number(r.costPerItem) || 0
      return sum + Math.round(q * c)
    }, 0)
  }, [itemRows])



  const formattedMonthTitle = selectedMonth.includes('2026') ? selectedMonth : `${selectedMonth} 2026`

  return (
    <div className="space-y-4">
      {/* Page Header with Consistent Clean Layout */}
      <PageHeader
        title={`Month of ${formattedMonthTitle}`}
        showTitle={false}
        breadcrumbs={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accounts', href: '/accounts/inventory-inward' },
          { label: 'Daily Inward & Expenses' },
        ]}
        actions={
          <div className="flex flex-wrap items-center justify-between gap-3 w-full">
            {/* Left Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  setEntryDate(`2026-09-${String(now.getDate()).padStart(2, '0')}`)
                  setEntryInwardNo(getNextInwardNo())
                  setEntryPartyName('')
                  setEntryPartyType('Trader')
                  setIsCustomParty(false)
                  setShowAddModal(true)
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0066cc] hover:bg-[#0052a3] text-white shadow-xs transition-all cursor-pointer !min-h-9 !h-9"
              >
                <PlusCircle className="size-4" />
                <span>Add Entry</span>
              </button>

              <button
                type="button"
                onClick={() => setShowGenerateMonthModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer !min-h-9 !h-9"
              >
                <Calendar className="size-3.5" />
                <span>Generate Month</span>
              </button>
            </div>

            {/* Right Tools: Month Switcher, Export, Print */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-background border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 shadow-2xs h-9">
                <Calendar className="size-3.5 text-muted-foreground" />
                <select
                  value={selectedMonth}
                  onChange={(e) => handleSelectMonth(e.target.value)}
                  className="bg-transparent text-xs font-bold text-foreground focus:outline-hidden cursor-pointer"
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m} className="bg-background text-foreground">
                      {m.includes('2026') ? m : `${m} 2026`}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={exportCSV}
                className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800 dark:!text-slate-200 cursor-pointer"
              >
                <Download className="size-3.5" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800 dark:!text-slate-200 cursor-pointer"
              >
                <Printer className="size-3.5" />
                <span>Print</span>
              </button>
            </div>
          </div>
        }
      />

      {/* Floating Success Feedback Toast */}
      {feedbackMsg && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xl border border-slate-700/50 animate-in fade-in slide-in-from-top-3 duration-200">
          <CheckCircle2 className="size-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span className="text-xs font-semibold">{feedbackMsg.message}</span>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="ml-2 text-slate-400 hover:text-white dark:hover:text-black cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Main Table Card */}
      <div className="erp-card overflow-hidden">
        {/* Table Action Bar with Month Indicator */}
        <div className="p-3 border-b border-border flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Month Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs font-bold text-[#0066cc] dark:text-sky-300 shadow-2xs">
              <Calendar className="size-3.5" />
              <span>Month of {formattedMonthTitle}</span>
            </div>

            {/* Search Box */}
            <div className="relative w-60">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search description, party, bill..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#0066cc]"
              />
            </div>

            {/* Filter by Machine */}
            <div className="flex items-center gap-1.5 bg-background border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1">
              <Filter className="size-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground font-semibold">Machine:</span>
              <select
                value={filterMachine}
                onChange={(e) => setFilterMachine(e.target.value)}
                className="bg-transparent text-xs font-bold text-foreground focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">ALL Machines</option>
                {MACHINE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by Party Type */}
            <div className="flex items-center gap-1.5 bg-background border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1">
              <Building2 className="size-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground font-semibold">Party:</span>
              <select
                value={filterPartyType}
                onChange={(e) => setFilterPartyType(e.target.value as any)}
                className="bg-transparent text-xs font-bold text-foreground focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">All Parties</option>
                <option value="Trader">Traders Only</option>
                <option value="Workshop">Workshops Only</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {filteredItems.length} records
            </span>
            {isSaved && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold animate-pulse">
                <CheckCircle2 className="size-3.5" />
                Saved to Database
              </span>
            )}
          </div>
        </div>

        {/* Master Inward Table (Sara AP and FOI Cash/Cheq columns removed as requested) */}
        <div className="overflow-x-auto">
          <table
            style={{ minWidth: `${totalTableWidth}px`, tableLayout: 'fixed' }}
            className="w-full text-left border-collapse text-xs border border-slate-400 dark:border-slate-600 select-text"
          >
            <thead>
              <tr className="bg-slate-200/90 dark:bg-slate-800 border-b border-slate-400 dark:border-slate-600 print:table-row">
                <th
                  colSpan={11}
                  className="py-2 px-3 text-left font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-slate-100 border border-slate-400 dark:border-slate-600 bg-slate-200/80 dark:bg-slate-800"
                >
                  Daily Inward & Purchase Expenses • Month of {formattedMonthTitle}
                </th>
              </tr>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold uppercase text-[11px] border-b-2 border-slate-800 dark:border-slate-300">
                <th
                  style={{ width: `${colWidths.sNo}px` }}
                  className="relative py-2.5 px-2 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  S.No
                  <div
                    onMouseDown={(e) => startColResize('sNo', e)}
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.date}px` }}
                  className="relative py-2.5 px-2 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Date
                  <div
                    onMouseDown={(e) => startColResize('date', e)}
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.billNo}px` }}
                  className="relative py-2.5 px-2 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Bill No
                  <div
                    onMouseDown={(e) => startColResize('billNo', e)}
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.inwardNo}px` }}
                  className="relative py-2.5 px-2 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Inw. No
                  <div
                    onMouseDown={(e) => startColResize('inwardNo', e)}
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.partyName}px` }}
                  className="relative py-2.5 px-3 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Party Name
                  <div
                    onMouseDown={(e) => startColResize('partyName', e)}
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.description}px` }}
                  className="relative py-2.5 px-3 border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Description
                  <div
                    onMouseDown={(e) => startColResize('description', e)}
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.machineName}px` }}
                  className="relative py-2.5 px-2 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Machine Type
                  <div
                    onMouseDown={(e) => startColResize('machineName', e)}
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.quantity}px` }}
                  className="relative py-2.5 px-2 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Qty
                  <div
                    onMouseDown={(e) => startColResize('quantity', e)}
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.costPerItem}px` }}
                  className="relative py-2.5 px-2 text-right border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Rate
                  <div
                    onMouseDown={(e) => startColResize('costPerItem', e)}
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.totalPrice}px` }}
                  className="relative py-2.5 px-2 text-right border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Total Amount
                  <div
                    onMouseDown={(e) => startColResize('totalPrice', e)}
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.balance}px` }}
                  className="relative py-2.5 px-2 text-right border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Balance
                  <div
                    onMouseDown={(e) => startColResize('balance', e)}
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.actions}px` }}
                  className="relative py-2.5 px-2 text-center border border-slate-400 dark:border-slate-600 select-none group/th print:hidden"
                >
                  Actions
                  <div
                    onMouseDown={(e) => startColResize('actions', e)}
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] z-20"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-muted-foreground border border-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Receipt className="size-8 text-slate-400" />
                      <p className="font-semibold text-sm">No inward entries for {formattedMonthTitle}</p>
                      <p className="text-xs text-muted-foreground max-w-md">
                        Click the <strong>&quot;+ Add Entry&quot;</strong> button above to start entering bills for this month.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date()
                          setEntryDate(`2026-09-${String(now.getDate()).padStart(2, '0')}`)
                          setShowAddModal(true)
                        }}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0066cc] hover:bg-[#0052a3] text-white shadow-xs cursor-pointer"
                      >
                        <PlusCircle className="size-4" />
                        <span>Add First Entry</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const groupInfo = billGroups[idx] || {
                    invoiceIndex: idx,
                    isFirstInBill: true,
                    isLastInBill: true,
                    rowSpan: 1,
                  }
                  const isEvenInvoice = (groupInfo.invoiceIndex ?? 0) % 2 === 0
                  const isLastInBill = groupInfo.isLastInBill

                  return (
                    <tr
                      key={item.id || item.sNo}
                      className={cn(
                        'group transition-colors',
                        isEvenInvoice
                          ? 'bg-white dark:bg-slate-900'
                          : 'bg-slate-50/70 dark:bg-slate-800/40',
                        'hover:bg-blue-50/40 dark:hover:bg-slate-700/50'
                      )}
                    >
                      {/* S.No */}
                      <td
                        className={cn(
                          'py-2 px-2 text-center font-mono font-medium text-slate-600 dark:text-slate-400 border border-slate-400 dark:border-slate-600',
                          isLastInBill && 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                        )}
                      >
                        {item.sNo}
                      </td>

                      {/* Merged Date */}
                      {groupInfo.isFirstInBill && (
                        <td
                          rowSpan={groupInfo.rowSpan}
                          className={cn(
                            'py-2 px-2 font-mono text-center align-middle font-medium text-slate-800 dark:text-slate-200 border border-slate-400 dark:border-slate-600 border-b-2 border-b-slate-800 dark:border-b-slate-200 whitespace-nowrap',
                            isEvenInvoice ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/90 dark:bg-slate-800/70'
                          )}
                        >
                          {item.date || '-'}
                        </td>
                      )}

                      {/* Merged Bill No */}
                      {groupInfo.isFirstInBill && (
                        <td
                          rowSpan={groupInfo.rowSpan}
                          className={cn(
                            'py-2 px-2 font-mono text-center align-middle border border-slate-400 dark:border-slate-600 border-b-2 border-b-slate-800 dark:border-b-slate-200 whitespace-nowrap',
                            isEvenInvoice ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/90 dark:bg-slate-800/70'
                          )}
                        >
                          <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                            {item.billNo || '-'}
                          </span>
                        </td>
                      )}

                      {/* Merged Inward No */}
                      {groupInfo.isFirstInBill && (
                        <td
                          rowSpan={groupInfo.rowSpan}
                          className={cn(
                            'py-2 px-2 font-mono text-center align-middle font-bold text-[#0066cc] dark:text-sky-400 border border-slate-400 dark:border-slate-600 border-b-2 border-b-slate-800 dark:border-b-slate-200 whitespace-nowrap',
                            isEvenInvoice ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/90 dark:bg-slate-800/70'
                          )}
                        >
                          {item.inwardNo || '-'}
                        </td>
                      )}

                      {/* Merged Party Name with Authentic Pastel Tint from Excel */}
                      {groupInfo.isFirstInBill && (
                        <td
                          rowSpan={groupInfo.rowSpan}
                          className={cn(
                            'py-2 px-3 text-center align-middle whitespace-normal border border-slate-400 dark:border-slate-600 border-b-2 border-b-slate-800 dark:border-b-slate-200 transition-colors',
                            getCompanyTintStyle(item.companyName)
                          )}
                        >
                          <div className="font-bold text-xs">{item.companyName || '-'}</div>
                          {groupInfo.rowSpan > 1 && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono bg-black/10 dark:bg-white/20 text-foreground border border-black/10">
                              {groupInfo.rowSpan} items
                            </span>
                          )}
                        </td>
                      )}

                      {/* Item Description (Inline editable or with Hover "+ Add" Button) */}
                      <td
                        className={cn(
                          'py-2 px-3 text-slate-900 dark:text-slate-100 font-medium border border-slate-400 dark:border-slate-600',
                          isLastInBill && 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                        )}
                      >
                        {inlineEditingId === item.id ? (
                          <input
                            type="text"
                            autoFocus
                            placeholder="Enter description..."
                            value={item.itemDescription || ''}
                            onChange={(e) => handleInlineCellChange(item.sNo - 1, 'itemDescription', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') setInlineEditingId(null)
                            }}
                            className="w-full px-2 py-1 text-xs bg-white dark:bg-slate-900 border-2 border-[#0066cc] rounded font-medium focus:outline-hidden"
                          />
                        ) : (
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className="truncate text-slate-800 dark:text-slate-200 select-text"
                              title={item.itemDescription || ''}
                            >
                              {item.itemDescription || <span className="text-muted-foreground italic">Add description...</span>}
                            </span>
                            {/* Hover button to directly add another row to this bill without any dialog */}
                            <button
                              type="button"
                              onClick={() => handleDirectInlineAddRow(item)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 cursor-pointer shadow-2xs"
                              title={`Add another row to Bill #${item.billNo || '-'}`}
                            >
                              <Plus className="size-2.5" />
                              <span>Add</span>
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Machine Type (Fast interactive dropdown right in table!) */}
                      <td
                        className={cn(
                          'py-1 px-1 text-center border border-slate-400 dark:border-slate-600',
                          isLastInBill && 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                        )}
                      >
                        <select
                          value={item.machineName || 'G-6200'}
                          onChange={(e) => handleInlineMachineChange(item.sNo - 1, e.target.value)}
                          className={cn(
                            'w-full px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer border-0 shadow-2xs focus:ring-1 focus:ring-[#0066cc] uppercase tracking-wide text-center',
                            getMachineBadgeStyle(item.machineName)
                          )}
                        >
                          {MACHINE_OPTIONS.map((m) => (
                            <option key={m} value={m} className="bg-white text-slate-900 font-semibold">
                              {m}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Quantity */}
                      <td
                        className={cn(
                          'py-2 px-2 text-center font-mono font-semibold text-slate-800 dark:text-slate-200 border border-slate-400 dark:border-slate-600',
                          isLastInBill && 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                        )}
                      >
                        {inlineEditingId === item.id ? (
                          <input
                            type="number"
                            min={1}
                            value={item.quantity || ''}
                            onChange={(e) => handleInlineCellChange(item.sNo - 1, 'quantity', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setInlineEditingId(null)
                                showFeedback('Row updated successfully!')
                              }
                            }}
                            className="w-16 px-1.5 py-1 text-xs text-center font-mono font-bold bg-white dark:bg-slate-900 border-2 border-[#0066cc] rounded focus:outline-hidden"
                          />
                        ) : (
                          <span>{item.quantity}</span>
                        )}
                      </td>

                      {/* Rate */}
                      <td
                        className={cn(
                          'py-2 px-2 text-right font-mono text-slate-700 dark:text-slate-300 border border-slate-400 dark:border-slate-600',
                          isLastInBill && 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                        )}
                      >
                        {inlineEditingId === item.id ? (
                          <input
                            type="number"
                            min={0}
                            placeholder="Rate"
                            value={item.costPerItem || ''}
                            onChange={(e) => handleInlineCellChange(item.sNo - 1, 'costPerItem', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setInlineEditingId(null)
                                showFeedback('Row updated successfully!')
                              }
                            }}
                            className="w-20 px-1.5 py-1 text-xs text-right font-mono font-bold bg-white dark:bg-slate-900 border-2 border-[#0066cc] rounded focus:outline-hidden"
                          />
                        ) : (
                          <span>{formatNumber(item.costPerItem)}</span>
                        )}
                      </td>

                      {/* Total Amount */}
                      <td
                        className={cn(
                          'py-2 px-2 text-right font-mono font-bold text-slate-900 dark:text-slate-100 border border-slate-400 dark:border-slate-600',
                          isLastInBill && 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                        )}
                      >
                        {formatNumber(item.totalPrice)}
                      </td>

                      {/* Running Balance */}
                      <td
                        className={cn(
                          'py-2 px-2 text-right font-mono font-bold text-slate-950 dark:text-white border border-slate-400 dark:border-slate-600',
                          isLastInBill && 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                        )}
                      >
                        {formatNumber(item.balance || 0)}
                      </td>

                      {/* Actions */}
                      <td
                        className={cn(
                          'py-2 px-2 text-center print:hidden border border-slate-400 dark:border-slate-600',
                          isLastInBill && 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                        )}
                      >
                        <div className="flex items-center justify-center gap-1">
                          {inlineEditingId === item.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setInlineEditingId(null)
                                  showFeedback('Row updated successfully!')
                                }}
                                className="rounded p-1 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 cursor-pointer transition-colors"
                                title="Save changes"
                              >
                                <Check className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setInlineEditingId(null)}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                title="Cancel edit"
                              >
                                <X className="size-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              {/* Dedicated Plus button to directly insert new row without dialog */}
                              <button
                                type="button"
                                onClick={() => handleDirectInlineAddRow(item)}
                                className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer transition-colors"
                                title={`Add another description to Bill #${item.billNo || '-'}`}
                              >
                                <PlusCircle className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setInlineEditingId(item.id || null)}
                                className="rounded p-1 text-slate-500 hover:bg-blue-50 hover:text-[#0066cc] cursor-pointer transition-colors"
                                title="Edit row inline"
                              >
                                <Edit2 className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ index: item.sNo - 1, item })}
                                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer transition-colors"
                                title="Delete row"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>

            {/* Total Footer Row */}
            {filteredItems.length > 0 && (
              <tfoot>
                <tr className="bg-slate-200 dark:bg-slate-800/80 font-black text-xs border-t-2 border-slate-800 dark:border-slate-200">
                  <td colSpan={7} className="py-2.5 px-3 text-right uppercase tracking-wider border border-slate-400 dark:border-slate-600">
                    Grand Total ({formattedMonthTitle}):
                  </td>
                  <td className="py-2.5 px-2 text-center font-mono border border-slate-400 dark:border-slate-600">
                    {formatNumber(filteredItems.reduce((s, it) => s + (it.quantity || 0), 0))}
                  </td>
                  <td className="py-2.5 px-2 text-right border border-slate-400 dark:border-slate-600">-</td>
                  <td className="py-2.5 px-2 text-right font-mono text-[#0066cc] dark:text-sky-400 border border-slate-400 dark:border-slate-600">
                    {formatNumber(filteredItems.reduce((s, it) => s + (it.totalPrice || 0), 0))}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-purple-700 dark:text-purple-300 border border-slate-400 dark:border-slate-600">
                    {formatNumber(filteredItems[filteredItems.length - 1]?.balance || 0)}
                  </td>
                  <td className="border border-slate-400 dark:border-slate-600 print:hidden" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MULTI-ITEM "ADD ENTRY" MODAL (NEW INVOICE BILL)                       */}
      {/* ===================================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-6xl bg-background rounded-xl border border-border shadow-2xl overflow-hidden my-6">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <Receipt className="size-5 text-[#0066cc]" />
                <h3 className="font-bold text-base text-foreground">Add Inward / Purchase Entry</h3>
                <span className="ml-2 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 dark:bg-blue-950/60 text-[#0066cc]">
                  Month: {formattedMonthTitle}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleAddEntrySubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
              {/* Header Fields: Date, Bill No, Inward No, Party Name (Wide Party, Compact Bill & Inward) */}
              <div className="grid grid-cols-12 gap-3 p-4 rounded-lg bg-slate-50/70 dark:bg-slate-800/30 border border-border">
                {/* Date */}
                <div className="col-span-12 sm:col-span-6 md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-background border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-[#0066cc] font-mono"
                  />
                </div>

                {/* Bill No (Compact) */}
                <div className="col-span-6 sm:col-span-3 md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Bill No *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 702"
                    value={entryBillNo}
                    onChange={(e) => setEntryBillNo(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-background border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-[#0066cc] font-mono font-bold"
                  />
                </div>

                {/* Inward No (Compact) */}
                <div className="col-span-6 sm:col-span-3 md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Inward No *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 7654"
                    value={entryInwardNo}
                    onChange={(e) => setEntryInwardNo(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-background border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-[#0066cc] font-mono text-[#0066cc] font-bold"
                  />
                </div>

                {/* Party Name (Wide - spans 6 cols) with Interactive Trader/Workshop Switcher & Distinct Dropdowns */}
                <div className="col-span-12 md:col-span-6">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {entryPartyType === 'Workshop' ? 'Workshop Vendor *' : 'Trader Party *'}
                    </label>

                    {/* Interactive Clickable Switcher (Trader / Workshop) */}
                    <div className="inline-flex items-center rounded-lg bg-slate-200/90 dark:bg-slate-800 p-0.5 border border-slate-300 dark:border-slate-700 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => {
                          setEntryPartyType('Trader')
                          setEntryPartyName('')
                          setIsCustomParty(false)
                        }}
                        className={cn(
                          'px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1',
                          entryPartyType === 'Trader'
                            ? 'bg-[#0066cc] text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        )}
                        title="Click to switch to Trader parties"
                      >
                        <span>Trader</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEntryPartyType('Workshop')
                          setEntryPartyName('')
                          setIsCustomParty(false)
                        }}
                        className={cn(
                          'px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1',
                          entryPartyType === 'Workshop'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        )}
                        title="Click to switch to Workshop vendors"
                      >
                        <span>Workshop</span>
                      </button>
                    </div>
                  </div>

                  {/* Separate Dropdown based on whether Trader or Workshop is active */}
                  {entryPartyType === 'Trader' ? (
                    <div className="space-y-1.5">
                      {!isCustomParty ? (
                        <select
                          required
                          value={entryPartyName}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setIsCustomParty(true)
                              setEntryPartyName('')
                            } else {
                              setEntryPartyName(e.target.value)
                            }
                          }}
                          className="w-full px-3 py-1.5 text-xs bg-background border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-[#0066cc] font-bold cursor-pointer text-slate-900 dark:text-slate-100"
                        >
                          <option value="">-- Select Trader Party ({traderOptions.length}) --</option>
                          {traderOptions.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                          <option value="__custom__">+ Enter Custom / Other Trader Name...</option>
                        </select>
                      ) : (
                        <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                          <input
                            type="text"
                            required
                            autoFocus
                            placeholder="Type new trader party name..."
                            value={entryPartyName}
                            onChange={(e) => setEntryPartyName(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs bg-background border-2 border-[#0066cc] rounded-lg focus:outline-hidden font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomParty(false)
                              setEntryPartyName('')
                            }}
                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700 shrink-0 cursor-pointer"
                            title="Back to Trader dropdown list"
                          >
                            Choose from list
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {!isCustomParty ? (
                        <select
                          required
                          value={entryPartyName}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setIsCustomParty(true)
                              setEntryPartyName('')
                            } else {
                              setEntryPartyName(e.target.value)
                            }
                          }}
                          className="w-full px-3 py-1.5 text-xs bg-background border border-amber-300 dark:border-amber-700 rounded-lg focus:ring-1 focus:ring-amber-600 font-bold cursor-pointer text-slate-900 dark:text-slate-100"
                        >
                          <option value="">-- Select Workshop Vendor ({workshopOptions.length}) --</option>
                          {workshopOptions.map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))}
                          <option value="__custom__">+ Enter Custom / Other Workshop Name...</option>
                        </select>
                      ) : (
                        <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                          <input
                            type="text"
                            required
                            autoFocus
                            placeholder="Type new workshop vendor name..."
                            value={entryPartyName}
                            onChange={(e) => setEntryPartyName(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs bg-background border-2 border-amber-500 rounded-lg focus:outline-hidden font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomParty(false)
                              setEntryPartyName('')
                            }}
                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700 shrink-0 cursor-pointer"
                            title="Back to Workshop dropdown list"
                          >
                            Choose from list
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Dynamic Descriptions Section */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-foreground">
                      Item Descriptions in this Bill:
                    </span>
                    {/* Sleek Counter Pill: [ - ] [ count ] [ + ] */}
                    <div className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-background overflow-hidden shadow-2xs h-7">
                      <button
                        type="button"
                        onClick={() => handleDescriptionCountChange(Math.max(1, descriptionCount - 1))}
                        className="px-2 py-0 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors font-bold text-xs cursor-pointer h-full border-r border-slate-200 dark:border-slate-700"
                        title="Decrease row count"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={descriptionCount}
                        onChange={(e) => handleDescriptionCountChange(parseInt(e.target.value, 10))}
                        className="w-10 text-center text-xs font-bold font-mono py-0 focus:outline-hidden bg-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => handleDescriptionCountChange(Math.min(20, descriptionCount + 1))}
                        className="px-2 py-0 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors font-bold text-xs cursor-pointer h-full border-l border-slate-200 dark:border-slate-700"
                        title="Increase row count"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={addItemDraftRow}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0066cc] hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-900 cursor-pointer transition-colors"
                  >
                    <Plus className="size-3.5" />
                    <span>Add Another Description</span>
                  </button>
                </div>

                {/* Line Items Table with Column Headers */}
                <div className="border border-border rounded-lg overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-border">
                        <th className="py-2.5 px-2.5 w-10 text-center">#</th>
                        <th className="py-2.5 px-3 min-w-[220px]">Item Description *</th>
                        <th className="py-2.5 px-2 w-32">Machine Type</th>
                        <th className="py-2.5 px-2 w-20 text-center">Qty *</th>
                        <th className="py-2.5 px-2 w-28 text-right">Rate (PKR) *</th>
                        <th className="py-2.5 px-3 w-40 text-right">Total Price (PKR)</th>
                        <th className="py-2.5 px-2 w-12 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {itemRows.map((row, idx) => (
                        <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="py-2 px-2.5 text-center font-mono font-bold text-muted-foreground">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              required
                              placeholder="Item Description (e.g. Servo Motor)"
                              value={row.description}
                              onChange={(e) => updateItemDraftRow(idx, 'description', e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs bg-background border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-[#0066cc] font-medium"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <select
                              value={row.machineName}
                              onChange={(e) => updateItemDraftRow(idx, 'machineName', e.target.value)}
                              className="w-full px-2 py-1.5 text-xs font-bold bg-background border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-[#0066cc] cursor-pointer"
                            >
                              {MACHINE_OPTIONS.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              min={1}
                              required
                              placeholder="Qty"
                              value={row.quantity}
                              onChange={(e) => updateItemDraftRow(idx, 'quantity', e.target.value)}
                              className="w-full px-2 py-1.5 text-xs text-center font-mono font-bold bg-background border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-[#0066cc]"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              min={0}
                              required
                              placeholder="Rate"
                              value={row.costPerItem}
                              onChange={(e) => updateItemDraftRow(idx, 'costPerItem', e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs text-right font-mono font-bold bg-background border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-[#0066cc]"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            {/* Dedicated Spacious Total Price Chip: never clips */}
                            <div className="w-36 ml-auto px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono font-bold text-xs text-right border border-slate-200 dark:border-slate-700 whitespace-nowrap shadow-2xs">
                              {formatNumber(row.totalPrice)}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-center">
                            {itemRows.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => removeItemDraftRow(idx)}
                                className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
                                title="Remove row"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Remarks Section */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Remarks / Invoice Notes
                </label>
                <input
                  type="text"
                  placeholder="Optional remarks"
                  value={entryRemarks}
                  onChange={(e) => setEntryRemarks(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-background border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-[#0066cc]"
                />
              </div>

              {/* Live Calculation Summary */}
              <div className="flex flex-wrap items-center justify-between p-3.5 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60">
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground">Total Line Items: </span>
                    <span className="font-bold font-mono">{itemRows.length}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Bill Amount: </span>
                    <span className="font-bold font-mono text-[#0066cc] dark:text-sky-400">
                      {formatCurrency(addModalTotalAmount)}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-muted-foreground">Net Addition to Balance: </span>
                  <span className="text-sm font-black font-mono text-purple-700 dark:text-purple-300">
                    +{formatCurrency(addModalTotalAmount)}
                  </span>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold bg-[#0066cc] hover:bg-[#0052a3] text-white shadow-xs transition-all cursor-pointer"
                >
                  <Save className="size-4" />
                  <span>Save Bill Entry</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* CUSTOM DELETE CONFIRMATION MODAL                                     */}
      {/* ===================================================================== */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-background rounded-xl border border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-rose-50/70 dark:bg-rose-950/30">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="size-5" />
                <h3 className="font-bold text-sm text-foreground">Confirm Delete Entry</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Are you sure you want to delete this purchase entry? This action will permanently remove it and automatically recalculate running balances.
              </p>

              <div className="p-3.5 rounded-lg border border-border bg-slate-50 dark:bg-slate-800/50 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-medium">S.No & Date:</span>
                  <span className="font-mono font-bold text-foreground">
                    #{deleteTarget.item.sNo} • {deleteTarget.item.date}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-medium">Bill / Inward:</span>
                  <span className="font-mono font-bold text-foreground">
                    Bill #{deleteTarget.item.billNo || '-'} (Inw #{deleteTarget.item.inwardNo || '-'})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-medium">Party:</span>
                  <span className="font-bold text-foreground">
                    {deleteTarget.item.companyName || deleteTarget.item.partyName || '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-medium">Description:</span>
                  <span className="font-semibold text-foreground truncate max-w-[200px]">
                    {deleteTarget.item.itemDescription || '-'}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-border">
                  <span className="text-muted-foreground font-medium">Amount:</span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                    {formatCurrency(deleteTarget.item.totalPrice)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer"
                >
                  <Trash2 className="size-3.5" />
                  <span>Yes, Delete Entry</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* GENERATE NEW MONTH MODAL                                              */}
      {/* ===================================================================== */}
      {showGenerateMonthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-background rounded-xl border border-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-foreground">Generate New Accounting Month</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGenerateMonthModal(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleGenerateMonth} className="p-6 space-y-4">
              <p className="text-xs text-muted-foreground">
                Generate a fresh accounting month in PostgreSQL. All inward purchases and balances will start clean for your new entries.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Select Month
                </label>
                <select
                  value={genMonthName}
                  onChange={(e) => setGenMonthName(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold bg-background border border-slate-300 dark:border-slate-700 rounded-lg cursor-pointer"
                >
                  {ALL_MONTH_NAMES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Year
                </label>
                <input
                  type="text"
                  value={genYear}
                  onChange={(e) => setGenYear(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold bg-background border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowGenerateMonthModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer"
                >
                  <Calendar className="size-4" />
                  <span>Generate Month</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
