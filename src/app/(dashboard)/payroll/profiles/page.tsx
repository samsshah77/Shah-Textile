'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  payrollService,
  inferEmployeeCategory,
  matchesHrCategoryFilter,
  hydratePayrollFromDb,
  formatPayrollMonthLabel,
} from '@/services/payrollService'
import { EmployeeProfile } from '@/types/payroll'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, cn } from '@/lib/utils'
import {
  Search,
  Printer,
  CheckCircle2,
  FileSpreadsheet,
  LayoutGrid,
  Table as TableIcon,
  Phone,
  Pencil,
} from 'lucide-react'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { ProfileAvatar } from '@/components/payroll/ProfileAvatar'
import { PayrollMonthSelect } from '@/components/payroll/PayrollMonthSelect'

const HR_TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'STAFF', label: 'Staff' },
  { id: 'CONTRACT', label: 'Company Contract' },
  { id: 'WEAVER', label: 'Weaver' },
  { id: 'HELPER', label: 'Helper' },
  { id: 'CONTRACTOR', label: 'Contractor' },
  { id: 'RESIGNED', label: 'Resigned' },
]

function EmployeeProfilesContent() {
  const { canEditAccounts } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialSearch = searchParams.get('search') || ''
  const initialTab = (searchParams.get('tab') || 'ALL').toUpperCase()

  const [employees, setEmployees] = useState<EmployeeProfile[]>([])
  const [activeMonth, setActiveMonth] = useState<string>('2026-09')
  const [search, setSearch] = useState(initialSearch)
  const [filterCategory, setFilterCategory] = useState<string>(initialTab)
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  const [statusNotice, setStatusNotice] = useState<string | null>(null)

  const reload = () => {
    setEmployees(payrollService.getEmployees())
    setActiveMonth(payrollService.getActiveSalariedMonth())
  }

  useEffect(() => {
    const init = async () => {
      await hydratePayrollFromDb()
      reload()
    }
    void init()
    const handleSync = () => reload()
    window.addEventListener('payroll_synced', handleSync)
    return () => window.removeEventListener('payroll_synced', handleSync)
  }, [])

  useEffect(() => {
    if (initialSearch) setSearch(initialSearch)
  }, [initialSearch])

  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam) setFilterCategory(tabParam.toUpperCase())
  }, [searchParams])

  const activeEmployees = employees.filter((e) => (e.status || 'Active') !== 'Resigned')
  const resignedEmployees = employees.filter((e) => (e.status || 'Active') === 'Resigned')

  const getCategoryCount = (catId: string) => {
    if (catId === 'ALL') return activeEmployees.length
    if (catId === 'RESIGNED') return resignedEmployees.length
    return activeEmployees.filter((e) => matchesHrCategoryFilter(e, catId)).length
  }

  const filtered = employees.filter((e) => {
    const isResigned = (e.status || 'Active') === 'Resigned'
    const q = search.toLowerCase()
    const matchSearch =
      (e.name || '').toLowerCase().includes(q) ||
      (e.fatherName || '').toLowerCase().includes(q) ||
      (e.cnic || '').toLowerCase().includes(q) ||
      (e.phone || '').toLowerCase().includes(q) ||
      (e.designation || '').toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q)

    if (!matchSearch) return false
    if (filterCategory === 'RESIGNED') return isResigned
    if (isResigned) return false
    if (filterCategory === 'ALL') return true
    return matchesHrCategoryFilter(e, filterCategory)
  })

  const openProfile = (id: string) => {
    router.push(`/payroll/profiles/${id}`)
  }

  const payFor = (emp: EmployeeProfile) => {
    const cat = inferEmployeeCategory(emp)
    const isDaily = cat === 'Weaver' || cat === 'Helper'
    const pay = isDaily
      ? emp.ratePerDay30 || emp.ratePerDay31 || Math.round((emp.salary || 0) / 30)
      : emp.salary
    return { cat, isDaily, pay }
  }

  return (
    <main className="w-full max-w-6xl space-y-4 px-1 pb-16 pt-6 sm:pt-8">
      {statusNotice && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="size-3.5 shrink-0" />
          {statusNotice}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-nowrap items-center justify-between gap-2 overflow-x-auto pb-1">
        <div className="inline-flex shrink-0 items-center gap-1.5">
          <div className="relative min-w-[200px] w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search name, CNIC, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white py-0 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
            />
          </div>
          <PayrollMonthSelect
            value={activeMonth}
            disabled={!canEditAccounts}
            onChange={
              canEditAccounts
                ? async (m) => {
                    await payrollService.setActiveSalariedMonthAsync(m)
                    setActiveMonth(m)
                    reload()
                    setStatusNotice(`Viewing ${formatPayrollMonthLabel(m)}.`)
                    setTimeout(() => setStatusNotice(null), 2500)
                  }
                : undefined
            }
          />
        </div>
        <div className="inline-flex shrink-0 items-center gap-1.5">
          <Link href="/payroll/employees" className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800">
            <FileSpreadsheet className="size-3.5 text-emerald-600" />
            General Wages
          </Link>
          {canEditAccounts && (
            <Link href="/payroll/profiles/new" className="erp-btn-primary text-xs !min-h-9 !h-9">
              Register
            </Link>
          )}
          <button
            type="button"
            className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800"
            onClick={() => window.print()}
          >
            <Printer className="size-3.5" />
            Print
          </button>
          <ExportPdfButton filename="HR-Profiles" className="!min-h-9 !h-9" />
        </div>
      </div>

      {/* Filters + view */}
      <div className="flex flex-wrap items-center gap-2 justify-between border-b border-slate-200 pb-2">
        <div className="flex flex-wrap items-center gap-0.5">
          {HR_TABS.map((tab) => {
            const count = getCategoryCount(tab.id)
            const isSelected = filterCategory === tab.id
            const isResignedTab = tab.id === 'RESIGNED'
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterCategory(tab.id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                  isSelected
                    ? isResignedTab
                      ? 'bg-rose-600 text-white'
                      : 'bg-[#0066cc] text-white'
                    : isResignedTab
                      ? 'text-rose-600 hover:bg-rose-50'
                      : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    'ml-1 font-mono text-[10px]',
                    isSelected ? 'opacity-90' : 'text-slate-400'
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
        <div className="inline-flex rounded-md border border-slate-200 p-0.5">
          <button
            type="button"
            title="Table"
            onClick={() => setViewMode('table')}
            className={cn(
              'rounded p-1.5 cursor-pointer',
              viewMode === 'table' ? 'bg-[#0066cc] text-white' : 'text-slate-500 hover:bg-slate-50'
            )}
          >
            <TableIcon className="size-3.5" />
          </button>
          <button
            type="button"
            title="Grid"
            onClick={() => setViewMode('grid')}
            className={cn(
              'rounded p-1.5 cursor-pointer',
              viewMode === 'grid' ? 'bg-[#0066cc] text-white' : 'text-slate-500 hover:bg-slate-50'
            )}
          >
            <LayoutGrid className="size-3.5" />
          </button>
        </div>
      </div>

      {viewMode === 'table' && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold w-12">#</th>
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Designation</th>
                <th className="px-3 py-2 font-semibold">Category</th>
                <th className="px-3 py-2 font-semibold">Phone</th>
                <th className="px-3 py-2 font-semibold">DOJ</th>
                <th className="px-3 py-2 font-semibold text-right">Pay</th>
                <th className="px-3 py-2 font-semibold text-right print:hidden w-14" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-400">
                    No profiles match this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((emp) => {
                  const { cat, isDaily, pay } = payFor(emp)
                  const isResigned = (emp.status || 'Active') === 'Resigned'
                  return (
                    <tr
                      key={emp.id}
                      onClick={() => openProfile(emp.id)}
                      className={cn(
                        'border-b border-slate-100 cursor-pointer transition-colors hover:bg-slate-50',
                        isResigned && 'bg-rose-50/30'
                      )}
                    >
                    <td className="px-3 py-2.5 font-mono text-slate-500">{emp.serialNo}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ProfileAvatar
                          name={emp.name}
                          photoUrl={emp.photoUrl}
                          category={cat}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900 block truncate">{emp.name}</span>
                          {emp.fatherName && (
                            <span className="block text-[10px] text-slate-500 truncate">S/O {emp.fatherName}</span>
                          )}
                        </div>
                      </div>
                    </td>
                      <td className="px-3 py-2.5 text-slate-700">{emp.designation}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                          {cat}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-600">{emp.phone || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-600">{emp.doj || '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-800">
                        {pay ? formatCurrency(pay) : '—'}
                        {isDaily && pay ? (
                          <span className="block text-[10px] font-sans font-normal text-slate-400">/ day</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right print:hidden text-slate-400">
                        <Pencil className="size-3.5 inline-block" />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.length === 0 ? (
            <div className="col-span-full py-10 text-center text-slate-400 text-sm">
              No profiles match this filter.
            </div>
          ) : (
            filtered.map((emp) => {
              const { cat, isDaily, pay } = payFor(emp)
              const isResigned = (emp.status || 'Active') === 'Resigned'
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => openProfile(emp.id)}
                  className={cn(
                    'text-left rounded-lg border bg-white p-3.5 transition-colors cursor-pointer hover:border-[#0066cc]',
                    isResigned ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <ProfileAvatar
                        name={emp.name}
                        photoUrl={emp.photoUrl}
                        category={cat}
                        size="md"
                      />
                      <div className="min-w-0">
                        <p className="text-[10px] font-mono text-slate-400">#{emp.serialNo}</p>
                        <h3 className="font-semibold text-slate-900 text-sm leading-snug truncate">{emp.name}</h3>
                        <p className="text-xs text-slate-600 mt-0.5 truncate">{emp.designation}</p>
                      </div>
                    </div>
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                      {cat}
                    </span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                    <span className="flex items-center gap-1 truncate">
                      <Phone className="size-3 text-slate-400 shrink-0" />
                      {emp.phone || '—'}
                    </span>
                    <span className="font-mono font-semibold text-slate-800">
                      {pay ? formatCurrency(pay) : '—'}
                      {isDaily && pay ? <span className="font-sans font-normal text-slate-400"> /d</span> : null}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">DOJ {emp.doj || '—'} · Open to edit</p>
                </button>
              )
            })
          )}
        </div>
      )}

      {filterCategory === 'RESIGNED' && (
        <p className="mt-3 text-xs text-rose-700">
          Resigned archive — profile kholo, wahan Re-Join confirmation ke sath hai.
        </p>
      )}
    </main>
  )
}

export default function EmployeeProfilesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Loading profiles…</div>}>
      <EmployeeProfilesContent />
    </Suspense>
  )
}
