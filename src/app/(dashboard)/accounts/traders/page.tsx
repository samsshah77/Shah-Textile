'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { expenseService, TraderSummary } from '@/services/expenseService'
import { formatCurrency, formatNumber } from '@/lib/utils'
import {
  Building2,
  Printer,
  Search,
  ExternalLink,
  Download,
  PlusCircle,
  TrendingUp,
  Receipt,
  RotateCcw,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { AddTraderBillModal } from '@/components/accounts/AddTraderBillModal'

export default function TradersDirectoryPage() {
  const [traders, setTraders] = useState<TraderSummary[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [modalDefaultSlug, setModalDefaultSlug] = useState<string | undefined>()

  const loadTraders = useCallback(() => {
    const list = expenseService.getTradersList()
    setTraders(list)
  }, [])

  useEffect(() => {
    loadTraders()
    const handleSync = () => loadTraders()
    window.addEventListener('accounts_synced', handleSync)
    return () => window.removeEventListener('accounts_synced', handleSync)
  }, [loadTraders])

  // Top KPIs
  const totalTradersCount = traders.length
  const totalBillsCount = useMemo(() => traders.reduce((s, t) => s + (t.totalBills || 0), 0), [traders])
  const totalItemsCount = useMemo(() => traders.reduce((s, t) => s + (t.totalItems || 0), 0), [traders])
  const totalPayable = useMemo(() => traders.reduce((s, t) => s + (t.totalPurchases || 0), 0), [traders])

  const filteredTraders = useMemo(() => {
    const q = searchTerm.toLowerCase().trim()
    if (!q) return traders
    return traders.filter(
      (t) =>
        t.partyName.toLowerCase().includes(q) ||
        (t.remarks && t.remarks.toLowerCase().includes(q)) ||
        t.type.toLowerCase().includes(q)
    )
  }, [traders, searchTerm])

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print()
  }

  const exportCSV = () => {
    const headers = [
      'S.No',
      'Trader Name',
      'Category',
      'No of Bills',
      'Total Items',
      'Total Purchases (PKR)',
      'Current Balance (PKR)',
      'Last Date',
      'Remarks',
    ]
    const rows = filteredTraders.map((t, idx) => [
      idx + 1,
      `"${t.partyName}"`,
      `"${t.type}"`,
      t.totalBills,
      t.totalItems,
      t.totalPurchases,
      t.currentBalance,
      `"${t.lastDate || ''}"`,
      `"${t.remarks || ''}"`,
    ])
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Sara_Textile_Traders_Directory_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleOpenAddForTrader = (slug?: string) => {
    setModalDefaultSlug(slug)
    setShowAddModal(true)
  }

  return (
    <div className="space-y-6 pb-16">
      {/* 1. Page Header */}
      <div className="print:hidden">
        <PageHeader
          title="Traders Bill Directory"
          showTitle={false}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Accounts', href: '/accounts/traders' },
            { label: 'Traders' },
          ]}
          actions={
            <div className="inline-flex shrink-0 items-center gap-2">
              <Link
                href="/accounts/inventory-inward"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 text-[#0066cc] dark:text-sky-400 border border-blue-200 dark:border-blue-900/50 transition-colors"
                title="Enter inward purchases via Store Inventory Control"
              >
                <span>Gate Inward Register</span>
              </Link>
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
            </div>
          }
        />
      </div>

      {/* 3. Search & Quick Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-3 print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">Traders Directory:</span>
          <span className="badge rounded-pill bg-primary-subtle text-primary fw-semibold px-2 py-1 text-xs">
            {filteredTraders.length} parties
          </span>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search party name, goods, category..."
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-4 py-1.5 text-xs font-medium placeholder:text-slate-400 focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 4. Print Company Header */}
      <div className="hidden print:block text-center border-b pb-4 mb-4">
        <h1 className="text-2xl font-bold uppercase tracking-wider text-slate-900">SARA TEXTILE</h1>
        <h2 className="text-sm font-semibold text-slate-700">Traders Bill Synopsis & Directory</h2>
        <p className="text-xs font-medium text-slate-500">Official Accounts Ledger</p>
      </div>

      {/* 5. Main Table */}
      <div className="erp-card shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-5 py-3">
          <div>
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Traders Bill Synopsis & Summary
            </h2>
            <p className="text-[11px] text-slate-500">
              Auto-aggregates all inward items, bills, and purchase vouchers
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium text-slate-500">Total Purchases:</span>
            <p className="text-sm font-bold text-emerald-600 font-mono">
              {formatCurrency(totalPayable)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-semibold uppercase text-[11px] text-slate-600">
                <th className="py-2.5 px-4 text-center w-12">S.No</th>
                <th className="py-2.5 px-4">Trader / Vendor Name</th>
                <th className="py-2.5 px-4 text-center w-36">Category</th>
                <th className="py-2.5 px-4 text-center w-24">Bills</th>
                <th className="py-2.5 px-4 text-center w-24">Items</th>
                <th className="py-2.5 px-4 text-right">Total Purchases (PKR)</th>
                <th className="py-2.5 px-4 text-right">Balance</th>
                <th className="py-2.5 px-4">Remarks</th>
                <th className="py-2.5 px-4 text-center print:hidden w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredTraders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No traders found matching &quot;{searchTerm}&quot;
                  </td>
                </tr>
              ) : (
                filteredTraders.map((trader, idx) => {
                  return (
                    <tr
                      key={trader.slug}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3 px-4 text-center font-mono font-medium text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <Link
                          href={`/accounts/traders/${trader.slug}`}
                          className="hover:text-[#0066cc] hover:underline inline-flex items-center gap-1.5"
                        >
                          <span>{trader.partyName}</span>
                          <ExternalLink className="size-3 text-slate-400 opacity-60 print:hidden" />
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                            trader.type === 'Electronics'
                              ? 'bg-purple-100 text-purple-700'
                              : trader.type === 'Petroleum & Oil'
                              ? 'bg-orange-100 text-orange-700'
                              : trader.type === 'Safety / Fire'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {trader.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold">
                        <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[#0066cc] text-xs">
                          {trader.totalBills} {trader.totalBills === 1 ? 'bill' : 'bills'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-600">
                        {trader.totalItems || 0}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">
                        {formatCurrency(trader.totalPurchases)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(trader.currentBalance)}
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-[200px] truncate" title={trader.remarks}>
                        {trader.remarks || '—'}
                      </td>
                      <td className="py-3 px-4 text-center print:hidden">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            href={`/accounts/traders/${trader.slug}`}
                            className="btn btn-xs btn-outline-primary py-1 px-2 text-[11px] font-semibold"
                            title="View complete ledger"
                          >
                            Ledger
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleOpenAddForTrader(trader.slug)}
                            className="btn btn-xs btn-outline-secondary py-1 px-2 text-[11px]"
                            title="Add bill for this trader"
                          >
                            + Bill
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {filteredTraders.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold text-xs text-slate-900">
                  <td colSpan={3} className="py-3 px-4 text-center uppercase tracking-wide">
                    Grand Total ({filteredTraders.length} Traders)
                  </td>
                  <td className="py-3 px-4 text-center font-mono">
                    {formatNumber(filteredTraders.reduce((s, t) => s + t.totalBills, 0))} bills
                  </td>
                  <td className="py-3 px-4 text-center font-mono">
                    {formatNumber(filteredTraders.reduce((s, t) => s + t.totalItems, 0))}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-700">
                    {formatCurrency(filteredTraders.reduce((s, t) => s + t.totalPurchases, 0))}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-amber-700">
                    {formatCurrency(filteredTraders.reduce((s, t) => s + t.currentBalance, 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Add Trader Bill Modal */}
      <AddTraderBillModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={loadTraders}
        defaultTraderSlug={modalDefaultSlug}
      />
    </div>
  )
}
