'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { expenseService, TraderSummary } from '@/services/expenseService'
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
  Sparkles,
  Info,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'

interface GroupedBill {
  billKey: string
  date: string
  billNo: string
  inwardNo: string
  items: (InventoryPurchaseEntry & { serialNo: number; runningBalance: number })[]
  billTotal: number
  startSerial: number
}

export default function TraderSpecificLedgerPage() {
  const params = useParams()
  const slug = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug as string) || ''
  const storageKey = `sara_textile_trader_custom_v1_${slug}`

  const [trader, setTrader] = useState<TraderSummary | null>(null)
  const [entries, setEntries] = useState<InventoryPurchaseEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaved, setIsSaved] = useState(false)

  // New Inward Item form state
  const [billNo, setBillNo] = useState('')
  const [inwardNo, setInwardNo] = useState('')
  const [itemDescription, setItemDescription] = useState('')
  const [quantity, setQuantity] = useState<number | string>('')
  const [costPerItem, setCostPerItem] = useState<number | string>('')
  const [machineCategory, setMachineCategory] = useState<any>('All')
  const [isSuccess, setIsSuccess] = useState(false)

  const reloadTrader = () => {
    if (!slug) return
    const data = expenseService.getTraderBySlug(slug)
    if (data) {
      setTrader(data)
      // Check localStorage for customized entries
      if (typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem(storageKey)
          if (stored) {
            setEntries(JSON.parse(stored))
            setLoading(false)
            return
          }
        } catch (e) {
          console.error(e)
        }
      }
      setEntries(data.entries)
    }
    setLoading(false)
  }

  useEffect(() => {
    reloadTrader()
  }, [slug])

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
        // Live Excel formula: =Qty * Rate
        updated.totalPrice = Math.round(q * r)
        return updated
      })
    )
  }

  // Delete row
  const handleDeleteRow = (id: string) => {
    setEntries((prev) => prev.filter((item) => item.id !== id))
  }

  // Save to LocalStorage
  const handleSave = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(entries))
    }
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2500)
  }

  // Reset to Excel Defaults
  const handleReset = () => {
    if (confirm('Reset ledger to the authentic Excel original records?')) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(storageKey)
      }
      const data = expenseService.getTraderBySlug(slug)
      if (data) {
        setEntries(data.entries)
      }
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2000)
    }
  }

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!trader) return
    const numQty = parseFloat(quantity as string)
    const numCost = parseFloat(costPerItem as string)
    if (!numQty || !numCost || !itemDescription) return

    const newRecord: InventoryPurchaseEntry = {
      id: `tr-custom-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      billNo: billNo || `BILL-${Math.floor(1000 + Math.random() * 9000)}`,
      inwardNo: inwardNo || `INW-${Math.floor(7000 + Math.random() * 900)}`,
      partyName: trader.partyName,
      itemDescription,
      machineCategory,
      quantity: numQty,
      costPerItem: numCost,
      totalPrice: Math.round(numQty * numCost),
    }

    const updated = [...entries, newRecord]
    setEntries(updated)
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(updated))
    }

    setBillNo('')
    setInwardNo('')
    setItemDescription('')
    setQuantity('')
    setCostPerItem('')
    setIsSuccess(true)
    setTimeout(() => setIsSuccess(false), 2500)
  }

  // =========================================================================
  // LIVE EXCEL FORMULAS COMPUTATION
  // =========================================================================
  // 1. Running Balance Formula: =Prev + Amount
  // 2. Group contiguous entries sharing (date, billNo, inwardNo) into single merged boxes
  const { groupedBills, totalPurchases, totalItems, uniqueBillsCount } = useMemo(() => {
    let currentBalance = 0
    let totalPurchasesSum = 0
    let totalItemsSum = 0
    const billSet = new Set<string>()

    const flatWithBalances = entries.map((entry, index) => {
      // Excel Formula: Running Balance = Previous Running Balance + Total Amount
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

  if (loading) {
    return <div className="p-12 text-center text-xs text-muted-foreground">Loading specific trader ledger...</div>
  }

  if (!trader) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center space-y-4">
        <h2 className="text-lg font-bold text-foreground">Trader / Workshop Not Found</h2>
        <p className="text-xs text-muted-foreground">The requested vendor sub-ledger could not be located in Sara Textile ERP.</p>
        <Link
          href="/accounts/traders"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
        >
          <ArrowLeft className="size-4" />
          <span>Return to Traders Directory</span>
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div className="print:hidden">
        <PageHeader
          title={trader.partyName}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Accounts', href: '/accounts/traders' },
            { label: 'Traders', href: '/accounts/traders' },
            { label: trader.partyName },
          ]}
          actions={
            <>
              <Link
                href="/accounts/traders"
                className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
              >
                <ArrowLeft className="size-4" />
                <span>All Traders</span>
              </Link>
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className={cn(
                  'btn btn-sm d-inline-flex align-items-center gap-1',
                  isEditing ? 'btn-warning' : 'btn-outline-secondary'
                )}
              >
                {isEditing ? <Eye className="size-3.5" /> : <Edit3 className="size-3.5" />}
                <span>{isEditing ? 'View Mode' : 'Edit'}</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
                title="Reset to official Excel default records"
              >
                <RotateCcw className="size-3.5" />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="btn btn-sm btn-success d-inline-flex align-items-center gap-1"
              >
                <Save className="size-3.5" />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"
              >
                <Printer className="size-3.5" />
                <span>Print</span>
              </button>
            </>
          }
        />
      </div>

      {/* Save Notification Toast */}
      {isSaved && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400 print:hidden animate-in fade-in">
          <CheckCircle2 className="size-4" />
          <span>Vendor ledger changes saved to local storage! Dynamic formulas active.</span>
        </div>
      )}

      {/* Formula & Live Calculation Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 px-4 py-2.5 text-xs print:hidden">
        <div className="flex flex-wrap items-center gap-2 font-mono">
          <div className="flex items-center gap-1.5 rounded-md bg-white dark:bg-slate-800 px-2.5 py-1 border border-slate-200 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200">
            <Calculator className="size-3.5 text-[#0066cc]" />
            <span>fx: Total Amount = Quantity × Rate</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-white dark:bg-slate-800 px-2.5 py-1 border border-slate-200 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200">
            <span>fx: Running Balance = Prev Balance + Amount</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-white dark:bg-slate-800 px-2.5 py-1 border border-slate-200 dark:border-slate-700 font-bold text-emerald-700 dark:text-emerald-400">
            <span>fx: Total Purchases = SUM(Bill Amounts)</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
          <Sparkles className="size-3 text-amber-500" />
          <span>Any edit instantly updates all subsequent running balances & totals</span>
        </div>
      </div>

      {/* Quick Add Purchase Bill for this specific trader */}
      <form
        onSubmit={handleAddItem}
        className="erp-card p-5 space-y-4 shadow-xs print:hidden"
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2.5">
          <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
            Quick Log Inward Bill For {trader.partyName}
          </h3>
          <span className="text-[11px] font-mono text-slate-500">{trader.type}</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 text-xs">
          <div>
            <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Bill / Invoice # *</label>
            <input
              type="text"
              required
              placeholder="e.g. 1019"
              value={billNo}
              onChange={(e) => setBillNo(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background px-3 py-1.5 font-mono text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Inward Pass #</label>
            <input
              type="text"
              placeholder="e.g. 7650"
              value={inwardNo}
              onChange={(e) => setInwardNo(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background px-3 py-1.5 font-mono text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Item / Job Description *</label>
            <input
              type="text"
              required
              placeholder="e.g. Jackguard Arm New / Machine Worked"
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background px-3 py-1.5 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Qty *</label>
            <input
              type="number"
              required
              min="1"
              placeholder="Qty"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background px-3 py-1.5 font-mono font-bold text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Rate (PKR) *</label>
            <input
              type="number"
              required
              min="0"
              placeholder="Rate"
              value={costPerItem}
              onChange={(e) => setCostPerItem(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background px-3 py-1.5 font-mono font-bold text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          {isSuccess && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <CheckCircle2 className="size-4" />
              Bill item logged to {trader.partyName} ledger!
            </span>
          )}
          <button
            type="submit"
            className="ml-auto flex items-center gap-1.5 erp-btn-primary"
          >
            <PlusCircle className="size-3.5" />
            <span>Add Bill Item</span>
          </button>
        </div>
      </form>

      {/* Formal Printable Vendor Sub-Ledger Document with Merged Date/Bill/Inward Cells */}
      <div className="erp-card bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-6 sm:p-8 shadow-xs print:border-none print:p-0 print:shadow-none font-sans">
        {/* Header */}
        <div className="border-b border-slate-200 dark:border-slate-700 pb-4 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold uppercase text-slate-900 dark:text-slate-100">
                SARA TEXTILE (PVT) LIMITED
              </h1>
              <h2 className="text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
                Vendor Sub-Ledger Statement: <span className="underline">{trader.partyName}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Category: {trader.type} • Faisalabad Weaving Mill Unit #1
              </p>
            </div>

            <div className="text-right font-mono text-xs">
              <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">TOTAL PURCHASE: {formatCurrency(totalPurchases)}</div>
              <div className="text-slate-600 dark:text-slate-400">Bills Logged: {uniqueBillsCount} Bills ({totalItems} Units)</div>
              <div className="text-slate-400 mt-1">Generated: {new Date().toLocaleDateString('en-GB')}</div>
            </div>
          </div>
        </div>

        {/* Ledger Table with Merged Cells */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs">
          <table className="w-full min-w-[920px] text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-semibold uppercase text-[11px] text-slate-600 dark:text-slate-300">
                <th className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-2 text-center w-12 min-w-[50px]">S.No</th>
                <th className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-3 text-center w-24 min-w-[95px]">Date</th>
                <th className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-2.5 text-center w-20 min-w-[85px]">Bill No</th>
                <th className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-2.5 text-center w-20 min-w-[85px]">Inw #</th>
                <th className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-4 text-left font-sans min-w-[260px]">Description</th>
                <th className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-2 text-center w-16 min-w-[65px]">Qty</th>
                <th className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-3 text-right w-24 min-w-[90px]">Rate</th>
                <th className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-3 text-right w-28 min-w-[110px]">Total Amount</th>
                <th className="py-2.5 px-3 text-right w-28 min-w-[110px] font-bold">Balance</th>
                {isEditing && (
                  <th className="border-l border-slate-200 dark:border-slate-700 py-2.5 px-2 text-center w-12 print:hidden">Del</th>
                )}
              </tr>
            </thead>
            <tbody>
              {groupedBills.map((group) => {
                const rowSpan = group.items.length
                return group.items.map((item, itemIdx) => {
                  const isFirstRowOfBill = itemIdx === 0
                  const isLastRowOfBill = itemIdx === rowSpan - 1

                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        'text-slate-800 dark:text-slate-200 hover:bg-slate-50/60 dark:hover:bg-slate-800/40',
                        isLastRowOfBill ? 'border-b border-slate-300 dark:border-slate-600' : 'border-b border-slate-200 dark:border-slate-700'
                      )}
                    >
                      {/* S.No */}
                      <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-center font-semibold text-slate-500 min-w-[50px]">
                        {item.serialNo}
                      </td>

                      {/* Date (MERGED BOX for entire bill) */}
                      {isFirstRowOfBill && (
                        <td
                          rowSpan={rowSpan}
                          className="border-r border-slate-200 dark:border-slate-700 py-2 px-3 text-center align-middle font-semibold text-slate-700 dark:text-slate-300 bg-slate-50/60 dark:bg-slate-800/40 min-w-[95px]"
                        >
                          {group.date}
                        </td>
                      )}

                      {/* Bill No (MERGED BOX for entire bill) */}
                      {isFirstRowOfBill && (
                        <td
                          rowSpan={rowSpan}
                          className="border-r border-slate-200 dark:border-slate-700 py-2 px-2.5 text-center align-middle font-bold text-slate-900 dark:text-slate-100 bg-slate-50/60 dark:bg-slate-800/40 min-w-[85px]"
                        >
                          {group.billNo}
                        </td>
                      )}

                      {/* Inward No (MERGED BOX for entire bill) */}
                      {isFirstRowOfBill && (
                        <td
                          rowSpan={rowSpan}
                          className="border-r border-slate-200 dark:border-slate-700 py-2 px-2.5 text-center align-middle text-[#0066cc] dark:text-sky-400 bg-slate-50/60 dark:bg-slate-800/40 font-semibold min-w-[85px]"
                        >
                          {group.inwardNo}
                        </td>
                      )}

                      {/* Item Description */}
                      <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-4 font-sans font-medium text-slate-800 dark:text-slate-200 min-w-[260px]">
                        {isEditing ? (
                          <input
                            type="text"
                            value={item.itemDescription}
                            onChange={(e) => handleCellChange(item.id, 'itemDescription', e.target.value)}
                            className="w-full rounded border border-slate-300 dark:border-slate-600 bg-background px-2 py-0.5 text-xs text-foreground focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                          />
                        ) : (
                          item.itemDescription
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-center font-bold min-w-[65px]">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => handleCellChange(item.id, 'quantity', e.target.value)}
                            className="w-full rounded border border-slate-300 dark:border-slate-600 bg-background px-1 py-0.5 text-center font-bold text-xs text-foreground focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                          />
                        ) : (
                          item.quantity
                        )}
                      </td>

                      {/* Rate */}
                      <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-3 text-right min-w-[90px]">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={item.costPerItem}
                            onChange={(e) => handleCellChange(item.id, 'costPerItem', e.target.value)}
                            className="w-full rounded border border-slate-300 dark:border-slate-600 bg-background px-1 py-0.5 text-right font-bold text-xs text-foreground focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                          />
                        ) : (
                          formatNumber(item.costPerItem, 0)
                        )}
                      </td>

                      {/* Total Amount for this item (Calculated: Qty * Rate) */}
                      <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-3 text-right font-bold min-w-[110px]">
                        {formatNumber(item.totalPrice, 0)}
                      </td>

                      {/* Running Balance (Calculated: Prev + Amount) */}
                      <td className="py-2 px-3 text-right font-bold min-w-[110px]">
                        {formatNumber(item.runningBalance, 0)}
                      </td>

                      {/* Action (Delete row in Edit mode) */}
                      {isEditing && (
                        <td className="border-l border-slate-200 dark:border-slate-700 py-2 px-2 text-center print:hidden">
                          <button
                            onClick={() => handleDeleteRow(item.id)}
                            className="rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Delete row"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-slate-100 text-xs">
                <td colSpan={5} className="border-r border-slate-200 dark:border-slate-700 py-3 px-4 font-sans uppercase min-w-[575px]">
                  Total Cumulative Purchases for {trader.partyName}:
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-3 px-2 text-center min-w-[65px]">
                  {totalItems}
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-3 px-3 text-right min-w-[90px]">-</td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-3 px-3 text-right text-sm min-w-[110px] text-emerald-700 dark:text-emerald-400 font-bold">
                  {formatNumber(totalPurchases, 0)}
                </td>
                <td className="py-3 px-3 text-right text-sm font-bold min-w-[110px] text-slate-900 dark:text-slate-100">
                  {formatNumber(totalPurchases, 0)}
                </td>
                {isEditing && <td className="border-l border-slate-200 dark:border-slate-700 print:hidden" />}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Verification Signatures */}
        <div className="mt-12 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="grid grid-cols-3 gap-6 text-center text-xs font-mono text-slate-600 dark:text-slate-400">
            <div>
              <div className="border-t border-slate-300 dark:border-slate-600 pt-1.5 font-bold text-slate-800 dark:text-slate-200">Store Incharge</div>
              <div className="text-[10px] text-slate-500">Goods Receipt Verification</div>
            </div>
            <div>
              <div className="border-t border-slate-300 dark:border-slate-600 pt-1.5 font-bold text-slate-800 dark:text-slate-200">Mill Accountant</div>
              <div className="text-[10px] text-slate-500">Ledger Audited</div>
            </div>
            <div>
              <div className="border-t border-slate-300 dark:border-slate-600 pt-1.5 font-bold text-slate-800 dark:text-slate-200">Supplier Confirmation</div>
              <div className="text-[10px] text-slate-500">Party Stamp / Signature</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
