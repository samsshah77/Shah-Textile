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
  Edit2,
  Trash2,
  Save,
  RotateCcw,
  X,
  Check,
} from 'lucide-react'

const STORAGE_KEY_DAILY_EXPENSE = 'sara_textile_daily_inward_v2'

export default function DailyExpensePage() {
  const [items, setItems] = useState<DailyInwardItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_DAILY_EXPENSE)
        if (stored) return JSON.parse(stored)
      } catch (err) {
        console.error(err)
      }
    }
    return accountsData.dailyExpense.inward
  })

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedParty, setSelectedParty] = useState<string>('ALL')
  const [isSaved, setIsSaved] = useState(false)

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
  // REACTIVE FORMULAS COMPUTATION
  // =========================================================================
  // In Excel: Total Amount = Qty * Rate
  // Sara AP = Total Amount
  // Running Balance = Prev Balance + Sara AP
  const computedItems = useMemo(() => {
    let runningBalance = 0
    return items.map((item, idx) => {
      const qty = Number(item.quantity) || 0
      const rate = Number(item.rate) || 0
      // Formula: Qty * Rate
      const totalAmount = qty * rate
      const saraAp = totalAmount
      runningBalance += saraAp

      return {
        ...item,
        sNo: idx + 1,
        totalAmount,
        saraAp,
        balance: runningBalance,
      }
    })
  }, [items])

  const totalAmount = useMemo(() => {
    return computedItems.reduce((s, i) => s + i.saraAp, 0)
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
    return filteredItems.reduce((s, i) => s + i.saraAp, 0)
  }, [filteredItems])

  // Save to localStorage
  const saveItems = (updated: DailyInwardItem[]) => {
    setItems(updated)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_DAILY_EXPENSE, JSON.stringify(updated))
    }
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  const handleReset = () => {
    if (confirm('Reset Daily Inward Expenses to the authentic Excel default (60 items • PKR 677,551)?')) {
      saveItems(accountsData.dailyExpense.inward)
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY_DAILY_EXPENSE)
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

    saveItems(updated)
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
      saveItems(updated)
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
      inwardNo: newInwardNo || `${7654 + items.length - 60}`,
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
    saveItems(updated)

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
    const headers = ['S.No', 'Date', 'Bill No', 'Inward No', 'Party Name', 'Description', 'Qty', 'Rate', 'Total Amount', 'Sara AP', 'Running Balance']
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
      item.saraAp,
      item.balance,
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', 'Sara_Textile_Daily_Inward_Expenses_Aug2026.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6 pb-16">
      {/* ========================================================================= */}
      {/* 1. HEADER SECTION                                                         */}
      {/* ========================================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="erp-badge-blue">
              Accounts Module • Dynamic Inward Register
            </span>
            <span className="text-xs font-semibold text-slate-500">• August 2026</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-1.5">
            Daily Expense & Inward Record
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Excel Formula Engine: <code className="font-mono text-[#0066cc]">Total = Qty * Rate</code> • <code className="font-mono text-purple-600">Balance = Prev + Sara AP</code> • <code className="font-mono text-emerald-600">Grand Total = =SUM(...)</code>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Add Item Button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="erp-btn-primary"
          >
            <PlusCircle className="size-3.5" />
            <span>Add Inward Bill / Item</span>
          </button>

          {/* Reset Button */}
          <button
            onClick={handleReset}
            title="Reset to Excel authentic data"
            className="erp-btn-secondary"
          >
            <RotateCcw className="size-3.5" />
            <span>Reset</span>
          </button>

          {/* Export CSV */}
          <button
            onClick={exportCSV}
            className="erp-btn-secondary"
          >
            <Download className="size-3.5 text-emerald-600" />
            <span>Export CSV</span>
          </button>

          {/* Print */}
          <button
            onClick={handlePrint}
            className="erp-btn-secondary"
          >
            <Printer className="size-3.5" />
            <span>Print Register</span>
          </button>
        </div>
      </div>

      {/* Save Toast Notification */}
      {isSaved && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2 animate-in fade-in print:hidden">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span>Formulas recalculated and register saved successfully!</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. FILTERS & SEARCH BAR                                                   */}
      {/* ========================================================================= */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-700 pb-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="size-3.5 text-slate-500" />
            <select
              value={selectedParty}
              onChange={(e) => setSelectedParty(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
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
              className="text-xs font-semibold text-[#0066cc] hover:underline cursor-pointer"
            >
              Reset Filter
            </button>
          )}
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search description, bill #, inward #, party..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-4 py-1.5 text-xs font-medium placeholder:text-slate-400 focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. PRINTABLE COMPANY HEADER                                               */}
      {/* ========================================================================= */}
      <div className="hidden print:block text-center border-b pb-4 mb-4">
        <h1 className="text-2xl font-bold uppercase tracking-wider text-slate-900">SARA TEXTILE</h1>
        <h2 className="text-sm font-semibold text-slate-700">Monthly Expense Account Payable and Cash New Item and Repairing</h2>
        <p className="text-xs font-medium text-slate-500">Month Of August-2026 • {computedItems.length} Itemized Line Items</p>
      </div>

      {/* ========================================================================= */}
      {/* 5. DATA TABLE WITH INLINE FORMULAS & INLINE EDITING                       */}
      {/* ========================================================================= */}
      <div className="erp-card shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="size-4 text-[#0066cc]" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Traders & Workshops Inward Register ({filteredItems.length} of {computedItems.length} records)
            </span>
          </div>
          <div className="text-right flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500">
              Showing Total: <strong className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">{formatCurrency(filteredTotal)}</strong>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 font-semibold uppercase text-[11px] text-slate-600 dark:text-slate-300">
                <th className="py-2.5 px-3 text-center w-12">S.No</th>
                <th className="py-2.5 px-3 w-24">Date</th>
                <th className="py-2.5 px-3 w-20">Bill No</th>
                <th className="py-2.5 px-3 w-20">Inw.No</th>
                <th className="py-2.5 px-3">Party Name</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3 text-center w-16">Qty</th>
                <th className="py-2.5 px-3 text-right w-24">Rate (PKR)</th>
                <th className="py-2.5 px-3 text-right w-28">
                  Total Amount
                  <span className="block text-[9px] font-mono text-purple-600 lowercase font-normal">fx: =Qty*Rate</span>
                </th>
                <th className="py-2.5 px-3 text-right w-28">Sara AP</th>
                <th className="py-2.5 px-3 text-right w-28">
                  Running Balance
                  <span className="block text-[9px] font-mono text-[#0066cc] lowercase font-normal">fx: =Prev+AP</span>
                </th>
                <th className="py-2.5 px-3 text-center w-20 print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredItems.map((item, idx) => {
                const isEditingThis = editingIndex === item.sNo - 1
                const isWorkshop = item.partyName.toLowerCase().includes('marhaba')

                if (isEditingThis) {
                  const editQty = Number(editForm.quantity) || 0
                  const editRate = Number(editForm.rate) || 0
                  const liveItemTotal = editQty * editRate

                  return (
                    <tr key={item.sNo} className="bg-amber-500/10">
                      <td className="py-2 px-3 text-center font-mono font-bold">{item.sNo}</td>
                      <td className="py-2 px-3">
                        <input
                          type="date"
                          value={editForm.date || ''}
                          onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                          className="w-28 rounded border border-slate-300 dark:border-slate-600 bg-background px-1.5 py-0.5 text-xs font-mono focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={editForm.billNo || ''}
                          onChange={(e) => setEditForm({ ...editForm, billNo: e.target.value })}
                          className="w-18 rounded border border-slate-300 dark:border-slate-600 bg-background px-1.5 py-0.5 text-xs font-mono focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={editForm.inwardNo || ''}
                          onChange={(e) => setEditForm({ ...editForm, inwardNo: e.target.value })}
                          className="w-18 rounded border border-slate-300 dark:border-slate-600 bg-background px-1.5 py-0.5 text-xs font-mono font-bold text-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={editForm.partyName || ''}
                          onChange={(e) => setEditForm({ ...editForm, partyName: e.target.value })}
                          className="w-32 rounded border border-slate-300 dark:border-slate-600 bg-background px-1.5 py-0.5 text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={editForm.itemDescription || ''}
                          onChange={(e) => setEditForm({ ...editForm, itemDescription: e.target.value })}
                          className="w-full rounded border border-slate-300 dark:border-slate-600 bg-background px-1.5 py-0.5 text-xs font-medium focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          value={editForm.quantity}
                          onChange={(e) => setEditForm({ ...editForm, quantity: Number(e.target.value) })}
                          className="w-14 rounded border border-slate-300 dark:border-slate-600 bg-background px-1 py-0.5 text-center font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          value={editForm.rate}
                          onChange={(e) => setEditForm({ ...editForm, rate: Number(e.target.value) })}
                          className="w-20 rounded border border-slate-300 dark:border-slate-600 bg-background px-1.5 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-purple-700 dark:text-purple-300">
                        {formatNumber(liveItemTotal)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold">
                        {formatNumber(liveItemTotal)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-400">
                        recalculates...
                      </td>
                      <td className="py-2 px-3 text-center print:hidden">
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

                return (
                  <tr
                    key={item.sNo}
                    className={cn(
                      'hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors',
                      isWorkshop && 'bg-amber-500/5'
                    )}
                  >
                    <td className="py-2 px-3 text-center font-mono font-medium text-slate-400">
                      {item.sNo}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {item.date}
                    </td>
                    <td className="py-2 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {item.billNo ? `#${item.billNo}` : '-'}
                    </td>
                    <td className="py-2 px-3 font-mono font-semibold text-[#0066cc] dark:text-sky-400">
                      {item.inwardNo ? `#${item.inwardNo}` : '-'}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {item.partyName}
                      {isWorkshop && (
                        <span className="ml-1.5 rounded-sm bg-amber-500/10 px-1 py-0.2 text-[9px] font-bold text-amber-700 dark:text-amber-400">
                          Workshop
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 font-medium max-w-xs truncate" title={item.itemDescription}>
                      {item.itemDescription}
                    </td>
                    <td className="py-2 px-3 text-center font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {item.quantity}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                      {formatNumber(item.rate)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {formatNumber(item.totalAmount)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatNumber(item.saraAp)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-500 dark:text-slate-400">
                      {formatNumber(item.balance)}
                    </td>
                    <td className="py-2 px-3 text-center print:hidden">
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
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 font-bold text-xs">
                <td colSpan={6} className="py-3 px-3 uppercase text-slate-800 dark:text-slate-200">
                  Total Monthly Inward Expense (August 2026)
                  <span className="ml-2 text-[10px] font-mono text-purple-600 dark:text-purple-400 font-normal">
                    fx: =SUM(J5:J{computedItems.length + 4})
                  </span>
                </td>
                <td className="py-3 px-3 text-center font-mono font-bold text-slate-900 dark:text-slate-100">
                  {totalQuantity}
                </td>
                <td className="py-3 px-3"></td>
                <td className="py-3 px-3 text-right font-mono text-slate-900 dark:text-slate-100 font-bold">
                  {formatCurrency(totalAmount)}
                </td>
                <td className="py-3 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400 text-sm font-bold">
                  {formatCurrency(totalAmount)}
                </td>
                <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                  {formatCurrency(totalAmount)}
                </td>
                <td className="print:hidden"></td>
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
    </div>
  )
}
