'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { accountsData, DailyInwardItem } from '@/data/accountsData'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import {
  Wallet,
  Receipt,
  FileSpreadsheet,
  Printer,
  Search,
  Download,
  Filter,
  CheckCircle2,
  Building2,
  Calendar,
  Layers,
  PlusCircle,
  Plus,
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

const STORAGE_KEY_DAILY_EXPENSE = ACCOUNTS_KEYS.DAILY_INWARD

const MONTH_NAMES = [
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
]

export default function DailyExpensePage() {
  const [monthsData, setMonthsData] = useState<Record<string, DailyInwardItem[]>>(() => {
    const rawMonths = accountsRead<Record<string, DailyInwardItem[]> | null>(
      ACCOUNTS_KEYS.DAILY_INWARD_MONTHS,
      null
    )
    const augustData = accountsRead<DailyInwardItem[]>(
      STORAGE_KEY_DAILY_EXPENSE,
      accountsData.dailyExpense.inward
    )

    if (rawMonths && typeof rawMonths === 'object' && Object.keys(rawMonths).length > 0) {
      const sanitized = { ...rawMonths }
      // User request: "september wala data remove kr do yr , me khud dalon ga"
      if (sanitized['September 2026'] && sanitized['September 2026'].length > 0) {
        sanitized['September 2026'] = []
        accountsWrite(ACCOUNTS_KEYS.DAILY_INWARD_MONTHS, sanitized)
      }
      if (!sanitized['August 2026']) {
        return { 'August 2026': augustData, ...sanitized }
      }
      return sanitized
    }

    return {
      'August 2026': augustData,
    }
  })

  const [selectedMonth, setSelectedMonth] = useState<string>('August 2026')
  const [showGenerateMonthModal, setShowGenerateMonthModal] = useState(false)
  const [genMonthName, setGenMonthName] = useState('September')
  const [genYear, setGenYear] = useState('2026')

  const availableMonths = useMemo(() => {
    return Object.keys(monthsData)
  }, [monthsData])

  const items = useMemo(() => {
    return monthsData[selectedMonth] || []
  }, [monthsData, selectedMonth])

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedParty, setSelectedParty] = useState<string>('ALL')
  const [isSaved, setIsSaved] = useState(false)

  useEffect(() => {
    const handleSync = () => {
      const rawMonths = accountsRead<Record<string, DailyInwardItem[]> | null>(
        ACCOUNTS_KEYS.DAILY_INWARD_MONTHS,
        null
      )
      if (rawMonths && typeof rawMonths === 'object') {
        setMonthsData(rawMonths)
      } else {
        const august = accountsRead<DailyInwardItem[]>(
          STORAGE_KEY_DAILY_EXPENSE,
          accountsData.dailyExpense.inward
        )
        setMonthsData((prev) => ({ ...prev, 'August 2026': august }))
      }
    }
    window.addEventListener('accounts_synced', handleSync)
    return () => window.removeEventListener('accounts_synced', handleSync)
  }, [])

  // Editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Partial<DailyInwardItem>>({})

  // New Item modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newDate, setNewDate] = useState('2026-08-31')
  const [newBillNo, setNewBillNo] = useState('')
  const [newInwardNo, setNewInwardNo] = useState('')
  const [newPartyName, setNewPartyName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newQuantity, setNewQuantity] = useState<number | string>(1)
  const [newRate, setNewRate] = useState<number | string>('')

  // =========================================================================
  // INTERACTIVE COLUMN RESIZING (EXCEL DRAGGABLE COLUMNS)
  // =========================================================================
  const DEFAULT_EXPENSE_COL_WIDTHS: Record<string, number> = {
    sNo: 50,
    date: 95,
    billNo: 85,
    inwardNo: 85,
    partyName: 180,
    description: 280,
    quantity: 70,
    rate: 95,
    totalAmount: 120,
    balance: 130,
    actions: 75,
  }

  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('sara_expense_col_widths')
        if (saved) return { ...DEFAULT_EXPENSE_COL_WIDTHS, ...JSON.parse(saved) }
      } catch {}
    }
    return DEFAULT_EXPENSE_COL_WIDTHS
  })

  const startColResize = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = colWidths[colKey] || DEFAULT_EXPENSE_COL_WIDTHS[colKey] || 80

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
          localStorage.setItem('sara_expense_col_widths', JSON.stringify(latest))
        } catch {}
        return latest
      })
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const resetColWidths = () => {
    setColWidths(DEFAULT_EXPENSE_COL_WIDTHS)
    try {
      localStorage.removeItem('sara_expense_col_widths')
    } catch {}
  }

  const totalTableWidth = useMemo(() => {
    return Object.values(colWidths).reduce((sum, w) => sum + w, 0)
  }, [colWidths])

  // =========================================================================
  // REACTIVE FORMULAS COMPUTATION
  // =========================================================================
  // In Excel: Total Amount = Qty * Rate
  // Running Balance = Prev Balance + Total Amount
  const computedItems = useMemo(() => {
    let runningBalance = 0
    return items.map((item, idx) => {
      const qty = Number(item.quantity) || 0
      const rate = Number(item.rate) || 0
      const totalAmount = qty * rate
      runningBalance += totalAmount

      return {
        ...item,
        sNo: idx + 1,
        totalAmount,
        saraAp: totalAmount,
        balance: runningBalance,
      }
    })
  }, [items])

  const totalAmount = useMemo(() => {
    return computedItems.reduce((s, i) => s + i.totalAmount, 0)
  }, [computedItems])

  const totalQuantity = useMemo(() => {
    return computedItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0)
  }, [computedItems])

  const uniqueParties = useMemo(() => {
    const parties = Array.from(new Set(computedItems.map((i) => i.partyName).filter(Boolean)))
    return parties.sort()
  }, [computedItems])

  const filteredItems = useMemo(() => {
    return computedItems.filter((item) => {
      const q = searchTerm.toLowerCase()
      const matchSearch =
        !q ||
        item.itemDescription.toLowerCase().includes(q) ||
        item.partyName.toLowerCase().includes(q) ||
        item.billNo.toLowerCase().includes(q) ||
        item.inwardNo.toLowerCase().includes(q)

      const matchParty = selectedParty === 'ALL' || item.partyName === selectedParty

      return matchSearch && matchParty
    })
  }, [computedItems, searchTerm, selectedParty])

  const filteredTotal = useMemo(() => {
    return filteredItems.reduce((s, i) => s + i.totalAmount, 0)
  }, [filteredItems])

  // Group consecutive items by same Invoice / Bill No & Party (Excel merged cell style)
  const billGroups = useMemo(() => {
    if (editingIndex !== null) {
      return filteredItems.map((_, idx) => ({
        invoiceIndex: idx,
        isFirstInBill: true,
        isLastInBill: true,
        rowSpan: 1,
        billTotal: filteredItems[idx]?.totalAmount || 0,
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
          billTotal: current.totalAmount,
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
        filteredItems[j].partyName.trim().toLowerCase() === current.partyName.trim().toLowerCase()
      ) {
        j++
      }

      const count = j - i
      let sumBill = 0
      for (let k = i; k < j; k++) {
        sumBill += filteredItems[k].totalAmount
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

  const saveItems = (updated: DailyInwardItem[], targetMonth = selectedMonth) => {
    const nextMonthsData = {
      ...monthsData,
      [targetMonth]: updated,
    }
    setMonthsData(nextMonthsData)
    accountsWrite(ACCOUNTS_KEYS.DAILY_INWARD_MONTHS, nextMonthsData)

    if (targetMonth === 'August 2026') {
      accountsWrite(STORAGE_KEY_DAILY_EXPENSE, updated)
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('accounts_synced', { detail: { source: 'daily_inward' } }))
    }

    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  const handleSelectMonth = (mKey: string) => {
    setSelectedMonth(mKey)
    setEditingIndex(null)
    setSelectedParty('ALL')
    const parts = mKey.split(' ')
    if (parts.length === 2) {
      const mIdx = MONTH_NAMES.indexOf(parts[0])
      if (mIdx !== -1) {
        const mNum = String(mIdx + 1).padStart(2, '0')
        setNewDate(`${parts[1]}-${mNum}-01`)
      }
    }
  }

  const handleGenerateMonth = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const targetMonthKey = `${genMonthName} ${genYear}`

    if (monthsData[targetMonthKey]) {
      handleSelectMonth(targetMonthKey)
      setShowGenerateMonthModal(false)
      return
    }

    const nextMonthsData = {
      ...monthsData,
      [targetMonthKey]: [],
    }

    setMonthsData(nextMonthsData)
    accountsWrite(ACCOUNTS_KEYS.DAILY_INWARD_MONTHS, nextMonthsData)
    setSelectedMonth(targetMonthKey)
    setShowGenerateMonthModal(false)

    const mIdx = MONTH_NAMES.indexOf(genMonthName)
    if (mIdx !== -1) {
      const mNum = String(mIdx + 1).padStart(2, '0')
      setNewDate(`${genYear}-${mNum}-01`)
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('accounts_synced', { detail: { source: 'daily_inward' } }))
    }

    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  const handleQuickCreateMonth = (monthName: string, year: string) => {
    const targetMonthKey = `${monthName} ${year}`
    if (monthsData[targetMonthKey]) {
      handleSelectMonth(targetMonthKey)
      return
    }
    const nextMonthsData = {
      ...monthsData,
      [targetMonthKey]: [],
    }
    setMonthsData(nextMonthsData)
    accountsWrite(ACCOUNTS_KEYS.DAILY_INWARD_MONTHS, nextMonthsData)
    setSelectedMonth(targetMonthKey)

    const mIdx = MONTH_NAMES.indexOf(monthName)
    if (mIdx !== -1) {
      const mNum = String(mIdx + 1).padStart(2, '0')
      setNewDate(`${year}-${mNum}-01`)
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('accounts_synced', { detail: { source: 'daily_inward' } }))
    }

    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  const handleDeleteMonth = (monthToDelete: string) => {
    if (monthToDelete === 'August 2026') {
      alert('Cannot delete base August 2026 records.')
      return
    }
    if (confirm(`Are you sure you want to delete the ${monthToDelete} register and all its entries?`)) {
      const nextMonthsData = { ...monthsData }
      delete nextMonthsData[monthToDelete]
      setMonthsData(nextMonthsData)
      accountsWrite(ACCOUNTS_KEYS.DAILY_INWARD_MONTHS, nextMonthsData)
      setSelectedMonth('August 2026')
      setNewDate('2026-08-31')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('accounts_synced', { detail: { source: 'daily_inward' } }))
      }
    }
  }

  const handleReset = () => {
    if (selectedMonth === 'August 2026') {
      if (confirm('Reset August 2026 Daily Inward Expenses to the authentic Excel default (60 items • PKR 677,551)?')) {
        saveItems(accountsData.dailyExpense.inward, 'August 2026')
      }
    } else {
      if (confirm(`Clear all inward items for ${selectedMonth}?`)) {
        saveItems([], selectedMonth)
      }
    }
  }

  // Row inline edit
  const startEdit = (idx: number, item: DailyInwardItem) => {
    setEditingIndex(idx)
    setEditForm({ ...item })
  }

  const saveEdit = (idx: number) => {
    const updated = [...items]
    const qty = Number(editForm.quantity) || 0
    const rate = Number(editForm.rate) || 0
    const totalAmount = qty * rate

    updated[idx] = {
      ...updated[idx],
      ...editForm,
      quantity: qty,
      rate,
      totalAmount,
      saraAp: totalAmount,
    } as DailyInwardItem

    saveItems(updated, selectedMonth)
    setEditingIndex(null)
    setEditForm({})
  }

  const cancelEdit = () => {
    setEditingIndex(null)
    setEditForm({})
  }

  const deleteRow = (idx: number) => {
    if (confirm(`Delete inward line #${idx + 1}? All running balances will recalculate automatically.`)) {
      const updated = items.filter((_, i) => i !== idx)
      saveItems(updated, selectedMonth)
    }
  }

  // Add new item
  const handleAddNewItem = (e: React.FormEvent) => {
    e.preventDefault()
    const qty = Number(newQuantity) || 1
    const rate = Number(newRate) || 0
    if (!newPartyName || !newDescription || rate <= 0) return

    const totalAmount = qty * rate
    const newItem: DailyInwardItem = {
      sNo: items.length + 1,
      date: newDate,
      billNo: newBillNo || `BILL-${Math.floor(1000 + Math.random() * 9000)}`,
      inwardNo: newInwardNo || `${7654 + items.length}`,
      partyName: newPartyName,
      itemDescription: newDescription,
      quantity: qty,
      rate,
      totalAmount,
      saraAp: totalAmount,
      foiCashCheque: 0,
      balance: 0,
    }

    const updated = [...items, newItem]
    saveItems(updated, selectedMonth)

    // Reset modal
    setNewDescription('')
    setNewRate('')
    setNewQuantity(1)
    setShowAddModal(false)
  }

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  const exportCSV = () => {
    const headers = ['S.No', 'Date', 'Bill No', 'Inward No', 'Party Name', 'Description', 'Qty', 'Rate', 'Total Amount', 'Running Balance']
    const rows = filteredItems.map((item) => [
      item.sNo,
      item.date,
      `"${item.billNo}"`,
      `"${item.inwardNo}"`,
      `"${item.partyName}"`,
      `"${item.itemDescription}"`,
      item.quantity,
      item.rate,
      item.totalAmount,
      item.balance,
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Sara_Textile_Daily_Inward_Expenses_${selectedMonth.replace(/\s+/g, '_')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="print:hidden">
        <PageHeader
          title="Daily Expense & Inward Record"
          showTitle={false}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Accounts', href: '/accounts/daily-expense' },
            { label: 'Daily Expense' },
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
                  <span>Add Entry</span>
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
          <span>Formulas recalculated and register saved successfully!</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. COMPACT TOOLBAR: MONTH DROPDOWN, PARTY FILTER, SEARCH                 */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-border pb-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Month Dropdown Selector */}
          <div className="flex items-center gap-1.5">
            <Calendar className="size-4 text-[#0066cc]" />
            <span className="text-xs font-bold text-foreground">Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => handleSelectMonth(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground focus:border-[#0066cc] focus:outline-hidden cursor-pointer shadow-2xs"
            >
              {availableMonths.map((mKey) => {
                const count = (monthsData[mKey] || []).length
                return (
                  <option key={mKey} value={mKey}>
                    {mKey} ({count} {count === 1 ? 'item' : 'items'})
                  </option>
                )
              })}
            </select>
          </div>

          {/* Party Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="size-3.5 text-slate-500" />
            <select
              value={selectedParty}
              onChange={(e) => setSelectedParty(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground focus:border-[#0066cc] focus:outline-hidden cursor-pointer shadow-2xs"
            >
              <option value="ALL">All Parties ({uniqueParties.length})</option>
              {uniqueParties.map((party) => (
                <option key={party} value={party}>
                  {party}
                </option>
              ))}
            </select>
          </div>

          {selectedParty !== 'ALL' && (
            <button
              onClick={() => setSelectedParty('ALL')}
              className="text-xs font-bold text-[#0066cc] hover:underline cursor-pointer"
            >
              Reset
            </button>
          )}

          {/* Link to Store Inventory Gate Inward */}
          <span className="text-[11px] text-slate-500 hidden sm:inline-flex items-center gap-1 font-medium bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
            <span>Synced with</span>
            <Link href="/accounts/inventory-inward" className="text-[#0066cc] font-bold hover:underline">
              Store Inventory Control
            </Link>
          </span>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search description, bill #, inward #, party..."
            className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-1.5 text-xs font-medium placeholder:text-muted-foreground focus:border-[#0066cc] focus:outline-hidden"
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. PRINTABLE COMPANY HEADER                                               */}
      {/* ========================================================================= */}
      <div className="hidden print:block text-center border-b pb-4 mb-4">
        <h1 className="text-2xl font-bold uppercase tracking-wider text-slate-900">SARA TEXTILE</h1>
        <h2 className="text-sm font-semibold text-slate-700">Monthly Expense Account Payable and Cash New Item and Repairing</h2>
        <p className="text-xs font-medium text-slate-500">Month Of {selectedMonth} • {computedItems.length} Itemized Line Items</p>
      </div>

      {/* ========================================================================= */}
      {/* 4. DATA TABLE WITH INLINE FORMULAS & INLINE EDITING                       */}
      {/* ========================================================================= */}
      <div className="erp-card shadow-xs overflow-hidden">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-2 min-w-0">
            <FileSpreadsheet className="size-4 shrink-0 text-[#0066cc]" />
            <span className="text-sm font-bold uppercase tracking-wide text-slate-800 dark:text-slate-200">
              Traders & Workshops Inward Register — {selectedMonth} ({filteredItems.length} of {computedItems.length} records)
            </span>
          </div>
          <div className="text-left sm:text-right flex items-center gap-3">
            <button
              type="button"
              onClick={resetColWidths}
              title="Reset all column widths to default"
              className="text-[11px] font-semibold text-slate-500 hover:text-[#0066cc] underline cursor-pointer"
            >
              Reset Columns
            </button>
            <span className="text-sm font-medium text-slate-500">
              Showing Total: <strong className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">{formatCurrency(filteredTotal)}</strong>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table
            className="text-left border-collapse text-xs border border-slate-400 dark:border-slate-600"
            style={{ width: `${totalTableWidth}px`, minWidth: '100%', tableLayout: 'fixed' }}
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
                    onDoubleClick={() => setColWidths((p) => ({ ...p, sNo: DEFAULT_EXPENSE_COL_WIDTHS.sNo }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] active:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.date}px` }}
                  className="relative py-2.5 px-3 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Date
                  <div
                    onMouseDown={(e) => startColResize('date', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, date: DEFAULT_EXPENSE_COL_WIDTHS.date }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] active:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.billNo}px` }}
                  className="relative py-2.5 px-3 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Bill No
                  <div
                    onMouseDown={(e) => startColResize('billNo', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, billNo: DEFAULT_EXPENSE_COL_WIDTHS.billNo }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] active:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.inwardNo}px` }}
                  className="relative py-2.5 px-3 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Inw.No
                  <div
                    onMouseDown={(e) => startColResize('inwardNo', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, inwardNo: DEFAULT_EXPENSE_COL_WIDTHS.inwardNo }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] active:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.partyName}px` }}
                  className="relative py-2.5 px-3 text-center border border-slate-400 dark:border-slate-600 border-r-2 border-r-slate-800 dark:border-r-slate-300 select-none group/th"
                >
                  Party Name
                  <div
                    onMouseDown={(e) => startColResize('partyName', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, partyName: DEFAULT_EXPENSE_COL_WIDTHS.partyName }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] active:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.description}px` }}
                  className="relative py-2.5 px-3 border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Description
                  <div
                    onMouseDown={(e) => startColResize('description', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, description: DEFAULT_EXPENSE_COL_WIDTHS.description }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] active:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.quantity}px` }}
                  className="relative py-2.5 px-3 text-center border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Qty
                  <div
                    onMouseDown={(e) => startColResize('quantity', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, quantity: DEFAULT_EXPENSE_COL_WIDTHS.quantity }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] active:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.rate}px` }}
                  className="relative py-2.5 px-3 text-right border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Rate (PKR)
                  <div
                    onMouseDown={(e) => startColResize('rate', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, rate: DEFAULT_EXPENSE_COL_WIDTHS.rate }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] active:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.totalAmount}px` }}
                  className="relative py-2.5 px-3 text-right border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Total Amount
                  <span className="block text-[9px] font-mono text-purple-700 dark:text-purple-300 lowercase font-normal">fx: =Qty*Rate</span>
                  <div
                    onMouseDown={(e) => startColResize('totalAmount', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, totalAmount: DEFAULT_EXPENSE_COL_WIDTHS.totalAmount }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] active:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.balance}px` }}
                  className="relative py-2.5 px-3 text-right border border-slate-400 dark:border-slate-600 select-none group/th"
                >
                  Running Balance
                  <span className="block text-[9px] font-mono text-[#0066cc] dark:text-sky-400 lowercase font-normal">fx: =Prev+Amount</span>
                  <div
                    onMouseDown={(e) => startColResize('balance', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, balance: DEFAULT_EXPENSE_COL_WIDTHS.balance }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] active:bg-[#0066cc] z-20"
                  />
                </th>
                <th
                  style={{ width: `${colWidths.actions}px` }}
                  className="relative py-2.5 px-2 text-center border border-slate-400 dark:border-slate-600 select-none group/th print:hidden"
                >
                  Actions
                  <div
                    onMouseDown={(e) => startColResize('actions', e)}
                    onDoubleClick={() => setColWidths((p) => ({ ...p, actions: DEFAULT_EXPENSE_COL_WIDTHS.actions }))}
                    title="Drag to resize column (Double-click to reset)"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#0066cc] active:bg-[#0066cc] z-20"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 px-4 text-center border border-slate-400 dark:border-slate-600">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="inline-flex items-center justify-center size-12 rounded-full bg-blue-500/10 text-[#0066cc] dark:bg-blue-500/20">
                        <Calendar className="size-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                          No Inward Expenses for {selectedMonth}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {searchTerm || selectedParty !== 'ALL'
                            ? 'No entries match your search/filter criteria. Try clearing the filter.'
                            : `This register is fresh and empty. You can now add your bills and inward entries for ${selectedMonth}.`}
                        </p>
                      </div>
                      {searchTerm || selectedParty !== 'ALL' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchTerm('')
                            setSelectedParty('ALL')
                          }}
                          className="erp-btn-secondary text-xs"
                        >
                          Clear Filters
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowAddModal(true)}
                          className="erp-btn-primary text-xs inline-flex items-center gap-1.5"
                        >
                          <PlusCircle className="size-4" />
                          <span>Add First Bill for {selectedMonth}</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const isEditingThis = editingIndex === item.sNo - 1
                  const isWorkshop = item.partyName.toLowerCase().includes('marhaba')
                  const groupInfo = billGroups[idx] || { isFirstInBill: true, isLastInBill: true, rowSpan: 1 }

                if (isEditingThis) {
                  const editQty = Number(editForm.quantity) || 0
                  const editRate = Number(editForm.rate) || 0
                  const liveItemTotal = editQty * editRate

                  return (
                    <tr key={item.sNo} className="bg-amber-500/10 border-b-2 border-amber-500">
                      <td className="py-2 px-3 text-center font-mono font-bold border border-slate-400 dark:border-slate-600">{item.sNo}</td>
                      <td className="py-2 px-3 border border-slate-400 dark:border-slate-600">
                        <input
                          type="date"
                          value={editForm.date || ''}
                          onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                          className="w-28 rounded border border-slate-300 dark:border-slate-600 bg-background px-1.5 py-0.5 text-xs font-mono focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3 border border-slate-400 dark:border-slate-600">
                        <input
                          type="text"
                          value={editForm.billNo || ''}
                          onChange={(e) => setEditForm({ ...editForm, billNo: e.target.value })}
                          className="w-18 rounded border border-slate-300 dark:border-slate-600 bg-background px-1.5 py-0.5 text-xs font-mono focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3 border border-slate-400 dark:border-slate-600">
                        <input
                          type="text"
                          value={editForm.inwardNo || ''}
                          onChange={(e) => setEditForm({ ...editForm, inwardNo: e.target.value })}
                          className="w-18 rounded border border-slate-300 dark:border-slate-600 bg-background px-1.5 py-0.5 text-xs font-mono font-bold text-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3 border border-slate-400 dark:border-slate-600 border-r-2 border-r-slate-800 dark:border-r-slate-300">
                        <input
                          type="text"
                          value={editForm.partyName || ''}
                          onChange={(e) => setEditForm({ ...editForm, partyName: e.target.value })}
                          className="w-32 rounded border border-slate-300 dark:border-slate-600 bg-background px-1.5 py-0.5 text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3 border border-slate-400 dark:border-slate-600">
                        <input
                          type="text"
                          value={editForm.itemDescription || ''}
                          onChange={(e) => setEditForm({ ...editForm, itemDescription: e.target.value })}
                          className="w-full rounded border border-slate-300 dark:border-slate-600 bg-background px-1.5 py-0.5 text-xs font-medium focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3 border border-slate-400 dark:border-slate-600">
                        <input
                          type="number"
                          value={editForm.quantity}
                          onChange={(e) => setEditForm({ ...editForm, quantity: Number(e.target.value) })}
                          className="w-14 rounded border border-slate-300 dark:border-slate-600 bg-background px-1 py-0.5 text-center font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3 border border-slate-400 dark:border-slate-600">
                        <input
                          type="number"
                          value={editForm.rate}
                          onChange={(e) => setEditForm({ ...editForm, rate: Number(e.target.value) })}
                          className="w-20 rounded border border-slate-300 dark:border-slate-600 bg-background px-1.5 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-purple-700 dark:text-purple-300 border border-slate-400 dark:border-slate-600">
                        {formatNumber(liveItemTotal)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-400 border border-slate-400 dark:border-slate-600">
                        recalculates...
                      </td>
                      <td className="py-2 px-3 text-center border border-slate-400 dark:border-slate-600 print:hidden">
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
                            className="rounded p-1 bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
                            title="Cancel"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                const isEvenInvoice = (groupInfo.invoiceIndex ?? 0) % 2 === 0
                const isLastInBill = groupInfo.isLastInBill

                return (
                  <tr
                    key={item.sNo}
                    className={cn(
                      'transition-colors',
                      isEvenInvoice
                        ? 'bg-white dark:bg-slate-900'
                        : 'bg-slate-50/70 dark:bg-slate-800/40',
                      isWorkshop && '!bg-amber-500/5',
                      'hover:bg-blue-50/50 dark:hover:bg-slate-700/50'
                    )}
                  >
                    {/* S.No */}
                    <td
                      className={cn(
                        'py-2 px-3 text-center font-mono font-medium text-slate-600 dark:text-slate-400 border-r-2 border-r-slate-400 dark:border-r-slate-500 border-l border-slate-400 dark:border-slate-600',
                        isLastInBill
                          ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                          : 'border-b border-b-slate-300 dark:border-b-slate-600'
                      )}
                    >
                      {item.sNo}
                    </td>

                    {/* Merged Invoice Master Columns (Date, Bill No, Inward No, Party Name) */}
                    {groupInfo.isFirstInBill && (
                      <>
                        <td
                          rowSpan={groupInfo.rowSpan}
                          className={cn(
                            'py-3 px-3 font-mono text-center align-middle font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap border-r border-slate-400 dark:border-slate-600 border-b-2 border-b-slate-800 dark:border-b-slate-200',
                            isEvenInvoice
                              ? 'bg-white dark:bg-slate-900'
                              : 'bg-slate-50/90 dark:bg-slate-800/70'
                          )}
                        >
                          {item.date}
                        </td>
                        <td
                          rowSpan={groupInfo.rowSpan}
                          className={cn(
                            'py-3 px-3 font-mono text-center align-middle border-r border-slate-400 dark:border-slate-600 border-b-2 border-b-slate-800 dark:border-b-slate-200',
                            isEvenInvoice
                              ? 'bg-white dark:bg-slate-900'
                              : 'bg-slate-50/90 dark:bg-slate-800/70'
                          )}
                        >
                          <span className="inline-block px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 shadow-2xs">
                            {item.billNo ? `#${item.billNo}` : '-'}
                          </span>
                        </td>
                        <td
                          rowSpan={groupInfo.rowSpan}
                          className={cn(
                            'py-3 px-3 font-mono text-center align-middle border-r border-slate-400 dark:border-slate-600 border-b-2 border-b-slate-800 dark:border-b-slate-200',
                            isEvenInvoice
                              ? 'bg-white dark:bg-slate-900'
                              : 'bg-slate-50/90 dark:bg-slate-800/70'
                          )}
                        >
                          <span className="font-bold text-[#0066cc] dark:text-sky-400">
                            {item.inwardNo ? `#${item.inwardNo}` : '-'}
                          </span>
                        </td>
                        <td
                          rowSpan={groupInfo.rowSpan}
                          className={cn(
                            'py-3 px-4 text-center align-middle whitespace-nowrap border-r-2 border-r-slate-800 dark:border-r-slate-300 border-b-2 border-b-slate-800 dark:border-b-slate-200',
                            isEvenInvoice
                              ? 'bg-white dark:bg-slate-900'
                              : 'bg-slate-50/90 dark:bg-slate-800/70'
                          )}
                        >
                          <div className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                            {item.partyName}
                          </div>
                          {groupInfo.rowSpan > 1 && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono bg-blue-100/80 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              {groupInfo.rowSpan} items in bill
                            </span>
                          )}
                          {isWorkshop && (
                            <span className="block mt-1 mx-auto w-fit rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-400 border border-amber-300/40">
                              Workshop
                            </span>
                          )}
                        </td>
                      </>
                    )}

                    {/* Description */}
                    <td
                      className={cn(
                        'py-2 px-3 text-slate-800 dark:text-slate-200 font-medium max-w-xs truncate border-r border-slate-300 dark:border-slate-600',
                        isLastInBill
                          ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                          : 'border-b border-b-slate-300 dark:border-b-slate-600'
                      )}
                      title={item.itemDescription}
                    >
                      {item.itemDescription}
                    </td>

                    {/* Quantity */}
                    <td
                      className={cn(
                        'py-2 px-3 text-center font-mono font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-300 dark:border-slate-600',
                        isLastInBill
                          ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                          : 'border-b border-b-slate-300 dark:border-b-slate-600'
                      )}
                    >
                      {item.quantity}
                    </td>

                    {/* Rate */}
                    <td
                      className={cn(
                        'py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300 border-r border-slate-300 dark:border-slate-600',
                        isLastInBill
                          ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                          : 'border-b border-b-slate-300 dark:border-b-slate-600'
                      )}
                    >
                      {formatNumber(item.rate)}
                    </td>

                    {/* Total Amount */}
                    <td
                      className={cn(
                        'py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 border-r border-slate-300 dark:border-slate-600',
                        isLastInBill
                          ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                          : 'border-b border-b-slate-300 dark:border-b-slate-600'
                      )}
                    >
                      {formatNumber(item.totalAmount)}
                    </td>

                    {/* Running Balance */}
                    <td
                      className={cn(
                        'py-2 px-3 text-right font-mono font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-300 dark:border-slate-600',
                        isLastInBill
                          ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                          : 'border-b border-b-slate-300 dark:border-b-slate-600'
                      )}
                    >
                      {formatNumber(item.balance)}
                    </td>

                    {/* Actions */}
                    <td
                      className={cn(
                        'py-2 px-3 text-center print:hidden border-r border-slate-400 dark:border-slate-600',
                        isLastInBill
                          ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                          : 'border-b border-b-slate-300 dark:border-b-slate-600'
                      )}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => startEdit(item.sNo - 1, item)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-[#0066cc] cursor-pointer transition-colors"
                          title="Edit Row"
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
              })
            )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-800 dark:border-slate-200 bg-slate-100 dark:bg-slate-800 font-bold text-xs">
                <td colSpan={6} className="py-3 px-3 uppercase text-slate-800 dark:text-slate-100 border border-slate-400 dark:border-slate-600">
                  Total Monthly Inward Expense ({selectedMonth})
                  <span className="ml-2 text-[10px] font-mono text-purple-700 dark:text-purple-300 font-normal">
                    fx: =SUM(I5:I{computedItems.length + 4})
                  </span>
                </td>
                <td className="py-3 px-3 text-center font-mono font-bold text-slate-900 dark:text-slate-100 border border-slate-400 dark:border-slate-600">
                  {totalQuantity}
                </td>
                <td className="py-3 px-3 border border-slate-400 dark:border-slate-600"></td>
                <td className="py-3 px-3 text-right font-mono text-slate-900 dark:text-slate-100 font-bold border border-slate-400 dark:border-slate-600">
                  {formatCurrency(totalAmount)}
                </td>
                <td className="py-3 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400 text-sm font-bold border border-slate-400 dark:border-slate-600">
                  {formatCurrency(totalAmount)}
                </td>
                <td className="border border-slate-400 dark:border-slate-600 print:hidden"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. MODAL: ADD NEW INWARD BILL / ITEM                                      */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4 print:hidden">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Add New Inward Bill / Item</h3>
                <p className="text-xs text-slate-500">
                  Auto-computes <code className="font-mono text-[#0066cc]">Total = Qty * Rate</code> & updates running balances
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleAddNewItem} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Date</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background px-3 py-1.5 text-slate-900 dark:text-slate-100 font-mono focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Inward No</label>
                  <input
                    type="text"
                    value={newInwardNo}
                    onChange={(e) => setNewInwardNo(e.target.value)}
                    placeholder="e.g. 7654"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background px-3 py-1.5 text-slate-900 dark:text-slate-100 font-mono font-semibold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Bill No</label>
                  <input
                    type="text"
                    value={newBillNo}
                    onChange={(e) => setNewBillNo(e.target.value)}
                    placeholder="e.g. 1022"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background px-3 py-1.5 text-slate-900 dark:text-slate-100 font-mono focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Party / Supplier Name</label>
                  <input
                    type="text"
                    value={newPartyName}
                    onChange={(e) => setNewPartyName(e.target.value)}
                    placeholder="e.g. Blue Reed"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background px-3 py-1.5 text-slate-900 dark:text-slate-100 font-semibold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Item Description</label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="e.g. 1520 Belt Black G6200"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background px-3 py-1.5 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background px-3 py-1.5 text-slate-900 dark:text-slate-100 font-mono font-semibold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Rate (PKR / Unit)</label>
                  <input
                    type="number"
                    min="1"
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value)}
                    placeholder="e.g. 1200"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background px-3 py-1.5 text-slate-900 dark:text-slate-100 font-mono font-semibold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Live Formula Preview Box */}
              <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 flex justify-between items-center">
                <span className="font-semibold text-slate-600 dark:text-slate-400">
                  Formula Result (<code className="font-mono text-purple-600">Qty * Rate</code>):
                </span>
                <span className="font-mono text-sm font-bold text-purple-700 dark:text-purple-300">
                  {formatCurrency((Number(newQuantity) || 0) * (Number(newRate) || 0))}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="erp-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="erp-btn-primary"
                >
                  Save Inward Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. MODAL: GENERATE NEW MONTH REGISTER                                     */}
      {/* ========================================================================= */}
      {showGenerateMonthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4 print:hidden">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-[#0066cc]">
                  <Calendar className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Generate New Month</h3>
                  <p className="text-xs text-slate-500">Create an empty register for manual expense entry</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGenerateMonthModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleGenerateMonth} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Select Month</label>
                  <select
                    value={genMonthName}
                    onChange={(e) => setGenMonthName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background px-3 py-2 text-slate-900 dark:text-slate-100 font-semibold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                  >
                    {MONTH_NAMES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Select Year</label>
                  <select
                    value={genYear}
                    onChange={(e) => setGenYear(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background px-3 py-2 text-slate-900 dark:text-slate-100 font-semibold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                  >
                    {['2025', '2026', '2027', '2028'].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick Suggestion Chips */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Quick Suggestions
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {['September 2026', 'October 2026', 'November 2026', 'December 2026'].map((preset) => {
                    const [pMonth, pYear] = preset.split(' ')
                    const isCurrent = genMonthName === pMonth && genYear === pYear
                    const alreadyExists = !!monthsData[preset]
                    return (
                      <button
                        type="button"
                        key={preset}
                        onClick={() => {
                          setGenMonthName(pMonth)
                          setGenYear(pYear)
                        }}
                        className={cn(
                          'px-2.5 py-1 rounded text-xs font-medium border transition-colors cursor-pointer',
                          isCurrent
                            ? 'border-[#0066cc] bg-blue-50 dark:bg-blue-950/40 text-[#0066cc] font-bold'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                        )}
                      >
                        {preset} {alreadyExists ? '(Exists)' : ''}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Preview info */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-600 dark:text-slate-400">Target Register:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 font-mono text-sm">
                    {genMonthName} {genYear}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Initial State:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    Clean Register (0 records)
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-700/60">
                  August 2026 records remain fully preserved. You can switch between months anytime.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowGenerateMonthModal(false)}
                  className="erp-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="erp-btn-primary inline-flex items-center gap-1.5"
                >
                  <Plus className="size-4" />
                  <span>Generate Month & Open</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
