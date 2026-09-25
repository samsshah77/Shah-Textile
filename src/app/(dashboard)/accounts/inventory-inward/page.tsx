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

  const [monthsData, setMonthsData] = useState<Record<string, MonthlyInventorySheet>>(() =>
    accountsRead(STORAGE_KEY_INVENTORY, accountsData.inventoryControl.months)
  )

  const [isSaved, setIsSaved] = useState(false)

  // Editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Partial<InventoryItem>>({})

  // Add Item Modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [newDate, setNewDate] = useState('2026-08-31')
  const [newBillNo, setNewBillNo] = useState('')
  const [newInwardNo, setNewInwardNo] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newCompany, setNewCompany] = useState('')
  const [newMachine, setNewMachine] = useState('PU')
  const [newQuantity, setNewQuantity] = useState<number | string>(1)
  const [newCost, setNewCost] = useState<number | string>('')

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

    // Reset modal
    setNewDescription('')
    setNewCost('')
    setNewQuantity(1)
    setShowAddModal(false)
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
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Accounts', href: '/accounts/inventory-inward' },
            { label: 'Store Inventory' },
          ]}
          actions={
            <>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"
              >
                <PlusCircle className="size-4" />
                <span>Add Purchase Item</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                title="Reset to Excel authentic data"
                className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
              >
                <RotateCcw className="size-3.5" />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={exportCSV}
                className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
              >
                <Download className="size-4 text-emerald-600" />
                <span>Export CSV</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"
              >
                <Printer className="size-4" />
                <span>Print</span>
              </button>
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
      {/* 2. MONTH TABS                                                             */}
      {/* ========================================================================= */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5 shadow-xs scrollbar-none print:hidden">
        {MONTH_KEYS.map((month) => {
          const sheet = computedMonths[month]
          const isSelected = selectedMonth === month
          return (
            <button
              key={month}
              onClick={() => {
                setSelectedMonth(month)
                setFilterMachine('ALL')
                setEditingIndex(null)
              }}
              className={cn(
                'erp-filter-tab shrink-0 rounded-xl',
                isSelected
                  ? 'bg-[#0066cc] text-white shadow-xs'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              <span>{month}</span>
              <span
                className={cn(
                  'erp-count-chip font-mono rounded-md',
                  isSelected
                    ? 'bg-white/20 text-white'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {sheet ? `${sheet.itemsCount}` : '0'}
              </span>
            </button>
          )
        })}
      </div>

      {/* ========================================================================= */}
      {/* 4. SEARCH & MACHINE FILTER                                                */}
      {/* ========================================================================= */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          {/* Machine Filter */}
          <div className="flex items-center gap-1.5">
            <Cpu className="size-4 text-muted-foreground" />
            <select
              value={filterMachine}
              onChange={(e) => setFilterMachine(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground focus:border-blue-500 focus:outline-hidden"
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
              Reset Machine Filter
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item, company, bill, inward..."
            className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-2 text-xs font-medium placeholder:text-muted-foreground focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. PRINTABLE COMPANY HEADER                                               */}
      {/* ========================================================================= */}
      <div className="hidden print:block text-center border-b pb-4 mb-4">
        <h1 className="text-2xl font-black uppercase tracking-wider text-slate-900">SARA TEXTILE</h1>
        <h2 className="text-base font-bold text-slate-700">Store Inventory Control Sheet</h2>
        <p className="text-xs font-semibold text-slate-500">
          For the Month of {selectedMonth} 2026 • Total: PKR {formatNumber(activeMonthSheet.totalAmount)}
        </p>
      </div>

      {/* ========================================================================= */}
      {/* 6. DATA TABLE WITH INLINE FORMULAS & EDITING                              */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <PackageCheck className="size-4 text-purple-600 dark:text-purple-400" />
            <span className="text-xs font-black uppercase tracking-wider text-foreground">
              {selectedMonth} Store Purchases ({filteredItems.length} records)
            </span>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-muted-foreground">{selectedMonth} Total: </span>
            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {formatCurrency(activeMonthSheet.totalAmount)}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-black uppercase text-[10px] text-muted-foreground tracking-wider">
                <th className="py-3 px-3 text-center w-12">S.No</th>
                <th className="py-3 px-3 w-24">Date</th>
                <th className="py-3 px-3 w-20">Bill No</th>
                <th className="py-3 px-3 w-20">In No</th>
                <th className="py-3 px-3">Item Description</th>
                <th className="py-3 px-3">Company / Trader</th>
                <th className="py-3 px-3 text-center w-20">Machine</th>
                <th className="py-3 px-3 text-center w-14">Qty</th>
                <th className="py-3 px-3 text-right w-24">Cost / Item</th>
                <th className="py-3 px-3 text-right w-28">
                  Total Price (PKR)
                  <span className="block text-[8px] font-mono text-purple-600 lowercase font-normal">fx: =Qty*Cost</span>
                </th>
                <th className="py-3 px-3 text-center w-20 print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.map((item, idx) => {
                const isEditingThis = editingIndex === item.sNo - 1

                if (isEditingThis) {
                  const editQty = Number(editForm.quantity) || 0
                  const editCost = Number(editForm.costPerItem) || 0
                  const liveItemTotal = editQty * editCost

                  return (
                    <tr key={item.sNo} className="bg-purple-500/10">
                      <td className="py-2.5 px-3 text-center font-mono font-bold">{item.sNo}</td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={editForm.date || ''}
                          onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                          className="w-24 rounded border border-purple-500 bg-background px-1.5 py-1 text-xs font-mono"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={editForm.billNo || ''}
                          onChange={(e) => setEditForm({ ...editForm, billNo: e.target.value })}
                          className="w-18 rounded border border-purple-500 bg-background px-1.5 py-1 text-xs font-mono"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={editForm.inwardNo || ''}
                          onChange={(e) => setEditForm({ ...editForm, inwardNo: e.target.value })}
                          className="w-18 rounded border border-purple-500 bg-background px-1.5 py-1 text-xs font-mono text-purple-600"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={editForm.itemDescription || ''}
                          onChange={(e) => setEditForm({ ...editForm, itemDescription: e.target.value })}
                          className="w-full rounded border border-purple-500 bg-background px-1.5 py-1 text-xs font-medium"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={editForm.companyName || ''}
                          onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                          className="w-32 rounded border border-purple-500 bg-background px-1.5 py-1 text-xs font-medium"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={editForm.machineName || ''}
                          onChange={(e) => setEditForm({ ...editForm, machineName: e.target.value })}
                          className="w-16 rounded border border-purple-500 bg-background px-1 py-1 text-xs text-center"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          value={editForm.quantity}
                          onChange={(e) => setEditForm({ ...editForm, quantity: Number(e.target.value) })}
                          className="w-14 rounded border border-purple-500 bg-background px-1 py-1 text-center font-mono text-xs font-bold"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          value={editForm.costPerItem}
                          onChange={(e) => setEditForm({ ...editForm, costPerItem: Number(e.target.value) })}
                          className="w-20 rounded border border-purple-500 bg-background px-1.5 py-1 text-right font-mono text-xs font-bold"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-purple-700 dark:text-purple-300">
                        {formatNumber(liveItemTotal)}
                      </td>
                      <td className="py-2.5 px-3 text-center print:hidden">
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
                  <tr key={item.sNo} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-muted-foreground">
                      {item.sNo}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-muted-foreground whitespace-nowrap">
                      {item.date || '-'}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-foreground whitespace-nowrap">
                      {item.billNo ? `#${item.billNo}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-purple-600 dark:text-purple-400 whitespace-nowrap">
                      {item.inwardNo ? `#${item.inwardNo}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-foreground font-semibold max-w-xs truncate" title={item.itemDescription}>
                      {item.itemDescription}
                    </td>
                    <td className="py-2.5 px-3 text-foreground font-medium whitespace-nowrap">
                      {item.companyName || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {item.machineName ? (
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground">
                          {item.machineName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold">
                      {item.quantity}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                      {formatNumber(item.costPerItem)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-foreground">
                      {formatNumber(item.totalPrice)}
                    </td>
                    <td className="py-2.5 px-3 text-center print:hidden">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => startEdit(item.sNo - 1, item)}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-purple-600 cursor-pointer transition-colors"
                          title="Edit Row"
                        >
                          <Edit2 className="size-3.5" />
                        </button>
                        <button
                          onClick={() => deleteRow(item.sNo - 1)}
                          className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
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
              <tr className="border-t-2 border-border bg-muted/50 font-black text-xs">
                <td colSpan={7} className="py-3 px-3 uppercase text-foreground">
                  {selectedMonth} Total Purchases
                  <span className="ml-2 text-[10px] font-mono text-purple-700 font-normal">
                    fx: =SUM(J6:J{activeMonthSheet.items.length + 5})
                  </span>
                </td>
                <td className="py-3 px-3 text-center font-mono font-bold text-foreground">
                  {filteredItems.reduce((s, it) => s + (it.quantity || 1), 0)}
                </td>
                <td className="py-3 px-3"></td>
                <td className="py-3 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 text-sm font-black">
                  {formatCurrency(filteredTotal)}
                </td>
                <td className="print:hidden"></td>
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
    </div>
  )
}
