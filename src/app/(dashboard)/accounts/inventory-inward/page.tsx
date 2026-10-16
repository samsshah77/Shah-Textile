'use client'

import { useState, useMemo, useEffect } from 'react'
import { accountsData, InventoryItem, MonthlyInventorySheet } from '@/data/accountsData'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import {
  PackageCheck,
  Building2,
  Search,
  CheckCircle2,
  Cpu,
  Printer,
  Download,
  Calendar,
  Layers,
  Filter,
  PlusCircle,
  Edit2,
  Trash2,
  Save,
  RotateCcw,
  X,
  Check,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { accountsRead, accountsWrite } from '@/services/accountsStore'
import { ACCOUNTS_KEYS } from '@/lib/accountsKeys'

const MONTH_KEYS = [
  'January',
  'Febraury',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
] as const

const STORAGE_KEY_INVENTORY = ACCOUNTS_KEYS.INVENTORY_CONTROL

export default function InventoryInwardPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>('August')
  const [search, setSearch] = useState('')
  const [filterMachine, setFilterMachine] = useState<string>('ALL')

  const [monthsData, setMonthsData] = useState<Record<string, MonthlyInventorySheet>>(() => {
    const raw = accountsRead(STORAGE_KEY_INVENTORY, accountsData.inventoryControl.months)
    if (raw && typeof raw === 'object' && raw['September']) {
      if (raw['September'].items && raw['September'].items.length > 0) {
        const next = {
          ...raw,
          September: {
            ...raw['September'],
            items: [],
            itemsCount: 0,
            totalAmount: 0,
          },
        }
        accountsWrite(STORAGE_KEY_INVENTORY, next)
        return next
      }
    }
    return raw
  })

  const [isSaved, setIsSaved] = useState(false)

  const availableMonths = useMemo(() => {
    return Object.keys(monthsData)
  }, [monthsData])

  // Table Edit Mode Toggle
  const [isEditMode, setIsEditMode] = useState(false)

  // Editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Partial<InventoryItem>>({})

  // Add Item Modal (Formal Dialog Box)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newDate, setNewDate] = useState('2026-08-31')
  const [newBillNo, setNewBillNo] = useState('')
  const [newInwardNo, setNewInwardNo] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newCompany, setNewCompany] = useState('')
  const [newMachine, setNewMachine] = useState('PU')
  const [newQuantity, setNewQuantity] = useState<number | string>(1)
  const [newCost, setNewCost] = useState<number | string>('')

  // Edit Item Modal (Formal Dialog Box for correcting mistakes)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editBillNo, setEditBillNo] = useState('')
  const [editInwardNo, setEditInwardNo] = useState('')
  const [editCompany, setEditCompany] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editMachine, setEditMachine] = useState('PU')
  const [editQuantity, setEditQuantity] = useState<number | string>(1)
  const [editCost, setEditCost] = useState<number | string>('')

  // Generate New Month Confirmation Modal (Centralized Primary Generator)
  const [showGenerateMonthModal, setShowGenerateMonthModal] = useState(false)
  const [monthToGenerate, setMonthToGenerate] = useState('September')
  const [yearToGenerate, setYearToGenerate] = useState('2026')

  // =========================================================================
  // INTERACTIVE COLUMN RESIZING (EXCEL DRAGGABLE COLUMNS) & COLOR HELPERS
  // =========================================================================
  const DEFAULT_INVENTORY_COL_WIDTHS: Record<string, number> = {
    sNo: 50,
    date: 95,
    billNo: 85,
    inwardNo: 85,
    description: 280,
    companyName: 190,
    machineName: 90,
    quantity: 75,
    costPerItem: 105,
    totalPrice: 125,
    actions: 75,
  }

  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('sara_inventory_col_widths')
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
          localStorage.setItem('sara_inventory_col_widths', JSON.stringify(latest))
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
      localStorage.removeItem('sara_inventory_col_widths')
    } catch {}
  }

  const totalTableWidth = useMemo(() => {
    return Object.values(colWidths).reduce((sum, w) => sum + w, 0)
  }, [colWidths])

  const getCompanyTintStyle = (company: string) => {
    const c = (company || '').toLowerCase()
    if (c.includes('gq fire')) return 'bg-[#e8dac8] text-amber-950 font-bold'
    if (c.includes('textile engineering')) return 'bg-[#dcfce7] text-emerald-950 font-bold'
    if (c.includes('muhammad ali')) return 'bg-[#ede9fe] text-purple-950 font-bold'
    if (c.includes('vip petroleum')) return 'bg-[#e0f2fe] text-sky-950 font-bold'
    if (c.includes('janjoha')) return 'bg-[#ffedd5] text-orange-950 font-bold'
    if (c.includes('f.t') || c.includes('ft traders')) return 'bg-[#fed7aa] text-amber-950 font-bold'
    if (c.includes('blue reed')) return 'bg-[#bfdbfe] text-blue-950 font-bold'
    return 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold'
  }

  const getMachineBadgeStyle = (machine: string) => {
    const m = (machine || '').trim().toUpperCase()
    if (m === 'ALL') return 'bg-red-600 text-white font-bold'
    if (m === 'PU') return 'bg-emerald-600 text-white font-bold'
    if (m.includes('6300')) return 'bg-blue-600 text-white font-bold'
    if (m.includes('6200')) return 'bg-teal-600 text-white font-bold'
    if (m === 'FOI') return 'bg-slate-500 text-white font-bold'
    if (m.toLowerCase().includes('electron')) return 'bg-purple-600 text-white font-bold'
    return 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold'
  }

  // =========================================================================
  // REACTIVE FORMULAS COMPUTATION
  // =========================================================================
  // For each month, each item Total Price = Quantity * Cost Per Item
  // Month Total = =SUM(Total Price of all items)
  // Grand Total = =SUM(All Month Totals)
  const computedMonths = useMemo(() => {
    const res: Record<string, MonthlyInventorySheet> = {}
    Object.entries(monthsData).forEach(([mName, sheet]) => {
      const computedItems = (sheet.items || []).map((it, idx) => {
        const qty = Number(it.quantity) || 0
        const cost = Number(it.costPerItem) || 0
        const totalPrice = qty * cost

        return {
          ...it,
          sNo: idx + 1,
          totalPrice,
        }
      })

      const totalAmount = computedItems.reduce((s, it) => s + it.totalPrice, 0)
      res[mName] = {
        month: mName,
        itemsCount: computedItems.length,
        totalAmount,
        items: computedItems,
      }
    })
    return res
  }, [monthsData])

  const activeMonthSheet = useMemo(() => {
    return computedMonths[selectedMonth] || { month: selectedMonth, totalAmount: 0, itemsCount: 0, items: [] }
  }, [computedMonths, selectedMonth])

  const grandTotal = useMemo(() => {
    return Object.values(computedMonths).reduce((s, m) => s + m.totalAmount, 0)
  }, [computedMonths])

  const totalItemsCount = useMemo(() => {
    return Object.values(computedMonths).reduce((s, m) => s + m.itemsCount, 0)
  }, [computedMonths])

  // Unique machines in current month
  const uniqueMachines = useMemo(() => {
    const set = new Set<string>()
    activeMonthSheet.items.forEach((it) => {
      if (it.machineName) set.add(it.machineName.trim())
    })
    return Array.from(set).sort()
  }, [activeMonthSheet])

  // Filtered items
  const filteredItems = useMemo(() => {
    return activeMonthSheet.items.filter((item) => {
      const q = search.toLowerCase()
      const matchSearch =
        !q ||
        item.itemDescription.toLowerCase().includes(q) ||
        item.companyName.toLowerCase().includes(q) ||
        item.billNo.toLowerCase().includes(q) ||
        item.inwardNo.toLowerCase().includes(q) ||
        item.machineName.toLowerCase().includes(q)

      const matchMachine = filterMachine === 'ALL' || item.machineName.trim() === filterMachine

      return matchSearch && matchMachine
    })
  }, [activeMonthSheet, search, filterMachine])

  const filteredTotal = useMemo(() => {
    return filteredItems.reduce((s, it) => s + (it.totalPrice || 0), 0)
  }, [filteredItems])

  // Group consecutive items by same Invoice / Bill No & Company
  const billGroups = useMemo(() => {
    if (editingIndex !== null) {
      return filteredItems.map((_, idx) => ({
        invoiceIndex: idx,
        isFirstInBill: true,
        isLastInBill: true,
        rowSpan: 1,
        billTotal: filteredItems[idx]?.totalPrice || 0,
      }))
    }

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
  }, [filteredItems, editingIndex])

  // Persistence helpers
  const saveMonthsData = (updated: Record<string, MonthlyInventorySheet>) => {
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

  const handleReset = () => {
    if (confirm('Reset Store Inventory Control to authentic Excel defaults (418 purchases • PKR 4,070,962)?')) {
      saveMonthsData(accountsData.inventoryControl.months)
    }
  }

  // Row inline edit
  const startEdit = (idx: number, item: InventoryItem) => {
    setEditingIndex(idx)
    setEditForm({ ...item })
  }

  const saveEdit = (idx: number) => {
    const sheet = { ...activeMonthSheet }
    const updatedItems = [...sheet.items]
    const qty = Number(editForm.quantity) || 0
    const cost = Number(editForm.costPerItem) || 0
    const totalPrice = qty * cost

    updatedItems[idx] = {
      ...updatedItems[idx],
      ...editForm,
      quantity: qty,
      costPerItem: cost,
      totalPrice,
    } as InventoryItem

    const updatedMonths = {
      ...monthsData,
      [selectedMonth]: {
        ...sheet,
        items: updatedItems,
        totalAmount: updatedItems.reduce((s, i) => s + i.totalPrice, 0),
        itemsCount: updatedItems.length,
      },
    }

    saveMonthsData(updatedMonths)
    setEditingIndex(null)
    setEditForm({})
  }

  const cancelEdit = () => {
    setEditingIndex(null)
    setEditForm({})
  }

  const deleteRow = (idx: number) => {
    if (confirm(`Delete purchase item #${idx + 1}? Monthly and grand totals will recalculate live.`)) {
      const sheet = { ...activeMonthSheet }
      const updatedItems = sheet.items.filter((_, i) => i !== idx)
      const updatedMonths = {
        ...monthsData,
        [selectedMonth]: {
          ...sheet,
          items: updatedItems,
          totalAmount: updatedItems.reduce((s, i) => s + i.totalPrice, 0),
          itemsCount: updatedItems.length,
        },
      }
      saveMonthsData(updatedMonths)
    }
  }

  // Add new purchase
  // Add new purchase (Formal Dialog Box)
  const handleAddNewPurchase = (e: React.FormEvent) => {
    e.preventDefault()
    const qty = Number(newQuantity) || 1
    const cost = Number(newCost) || 0
    if (!newDescription || cost <= 0) return

    const totalPrice = qty * cost
    const newItem: InventoryItem = {
      sNo: activeMonthSheet.items.length + 1,
      date: newDate,
      billNo: newBillNo,
      inwardNo: newInwardNo,
      itemDescription: newDescription,
      companyName: newCompany,
      machineName: newMachine,
      quantity: qty,
      costPerItem: cost,
      totalPrice,
    }

    const updatedItems = [...activeMonthSheet.items, newItem]
    const updatedMonths = {
      ...monthsData,
      [selectedMonth]: {
        ...activeMonthSheet,
        items: updatedItems,
        totalAmount: updatedItems.reduce((s, i) => s + i.totalPrice, 0),
        itemsCount: updatedItems.length,
      },
    }

    saveMonthsData(updatedMonths)

    // Automatic ERP routing: Post into Daily Inward Expenses register
    try {
      const expenseKey = ACCOUNTS_KEYS.DAILY_INWARD_MONTHS
      const existingExpense = accountsRead<Record<string, any[]>>(expenseKey, {}) || {}
      const monthKey = `${selectedMonth} 2026`
      const currentList = existingExpense[monthKey] || []
      const prevBal = currentList.length > 0 ? (Number(currentList[currentList.length - 1].balance) || 0) : 0
      const newDailyItem = {
        sNo: currentList.length + 1,
        date: newDate,
        billNo: newBillNo,
        inwardNo: newInwardNo,
        partyName: newCompany,
        itemDescription: newDescription,
        quantity: qty,
        rate: cost,
        totalAmount: totalPrice,
        saraAp: totalPrice,
        foiCashCheque: 0,
        balance: prevBal + totalPrice,
      }
      existingExpense[monthKey] = [...currentList, newDailyItem]
      accountsWrite(expenseKey, existingExpense)
    } catch (err) {
      console.error('Error auto-syncing to daily expense:', err)
    }

    // Reset modal
    setNewDescription('')
    setNewCost('')
    setNewQuantity(1)
    setShowAddModal(false)
  }

  // Open Formal Edit Dialog Box (for cleanly fixing any mistake)
  const openFormalEditDialog = (idx: number, item: InventoryItem) => {
    setEditingRowIndex(idx)
    setEditDate(item.date || '')
    setEditBillNo(item.billNo || '')
    setEditInwardNo(item.inwardNo || '')
    setEditCompany(item.companyName || '')
    setEditDescription(item.itemDescription || '')
    setEditMachine(item.machineName || 'PU')
    setEditQuantity(item.quantity)
    setEditCost(item.costPerItem)
    setShowEditModal(true)
  }

  // Save Formal Edit Dialog Box
  const handleSaveFormalEdit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingRowIndex === null) return

    const sheet = { ...activeMonthSheet }
    const updatedItems = [...sheet.items]
    const qty = Number(editQuantity) || 0
    const cost = Number(editCost) || 0
    const totalPrice = qty * cost

    updatedItems[editingRowIndex] = {
      ...updatedItems[editingRowIndex],
      date: editDate,
      billNo: editBillNo,
      inwardNo: editInwardNo,
      companyName: editCompany,
      itemDescription: editDescription,
      machineName: editMachine,
      quantity: qty,
      costPerItem: cost,
      totalPrice,
    }

    const updatedSheet: MonthlyInventorySheet = {
      ...sheet,
      items: updatedItems,
      itemsCount: updatedItems.length,
      totalAmount: updatedItems.reduce((s, it) => s + it.totalPrice, 0),
    }

    saveMonthsData({
      ...monthsData,
      [selectedMonth]: updatedSheet,
    })

    setShowEditModal(false)
    setEditingRowIndex(null)
  }

  // Centralized Primary Month Generator with Confirmation
  const handleConfirmGenerateMonth = (e: React.FormEvent) => {
    e.preventDefault()
    const targetMonth = monthToGenerate.trim()
    if (!targetMonth) return

    if (monthsData[targetMonth]) {
      alert(`${targetMonth} 2026 register already exists! Switched to it.`)
      setSelectedMonth(targetMonth)
      setShowGenerateMonthModal(false)
      return
    }

    const updated = {
      ...monthsData,
      [targetMonth]: {
        month: targetMonth,
        totalAmount: 0,
        itemsCount: 0,
        items: [],
      },
    }

    saveMonthsData(updated)
    setSelectedMonth(targetMonth)
    setShowGenerateMonthModal(false)

    // Auto-sync to Daily Inward Expenses
    try {
      const expenseKey = ACCOUNTS_KEYS.DAILY_INWARD_MONTHS
      const existingExpense = accountsRead<Record<string, any>>(expenseKey, {}) || {}
      const monthKey = `${targetMonth} ${yearToGenerate}`
      if (!existingExpense[monthKey]) {
        existingExpense[monthKey] = []
        accountsWrite(expenseKey, existingExpense)
      }
    } catch (err) {
      console.error('Error auto-syncing month to daily expense:', err)
    }
  }

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  const exportCSV = () => {
    const headers = ['S.No', 'Date Of Purchase', 'Bill No', 'In No', 'Item Description', 'Company/Trader Name', 'Machine Name', 'Quantity', 'Cost Per Item', 'Total Price']
    const rows = filteredItems.map((item) => [
      item.sNo,
      item.date,
      `"${item.billNo}"`,
      `"${item.inwardNo}"`,
      `"${item.itemDescription}"`,
      `"${item.companyName}"`,
      `"${item.machineName}"`,
      item.quantity,
      item.costPerItem,
      item.totalPrice,
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Sara_Textile_Store_Inventory_${selectedMonth}_2026.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="print:hidden">
        <PageHeader
          title="Store Inventory Control"
          showTitle={false}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Accounts', href: '/accounts/inventory-inward' },
            { label: 'Store Inventory' },
          ]}
          actions={
            <>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="erp-btn-primary text-xs !min-h-9 !h-9"
                >
                  <PlusCircle className="size-3.5" />
                  <span>Add Item</span>
                </button>
              </div>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleReset}
                  title="Reset to Excel authentic data"
                  className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800"
                >
                  <RotateCcw className="size-3.5" />
                  <span>Reset</span>
                </button>
                <button
                  type="button"
                  onClick={exportCSV}
                  className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800"
                >
                  <Download className="size-3.5" />
                  <span>Export</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="erp-btn-primary text-xs !min-h-9 !h-9"
                >
                  <Printer className="size-3.5" />
                  <span>Print</span>
                </button>
              </div>
            </>
          }
        />
      </div>

      {/* Save Toast Notification */}
      {isSaved && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2 animate-in fade-in print:hidden">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span>Formulas recalculated and store inventory updated successfully!</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. COMPACT TOOLBAR: MONTH DROPDOWN, MACHINE FILTER, SEARCH & GENERATE     */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-border pb-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Month Dropdown Selector */}
          <div className="flex items-center gap-1.5">
            <Calendar className="size-4 text-[#0066cc]" />
            <span className="text-xs font-bold text-foreground">Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value)
                setFilterMachine('ALL')
                setEditingIndex(null)
              }}
              className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground focus:border-[#0066cc] focus:outline-hidden cursor-pointer shadow-2xs"
            >
              {availableMonths.map((m) => {
                const sheet = computedMonths[m]
                const count = sheet ? sheet.itemsCount : 0
                return (
                  <option key={m} value={m}>
                    {m} 2026 ({count} items)
                  </option>
                )
              })}
            </select>
          </div>

          {/* Machine Filter */}
          <div className="flex items-center gap-1.5">
            <Cpu className="size-4 text-muted-foreground" />
            <select
              value={filterMachine}
              onChange={(e) => setFilterMachine(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground focus:border-blue-500 focus:outline-hidden cursor-pointer shadow-2xs"
            >
              <option value="ALL">All Machines ({uniqueMachines.length})</option>
              {uniqueMachines.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {filterMachine !== 'ALL' && (
            <button
              onClick={() => setFilterMachine('ALL')}
              className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
            >
              Reset
            </button>
          )}

          {/* Centralized Primary Month Generator with Confirmation */}
          <button
            type="button"
            onClick={() => setShowGenerateMonthModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-dashed border-[#0066cc]/60 bg-blue-50/50 dark:bg-blue-950/20 text-[#0066cc] hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer transition-colors shadow-2xs"
            title="Generate new month with confirmation"
          >
            <PlusCircle className="size-3.5" />
            <span>+ Generate New Month</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item, company, bill..."
            className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-1.5 text-xs font-medium placeholder:text-muted-foreground focus:border-[#0066cc] focus:outline-hidden"
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. PRINTABLE COMPANY HEADER                                               */}
      {/* ========================================================================= */}
      <div className="hidden print:block text-center border-b pb-4 mb-4">
        <h1 className="text-2xl font-black uppercase tracking-wider text-slate-900">SARA TEXTILE</h1>
        <h2 className="text-base font-bold text-slate-700">Store Inventory Control Sheet</h2>
        <p className="text-xs font-semibold text-slate-500">
          For the Month of {selectedMonth} 2026 • Total: PKR {formatNumber(activeMonthSheet.totalAmount)}
        </p>
      </div>

      {/* ========================================================================= */}
      {/* 4. DATA TABLE WITH INLINE FORMULAS & EDITING                              */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <PackageCheck className="size-4 text-purple-600 dark:text-purple-400" />
            <span className="text-xs font-black uppercase tracking-wider text-foreground">
              {selectedMonth} Store Purchases ({filteredItems.length} records)
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Table Edit Mode Toggle */}
            <button
              type="button"
              onClick={() => setIsEditMode((prev) => !prev)}
              title="Toggle Edit Mode to highlight rows for modification"
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg border shadow-2xs transition-all cursor-pointer',
                isEditMode
                  ? 'bg-amber-500 text-white border-amber-600 font-bold shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-amber-400'
              )}
            >
              <Edit2 className="size-3" />
              <span>{isEditMode ? 'Editing Active' : 'Edit Table'}</span>
            </button>

            <button
              type="button"
              onClick={resetColWidths}
              title="Reset column widths to default (Double-click any column border to reset individual)"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 bg-white dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-purple-300 shadow-2xs transition-all cursor-pointer"
            >
              <RotateCcw className="size-3" />
              <span>Reset Columns</span>
            </button>
            <div className="text-right">
              <span className="text-xs font-bold text-muted-foreground">{selectedMonth} Total: </span>
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">
                {formatCurrency(activeMonthSheet.totalAmount)}
              </span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table
            style={{ minWidth: `${totalTableWidth}px`, tableLayout: 'fixed' }}
            className="w-full text-left border-collapse text-xs border border-slate-400 dark:border-slate-600 select-text"
          >
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold uppercase text-[11px] border-b-2 border-slate-800 dark:border-slate-300">
                <th
                  style={{ width: `${colWidths.sNo}px` }}
                  className="relative py-2.5 px-2 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  S.No
                  <div
                    onMouseDown={(e) => startColResize('sNo', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, sNo: DEFAULT_INVENTORY_COL_WIDTHS.sNo }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-purple-600 active:bg-purple-600 z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.date}px` }}
                  className="relative py-2.5 px-3 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Date
                  <div
                    onMouseDown={(e) => startColResize('date', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, date: DEFAULT_INVENTORY_COL_WIDTHS.date }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-purple-600 active:bg-purple-600 z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.billNo}px` }}
                  className="relative py-2.5 px-3 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Bill No
                  <div
                    onMouseDown={(e) => startColResize('billNo', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, billNo: DEFAULT_INVENTORY_COL_WIDTHS.billNo }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-purple-600 active:bg-purple-600 z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.inwardNo}px` }}
                  className="relative py-2.5 px-3 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  In No
                  <div
                    onMouseDown={(e) => startColResize('inwardNo', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, inwardNo: DEFAULT_INVENTORY_COL_WIDTHS.inwardNo }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-purple-600 active:bg-purple-600 z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.description}px` }}
                  className="relative py-2.5 px-3 border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Item Description
                  <div
                    onMouseDown={(e) => startColResize('description', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, description: DEFAULT_INVENTORY_COL_WIDTHS.description }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-purple-600 active:bg-purple-600 z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.companyName}px` }}
                  className="relative py-2.5 px-3 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Company / Traders Name
                  <div
                    onMouseDown={(e) => startColResize('companyName', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, companyName: DEFAULT_INVENTORY_COL_WIDTHS.companyName }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-purple-600 active:bg-purple-600 z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.machineName}px` }}
                  className="relative py-2.5 px-2 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Machine
                  <div
                    onMouseDown={(e) => startColResize('machineName', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, machineName: DEFAULT_INVENTORY_COL_WIDTHS.machineName }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-purple-600 active:bg-purple-600 z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.quantity}px` }}
                  className="relative py-2.5 px-2 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Qty
                  <div
                    onMouseDown={(e) => startColResize('quantity', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, quantity: DEFAULT_INVENTORY_COL_WIDTHS.quantity }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-purple-600 active:bg-purple-600 z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.costPerItem}px` }}
                  className="relative py-2.5 px-3 text-right border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Cost / Item
                  <div
                    onMouseDown={(e) => startColResize('costPerItem', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, costPerItem: DEFAULT_INVENTORY_COL_WIDTHS.costPerItem }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-purple-600 active:bg-purple-600 z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.totalPrice}px` }}
                  className="relative py-2.5 px-3 text-right border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Total Price (PKR)
                  <span className="block text-[8px] font-mono text-purple-700 dark:text-purple-300 lowercase font-normal">fx: =Qty*Cost</span>
                  <div
                    onMouseDown={(e) => startColResize('totalPrice', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, totalPrice: DEFAULT_INVENTORY_COL_WIDTHS.totalPrice }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-purple-600 active:bg-purple-600 z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.actions}px` }}
                  className="relative py-2.5 px-2 text-center border border-slate-400 dark:border-slate-600 print:hidden select-none group/th"
                >
                  Actions
                  <div
                    onMouseDown={(e) => startColResize('actions', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, actions: DEFAULT_INVENTORY_COL_WIDTHS.actions }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-purple-600 active:bg-purple-600 z-20"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, idx) => {
                const isEditingThis = editingIndex === item.sNo - 1
                const groupInfo = billGroups[idx] || { invoiceIndex: idx, isFirstInBill: true, isLastInBill: true, rowSpan: 1 }
                const isEvenInvoice = (groupInfo.invoiceIndex ?? 0) % 2 === 0
                const isLastInBill = groupInfo.isLastInBill

                if (isEditingThis) {
                  const editQty = Number(editForm.quantity) || 0
                  const editCost = Number(editForm.costPerItem) || 0
                  const liveItemTotal = editQty * editCost

                  return (
                    <tr key={item.sNo} className="bg-purple-500/10 border-b-2 border-purple-500">
                      <td className="py-2.5 px-2 text-center font-mono font-bold border border-slate-400 dark:border-slate-600">{item.sNo}</td>
                      <td className="py-2.5 px-2 border border-slate-400 dark:border-slate-600">
                        <input
                          type="text"
                          value={editForm.date || ''}
                          onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                          className="w-full rounded border border-purple-500 bg-background px-1.5 py-1 text-xs font-mono"
                        />
                      </td>
                      <td className="py-2.5 px-2 border border-slate-400 dark:border-slate-600">
                        <input
                          type="text"
                          value={editForm.billNo || ''}
                          onChange={(e) => setEditForm({ ...editForm, billNo: e.target.value })}
                          className="w-full rounded border border-purple-500 bg-background px-1.5 py-1 text-xs font-mono"
                        />
                      </td>
                      <td className="py-2.5 px-2 border border-slate-400 dark:border-slate-600">
                        <input
                          type="text"
                          value={editForm.inwardNo || ''}
                          onChange={(e) => setEditForm({ ...editForm, inwardNo: e.target.value })}
                          className="w-full rounded border border-purple-500 bg-background px-1.5 py-1 text-xs font-mono text-purple-600"
                        />
                      </td>
                      <td className="py-2.5 px-2 border border-slate-400 dark:border-slate-600">
                        <input
                          type="text"
                          value={editForm.itemDescription || ''}
                          onChange={(e) => setEditForm({ ...editForm, itemDescription: e.target.value })}
                          className="w-full rounded border border-purple-500 bg-background px-1.5 py-1 text-xs font-medium"
                        />
                      </td>
                      <td className="py-2.5 px-2 border border-slate-400 dark:border-slate-600">
                        <input
                          type="text"
                          value={editForm.companyName || ''}
                          onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                          className="w-full rounded border border-purple-500 bg-background px-1.5 py-1 text-xs font-medium"
                        />
                      </td>
                      <td className="py-2.5 px-2 border border-slate-400 dark:border-slate-600">
                        <input
                          type="text"
                          value={editForm.machineName || ''}
                          onChange={(e) => setEditForm({ ...editForm, machineName: e.target.value })}
                          className="w-full rounded border border-purple-500 bg-background px-1 py-1 text-xs text-center font-bold"
                        />
                      </td>
                      <td className="py-2.5 px-2 border border-slate-400 dark:border-slate-600">
                        <input
                          type="number"
                          value={editForm.quantity}
                          onChange={(e) => setEditForm({ ...editForm, quantity: Number(e.target.value) })}
                          className="w-full rounded border border-purple-500 bg-background px-1 py-1 text-center font-mono text-xs font-bold"
                        />
                      </td>
                      <td className="py-2.5 px-2 border border-slate-400 dark:border-slate-600">
                        <input
                          type="number"
                          value={editForm.costPerItem}
                          onChange={(e) => setEditForm({ ...editForm, costPerItem: Number(e.target.value) })}
                          className="w-full rounded border border-purple-500 bg-background px-1.5 py-1 text-right font-mono text-xs font-bold"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-purple-700 dark:text-purple-300 border border-slate-400 dark:border-slate-600">
                        {formatNumber(liveItemTotal)}
                      </td>
                      <td className="py-2.5 px-2 text-center border border-slate-400 dark:border-slate-600 print:hidden">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => saveEdit(item.sNo - 1)}
                            className="rounded p-1 bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                            title="Save"
                          >
                            <Check className="size-3.5" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded p-1 bg-muted text-muted-foreground hover:bg-muted/80 cursor-pointer"
                            title="Cancel"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr
                    key={item.sNo}
                    className={cn(
                      'transition-colors',
                      isEvenInvoice
                        ? 'bg-white dark:bg-slate-900'
                        : 'bg-slate-50/70 dark:bg-slate-800/40',
                      'hover:bg-purple-50/40 dark:hover:bg-slate-700/50'
                    )}
                  >
                    <td
                      className={cn(
                        'py-2.5 px-2 text-center font-mono font-medium text-slate-600 dark:text-slate-400 border-r border-r-slate-400 dark:border-r-slate-500 border-l border-slate-400 dark:border-slate-600',
                        isLastInBill
                          ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                          : 'border-b border-b-slate-300 dark:border-b-slate-600'
                      )}
                    >
                      {item.sNo}
                    </td>

                    {/* Merged Master Columns: Date, Bill No, Inward No */}
                    {groupInfo.isFirstInBill && (
                      <>
                        <td
                          rowSpan={groupInfo.rowSpan}
                          className={cn(
                            'py-3 px-2 font-mono text-center align-middle font-medium text-slate-800 dark:text-slate-200 border-r border-slate-400 dark:border-slate-600 border-b-2 border-b-slate-800 dark:border-b-slate-200 whitespace-nowrap',
                            isEvenInvoice ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/90 dark:bg-slate-800/70'
                          )}
                        >
                          {item.date || '-'}
                        </td>

                        <td
                          rowSpan={groupInfo.rowSpan}
                          className={cn(
                            'py-3 px-2 font-mono text-center align-middle border-r border-slate-400 dark:border-slate-600 border-b-2 border-b-slate-800 dark:border-b-slate-200 whitespace-nowrap',
                            isEvenInvoice ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/90 dark:bg-slate-800/70'
                          )}
                        >
                          <span className="inline-block px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 shadow-2xs">
                            {item.billNo ? `#${item.billNo}` : '-'}
                          </span>
                        </td>

                        <td
                          rowSpan={groupInfo.rowSpan}
                          className={cn(
                            'py-3 px-2 font-mono text-center align-middle font-bold text-[#0066cc] dark:text-sky-400 border-r border-slate-400 dark:border-slate-600 border-b-2 border-b-slate-800 dark:border-b-slate-200 whitespace-nowrap',
                            isEvenInvoice ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/90 dark:bg-slate-800/70'
                          )}
                        >
                          {item.inwardNo ? `#${item.inwardNo}` : '-'}
                        </td>
                      </>
                    )}

                    {/* Item Description (Unique for each line item) */}
                    <td
                      className={cn(
                        'py-2 px-3 text-slate-800 dark:text-slate-200 font-medium truncate border-r border-slate-300 dark:border-slate-600',
                        isLastInBill
                          ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                          : 'border-b border-b-slate-300 dark:border-b-slate-600'
                      )}
                      title={item.itemDescription}
                    >
                      {item.itemDescription}
                    </td>

                    {/* Merged Company / Traders Name with Authentic Pastel Tint from Excel */}
                    {groupInfo.isFirstInBill && (
                      <td
                        rowSpan={groupInfo.rowSpan}
                        className={cn(
                          'py-3 px-3 text-center align-middle whitespace-normal border-r border-slate-400 dark:border-slate-600 border-b-2 border-b-slate-800 dark:border-b-slate-200 transition-colors',
                          getCompanyTintStyle(item.companyName)
                        )}
                      >
                        <div className="font-bold text-xs">{item.companyName || '-'}</div>
                        {groupInfo.rowSpan > 1 && (
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono bg-black/10 dark:bg-white/20 text-foreground border border-black/10">
                            {groupInfo.rowSpan} items in bill
                          </span>
                        )}
                      </td>
                    )}

                    {/* Machine Name with colorful badge */}
                    <td
                      className={cn(
                        'py-2 px-2 text-center border-r border-slate-300 dark:border-slate-600',
                        isLastInBill
                          ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                          : 'border-b border-b-slate-300 dark:border-b-slate-600'
                      )}
                    >
                      {item.machineName ? (
                        <span
                          className={cn(
                            'inline-block rounded-md px-2 py-0.5 text-[10px] tracking-wide uppercase shadow-2xs',
                            getMachineBadgeStyle(item.machineName)
                          )}
                        >
                          {item.machineName}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    {/* Quantity */}
                    <td
                      className={cn(
                        'py-2 px-2 text-center font-mono font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-300 dark:border-slate-600',
                        isLastInBill
                          ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                          : 'border-b border-b-slate-300 dark:border-b-slate-600'
                      )}
                    >
                      {item.quantity}
                    </td>

                    {/* Cost Per Item */}
                    <td
                      className={cn(
                        'py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300 border-r border-slate-300 dark:border-slate-600',
                        isLastInBill
                          ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                          : 'border-b border-b-slate-300 dark:border-b-slate-600'
                      )}
                    >
                      {formatNumber(item.costPerItem)}
                    </td>

                    {/* Total Price */}
                    <td
                      className={cn(
                        'py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 border-r border-slate-300 dark:border-slate-600',
                        isLastInBill
                          ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                          : 'border-b border-b-slate-300 dark:border-b-slate-600'
                      )}
                    >
                      {formatNumber(item.totalPrice)}
                    </td>

                    {/* Actions */}
                    <td
                      className={cn(
                        'py-2 px-2 text-center print:hidden border-r border-slate-400 dark:border-slate-600',
                        isLastInBill
                          ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                          : 'border-b border-b-slate-300 dark:border-b-slate-600',
                        isEditMode && 'bg-amber-500/10'
                      )}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openFormalEditDialog(item.sNo - 1, item)}
                          className={cn(
                            'rounded p-1 cursor-pointer transition-colors',
                            isEditMode
                              ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-2xs'
                              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-purple-600'
                          )}
                          title="Edit Row (Formal Dialog Box)"
                        >
                          <Edit2 className="size-3.5" />
                        </button>
                        <button
                          onClick={() => deleteRow(item.sNo - 1)}
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
                          title="Delete Row"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-800 dark:border-slate-200 bg-slate-100 dark:bg-slate-800 font-bold text-xs">
                <td colSpan={7} className="py-3 px-3 uppercase text-slate-800 dark:text-slate-100 border border-slate-400 dark:border-slate-600">
                  {selectedMonth} Total Purchases
                  <span className="ml-2 text-[10px] font-mono text-purple-700 dark:text-purple-300 font-normal">
                    fx: =SUM(J6:J{activeMonthSheet.items.length + 5})
                  </span>
                </td>
                <td className="py-3 px-2 text-center font-mono font-bold text-slate-900 dark:text-slate-100 border border-slate-400 dark:border-slate-600">
                  {filteredItems.reduce((s, it) => s + (it.quantity || 1), 0)}
                </td>
                <td className="py-3 px-3 border border-slate-400 dark:border-slate-600"></td>
                <td className="py-3 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400 text-sm font-bold border border-slate-400 dark:border-slate-600">
                  {formatCurrency(filteredTotal)}
                </td>
                <td className="border border-slate-400 dark:border-slate-600 print:hidden"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 7. MODAL: ADD NEW PURCHASE ITEM                                           */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 print:hidden">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-base font-black text-foreground">Add Purchase to {selectedMonth}</h3>
                <p className="text-xs text-muted-foreground">
                  Auto-computes <code className="font-mono text-purple-600">Total Price = Qty * Cost</code> & updates monthly total
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleAddNewPurchase} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Date</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">In No</label>
                  <input
                    type="text"
                    value={newInwardNo}
                    onChange={(e) => setNewInwardNo(e.target.value)}
                    placeholder="e.g. 7654"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Bill No</label>
                  <input
                    type="text"
                    value={newBillNo}
                    onChange={(e) => setNewBillNo(e.target.value)}
                    placeholder="e.g. 1022"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Company / Trader</label>
                  <input
                    type="text"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    placeholder="e.g. Textile Engineering"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Item Description</label>
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="e.g. Needle Patti New"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Machine Name</label>
                  <select
                    value={newMachine}
                    onChange={(e) => setNewMachine(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-bold"
                  >
                    <option value="PU">PU</option>
                    <option value="G-6200">G-6200</option>
                    <option value="G-6300">G-6300</option>
                    <option value="Electronic">Electronic</option>
                    <option value="All">All</option>
                    <option value="Sizing">Sizing</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Cost Per Item (PKR)</label>
                  <input
                    type="number"
                    min="1"
                    value={newCost}
                    onChange={(e) => setNewCost(e.target.value)}
                    placeholder="e.g. 2200"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-mono font-bold"
                    required
                  />
                </div>
              </div>

              {/* Live Formula Preview Box */}
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 flex justify-between items-center">
                <span className="font-bold text-muted-foreground">
                  Formula Total (<code className="font-mono text-purple-600">Qty * Cost</code>):
                </span>
                <span className="font-mono text-base font-black text-purple-700 dark:text-purple-300">
                  {formatCurrency((Number(newQuantity) || 0) * (Number(newCost) || 0))}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-purple-600 px-5 py-2 text-xs font-black text-white hover:bg-purple-700 cursor-pointer shadow-xs"
                >
                  Add to {selectedMonth}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. MODAL: FORMAL EDIT PURCHASE ITEM (MISTAKE CORRECTION)                  */}
      {/* ========================================================================= */}
      {showEditModal && editingRowIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 print:hidden">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-base font-black text-foreground">
                  Edit Purchase Item (Row #{editingRowIndex + 1})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Correct mistakes in {selectedMonth} 2026. Formulas and totals will automatically recalculate.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowEditModal(false)
                  setEditingRowIndex(null)
                }}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFormalEdit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Date</label>
                  <input
                    type="text"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">In No</label>
                  <input
                    type="text"
                    value={editInwardNo}
                    onChange={(e) => setEditInwardNo(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-mono font-bold text-purple-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Bill No</label>
                  <input
                    type="text"
                    value={editBillNo}
                    onChange={(e) => setEditBillNo(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Company / Trader</label>
                  <input
                    type="text"
                    value={editCompany}
                    onChange={(e) => setEditCompany(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Item Description</label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Machine Name</label>
                  <select
                    value={editMachine}
                    onChange={(e) => setEditMachine(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-bold"
                  >
                    <option value="PU">PU</option>
                    <option value="G-6200">G-6200</option>
                    <option value="G-6300">G-6300</option>
                    <option value="Electronic">Electronic</option>
                    <option value="All">All</option>
                    <option value="Sizing">Sizing</option>
                    <option value="FOI">FOI</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(Number(e.target.value))}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Cost Per Item (PKR)</label>
                  <input
                    type="number"
                    min="0"
                    value={editCost}
                    onChange={(e) => setEditCost(Number(e.target.value))}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-mono font-bold"
                    required
                  />
                </div>
              </div>

              {/* Live Formula Preview */}
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 flex justify-between items-center">
                <span className="font-bold text-muted-foreground">
                  Formula Total (<code className="font-mono text-purple-600">Qty * Cost</code>):
                </span>
                <span className="font-mono text-base font-black text-purple-700 dark:text-purple-300">
                  {formatCurrency((Number(editQuantity) || 0) * (Number(editCost) || 0))}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false)
                    setEditingRowIndex(null)
                  }}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-black text-white hover:bg-emerald-700 cursor-pointer shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. MODAL: GENERATE NEW MONTH CONFIRMATION                                 */}
      {/* ========================================================================= */}
      {showGenerateMonthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 print:hidden">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="size-5 text-[#0066cc]" />
                <h3 className="text-base font-black text-foreground">Generate New Month Register</h3>
              </div>
              <button
                onClick={() => setShowGenerateMonthModal(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmGenerateMonth} className="space-y-4 text-xs">
              <p className="text-muted-foreground">
                This will initialize a new blank monthly register ready for manual store inward entry. The new month will also be automatically synchronized with Daily Inward Expenses.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Select Month</label>
                  <select
                    value={monthToGenerate}
                    onChange={(e) => setMonthToGenerate(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-bold"
                  >
                    {[
                      'September',
                      'October',
                      'November',
                      'December',
                      'January',
                      'Febraury',
                      'March',
                      'April',
                      'May',
                      'June',
                      'July',
                      'August',
                    ].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Year</label>
                  <input
                    type="text"
                    value={yearToGenerate}
                    onChange={(e) => setYearToGenerate(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-mono font-bold"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-900 dark:text-amber-300">
                ⚠️ <strong>Confirmation Required:</strong> A clean, empty sheet will be created. You can begin adding bills immediately through the formal dialog box.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowGenerateMonthModal(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0066cc] px-5 py-2 text-xs font-black text-white hover:bg-blue-700 cursor-pointer shadow-xs"
                >
                  Confirm & Generate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
