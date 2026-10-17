'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { expenseService, TraderSummary, getAccountsAvailableMonths } from '@/services/expenseService'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { closeSidebar } from '@/lib/sidebarToggle'
import {
  Printer,
  Search,
  ExternalLink,
  Download,
  PlusCircle,
  Trash2,
  X,
  Save,
  Building2,
  Calendar,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'

export default function TradersDirectoryPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('sara_accounts_selected_month')
        if (saved) return saved
      } catch {}
    }
    return 'September'
  })
  const [availableMonths, setAvailableMonths] = useState<string[]>(() => getAccountsAvailableMonths())
  const [traders, setTraders] = useState<TraderSummary[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddTraderModal, setShowAddTraderModal] = useState(false)

  // Auto-close sidebar whenever modal opens
  useEffect(() => {
    if (showAddTraderModal) {
      closeSidebar()
    }
  }, [showAddTraderModal])

  // Add Trader form state (Custom string supported!)
  const [newTraderName, setNewTraderName] = useState('')
  const [newTraderCategory, setNewTraderCategory] = useState('Trader')
  const [newTraderRemarks, setNewTraderRemarks] = useState('')

  const loadTraders = useCallback(() => {
    const list = expenseService.getTradersList(selectedMonth)
    setTraders(list)
  }, [selectedMonth])

  useEffect(() => {
    loadTraders()
    const handleSync = () => {
      loadTraders()
      setAvailableMonths(getAccountsAvailableMonths())
    }
    const handleMonthChange = (e: Event) => {
      const customEvt = e as CustomEvent<string>
      if (customEvt.detail && customEvt.detail !== selectedMonth) {
        setSelectedMonth(customEvt.detail)
      }
      setAvailableMonths(getAccountsAvailableMonths())
    }
    window.addEventListener('accounts_synced', handleSync)
    window.addEventListener('accounts_month_changed', handleMonthChange)
    return () => {
      window.removeEventListener('accounts_synced', handleSync)
      window.removeEventListener('accounts_month_changed', handleMonthChange)
    }
  }, [loadTraders, selectedMonth])

  const handleSelectMonth = (month: string) => {
    setSelectedMonth(month)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('sara_accounts_selected_month', month)
        window.dispatchEvent(new CustomEvent('accounts_month_changed', { detail: month }))
      } catch {}
    }
  }

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

  const handleAddTraderSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTraderName.trim()) {
      alert('Please enter trader / vendor name.')
      return
    }

    expenseService.addNewTrader(newTraderName.trim(), newTraderCategory, newTraderRemarks.trim())
    setNewTraderName('')
    setNewTraderRemarks('')
    setShowAddTraderModal(false)
    loadTraders()
  }

  const handleDeleteTrader = (slug: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}" from Traders Directory?`)) {
      expenseService.deleteTrader(slug)
      loadTraders()
    }
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
            <div className="flex flex-wrap items-center justify-between gap-3 w-full">
              {/* Left Action Button */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddTraderModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0066cc] hover:bg-[#0052a3] text-white shadow-xs transition-all cursor-pointer !min-h-9 !h-9"
                >
                  <PlusCircle className="size-4" />
                  <span>Add Trader</span>
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
                        {m === 'ALL' ? 'All Months' : (m.includes('202') ? m : `${m} 2026`)}
                      </option>
                    ))}
                    {!availableMonths.includes('ALL') && (
                      <option value="ALL" className="bg-background text-foreground">
                        All Months
                      </option>
                    )}
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
      </div>

      {/* 2. Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-3 print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Traders Directory:</span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-950/60 dark:text-sky-300 dark:border-blue-800">
            {filteredTraders.length} parties
          </span>
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {selectedMonth === 'ALL' ? 'All Months' : `${selectedMonth} 2026`}
          </span>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search party name, category, remarks..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-4 py-1.5 text-xs font-medium placeholder:text-slate-400 focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
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

      {/* 3. Print Company Header */}
      <div className="hidden print:block text-center border-b pb-4 mb-4">
        <h1 className="text-2xl font-bold uppercase tracking-wider text-slate-900">SARA TEXTILE</h1>
        <h2 className="text-sm font-semibold text-slate-700">Traders Bill Synopsis & Directory ({selectedMonth === 'ALL' ? 'All Months' : `${selectedMonth} 2026`})</h2>
        <p className="text-xs font-medium text-slate-500">Official Accounts Ledger</p>
      </div>

      {/* 4. Main Table */}
      <div className="erp-card shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 px-5 py-3">
          <div>
            <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Traders Bill Synopsis & Summary ({selectedMonth === 'ALL' ? 'All Months' : `${selectedMonth} 2026`})
            </h2>
            <p className="text-[11px] text-slate-500">
              Synchronized directly with Daily Inward & Expense Register
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
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 font-semibold uppercase text-[11px] text-slate-600 dark:text-slate-400">
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
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
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
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 text-center font-mono font-medium text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
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
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                              : trader.type === 'Petroleum & Oil'
                              ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300'
                              : trader.type === 'Safety / Fire'
                              ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                          }`}
                        >
                          {trader.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold">
                        <span className="rounded-md bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-[#0066cc] text-xs">
                          {trader.totalBills} {trader.totalBills === 1 ? 'bill' : 'bills'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-600 dark:text-slate-400">
                        {trader.totalItems || 0}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">
                        {formatCurrency(trader.totalPurchases)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(trader.currentBalance)}
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-[200px] truncate" title={trader.remarks}>
                        {trader.remarks || '—'}
                      </td>
                      <td className="py-3 px-4 text-center print:hidden">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            href={`/accounts/traders/${trader.slug}`}
                            className="inline-flex items-center px-2 py-1 text-[11px] font-bold text-[#0066cc] bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-sky-300 rounded border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
                            title="View complete date-wise ledger"
                          >
                            Ledger
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDeleteTrader(trader.slug, trader.partyName)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title={`Delete ${trader.partyName}`}
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
            {filteredTraders.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 font-bold text-xs text-slate-900 dark:text-slate-100">
                  <td colSpan={3} className="py-3 px-4 text-center uppercase tracking-wide">
                    Grand Total ({filteredTraders.length} Traders)
                  </td>
                  <td className="py-3 px-4 text-center font-mono">
                    {formatNumber(filteredTraders.reduce((s, t) => s + t.totalBills, 0))} bills
                  </td>
                  <td className="py-3 px-4 text-center font-mono">
                    {formatNumber(filteredTraders.reduce((s, t) => s + t.totalItems, 0))}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(filteredTraders.reduce((s, t) => s + t.totalPurchases, 0))}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-900 dark:text-slate-100">
                    {formatCurrency(filteredTraders.reduce((s, t) => s + t.currentBalance, 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 5. Add Trader Modal */}
      {showAddTraderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-md bg-background rounded-xl border border-border shadow-2xl overflow-hidden my-6">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <Building2 className="size-5 text-[#0066cc]" />
                <h3 className="font-bold text-sm text-foreground">Add New Trader / Vendor</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddTraderModal(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleAddTraderSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Trader / Party Name *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Al-Madina Hardware & Loom Spares"
                  value={newTraderName}
                  onChange={(e) => setNewTraderName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-background border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-[#0066cc] font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Trade Category (Custom or Suggestion)
                </label>
                <input
                  type="text"
                  list="trader-category-suggestions"
                  placeholder="e.g. Petroleum & Oil, Spares, Electronics, or type custom..."
                  value={newTraderCategory}
                  onChange={(e) => setNewTraderCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-background border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-[#0066cc] font-medium"
                />
                <datalist id="trader-category-suggestions">
                  <option value="Trader (General)" />
                  <option value="Petroleum & Oil" />
                  <option value="Electronics / SMD" />
                  <option value="Safety / Fire" />
                  <option value="Loom Spares" />
                  <option value="Hardware" />
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Remarks / Contact Info
                </label>
                <textarea
                  rows={3}
                  placeholder="Address, Phone #, or Mill Terms..."
                  value={newTraderRemarks}
                  onChange={(e) => setNewTraderRemarks(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-background border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-[#0066cc] font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddTraderModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#0066cc] hover:bg-[#0052a3] text-white shadow-xs transition-all cursor-pointer"
                >
                  <Save className="size-4" />
                  <span>Save Trader</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
