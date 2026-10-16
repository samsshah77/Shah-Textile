'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { expenseService, WorkshopSummary } from '@/services/expenseService'
import { formatCurrency, formatNumber } from '@/lib/utils'
import {
  Wrench,
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
import { AddWorkshopBillModal } from '@/components/accounts/AddWorkshopBillModal'

export default function WorkshopsDirectoryPage() {
  const [workshops, setWorkshops] = useState<WorkshopSummary[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [modalDefaultSlug, setModalDefaultSlug] = useState<string | undefined>()

  const loadWorkshops = useCallback(() => {
    const list = expenseService.getWorkshopsList()
    setWorkshops(list)
  }, [])

  useEffect(() => {
    loadWorkshops()
    const handleSync = () => loadWorkshops()
    window.addEventListener('accounts_synced', handleSync)
    return () => window.removeEventListener('accounts_synced', handleSync)
  }, [loadWorkshops])

  // Top KPIs
  const totalWorkshopsCount = workshops.length
  const totalJobsCount = useMemo(() => workshops.reduce((s, w) => s + (w.totalBills || 0), 0), [workshops])
  const totalItemsCount = useMemo(() => workshops.reduce((s, w) => s + (w.totalItems || 0), 0), [workshops])
  const totalPayable = useMemo(() => workshops.reduce((s, w) => s + (w.totalPurchases || 0), 0), [workshops])

  const filteredWorkshops = useMemo(() => {
    const q = searchTerm.toLowerCase().trim()
    if (!q) return workshops
    return workshops.filter(
      (w) =>
        w.workshopName.toLowerCase().includes(q) ||
        (w.remarks && w.remarks.toLowerCase().includes(q)) ||
        w.type.toLowerCase().includes(q)
    )
  }, [workshops, searchTerm])

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print()
  }

  const exportCSV = () => {
    const headers = [
      'S.No',
      'Workshop Name',
      'Type / Trade',
      'No of Jobs',
      'Total Items',
      'Total Job Amount (PKR)',
      'Current Balance (PKR)',
      'Last Date',
      'Remarks',
    ]
    const rows = filteredWorkshops.map((w, idx) => [
      idx + 1,
      `"${w.workshopName}"`,
      `"${w.type}"`,
      w.totalBills,
      w.totalItems,
      w.totalPurchases,
      w.currentBalance,
      `"${w.lastDate || ''}"`,
      `"${w.remarks || ''}"`,
    ])
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Sara_Textile_Workshops_Directory_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleOpenAddForWorkshop = (slug?: string) => {
    setModalDefaultSlug(slug)
    setShowAddModal(true)
  }

  return (
    <div className="space-y-6 pb-16">
      {/* 1. Page Header */}
      <div className="print:hidden">
        <PageHeader
          title="Workshops & Engineering Directory"
          showTitle={false}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Accounts', href: '/accounts/traders' },
            { label: 'Workshops' },
          ]}
          actions={
            <div className="inline-flex shrink-0 items-center gap-2">
              <Link
                href="/accounts/inventory-inward"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 transition-colors"
                title="Enter inward repair jobs via Store Inventory Control"
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

      {/* 3. Search & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-3 print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">Workshops Synopsis:</span>
          <span className="badge rounded-pill bg-warning-subtle text-warning-emphasis fw-semibold px-2 py-1 text-xs">
            {filteredWorkshops.length} engineering vendors
          </span>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search workshop, trade, remarks..."
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-4 py-1.5 text-xs font-medium placeholder:text-slate-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none"
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
        <h2 className="text-sm font-semibold text-slate-700">Workshops & Engineering Synopsis</h2>
        <p className="text-xs font-medium text-slate-500">Official Accounts Ledger — Repair Expenses</p>
      </div>

      {/* 5. Main Table */}
      <div className="erp-card shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-5 py-3">
          <div>
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Workshop Bills & Jobs Synopsis
            </h2>
            <p className="text-[11px] text-slate-500">
              Auto-links into Cost Statement under Repair Maintenance and Daily Inward Register
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium text-slate-500">Total Job Amount:</span>
            <p className="text-sm font-bold text-amber-700 font-mono">
              {formatCurrency(totalPayable)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-semibold uppercase text-[11px] text-slate-600">
                <th className="py-2.5 px-4 text-center w-12">S.No</th>
                <th className="py-2.5 px-4">Workshop / Engineering Name</th>
                <th className="py-2.5 px-4 text-center w-36">Trade / Specialization</th>
                <th className="py-2.5 px-4 text-center w-24">Jobs / Bills</th>
                <th className="py-2.5 px-4 text-center w-24">Items</th>
                <th className="py-2.5 px-4 text-right">Total Job Amount (PKR)</th>
                <th className="py-2.5 px-4 text-right">Balance</th>
                <th className="py-2.5 px-4">Remarks</th>
                <th className="py-2.5 px-4 text-center print:hidden w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredWorkshops.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No workshops found matching &quot;{searchTerm}&quot;
                  </td>
                </tr>
              ) : (
                filteredWorkshops.map((workshop, idx) => {
                  return (
                    <tr
                      key={workshop.slug}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3 px-4 text-center font-mono font-medium text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <Link
                          href={`/accounts/workshops/${workshop.slug}`}
                          className="hover:text-amber-700 hover:underline inline-flex items-center gap-1.5"
                        >
                          <span>{workshop.workshopName}</span>
                          <ExternalLink className="size-3 text-slate-400 opacity-60 print:hidden" />
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                            workshop.type === 'Lathe / Turning'
                              ? 'bg-blue-100 text-blue-700'
                              : workshop.type === 'Welding'
                              ? 'bg-orange-100 text-orange-700'
                              : workshop.type === 'Motor Rewinding'
                              ? 'bg-cyan-100 text-cyan-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {workshop.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold">
                        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-800 text-xs">
                          {workshop.totalBills} {workshop.totalBills === 1 ? 'job' : 'jobs'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-600">
                        {workshop.totalItems || 0}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-700">
                        {formatCurrency(workshop.totalPurchases)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(workshop.currentBalance)}
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-[200px] truncate" title={workshop.remarks}>
                        {workshop.remarks || '—'}
                      </td>
                      <td className="py-3 px-4 text-center print:hidden">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            href={`/accounts/workshops/${workshop.slug}`}
                            className="btn btn-xs btn-outline-warning text-dark py-1 px-2 text-[11px] font-semibold"
                            title="View complete job ledger"
                          >
                            Job Ledger
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleOpenAddForWorkshop(workshop.slug)}
                            className="btn btn-xs btn-outline-secondary py-1 px-2 text-[11px]"
                            title="Record job for this workshop"
                          >
                            + Job
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {filteredWorkshops.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold text-xs text-slate-900">
                  <td colSpan={3} className="py-3 px-4 text-center uppercase tracking-wide">
                    Grand Total ({filteredWorkshops.length} Workshops)
                  </td>
                  <td className="py-3 px-4 text-center font-mono">
                    {formatNumber(filteredWorkshops.reduce((s, w) => s + w.totalBills, 0))} jobs
                  </td>
                  <td className="py-3 px-4 text-center font-mono">
                    {formatNumber(filteredWorkshops.reduce((s, w) => s + w.totalItems, 0))}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-amber-800">
                    {formatCurrency(filteredWorkshops.reduce((s, w) => s + w.totalPurchases, 0))}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-rose-700">
                    {formatCurrency(filteredWorkshops.reduce((s, w) => s + w.currentBalance, 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Add Workshop Bill Modal */}
      <AddWorkshopBillModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={loadWorkshops}
        defaultWorkshopSlug={modalDefaultSlug}
      />
    </div>
  )
}
