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
  Trash2,
  X,
  Save,
  Calendar,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'

export default function WorkshopsDirectoryPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('sara_accounts_selected_month')
        if (saved) return saved
      } catch {}
    }
    return 'September'
  })
  const [workshops, setWorkshops] = useState<WorkshopSummary[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddWorkshopModal, setShowAddWorkshopModal] = useState(false)

  // Add Workshop form state (Custom string supported!)
  const [newWorkshopName, setNewWorkshopName] = useState('')
  const [newWorkshopSpecialization, setNewWorkshopSpecialization] =
    useState('Workshop / Engineering')
  const [newWorkshopRemarks, setNewWorkshopRemarks] = useState('')

  const loadWorkshops = useCallback(() => {
    const list = expenseService.getWorkshopsList(selectedMonth)
    setWorkshops(list)
  }, [selectedMonth])

  useEffect(() => {
    loadWorkshops()
    const handleSync = () => loadWorkshops()
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
  }, [loadWorkshops, selectedMonth])

  const handleSelectMonth = (month: string) => {
    setSelectedMonth(month)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('sara_accounts_selected_month', month)
        window.dispatchEvent(new CustomEvent('accounts_month_changed', { detail: month }))
      } catch {}
    }
  }

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

  const handleAddWorkshopSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWorkshopName.trim()) {
      alert('Please enter workshop name.')
      return
    }

    expenseService.addNewWorkshop(newWorkshopName.trim(), newWorkshopSpecialization, newWorkshopRemarks.trim())
    setNewWorkshopName('')
    setNewWorkshopRemarks('')
    setShowAddWorkshopModal(false)
    loadWorkshops()
  }

  const handleDeleteWorkshop = (slug: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}" from Workshops Directory?`)) {
      expenseService.deleteWorkshop(slug)
      loadWorkshops()
    }
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
            <div className="flex flex-wrap items-center justify-between gap-3 w-full">
              {/* Left Action Button */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddWorkshopModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0066cc] hover:bg-[#0052a3] text-white shadow-xs transition-all cursor-pointer !min-h-9 !h-9"
                >
                  <PlusCircle className="size-4" />
                  <span>Add Workshop</span>
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
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Workshops Synopsis:</span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-950 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800">
            {filteredWorkshops.length} engineering vendors
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
            placeholder="Search workshop, trade, remarks..."
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
        <h2 className="text-sm font-semibold text-slate-700">Workshops & Engineering Synopsis ({selectedMonth === 'ALL' ? 'All Months' : `${selectedMonth} 2026`})</h2>
        <p className="text-xs font-medium text-slate-500">Official Accounts Ledger — Repair Expenses</p>
      </div>

      {/* 4. Main Table */}
      <div className="erp-card shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 px-5 py-3">
          <div>
            <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Workshop Bills & Jobs Synopsis ({selectedMonth === 'ALL' ? 'All Months' : `${selectedMonth} 2026`})
            </h2>
            <p className="text-[11px] text-slate-500">
              Synchronized directly with Daily Inward & Expense Register
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium text-slate-500">Total Job Amount:</span>
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400 font-mono">
              {formatCurrency(totalPayable)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 font-semibold uppercase text-[11px] text-slate-600 dark:text-slate-400">
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
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
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
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 text-center font-mono font-medium text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        <Link
                          href={`/accounts/workshops/${workshop.slug}`}
                          className="hover:text-amber-700 dark:hover:text-amber-400 hover:underline inline-flex items-center gap-1.5"
                        >
                          <span>{workshop.workshopName}</span>
                          <ExternalLink className="size-3 text-slate-400 opacity-60 print:hidden" />
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                            workshop.type === 'Lathe / Turning'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                              : workshop.type === 'Welding'
                              ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300'
                              : workshop.type === 'Motor Rewinding'
                              ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}
                        >
                          {workshop.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold">
                        <span className="rounded-md bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-amber-800 dark:text-amber-300 text-xs">
                          {workshop.totalBills} {workshop.totalBills === 1 ? 'job' : 'jobs'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-600 dark:text-slate-400">
                        {workshop.totalItems || 0}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-700 dark:text-amber-400">
                        {formatCurrency(workshop.totalPurchases)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(workshop.currentBalance)}
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-[200px] truncate" title={workshop.remarks}>
                        {workshop.remarks || '—'}
                      </td>
                      <td className="py-3 px-4 text-center print:hidden">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            href={`/accounts/workshops/${workshop.slug}`}
                            className="inline-flex items-center px-2 py-1 text-[11px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 rounded border border-amber-200 dark:border-amber-800 transition-colors cursor-pointer"
                            title="View complete date-wise job ledger"
                          >
                            Job Ledger
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDeleteWorkshop(workshop.slug, workshop.workshopName)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title={`Delete ${workshop.workshopName}`}
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
            {filteredWorkshops.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 font-bold text-xs text-slate-900 dark:text-slate-100">
                  <td colSpan={3} className="py-3 px-4 text-center uppercase tracking-wide">
                    Grand Total ({filteredWorkshops.length} Workshops)
                  </td>
                  <td className="py-3 px-4 text-center font-mono">
                    {formatNumber(filteredWorkshops.reduce((s, w) => s + w.totalBills, 0))} jobs
                  </td>
                  <td className="py-3 px-4 text-center font-mono">
                    {formatNumber(filteredWorkshops.reduce((s, w) => s + w.totalItems, 0))}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-amber-800 dark:text-amber-400">
                    {formatCurrency(filteredWorkshops.reduce((s, w) => s + w.totalPurchases, 0))}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-900 dark:text-slate-100">
                    {formatCurrency(filteredWorkshops.reduce((s, w) => s + w.currentBalance, 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 5. Add Workshop Modal */}
      {showAddWorkshopModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-md bg-background rounded-xl border border-border shadow-2xl overflow-hidden my-6">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-amber-50/50 dark:bg-amber-950/30">
              <div className="flex items-center gap-2">
                <Wrench className="size-5 text-amber-700" />
                <h3 className="font-bold text-sm text-foreground">Add New Workshop / Engineering</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddWorkshopModal(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleAddWorkshopSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Workshop / Engineering Name *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Rajput Engineering Works"
                  value={newWorkshopName}
                  onChange={(e) => setNewWorkshopName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-background border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-[#0066cc] font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Trade / Specialization (Custom or Suggestion)
                </label>
                <input
                  type="text"
                  list="workshop-specialization-suggestions"
                  placeholder="e.g. Lathe / Turning, Motor Rewinding, Welding, or type custom..."
                  value={newWorkshopSpecialization}
                  onChange={(e) => setNewWorkshopSpecialization(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-background border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-[#0066cc] font-medium"
                />
                <datalist id="workshop-specialization-suggestions">
                  <option value="Workshop / Engineering (General)" />
                  <option value="Lathe / Turning" />
                  <option value="Welding" />
                  <option value="Motor Rewinding" />
                  <option value="General Repair" />
                  <option value="Precision Grinding" />
                  <option value="Electrical Repair" />
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Remarks / Contact Info
                </label>
                <textarea
                  rows={3}
                  placeholder="Location, Phone #, or Workshop notes..."
                  value={newWorkshopRemarks}
                  onChange={(e) => setNewWorkshopRemarks(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-background border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-[#0066cc] font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddWorkshopModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#0066cc] hover:bg-[#0052a3] text-white shadow-xs transition-all cursor-pointer"
                >
                  <Save className="size-4" />
                  <span>Save Workshop</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
