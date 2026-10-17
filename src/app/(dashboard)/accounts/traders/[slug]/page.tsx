'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { expenseService, TraderSummary } from '@/services/expenseService'
import { InventoryPurchaseEntry } from '@/types/expense'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import { Printer, ArrowLeft, Download, Calendar } from 'lucide-react'
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

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('sara_accounts_selected_month')
        if (saved) return saved
      } catch {}
    }
    return 'September'
  })
  const [trader, setTrader] = useState<TraderSummary | null>(null)
  const [entries, setEntries] = useState<InventoryPurchaseEntry[]>([])
  const [loading, setLoading] = useState(true)

  const reloadTrader = useCallback(() => {
    if (!slug) return
    const data = expenseService.getTraderBySlug(slug, selectedMonth)
    if (data) {
      setTrader(data)
      setEntries(data.entries || [])
    }
    setLoading(false)
  }, [slug, selectedMonth])

  useEffect(() => {
    reloadTrader()
    const handleSync = () => reloadTrader()
    const handleMonthChange = (e: Event) => {
      const customEvt = e as CustomEvent<string>
      if (customEvt.detail && customEvt.detail !== selectedMonth) {
        setSelectedMonth(customEvt.detail)
      }
    }
    window.addEventListener('accounts_synced', handleSync)
    window.addEventListener('accounts_month_changed', handleMonthChange)
    return () => {
      window.removeEventListener('accounts_synced', handleSync)
      window.removeEventListener('accounts_month_changed', handleMonthChange)
    }
  }, [reloadTrader, selectedMonth])

  const handleSelectMonth = (month: string) => {
    setSelectedMonth(month)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('sara_accounts_selected_month', month)
        window.dispatchEvent(new CustomEvent('accounts_month_changed', { detail: month }))
      } catch {}
    }
  }

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  // Live calculation: Running balance = previous balance + current item amount
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
    if (!trader) return
    const headers = [
      'S.No',
      'Date',
      'Bill No',
      'Inward No',
      'Item Description',
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
    link.setAttribute('download', `Sara_Textile_${trader.partyName}_Ledger.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (loading) {
    return <div className="p-12 text-center text-xs text-muted-foreground">Loading vendor sub-ledger...</div>
  }

  if (!trader) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center space-y-4">
        <h2 className="text-lg font-bold text-foreground">Trader Not Found</h2>
        <p className="text-xs text-muted-foreground">The requested vendor sub-ledger could not be located in Sara Textile ERP.</p>
        <Link
          href="/accounts/traders"
          className="inline-flex items-center gap-2 rounded-lg bg-[#0066cc] px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
        >
          <ArrowLeft className="size-4" />
          <span>Return to Traders Directory</span>
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      {/* 1. Header & Actions (Screen Only) */}
      <div className="print:hidden">
        <PageHeader
          title={trader.partyName}
          showTitle={false}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Accounts', href: '/accounts/traders' },
            { label: 'Traders', href: '/accounts/traders' },
            { label: trader.partyName },
          ]}
          actions={
            <div className="flex flex-wrap items-center justify-between gap-3 w-full">
              {/* Left Action: Back Button */}
              <div className="flex items-center gap-2">
                <Link href="/accounts/traders" className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800 dark:!text-slate-200">
                  <ArrowLeft className="size-3.5" />
                  <span>All Traders</span>
                </Link>
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
                    <option value="September" className="bg-background text-foreground">September 2026</option>
                    <option value="August" className="bg-background text-foreground">August 2026</option>
                    <option value="ALL" className="bg-background text-foreground">All Months</option>
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0066cc] hover:bg-[#0052a3] text-white shadow-xs transition-all cursor-pointer !min-h-9 !h-9"
                >
                  <Printer className="size-3.5" />
                  <span>Print Ledger</span>
                </button>
              </div>
            </div>
          }
        />
      </div>

      {/* 2. Official Vendor Sub-Ledger Document */}
      <div className="erp-card bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-6 sm:p-8 shadow-xs print:border-none print:p-0 print:shadow-none font-sans">
        {/* Clean Standard Statement Header (No gigantic text or redundant top totals) */}
        <div className="border-b border-slate-200 dark:border-slate-700 pb-3 mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {trader.partyName}
            </span>
            <span className="text-xs text-muted-foreground">• Vendor Sub-Ledger</span>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {selectedMonth === 'ALL' ? 'All Months' : `${selectedMonth} 2026`}
            </span>
            <span className="text-xs text-slate-400">({trader.type})</span>
          </div>

          <div className="text-xs text-muted-foreground font-mono">
            <span>Bills Logged: </span>
            <span className="font-bold text-foreground">{uniqueBillsCount}</span>
            <span className="mx-2">•</span>
            <span>Date: {new Date().toLocaleDateString('en-GB')}</span>
          </div>
        </div>

        {/* Clean Date-wise Table with Merged Consecutive Bill Groupings */}
        <div className="overflow-x-auto rounded-lg border border-slate-400 dark:border-slate-600 shadow-xs">
          <table className="w-full min-w-[920px] text-left border-collapse text-xs font-mono border border-slate-400 dark:border-slate-600">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold uppercase text-[11px] border-b-2 border-slate-800 dark:border-slate-300">
                <th className="border border-slate-400 dark:border-slate-600 py-2.5 px-2 text-center w-12 min-w-[50px]">S.No</th>
                <th className="border border-slate-400 dark:border-slate-600 py-2.5 px-3 text-center w-24 min-w-[95px]">Date</th>
                <th className="border border-slate-400 dark:border-slate-600 py-2.5 px-2.5 text-center w-20 min-w-[85px]">Bill No</th>
                <th className="border border-slate-400 dark:border-slate-600 border-r-2 border-r-slate-800 dark:border-r-slate-300 py-2.5 px-2.5 text-center w-20 min-w-[85px]">Inw #</th>
                <th className="border border-slate-400 dark:border-slate-600 py-2.5 px-4 text-left font-sans min-w-[260px]">Description</th>
                <th className="border border-slate-400 dark:border-slate-600 py-2.5 px-2 text-center w-16 min-w-[65px]">Qty</th>
                <th className="border border-slate-400 dark:border-slate-600 py-2.5 px-3 text-right w-24 min-w-[90px]">Rate (PKR)</th>
                <th className="border border-slate-400 dark:border-slate-600 py-2.5 px-3 text-right w-28 min-w-[110px]">Total Amount</th>
                <th className="border border-slate-400 dark:border-slate-600 py-2.5 px-3 text-right w-28 min-w-[110px] font-bold">Balance</th>
              </tr>
            </thead>
            <tbody>
              {groupedBills.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 font-sans">
                    No inward purchases recorded yet for {trader.partyName}. All purchases recorded on Daily Inward Register will automatically sync here.
                  </td>
                </tr>
              ) : (
                groupedBills.map((group, groupIdx) => {
                  const rowSpan = group.items.length
                  const isEvenGroup = groupIdx % 2 === 0

                  return group.items.map((item, itemIdx) => {
                    const isFirstRowOfBill = itemIdx === 0
                    const isLastRowOfBill = itemIdx === rowSpan - 1

                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          'text-slate-800 dark:text-slate-200 transition-colors',
                          isEvenGroup
                            ? 'bg-white dark:bg-slate-900'
                            : 'bg-slate-50/70 dark:bg-slate-800/40',
                          'hover:bg-blue-50/50 dark:hover:bg-slate-700/50'
                        )}
                      >
                        {/* S.No */}
                        <td
                          className={cn(
                            'py-2.5 px-2 text-center font-semibold text-slate-600 dark:text-slate-400 min-w-[50px] border-r-2 border-r-slate-400 dark:border-r-slate-500 border-l border-slate-400 dark:border-slate-600',
                            isLastRowOfBill
                              ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                              : 'border-b border-b-slate-300 dark:border-b-slate-600'
                          )}
                        >
                          {item.serialNo}
                        </td>

                        {/* Date (MERGED BOX for entire bill) */}
                        {isFirstRowOfBill && (
                          <td
                            rowSpan={rowSpan}
                            className={cn(
                              'border-r border-slate-400 dark:border-slate-600 border-b-2 border-b-slate-800 dark:border-b-slate-200 py-3 px-3 text-center align-middle font-semibold text-slate-800 dark:text-slate-200 min-w-[95px] whitespace-nowrap',
                              isEvenGroup
                                ? 'bg-white dark:bg-slate-900'
                                : 'bg-slate-50/90 dark:bg-slate-800/70'
                            )}
                          >
                            {group.date}
                          </td>
                        )}

                        {/* Bill No (MERGED BOX for entire bill) */}
                        {isFirstRowOfBill && (
                          <td
                            rowSpan={rowSpan}
                            className={cn(
                              'border-r border-slate-400 dark:border-slate-600 border-b-2 border-b-slate-800 dark:border-b-slate-200 py-3 px-2.5 text-center align-middle min-w-[85px]',
                              isEvenGroup
                                ? 'bg-white dark:bg-slate-900'
                                : 'bg-slate-50/90 dark:bg-slate-800/70'
                            )}
                          >
                            <span className="inline-block px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 shadow-2xs">
                              #{group.billNo}
                            </span>
                            {rowSpan > 1 && (
                              <span className="block mt-1 text-[10px] font-mono text-slate-500 font-semibold">
                                ({rowSpan} items)
                              </span>
                            )}
                          </td>
                        )}

                        {/* Inward No (MERGED BOX for entire bill) */}
                        {isFirstRowOfBill && (
                          <td
                            rowSpan={rowSpan}
                            className={cn(
                              'border-r-2 border-r-slate-800 dark:border-r-slate-300 border-b-2 border-b-slate-800 dark:border-b-slate-200 py-3 px-2.5 text-center align-middle text-[#0066cc] dark:text-sky-400 font-bold min-w-[85px]',
                              isEvenGroup
                                ? 'bg-white dark:bg-slate-900'
                                : 'bg-slate-50/90 dark:bg-slate-800/70'
                            )}
                          >
                            #{group.inwardNo}
                          </td>
                        )}

                        {/* Item Description */}
                        <td
                          className={cn(
                            'border-r border-slate-300 dark:border-slate-600 py-2 px-4 font-sans font-medium text-slate-800 dark:text-slate-200 min-w-[260px]',
                            isLastRowOfBill
                              ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                              : 'border-b border-b-slate-300 dark:border-b-slate-600'
                          )}
                        >
                          {item.itemDescription}
                        </td>

                        {/* Quantity */}
                        <td
                          className={cn(
                            'border-r border-slate-300 dark:border-slate-600 py-2 px-2 text-center font-bold min-w-[65px]',
                            isLastRowOfBill
                              ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                              : 'border-b border-b-slate-300 dark:border-b-slate-600'
                          )}
                        >
                          {item.quantity}
                        </td>

                        {/* Rate */}
                        <td
                          className={cn(
                            'border-r border-slate-300 dark:border-slate-600 py-2 px-3 text-right font-mono min-w-[90px]',
                            isLastRowOfBill
                              ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                              : 'border-b border-b-slate-300 dark:border-b-slate-600'
                          )}
                        >
                          {formatNumber(item.costPerItem, 0)}
                        </td>

                        {/* Total Amount for this item (Calculated: Qty * Rate) */}
                        <td
                          className={cn(
                            'border-r border-slate-300 dark:border-slate-600 py-2 px-3 text-right font-mono font-bold min-w-[110px]',
                            isLastRowOfBill
                              ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                              : 'border-b border-b-slate-300 dark:border-b-slate-600'
                          )}
                        >
                          {formatNumber(item.totalPrice, 0)}
                        </td>

                        {/* Running Balance */}
                        <td
                          className={cn(
                            'border-r border-slate-300 dark:border-slate-600 py-2 px-3 text-right font-mono font-bold min-w-[110px]',
                            isLastRowOfBill
                              ? 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
                              : 'border-b border-b-slate-300 dark:border-b-slate-600'
                          )}
                        >
                          {formatNumber(item.runningBalance, 0)}
                        </td>
                      </tr>
                    )
                  })
                })
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-800 dark:border-slate-200 bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-slate-100 text-xs">
                <td colSpan={5} className="border border-slate-400 dark:border-slate-600 py-3 px-4 font-sans uppercase min-w-[575px]">
                  Total Cumulative Purchases for {trader.partyName}:
                </td>
                <td className="border border-slate-400 dark:border-slate-600 py-3 px-2 text-center min-w-[65px]">
                  {totalItems}
                </td>
                <td className="border border-slate-400 dark:border-slate-600 py-3 px-3 text-right min-w-[90px]">-</td>
                <td className="border border-slate-400 dark:border-slate-600 py-3 px-3 text-right text-sm min-w-[110px] text-emerald-700 dark:text-emerald-400 font-bold">
                  {formatNumber(totalPurchases, 0)}
                </td>
                <td className="border border-slate-400 dark:border-slate-600 py-3 px-3 text-right text-sm font-bold min-w-[110px] text-slate-900 dark:text-slate-100">
                  {formatNumber(totalPurchases, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Verification Signatures for Official Print with Generous Signing Gap */}
        <div className="mt-16 pt-6 border-t border-slate-200 dark:border-slate-700 print:mt-12 pb-4">
          <div className="grid grid-cols-3 gap-8 text-center text-xs font-sans text-slate-600 dark:text-slate-400">
            <div className="flex flex-col items-center">
              <div className="h-14 w-full"></div>
              <div className="w-full border-t border-slate-400 dark:border-slate-500 pt-2 font-bold text-slate-900 dark:text-slate-100">
                Store Incharge
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Goods Receipt Verification</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="h-14 w-full"></div>
              <div className="w-full border-t border-slate-400 dark:border-slate-500 pt-2 font-bold text-slate-900 dark:text-slate-100">
                Mill Accountant
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Ledger Audited</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="h-14 w-full"></div>
              <div className="w-full border-t border-slate-400 dark:border-slate-500 pt-2 font-bold text-slate-900 dark:text-slate-100">
                Supplier Confirmation
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Party Stamp / Signature</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
