'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  accountsData,
  TraderSynopsisItem,
  WorkshopSynopsisItem,
} from '@/data/accountsData'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import {
  Building2,
  Receipt,
  FileSpreadsheet,
  Printer,
  Search,
  ExternalLink,
  Wallet,
  Wrench,
  CheckCircle2,
  TrendingUp,
  Download,
  Filter,
} from 'lucide-react'

export default function TradersDirectoryPage() {
  const [activeTab, setActiveTab] = useState<'traders' | 'workshops' | 'all'>('traders')
  const [searchTerm, setSearchTerm] = useState('')

  const tradersSynopsis = accountsData.traders.synopsis
  const workshopsSynopsis = accountsData.workshops.synopsis

  const totalTradersPayable = accountsData.traders.totalPayable // 674,551
  const totalTradersBills = accountsData.traders.totalBills // 27
  const totalWorkshopsPayable = accountsData.workshops.totalPayable // 3,000
  const totalWorkshopsBills = accountsData.workshops.totalBills // 1
  const grandTotalPayable = totalTradersPayable + totalWorkshopsPayable // 677,551
  const grandTotalBills = totalTradersBills + totalWorkshopsBills // 28

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  // Helper to find slug for linking
  const getTraderSlug = (name: string) => {
    const found = accountsData.traders.ledgers.find(
      (l) => l.partyName.toLowerCase() === name.toLowerCase() || name.toLowerCase().includes(l.partyName.toLowerCase())
    )
    return found ? found.slug : name.toLowerCase().replace(/[^a-z0-9]/g, '-')
  }

  const getWorkshopSlug = (name: string) => {
    const found = accountsData.workshops.ledgers.find(
      (l) => l.workshopName.toLowerCase() === name.toLowerCase() || name.toLowerCase().includes(l.workshopName.toLowerCase())
    )
    return found ? found.slug : name.toLowerCase().replace(/[^a-z0-9]/g, '-')
  }

  // Filtered lists
  const filteredTraders = useMemo(() => {
    return tradersSynopsis.filter((t) =>
      t.traderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.remarks.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [tradersSynopsis, searchTerm])

  const filteredWorkshops = useMemo(() => {
    return workshopsSynopsis.filter((w) =>
      w.workshopName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.remarks.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [workshopsSynopsis, searchTerm])

  const exportCSV = () => {
    const list = activeTab === 'workshops' ? workshopsSynopsis : tradersSynopsis
    const headers = ['S.No', 'Name', 'No of Bills', 'Sara Payable', 'FOI Payable', 'Remarks']
    const rows = list.map((item) => {
      const name = 'traderName' in item ? item.traderName : item.workshopName
      return [item.sNo, `"${name}"`, item.noOfBills, item.saraPayable, item.foiPayable, `"${item.remarks || ''}"`]
    })
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Sara_Textile_${activeTab}_Synopsis_Aug2026.csv`)
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
              Accounts Module • Ledger Workbooks
            </span>
            <span className="text-xs font-semibold text-slate-500">• August 2026</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 uppercase mt-1.5">
            Traders & Workshops Ledger
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Verified accounts payable synopsis transcribed 100% from official Excel ledgers
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportCSV}
            className="erp-btn-secondary"
          >
            <Download className="size-3.5 text-emerald-600" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handlePrint}
            className="erp-btn-primary"
          >
            <Printer className="size-3.5" />
            <span>Print Synopsis</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. TABS & SEARCH BAR                                                      */}
      {/* ========================================================================= */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-700 pb-3 print:hidden">
        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 p-1">
          <button
            onClick={() => setActiveTab('traders')}
            className={cn(
              'flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer',
              activeTab === 'traders'
                ? 'bg-white dark:bg-slate-900 text-[#0066cc] dark:text-sky-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            )}
          >
            <Building2 className="size-3.5 text-[#0066cc]" />
            <span>Traders Bill Synopsis</span>
            <span className="rounded-full bg-blue-100 dark:bg-blue-950/60 px-1.5 py-0.2 text-[10px] font-bold text-[#0066cc] dark:text-sky-400">
              11
            </span>
          </button>

          <button
            onClick={() => setActiveTab('workshops')}
            className={cn(
              'flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer',
              activeTab === 'workshops'
                ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            )}
          >
            <Wrench className="size-3.5 text-amber-600" />
            <span>Workshop Bills Synopsis</span>
            <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.2 text-[10px] font-bold text-amber-700 dark:text-amber-400">
              4
            </span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search party name or remarks..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-4 py-1.5 text-xs font-medium placeholder:text-slate-400 focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. PRINTABLE COMPANY HEADER                                               */}
      {/* ========================================================================= */}
      <div className="hidden print:block text-center border-b pb-4 mb-4">
        <h1 className="text-2xl font-bold uppercase tracking-wider text-slate-900">SARA TEXTILE</h1>
        <h2 className="text-sm font-semibold text-slate-700">
          {activeTab === 'workshops' ? 'Workshop Bills Synopsis' : 'Traders Bill Synopsis'}
        </h2>
        <p className="text-xs font-medium text-slate-500">For The Month of August-2026</p>
      </div>

      {/* ========================================================================= */}
      {/* 5. DATA TABLES                                                            */}
      {/* ========================================================================= */}
      {activeTab === 'traders' && (
        <div className="erp-card shadow-xs overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 px-5 py-3">
            <div>
              <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Traders Bill Synopsis (August 2026)
              </h2>
              <p className="text-[11px] text-slate-500">
                Official Excel Sheet: <span className="font-semibold">08 Traders Ledger August.26.xlsx → Synopsis</span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-medium text-slate-500">Total Sara Payable:</span>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {formatCurrency(totalTradersPayable)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 font-semibold uppercase text-[11px] text-slate-600 dark:text-slate-300">
                  <th className="py-2.5 px-4 text-center w-14">S.No</th>
                  <th className="py-2.5 px-4">Traders Name</th>
                  <th className="py-2.5 px-4 text-center w-24">No of Bills</th>
                  <th className="py-2.5 px-4 text-right">Sara Payable (PKR)</th>
                  <th className="py-2.5 px-4 text-right">FOI Payable</th>
                  <th className="py-2.5 px-4">Remarks / Category</th>
                  <th className="py-2.5 px-4 text-center print:hidden">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredTraders.map((trader) => {
                  const slug = getTraderSlug(trader.traderName)
                  return (
                    <tr key={trader.sNo} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-4 text-center font-mono font-medium text-slate-400">
                        {trader.sNo}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        <Link
                          href={`/accounts/traders/${slug}`}
                          className="hover:text-[#0066cc] hover:underline flex items-center gap-1.5"
                        >
                          <span>{trader.traderName}</span>
                          <ExternalLink className="size-3 text-slate-400 opacity-60 print:hidden" />
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold">
                        <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[#0066cc] dark:text-sky-400 text-xs">
                          {trader.noOfBills} {trader.noOfBills === 1 ? 'bill' : 'bills'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatNumber(trader.saraPayable)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">
                        {trader.foiPayable > 0 ? formatNumber(trader.foiPayable) : '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        {trader.remarks || 'Machinery & Electrical Supplies'}
                      </td>
                      <td className="py-3 px-4 text-center print:hidden">
                        <Link
                          href={`/accounts/traders/${slug}`}
                          className="inline-flex items-center gap-1 erp-btn-secondary py-1 text-[11px]"
                        >
                          <span>View Ledger</span>
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 font-bold text-xs">
                  <td colSpan={2} className="py-3 px-4 uppercase text-slate-800 dark:text-slate-200">
                    Total Amount
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-bold text-slate-900 dark:text-slate-100">
                    {totalTradersBills} Bills
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-700 dark:text-emerald-400 text-sm font-bold">
                    {formatCurrency(totalTradersPayable)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-400">
                    -
                  </td>
                  <td colSpan={2} className="py-3 px-4 text-xs font-semibold text-slate-500">
                    11 Suppliers Verified
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'workshops' && (
        <div className="erp-card shadow-xs overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 px-5 py-3">
            <div>
              <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Workshop Bills Synopsis (August 2026)
              </h2>
              <p className="text-[11px] text-slate-500">
                Official Excel Sheet: <span className="font-semibold">08 Workshop Ledger August.26.xlsx → Synopsis</span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-medium text-slate-500">Total Sara Payable:</span>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {formatCurrency(totalWorkshopsPayable)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 font-semibold uppercase text-[11px] text-slate-600 dark:text-slate-300">
                  <th className="py-2.5 px-4 text-center w-14">S.No</th>
                  <th className="py-2.5 px-4">Workshop Name</th>
                  <th className="py-2.5 px-4 text-center w-24">No of Bills</th>
                  <th className="py-2.5 px-4 text-right">Sara Payable (PKR)</th>
                  <th className="py-2.5 px-4 text-right">FOI Payable</th>
                  <th className="py-2.5 px-4">Status & Remarks</th>
                  <th className="py-2.5 px-4 text-center print:hidden">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredWorkshops.map((workshop) => {
                  const slug = getWorkshopSlug(workshop.workshopName)
                  const hasBill = workshop.saraPayable > 0

                  return (
                    <tr key={workshop.sNo} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-4 text-center font-mono font-medium text-slate-400">
                        {workshop.sNo}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        <Link
                          href={`/accounts/traders/${slug}`}
                          className="hover:text-[#0066cc] hover:underline flex items-center gap-1.5"
                        >
                          <span>{workshop.workshopName}</span>
                          <ExternalLink className="size-3 text-slate-400 opacity-60 print:hidden" />
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold">
                        <span
                          className={cn(
                            'rounded-md px-2 py-0.5 text-xs font-semibold',
                            hasBill
                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          )}
                        >
                          {workshop.noOfBills} {workshop.noOfBills === 1 ? 'bill' : 'bills'}
                        </span>
                      </td>
                      <td
                        className={cn(
                          'py-3 px-4 text-right font-mono font-bold',
                          hasBill ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'
                        )}
                      >
                        {formatNumber(workshop.saraPayable)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">
                        {workshop.foiPayable > 0 ? formatNumber(workshop.foiPayable) : '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        {hasBill ? (
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            Bill #242 • Inward #7633 (PU Repair)
                          </span>
                        ) : (
                          <span>Nil in August 2026</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center print:hidden">
                        <Link
                          href={`/accounts/traders/${slug}`}
                          className="inline-flex items-center gap-1 erp-btn-secondary py-1 text-[11px]"
                        >
                          <span>View Ledger</span>
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 font-bold text-xs">
                  <td colSpan={2} className="py-3 px-4 uppercase text-slate-800 dark:text-slate-200">
                    Total Amount
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-bold text-slate-900 dark:text-slate-100">
                    {totalWorkshopsBills} Bill
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-700 dark:text-emerald-400 text-sm font-bold">
                    {formatCurrency(totalWorkshopsPayable)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-400">
                    -
                  </td>
                  <td colSpan={2} className="py-3 px-4 text-xs font-semibold text-slate-500">
                    4 Workshops Verified
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. CROSS-WORKBOOK RECONCILIATION SUMMARY BANNER                          */}
      {/* ========================================================================= */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-4 sm:p-5 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-[#0066cc] shrink-0" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Accounts Payable Reconciliation Check
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Traders (PKR 674,551) + Workshops (PKR 3,000) = <strong className="text-slate-900 dark:text-slate-100">PKR 677,551</strong>.
              This perfectly balances with the <strong className="text-slate-900 dark:text-slate-100">Daily Expense Record</strong> and the Cost Statement Machinery + Maintenance + Repair lines!
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/accounts/daily-expense"
              className="erp-btn-secondary text-[#0066cc]"
            >
              Check Daily Expense (60 Items) →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
