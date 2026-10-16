'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { expenseService, WorkshopSummary } from '@/services/expenseService'
import { accountsRead, accountsRemove, accountsWrite } from '@/services/accountsStore'
import { ACCOUNTS_KEYS } from '@/lib/accountsKeys'
import { InventoryPurchaseEntry } from '@/types/expense'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import {
  Printer,
  ArrowLeft,
  PlusCircle,
  CheckCircle2,
  Calculator,
  Edit3,
  Eye,
  RotateCcw,
  Save,
  Trash2,
  Info,
  Wrench,
  Download,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { AddWorkshopBillModal } from '@/components/accounts/AddWorkshopBillModal'

interface GroupedBill {
  billKey: string
  date: string
  billNo: string
  inwardNo: string
  items: (InventoryPurchaseEntry & { serialNo: number; runningBalance: number })[]
  billTotal: number
  startSerial: number
}

export default function WorkshopSpecificLedgerPage() {
  const params = useParams()
  const slug = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug as string) || ''
  const storageKey = `${ACCOUNTS_KEYS.WORKSHOP_PREFIX}${slug}`

  const [workshop, setWorkshop] = useState<WorkshopSummary | null>(null)
  const [entries, setEntries] = useState<InventoryPurchaseEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  // Direct quick line item form state
  const [billNo, setBillNo] = useState('')
  const [inwardNo, setInwardNo] = useState('')
  const [machineName, setMachineName] = useState('PU')
  const [itemDescription, setItemDescription] = useState('')
  const [quantity, setQuantity] = useState<number | string>('1')
  const [costPerItem, setCostPerItem] = useState<number | string>('')
  const [isSuccess, setIsSuccess] = useState(false)

  const reloadWorkshop = useCallback(() => {
    if (!slug) return
    const data = expenseService.getWorkshopBySlug(slug)
    if (data) {
      setWorkshop(data)
      const stored = accountsRead<InventoryPurchaseEntry[] | null>(storageKey, null)
      if (stored) {
        setEntries(stored)
        setLoading(false)
        return
      }
      setEntries(data.entries)
    }
    setLoading(false)
  }, [slug, storageKey])

  useEffect(() => {
    reloadWorkshop()
  }, [reloadWorkshop])

  // Handle cell edit with live reactive calculation: Amount = Qty * Rate
  const handleCellChange = (
    id: string,
    field: 'itemDescription' | 'quantity' | 'costPerItem',
    val: string | number
  ) => {
    setEntries((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const updated = { ...item, [field]: val }
        const q = Number(field === 'quantity' ? val : item.quantity) || 0
        const r = Number(field === 'costPerItem' ? val : item.costPerItem) || 0
        updated.totalPrice = Math.round(q * r)
        return updated
      })
    )
  }

  const handleDeleteRow = (id: string) => {
    setEntries((prev) => prev.filter((item) => item.id !== id))
  }

  const handleSave = () => {
    accountsWrite(storageKey, entries)
    expenseService.notifyDataChanged()
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2500)
  }

  const handleReset = () => {
    if (confirm('Reset workshop ledger to authentic original records?')) {
      accountsRemove(storageKey)
      const data = expenseService.getWorkshopBySlug(slug)
      if (data) {
        setEntries(data.entries)
      }
      expenseService.notifyDataChanged()
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2000)
    }
  }

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print()
  }

  const handleAddDirectItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!workshop) return
    const numQty = parseFloat(quantity as string)
    const numCost = parseFloat(costPerItem as string)
    if (!numQty || !numCost || !itemDescription) return

    const fullDesc = machineName ? `${itemDescription} (${machineName})` : itemDescription
    const newRecord: InventoryPurchaseEntry = {
      id: `ws-${slug}-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      billNo: billNo || `JOB-${Math.floor(100 + Math.random() * 900)}`,
      inwardNo: inwardNo || `GP-${Math.floor(7000 + Math.random() * 900)}`,
      partyName: workshop.workshopName,
      itemDescription: fullDesc,
      machineCategory: 'PU',
      quantity: numQty,
      costPerItem: numCost,
      totalPrice: Math.round(numQty * numCost),
    }

    const updated = [...entries, newRecord]
    setEntries(updated)
    accountsWrite(storageKey, updated)
    expenseService.notifyDataChanged()

    setBillNo('')
    setInwardNo('')
    setItemDescription('')
    setQuantity('1')
    setCostPerItem('')
    setIsSuccess(true)
    setTimeout(() => setIsSuccess(false), 2500)
  }

  // Reactive formulas & grouping
  const { groupedBills, totalPurchases, totalItems, uniqueBillsCount } = useMemo(() => {
    let currentBalance = 0
    let totalPurchasesSum = 0
    let totalItemsSum = 0
    const billSet = new Set<string>()

    const flatWithBalances = entries.map((entry, index) => {
      currentBalance += entry.totalPrice
      totalPurchasesSum += entry.totalPrice
      totalItemsSum += Number(entry.quantity) || 0
      if (entry.billNo) billSet.add(entry.billNo)

      return {
        ...entry,
        serialNo: index + 1,
        runningBalance: currentBalance,
      }
    })

    const groups: GroupedBill[] = []
    let currentGroup: GroupedBill | null = null

    flatWithBalances.forEach((item) => {
      const key = `${item.date}_${item.billNo}_${item.inwardNo}`
      if (!currentGroup || currentGroup.billKey !== key) {
        if (currentGroup) groups.push(currentGroup)
        currentGroup = {
          billKey: key,
          date: item.date,
          billNo: item.billNo,
          inwardNo: item.inwardNo,
          items: [item],
          billTotal: item.totalPrice,
          startSerial: item.serialNo,
        }
      } else {
        currentGroup.items.push(item)
        currentGroup.billTotal += item.totalPrice
      }
    })

    if (currentGroup) groups.push(currentGroup)
    return {
      groupedBills: groups,
      totalPurchases: totalPurchasesSum,
      totalItems: totalItemsSum,
      uniqueBillsCount: billSet.size || groups.length,
    }
  }, [entries])

  const exportCSV = () => {
    if (!workshop) return
    const headers = [
      'S.No',
      'Date',
      'Bill / Job #',
      'Gate Pass / Inward #',
      'Item / Job Description',
      'Quantity',
      'Rate',
      'Total Amount (PKR)',
      'Running Balance',
    ]
    let runBal = 0
    const rows = entries.map((it, idx) => {
      runBal += it.totalPrice
      return [
        idx + 1,
        `"${it.date}"`,
        `"${it.billNo}"`,
        `"${it.inwardNo}"`,
        `"${it.itemDescription}"`,
        it.quantity,
        it.costPerItem,
        it.totalPrice,
        runBal,
      ]
    })
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Sara_Textile_${workshop.workshopName}_Ledger.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (loading) {
    return <div className="p-12 text-center text-xs text-muted-foreground">Loading workshop ledger...</div>
  }

  if (!workshop) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center space-y-4">
        <h2 className="text-lg font-bold text-foreground">Workshop Not Found</h2>
        <p className="text-xs text-muted-foreground">The requested workshop could not be located in Sara Textile ERP.</p>
        <Link
          href="/accounts/workshops"
          className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700"
        >
          <ArrowLeft className="size-4" />
          <span>Return to Workshops Directory</span>
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      {/* 1. Header & Actions */}
      <div className="print:hidden">
        <PageHeader
          title={workshop.workshopName}
          showTitle={false}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Accounts', href: '/accounts/traders' },
            { label: 'Workshops', href: '/accounts/workshops' },
            { label: workshop.workshopName },
          ]}
          actions={
            <div className="inline-flex shrink-0 items-center gap-2">
              <Link href="/accounts/workshops" className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800">
                <ArrowLeft className="size-3.5" />
                <span>Back to Workshops</span>
              </Link>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="btn btn-sm btn-warning d-inline-flex align-items-center gap-1.5 shadow-xs text-dark fw-semibold"
              >
                <PlusCircle className="size-4" />
                <span>Record Job</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className={cn(
                  'erp-btn-secondary text-xs !min-h-9 !h-9',
                  isEditing ? 'bg-amber-100 text-amber-900 border-amber-300' : '!text-slate-800'
                )}
              >
                {isEditing ? <Eye className="size-3.5" /> : <Edit3 className="size-3.5" />}
                <span>{isEditing ? 'View Mode' : 'Edit Cells'}</span>
              </button>
              {isEditing && (
                <button
                  type="button"
                  onClick={handleSave}
                  className="btn btn-sm btn-success d-inline-flex align-items-center gap-1.5 shadow-xs"
                >
                  <Save className="size-4" />
                  <span>Save</span>
                </button>
              )}
              <button
                type="button"
                onClick={exportCSV}
                className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800"
              >
                <Download className="size-3.5" />
                <span>Export CSV</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800"
              >
                <Printer className="size-3.5" />
                <span>Print</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                title="Reset to Excel Defaults"
                className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-500 hover:!text-rose-600"
              >
                <RotateCcw className="size-3.5" />
              </button>
            </div>
          }
        />
      </div>

      {/* Save Toast Notification */}
      {isSaved && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between text-emerald-800 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span className="font-semibold">Workshop ledger changes saved to PostgreSQL database!</span>
          </div>
          <span className="text-[11px] text-emerald-600 font-mono">Cost Statement auto-updated</span>
        </div>
      )}

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:hidden">
        <div className="erp-card p-3 border-l-4 border-l-amber-500">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
            Total Jobs Amount
          </span>
          <p className="mt-1 text-lg font-black text-amber-700 font-mono">
            {formatCurrency(totalPurchases)}
          </p>
          <span className="text-[10px] text-slate-400">Total payable (repair)</span>
        </div>

        <div className="erp-card p-3 border-l-4 border-l-indigo-500">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
            Jobs / Invoices
          </span>
          <p className="mt-1 text-lg font-black text-slate-900 font-mono">
            {formatNumber(uniqueBillsCount)}
          </p>
          <span className="text-[10px] text-slate-400">{totalItems} line items</span>
        </div>

        <div className="erp-card p-3 border-l-4 border-l-blue-500">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
            Specialization
          </span>
          <p className="mt-1 text-sm font-bold text-slate-900 truncate">
            {workshop.type}
          </p>
          <span className="text-[10px] text-slate-400">Mechanical & Lathe</span>
        </div>

        <div className="erp-card p-3 border-l-4 border-l-emerald-500">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
            Current Balance
          </span>
          <p className="mt-1 text-lg font-black text-emerald-600 font-mono">
            {formatCurrency(totalPurchases - (workshop.paidAmount || 0))}
          </p>
          <span className="text-[10px] text-slate-400">Net payable balance</span>
        </div>
      </div>

      {/* 3. Printable Header */}
      <div className="hidden print:block text-center border-b pb-4 mb-4">
        <h1 className="text-2xl font-bold uppercase tracking-wider text-slate-900">SARA TEXTILE</h1>
        <h2 className="text-base font-bold text-slate-800">{workshop.workshopName} — Workshop Job Ledger</h2>
        <p className="text-xs font-medium text-slate-500">Specialization: {workshop.type} · Repair & Maintenance</p>
      </div>

      {/* 4. Quick Add Line Item Form (Print Hidden) */}
      <div className="erp-card p-4 border border-dashed border-amber-300 bg-amber-50/40 rounded-xl space-y-3 print:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="size-4 text-amber-700" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Quick Add Repair Job / Part
            </h3>
          </div>
          {isSuccess && (
            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="size-3.5" /> Added to ledger & daily inward!
            </span>
          )}
        </div>

        <form onSubmit={handleAddDirectItem} className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
          <div className="sm:col-span-2">
            <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Job / Bill #</label>
            <input
              type="text"
              placeholder="e.g. 242"
              value={billNo}
              onChange={(e) => setBillNo(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-mono"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Gate Pass #</label>
            <input
              type="text"
              placeholder="e.g. 7633"
              value={inwardNo}
              onChange={(e) => setInwardNo(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-mono"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Machine / Loom</label>
            <input
              type="text"
              placeholder="e.g. PU, Loom 14"
              value={machineName}
              onChange={(e) => setMachineName(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Job Description *</label>
            <input
              type="text"
              placeholder="e.g. Scissor Repaired 9pcs"
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
              required
            />
          </div>

          <div className="sm:col-span-1">
            <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Qty *</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-right font-mono"
              required
            />
          </div>

          <div className="sm:col-span-1">
            <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Rate (PKR) *</label>
            <input
              type="number"
              min="0"
              value={costPerItem}
              onChange={(e) => setCostPerItem(e.target.value)}
              placeholder="1000"
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-right font-mono"
              required
            />
          </div>

          <div className="sm:col-span-1 flex items-end">
            <button
              type="submit"
              className="w-full rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold py-1 px-2 text-xs flex items-center justify-center gap-1 shadow-xs"
            >
              <PlusCircle className="size-3.5" />
              <span>Add</span>
            </button>
          </div>
        </form>
      </div>

      {/* 5. Main Job Ledger Table (Grouped by Bill/Job) */}
      <div className="erp-card shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-5 py-3">
          <div>
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Itemized Workshop Repair Ledger
            </h2>
            <p className="text-[11px] text-slate-500">
              Live Excel Formula: <span className="font-semibold text-slate-700">Amount = Qty × Rate</span> ·{' '}
              <span className="font-semibold text-slate-700">Running Balance = Previous + Amount</span>
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium text-slate-500">Total Workshop Payable:</span>
            <p className="text-sm font-bold text-amber-700 font-mono">
              {formatCurrency(totalPurchases)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs border border-slate-400 dark:border-slate-600">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold uppercase text-[11px] border-b-2 border-slate-800 dark:border-slate-300">
                <th className="py-2.5 px-3 text-center w-10 border border-slate-400 dark:border-slate-600">S.No</th>
                <th className="py-2.5 px-3 w-24 border border-slate-400 dark:border-slate-600">Date</th>
                <th className="py-2.5 px-3 text-center w-20 border border-slate-400 dark:border-slate-600">Job / Bill #</th>
                <th className="py-2.5 px-3 text-center w-20 border border-slate-400 dark:border-slate-600 border-r-2 border-r-slate-800 dark:border-r-slate-300">Gate Pass #</th>
                <th className="py-2.5 px-3 border border-slate-400 dark:border-slate-600">Job / Part Description</th>
                <th className="py-2.5 px-3 text-right w-16 border border-slate-400 dark:border-slate-600">Qty</th>
                <th className="py-2.5 px-3 text-right w-24 border border-slate-400 dark:border-slate-600">Rate (PKR)</th>
                <th className="py-2.5 px-3 text-right w-28 border border-slate-400 dark:border-slate-600">Amount</th>
                <th className="py-2.5 px-3 text-right w-32 border border-slate-400 dark:border-slate-600 bg-amber-50/30">Running Balance</th>
                {isEditing && <th className="py-2.5 px-2 text-center w-10 border border-slate-400 dark:border-slate-600 print:hidden">Del</th>}
              </tr>
            </thead>
            <tbody>
              {groupedBills.length === 0 ? (
                <tr>
                  <td colSpan={isEditing ? 10 : 9} className="py-8 text-center text-slate-400 border border-slate-400 dark:border-slate-600">
                    No repair jobs recorded yet for {workshop.workshopName}. Use &quot;Record Job&quot; above to add entry.
                  </td>
                </tr>
              ) : (
                groupedBills.map((group, groupIdx) => {
                const rowSpan = group.items.length
                const isEvenGroup = groupIdx % 2 === 0

                return group.items.map((item, itemIdx) => {
                  const isFirstInBill = itemIdx === 0
                  const isLastInBill = itemIdx === rowSpan - 1

                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        'transition-colors',
                        isEvenGroup
                          ? 'bg-white dark:bg-slate-900'
                          : 'bg-slate-50/70 dark:bg-slate-800/40',
                        'hover:bg-amber-50/40 dark:hover:bg-slate-700/50'
                      )}
                    >
                      <td
                        className={cn(
                          'py-2.5 px-3 text-center font-mono font-medium text-slate-600 dark:text-slate-400 border-r-2 border-r-slate-400 dark:border-r-slate-500 border-l border-slate-400 dark:border-slate-600',
                          isLastInBill
                            ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                            : 'border-b border-b-slate-300 dark:border-b-slate-600'
                        )}
                      >
                        {item.serialNo}
                      </td>

                      {/* Date */}
                      {isFirstInBill && (
                        <td
                          rowSpan={rowSpan}
                          className={cn(
                            'py-3 px-3 font-mono text-center align-middle font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-400 dark:border-slate-600 border-b-2 border-b-slate-800 dark:border-b-slate-200 whitespace-nowrap',
                            isEvenGroup ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/90 dark:bg-slate-800/70'
                          )}
                        >
                          {group.date}
                        </td>
                      )}

                      {/* Bill / Job # */}
                      {isFirstInBill && (
                        <td
                          rowSpan={rowSpan}
                          className={cn(
                            'py-3 px-3 text-center font-mono font-semibold align-middle border-r border-slate-400 dark:border-slate-600 border-b-2 border-b-slate-800 dark:border-b-slate-200',
                            isEvenGroup ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/90 dark:bg-slate-800/70'
                          )}
                        >
                          <span className="inline-block px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 shadow-2xs">
                            {group.billNo ? `#${group.billNo}` : '—'}
                          </span>
                          {rowSpan > 1 && (
                            <span className="block mt-1 text-[10px] font-mono text-slate-500 font-semibold">
                              ({rowSpan} jobs)
                            </span>
                          )}
                        </td>
                      )}

                      {/* Gate Pass / Inward # */}
                      {isFirstInBill && (
                        <td
                          rowSpan={rowSpan}
                          className={cn(
                            'py-3 px-3 text-center font-mono align-middle font-bold text-[#0066cc] dark:text-sky-400 border-r-2 border-r-slate-800 dark:border-r-slate-300 border-b-2 border-b-slate-800 dark:border-b-slate-200',
                            isEvenGroup ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/90 dark:bg-slate-800/70'
                          )}
                        >
                          {group.inwardNo ? `#${group.inwardNo}` : '—'}
                        </td>
                      )}

                      {/* Job Description (Editable or View) */}
                      <td
                        className={cn(
                          'py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100 border-r border-slate-300 dark:border-slate-600',
                          isLastInBill
                            ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                            : 'border-b border-b-slate-300 dark:border-b-slate-600'
                        )}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            value={item.itemDescription}
                            onChange={(e) => handleCellChange(item.id, 'itemDescription', e.target.value)}
                            className="w-full rounded border border-slate-300 bg-white px-2 py-0.5 text-xs focus:border-amber-500"
                          />
                        ) : (
                          <span>{item.itemDescription}</span>
                        )}
                      </td>

                      {/* Quantity */}
                      <td
                        className={cn(
                          'py-2.5 px-3 text-right font-mono border-r border-slate-300 dark:border-slate-600',
                          isLastInBill
                            ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                            : 'border-b border-b-slate-300 dark:border-b-slate-600'
                        )}
                      >
                        {isEditing ? (
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleCellChange(item.id, 'quantity', e.target.value)}
                            className="w-16 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-right font-mono focus:border-amber-500"
                          />
                        ) : (
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{item.quantity}</span>
                        )}
                      </td>

                      {/* Rate */}
                      <td
                        className={cn(
                          'py-2.5 px-3 text-right font-mono border-r border-slate-300 dark:border-slate-600',
                          isLastInBill
                            ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                            : 'border-b border-b-slate-300 dark:border-b-slate-600'
                        )}
                      >
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={item.costPerItem}
                            onChange={(e) => handleCellChange(item.id, 'costPerItem', e.target.value)}
                            className="w-20 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-right font-mono focus:border-amber-500"
                          />
                        ) : (
                          <span className="text-slate-700 dark:text-slate-300">{formatNumber(item.costPerItem)}</span>
                        )}
                      </td>

                      {/* Total Amount = Qty * Rate */}
                      <td
                        className={cn(
                          'py-2.5 px-3 text-right font-mono font-bold text-amber-700 dark:text-amber-400 border-r border-slate-300 dark:border-slate-600',
                          isLastInBill
                            ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                            : 'border-b border-b-slate-300 dark:border-b-slate-600'
                        )}
                      >
                        {formatCurrency(item.totalPrice)}
                      </td>

                      {/* Running Balance = Prev + Amount */}
                      <td
                        className={cn(
                          'py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 bg-amber-50/20 dark:bg-amber-950/20 border-r border-slate-300 dark:border-slate-600',
                          isLastInBill
                            ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                            : 'border-b border-b-slate-300 dark:border-b-slate-600'
                        )}
                      >
                        {formatCurrency(item.runningBalance)}
                      </td>

                      {/* Delete Row button */}
                      {isEditing && (
                        <td
                          className={cn(
                            'py-2.5 px-2 text-center print:hidden border-r border-slate-400 dark:border-slate-600',
                            isLastInBill
                              ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                              : 'border-b border-b-slate-300 dark:border-b-slate-600'
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(item.id)}
                            className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                            title="Delete row"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })
              })
              )}
            </tbody>
            {entries.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-800 dark:border-slate-200 bg-slate-100 dark:bg-slate-800 font-bold text-xs text-slate-900 dark:text-slate-100">
                  <td colSpan={5} className="py-3 px-4 text-center uppercase tracking-wide border border-slate-400 dark:border-slate-600">
                    Grand Total ({entries.length} Job Items · {uniqueBillsCount} Invoices)
                  </td>
                  <td className="py-3 px-3 text-right font-mono border border-slate-400 dark:border-slate-600">
                    {formatNumber(totalItems)}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-500 text-[11px] border border-slate-400 dark:border-slate-600">—</td>
                  <td className="py-3 px-3 text-right font-mono text-amber-800 dark:text-amber-400 font-black border border-slate-400 dark:border-slate-600">
                    {formatCurrency(totalPurchases)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-900 dark:text-slate-100 font-black bg-amber-100/50 dark:bg-amber-950/40 border border-slate-400 dark:border-slate-600">
                    {formatCurrency(totalPurchases)}
                  </td>
                  {isEditing && <td className="border border-slate-400 dark:border-slate-600 print:hidden" />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Record Workshop Job Modal */}
      <AddWorkshopBillModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={reloadWorkshop}
        defaultWorkshopSlug={workshop.slug}
      />
    </div>
  )
}
