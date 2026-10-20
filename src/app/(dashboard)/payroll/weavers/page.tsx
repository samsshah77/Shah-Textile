'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { payrollService, formatPayrollMonthLabel } from '@/services/payrollService'
import { WeaverWageRecord, CustomColumn, EmployeePaySlip } from '@/types/payroll'
import { AddColumnButton, CustomColumnHeader } from '@/components/shared/CustomColumnModal'
import { SerialCellWithInsert, reorderSerialRows } from '@/components/shared/InlineRowActions'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatNumber, numberToWordsPKR, cn } from '@/lib/utils'
import {
  DollarSign,
  Award,
  Trash2,
  Save,
  Clock,
  Banknote,
  Printer,
  Lock,
  CalendarPlus,
  Edit2,
  X,
  FileText,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { NumericCellInput } from '@/components/shared/NumericCellInput'
import { PayrollMonthSelect } from '@/components/payroll/PayrollMonthSelect'
import { FortnightSelect, fortnightDisplayLabel } from '@/components/payroll/FortnightSelect'
import { MonthLockButton } from '@/components/payroll/MonthLockBanner'
import { EmployeePaySlipModal } from '@/components/payroll/EmployeePaySlipModal'
import { PayrollSaveButton } from '@/components/payroll/PayrollSaveButton'
import { PayrollUnsavedBanner } from '@/components/payroll/PayrollUnsavedBanner'
import { usePayrollDirtyTracker } from '@/hooks/usePayrollDirtyTracker'
import { usePayrollModals } from '@/hooks/usePayrollModals'
import { removeRowConfirm, REMOVE_ROW_TITLE } from '@/components/payroll/removeRowConfirm'

const DEFAULT_WEAVER_WAGES_WIDTHS = {
  serialNo: 56,
  employeeName: 220,
  designation: 170,
  wagePerDay: 110,
  attendanceDays: 70,
  basicSalary: 110,
  rateLoom: 85,
  extraLooms: 85,
  extraAmount: 100,
  attendanceAllowance: 95,
  grossAmount: 115,
  action: 48,
}

const DEFAULT_WEAVER_OT_WIDTHS = {
  serialNo: 56,
  employeeName: 220,
  designation: 170,
  holidayAttendance: 130,
  holidayRate: 110,
  holidayAmount: 130,
  action: 48,
}

const DEFAULT_WEAVER_NET_WIDTHS = {
  serialNo: 56,
  employeeName: 220,
  designation: 170,
  attendanceDays: 65,
  extraLooms: 80,
  extraLoomAmount: 100,
  attendanceAllowance: 95,
  basicSalary: 110,
  holidayAttendance: 65,
  holidayAmount: 100,
  efficiencyAmount: 100,
  netPay: 120,
  action: 48,
}

function WeaversPayrollContent() {
  const { canEditAccounts } = useAuth()
  const { askConfirm, showSuccess, showError, modals } = usePayrollModals()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as 'wages' | 'overtime' | 'net-payment') || 'wages'
  const period = payrollService.getActiveFortnightPeriod()
  const urlFn = searchParams.get('fortnight') as '1-15' | '16-31' | null

  const [activeFortnight, setActiveFortnight] = useState<'1-15' | '16-31'>(
    urlFn === '1-15' || urlFn === '16-31' ? urlFn : period.fortnight
  )
  const [activeTab, setActiveTab] = useState<'wages' | 'overtime' | 'net-payment'>(initialTab)

  const pushFilters = (next: { tab?: string; fortnight?: string; month?: string }) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next.tab) params.set('tab', next.tab)
    if (next.fortnight) params.set('fortnight', next.fortnight)
    if (next.month) params.set('month', next.month)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }
  const [selectedMonth, setSelectedMonth] = useState(period.month)
  const [weaversList, setWeaversList] = useState<WeaverWageRecord[]>([])
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([])
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [activeSlip, setActiveSlip] = useState<EmployeePaySlip | null>(null)

  const isLocked = payrollService.isMonthLocked(selectedMonth)
  const isEditable = canEditAccounts && !isLocked
  const [newMonth, setNewMonth] = useState(() => {
    const months = payrollService.listFortnightMonths()
    const last = months[months.length - 1] || '2026-08'
    const [y, m] = last.split('-').map(Number)
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  })
  const [newFortnight, setNewFortnight] = useState<'1-15' | '16-31'>('1-15')

  // Resizable column width hooks for all 3 views
  const {
    widths: wageWidths,
    setColumnWidth: setWageColWidth,
    resetColumnWidth: resetWageColWidth,
  } = useResizableColumns('weavers_wages', DEFAULT_WEAVER_WAGES_WIDTHS)

  const {
    widths: otWidths,
    setColumnWidth: setOtColWidth,
    resetColumnWidth: resetOtColWidth,
  } = useResizableColumns('weavers_ot', DEFAULT_WEAVER_OT_WIDTHS)

  const {
    widths: netWidths,
    setColumnWidth: setNetColWidth,
    resetColumnWidth: resetNetColWidth,
  } = useResizableColumns('weavers_net', DEFAULT_WEAVER_NET_WIDTHS)

  // Unsaved changes / dirty cell tracker
  const {
    isCellDirty,
    isRowDirty,
    dirtyCount,
    hasUnsavedChanges,
    commitSaved,
    resetSnapshot,
    discardChanges,
    requestNavigationGuard,
  } = usePayrollDirtyTracker(
    weaversList,
    `${selectedMonth}-${activeFortnight}`,
    {
      sheetName: 'Weavers',
      editableFields: [
        'attendanceDays',
        'extraLooms',
        'attendanceAllowance',
        'holidayAttendance',
        'efficiencyAmount',
      ],
    }
  )

  useEffect(() => {
    const fn = searchParams.get('fortnight') as '1-15' | '16-31'
    if (fn === '1-15' || fn === '16-31') setActiveFortnight(fn)

    const tab = searchParams.get('tab') as 'wages' | 'overtime' | 'net-payment'
    if (tab === 'overtime' || tab === 'net-payment' || tab === 'wages') setActiveTab(tab)
  }, [searchParams])

  const reload = (force = false) => {
    if (!force && hasUnsavedChanges) return
    const fresh = payrollService.getWeaversWages(selectedMonth, activeFortnight)
    setWeaversList(fresh)
    resetSnapshot(fresh)
  }

  useEffect(() => {
    reload()
    const handleSync = (e: Event) => {
      const detailMonth = (e as CustomEvent<{ month?: string }>).detail?.month
      const periodNow = payrollService.getActiveFortnightPeriod()
      const nextMonth =
        detailMonth && /^\d{4}-\d{2}$/.test(detailMonth) ? detailMonth : periodNow.month
      const nextFn = periodNow.fortnight
      if (nextMonth !== selectedMonth || nextFn !== activeFortnight) {
        setSelectedMonth(nextMonth)
        setActiveFortnight(nextFn)
        return
      }
      reload()
    }
    window.addEventListener('payroll_synced', handleSync)
    return () => window.removeEventListener('payroll_synced', handleSync)
  }, [selectedMonth, activeFortnight])

  const openGenerateDialog = () => {
    if (!canEditAccounts) return
    setShowGenerateDialog(true)
  }

  const confirmGenerateFortnight = () => {
    if (!canEditAccounts) return
    const monthToGenerate = newMonth
    const fnToGenerate = newFortnight
    setShowGenerateDialog(false)
    askConfirm({
      title: 'Generate fortnight?',
      message: (
        <>
          <strong>
            {formatPayrollMonthLabel(monthToGenerate)} ({fnToGenerate})
          </strong>{' '}
          generate hoga — Weavers, Helpers, Contractors isi cycle pe shift ho jayenge.
        </>
      ),
      confirmText: 'Generate',
      onConfirm: async () => {
        const result = await payrollService.generateFortnightCycle(monthToGenerate, fnToGenerate)
        if (result.ok) {
          setSelectedMonth(monthToGenerate)
          setActiveFortnight(fnToGenerate)
          const months = payrollService.listFortnightMonths()
          const last = months[months.length - 1] || monthToGenerate
          const [y, m] = last.split('-').map(Number)
          const next =
            fnToGenerate === '1-15'
              ? last
              : m === 12
                ? `${y + 1}-01`
                : `${y}-${String(m + 1).padStart(2, '0')}`
          setNewMonth(fnToGenerate === '1-15' ? last : next)
          setNewFortnight(fnToGenerate === '1-15' ? '16-31' : '1-15')
          showSuccess('Fortnight generated', result.message)
        } else {
          showError('Generate failed', result.message)
        }
      },
    })
  }

  // Handle cell edit with live formula recalculation
  const handleCellChange = (
    index: number,
    field: keyof WeaverWageRecord,
    value: string | number
  ) => {
    if (!canEditAccounts) return
    setWeaversList((prev) => {
      const updated = [...prev]
      const current = { ...updated[index], [field]: value }
      if (field === 'designation') {
        if (value === 'Spare Weaver') {
          current.wagePerDay = 1800
          current.holidayRate = 2100
        } else {
          current.wagePerDay = 1450
          current.holidayRate = 1750
        }
      }
      const recalculated = payrollService.calculateWeaverWageRow(current)
      updated[index] = recalculated
      return updated
    })
  }

  const handleCustomCellChange = (index: number, colId: string, value: string) => {
    if (!canEditAccounts) return
    setWeaversList((prev) => {
      const updated = [...prev]
      const currentCustom = updated[index].customFields || {}
      updated[index] = {
        ...updated[index],
        customFields: { ...currentCustom, [colId]: value },
      }
      return updated
    })
  }

  // Insert row anywhere with auto-renumber (inserts BELOW selected row)
  const handleInsertRow = (insertIdx?: number) => {
    if (!canEditAccounts) return
    const raw: WeaverWageRecord = {
      id: `w-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      serialNo: insertIdx !== undefined ? insertIdx + 2 : weaversList.length + 1,
      employeeName: 'NEW WEAVER',
      designation: 'Weaver',
      wagePerDay: 1450,
      attendanceDays: 13,
      basicSalary: 18850,
      rateLoom: 150,
      extraLooms: 0,
      extraLoomAmount: 0,
      attendanceAllowance: 200,
      grossAmount: 19050,
      holidayAttendance: 0,
      holidayRate: 1750,
      holidayAmount: 0,
      efficiencyAmount: 0,
      netPay: 19050,
      month: selectedMonth,
      fortnight: activeFortnight,
    }
    const newRecord = payrollService.calculateWeaverWageRow(raw)

    const updated = [...weaversList]
    if (insertIdx !== undefined) {
      updated.splice(insertIdx + 1, 0, newRecord)
    } else {
      updated.push(newRecord)
    }

    const renumbered = updated.map((item, i) => ({
      ...item,
      serialNo: i + 1,
    }))
    setWeaversList(renumbered)
  }

  const handleMoveRow = (index: number, direction: 'up' | 'down') => {
    if (!canEditAccounts) return
    const next = reorderSerialRows(weaversList, index, direction)
    if (!next) return
    setWeaversList(next)
  }

  // Delete row with confirmation
  const handleDeleteRow = (id: string) => {
    if (!canEditAccounts) return
    const row = weaversList.find((w) => w.id === id)
    if (!row) return
    const empName = row.employeeName || 'Weaver'
    askConfirm({
      ...removeRowConfirm(empName, 'is Weavers table'),
      onConfirm: () => {
        // Only this row of this table — the profile and other periods stay.
        const filtered = weaversList
          .filter((w) => w.id !== id)
          .map((item, i) => ({ ...item, serialNo: i + 1 }))
        setWeaversList(filtered)
      },
    })
  }


  const handleSave = () => {
    if (!canEditAccounts) return
    askConfirm({
      title: 'Save weavers sheet?',
      message: `Save ${formatPayrollMonthLabel(selectedMonth)} (${activeFortnight}) wages?`,
      confirmText: 'Save',
      onConfirm: () => {
        payrollService.saveWeaversWages(selectedMonth, activeFortnight, weaversList)
        commitSaved(weaversList)
        showSuccess('Saved', 'Weavers wages successfully saved.')
      },
    })
  }

  const handleDiscard = () => {
    askConfirm({
      title: 'Discard unsaved changes?',
      message: 'Unsaved edits revert ho jayenge. Proceed karein?',
      confirmText: 'Discard',
      onConfirm: () => {
        setWeaversList(discardChanges())
      },
    })
  }

  const handlePrint = () => {
    window.print()
  }

  // Custom Column Handlers
  const handleAddCustomColumn = (newCol: CustomColumn) => {
    setCustomColumns([...customColumns, newCol])
  }

  const handleUpdateCustomColumn = (updated: CustomColumn) => {
    setCustomColumns(customColumns.map((c) => (c.id === updated.id ? updated : c)))
  }

  const handleRemoveCustomColumn = (colId: string) => {
    setCustomColumns(customColumns.filter((c) => c.id !== colId))
  }

  // Totals calculations
  const totalBasic = weaversList.reduce((sum, w) => sum + (w.basicSalary || 0), 0)
  const totalExtraLoom = weaversList.reduce((sum, w) => sum + (w.extraLoomAmount || 0), 0)
  const totalAttnAllow = weaversList.reduce((sum, w) => sum + (w.attendanceAllowance || 0), 0)
  const totalGross = weaversList.reduce((sum, w) => sum + (w.grossAmount || 0), 0)
  const totalHoliday = weaversList.reduce((sum, w) => sum + (w.holidayAmount || 0), 0)
  const totalEfficiency = weaversList.reduce((sum, w) => sum + (w.efficiencyAmount || 0), 0)
  const totalNet = weaversList.reduce((sum, w) => sum + (w.netPay || 0), 0)

  return (
    <div className="space-y-6 print:space-y-2">
      {modals}
      <div className="print:hidden">
        <PageHeader
          title={
            activeTab === 'overtime'
              ? `Weawers OT ${activeFortnight}`
              : activeTab === 'net-payment'
                ? `Net Payment Weawers ${activeFortnight}`
                : `Weawers Wages ${activeFortnight}`
          }
          showTitle={false}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Payroll', href: '/payroll/weavers' },
            {
              label:
                activeTab === 'overtime'
                  ? `Weawers OT ${activeFortnight}`
                  : activeTab === 'net-payment'
                    ? `Net Payment Weawers ${activeFortnight}`
                    : `Weawers Wages ${activeFortnight}`,
            },
          ]}
          actions={
            <>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <PayrollMonthSelect
                  value={selectedMonth}
                  months={payrollService.listFortnightMonths()}
                  disabled={!canEditAccounts}
                  onChange={
                    canEditAccounts
                      ? (m) => {
                          if (m === selectedMonth) return
                          requestNavigationGuard(async () => {
                            const halves = payrollService.listAvailableFortnightsForMonth(m)
                            const nextFn = halves.includes(activeFortnight)
                              ? activeFortnight
                              : halves[0] || '1-15'
                            await payrollService.setActiveFortnightPeriodAsync(m, nextFn)
                            setSelectedMonth(m)
                            setActiveFortnight(nextFn)
                            pushFilters({ month: m, fortnight: nextFn, tab: activeTab })
                          })
                        }
                      : undefined
                  }
                />
                <FortnightSelect
                  month={selectedMonth}
                  value={activeFortnight}
                  disabled={!canEditAccounts}
                  onChange={
                    canEditAccounts
                      ? (fn) => {
                          if (fn === activeFortnight) return
                          requestNavigationGuard(async () => {
                            await payrollService.setActiveFortnightPeriodAsync(selectedMonth, fn)
                            setActiveFortnight(fn)
                            pushFilters({ fortnight: fn, tab: activeTab })
                          })
                        }
                      : undefined
                  }
                />
                <select
                  value={activeTab}
                  onChange={(e) => {
                    const tab = e.target.value as 'wages' | 'overtime' | 'net-payment'
                    if (tab === activeTab) return
                    requestNavigationGuard(() => {
                      setActiveTab(tab)
                      pushFilters({ tab, fortnight: activeFortnight })
                    })
                  }}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
                  aria-label="Sheet view"
                >
                  <option value="wages">Wages</option>
                  <option value="overtime">Overtime</option>
                  <option value="net-payment">Net Payment</option>
                </select>
                {canEditAccounts && (
                  <button
                    type="button"
                    onClick={openGenerateDialog}
                    className="erp-btn-primary text-xs !min-h-9 !h-9"
                  >
                    <CalendarPlus className="size-3.5" />
                    <span>Generate</span>
                  </button>
                )}
              </div>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <AddColumnButton onAddColumn={handleAddCustomColumn} />

                <PayrollSaveButton
                  onClick={handleSave}
                  disabled={!isEditable}
                  dirtyCount={dirtyCount}
                />
                <MonthLockButton month={selectedMonth} onStatusChange={reload} />
                <button
                  type="button"
                  onClick={handlePrint}
                  className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800"
                >
                  <Printer className="size-3.5" />
                  <span>Print</span>
                </button>
                <ExportPdfButton
                  filename={`Weavers-${selectedMonth}-${activeFortnight || 'all'}`}
                  className="!min-h-9 !h-9"
                />
              </div>
            </>
          }
        />
      </div>

      {showGenerateDialog && (
        <div
          className="fixed inset-0 z-[1080] flex items-center justify-center p-4 print:hidden"
          style={{ background: 'rgba(15, 23, 42, 0.48)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowGenerateDialog(false)
          }}
        >
          <div className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/5">
            <div className="relative px-5 pt-5 pb-4">
              <button
                type="button"
                onClick={() => setShowGenerateDialog(false)}
                className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
              <h3 className="text-[15px] font-semibold text-slate-900 pr-8">Generate fortnight</h3>
              <p className="mt-1.5 text-[13px] text-slate-600">
                Month aur half select karo, phir confirm karo.
              </p>
              <div className="mt-4 space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">Month</span>
                  <input
                    type="month"
                    value={newMonth}
                    onChange={(e) => setNewMonth(e.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0066cc] outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">Fortnight</span>
                  <select
                    value={newFortnight}
                    onChange={(e) => setNewFortnight(e.target.value as '1-15' | '16-31')}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
                  >
                    <option value="1-15">{fortnightDisplayLabel(newMonth, '1-15')}</option>
                    <option value="16-31">{fortnightDisplayLabel(newMonth, '16-31')}</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowGenerateDialog(false)}
                className="erp-btn-secondary text-xs"
              >
                Cancel
              </button>
              <button type="button" onClick={confirmGenerateFortnight} className="erp-btn-primary text-xs">
                <CalendarPlus className="size-3.5" />
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safety Notice if Editing is Disabled */}
      {!canEditAccounts && (
        <div className="flex items-center gap-2.5 p-3 rounded-md border border-amber-200 bg-amber-50/50 text-amber-900 text-xs font-medium print:hidden">
          <Lock className="size-4 shrink-0 text-amber-600" />
          <span>
            Edit Protection Active: Click <strong>&quot;Enable Editing&quot;</strong> in the top navigation bar to modify weaver wages, attendance, extra looms, or save changes.
          </span>
        </div>
      )}

      {/* Unsaved changes banner */}
      <PayrollUnsavedBanner
        dirtyCount={dirtyCount}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      {/* VIEW 1: Weavers Wages (Sheets 8 & 15) */}
      {activeTab === 'wages' && (
        <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
          <div className="text-center border-b border-slate-200 pb-3 mb-4">
            <h1 className="text-xl font-bold uppercase text-slate-900 tracking-wide">SARA TEXTILES</h1>
            <h2 className="text-xs font-semibold text-slate-600 mt-0.5">
              WEAVERS WAGES ({fortnightDisplayLabel(selectedMonth, activeFortnight)} ·{' '}
              {formatPayrollMonthLabel(selectedMonth)})
            </h2>
            <p className="text-[11px] text-slate-500 font-mono">Loom production, extra looms & attendance allowance</p>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                  <ResizableTh
                    columnKey="serialNo"
                    width={wageWidths.serialNo}
                    minWidth={45}
                    onResize={setWageColWidth}
                    onReset={resetWageColWidth}
                    className="border-r border-slate-200 py-2 px-1 text-center"
                    title="Hover row serial to insert row at position"
                  >
                    S.#
                  </ResizableTh>

                  <ResizableTh
                    columnKey="employeeName"
                    width={wageWidths.employeeName}
                    minWidth={130}
                    onResize={setWageColWidth}
                    onReset={resetWageColWidth}
                    className="border-r border-slate-200 py-2 px-3 font-sans"
                  >
                    Employee Name
                  </ResizableTh>

                  <ResizableTh
                    columnKey="designation"
                    width={wageWidths.designation}
                    minWidth={110}
                    onResize={setWageColWidth}
                    onReset={resetWageColWidth}
                    className="border-r border-slate-200 py-2 px-3 font-sans"
                  >
                    Designation
                  </ResizableTh>

                  <ResizableTh
                    columnKey="wagePerDay"
                    width={wageWidths.wagePerDay}
                    minWidth={85}
                    onResize={setWageColWidth}
                    onReset={resetWageColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right"
                  >
                    Wage / Day
                  </ResizableTh>

                  <ResizableTh
                    columnKey="attendanceDays"
                    width={wageWidths.attendanceDays}
                    minWidth={55}
                    onResize={setWageColWidth}
                    onReset={resetWageColWidth}
                    className="border-r border-slate-200 py-2 px-1 text-center"
                  >
                    ATTN
                  </ResizableTh>

                  <ResizableTh
                    columnKey="basicSalary"
                    width={wageWidths.basicSalary}
                    minWidth={85}
                    onResize={setWageColWidth}
                    onReset={resetWageColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                  >
                    Basic Salary
                  </ResizableTh>

                  <ResizableTh
                    columnKey="rateLoom"
                    width={wageWidths.rateLoom}
                    minWidth={65}
                    onResize={setWageColWidth}
                    onReset={resetWageColWidth}
                    className="border-r border-slate-200 py-2 px-1 text-center whitespace-nowrap"
                  >
                    Rate Loom
                  </ResizableTh>

                  <ResizableTh
                    columnKey="extraLooms"
                    width={wageWidths.extraLooms}
                    minWidth={65}
                    onResize={setWageColWidth}
                    onReset={resetWageColWidth}
                    className="border-r border-slate-200 py-2 px-1 text-center"
                  >
                    Extra Looms
                  </ResizableTh>

                  <ResizableTh
                    columnKey="extraAmount"
                    width={wageWidths.extraAmount}
                    minWidth={85}
                    onResize={setWageColWidth}
                    onReset={resetWageColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                  >
                    Extra Amount
                  </ResizableTh>

                  <ResizableTh
                    columnKey="attendanceAllowance"
                    width={wageWidths.attendanceAllowance}
                    minWidth={85}
                    onResize={setWageColWidth}
                    onReset={resetWageColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                  >
                    ATTN Allow.
                  </ResizableTh>

                  <ResizableTh
                    columnKey="grossAmount"
                    width={wageWidths.grossAmount}
                    minWidth={95}
                    onResize={setWageColWidth}
                    onReset={resetWageColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right font-bold text-[#0066cc] whitespace-nowrap"
                  >
                    Gross Wages
                  </ResizableTh>
                  
                  {/* Custom Columns */}
                  {customColumns.map((col) => (
                    <CustomColumnHeader
                      key={col.id}
                      column={col}
                      onUpdateColumn={handleUpdateCustomColumn}
                      onRemoveColumn={handleRemoveCustomColumn}
                    />
                  ))}

                  <ResizableTh
                    columnKey="action"
                    width={wageWidths.action}
                    minWidth={45}
                    enableResize={false}
                    className="py-2 px-1 text-center print:hidden"
                  >
                    Action
                  </ResizableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {weaversList.map((w, idx) => (
                  <tr
                    key={w.id}
                    className={cn(
                      'text-slate-800 hover:bg-slate-50/80 transition-colors',
                      isRowDirty(w.id) && 'payroll-row-dirty'
                    )}
                  >
                    {/* S.# with Hover Row Insertion */}
                    <SerialCellWithInsert
                      serialNo={w.serialNo}
                      index={idx}
                      onMoveUp={(i) => handleMoveRow(i, 'up')}
                      onMoveDown={(i) => handleMoveRow(i, 'down')}
                      canMoveUp={idx > 0}
                      canMoveDown={idx < weaversList.length - 1}
                    />
                    
                    {/* Name — from HR */}
                    <td
                      style={{ width: `${wageWidths.employeeName}px`, minWidth: `${wageWidths.employeeName}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 bg-slate-50"
                      title="From HR Profiles / General Wages"
                    >
                      <span className="font-semibold font-sans text-xs text-slate-500">{w.employeeName}</span>
                    </td>

                    {/* Designation — from HR */}
                    <td
                      style={{ width: `${wageWidths.designation}px`, minWidth: `${wageWidths.designation}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 bg-slate-50"
                      title="From HR Profiles / General Wages"
                    >
                      <span className="font-sans text-xs text-slate-500">{w.designation}</span>
                    </td>

                    {/* Wage Per Day — From HR Profile Card */}
                    <td
                      style={{ width: `${wageWidths.wagePerDay}px`, minWidth: `${wageWidths.wagePerDay}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right bg-slate-50/50"
                      title="Set in HR Profile Card"
                    >
                      <span className="font-mono text-xs font-semibold text-slate-800">
                        {formatNumber(w.wagePerDay || 0, 0)}
                      </span>
                    </td>

                    {/* Attendance Days */}
                    <td
                      style={{ width: `${wageWidths.attendanceDays}px`, minWidth: `${wageWidths.attendanceDays}px` }}
                      className="border-r border-slate-100 py-1 px-1 text-center"
                    >
                      <NumericCellInput
                        value={w.attendanceDays || 0}
                        disabled={!canEditAccounts}
                        isDirty={isCellDirty(w.id, 'attendanceDays')}
                        navRow={idx}
                        navCol={1}
                        onValueChange={(v) => handleCellChange(idx, 'attendanceDays', v)}
                        className="w-full text-center bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-slate-800"
                      />
                    </td>

                    {/* Calculated Basic Salary */}
                    <td
                      style={{ width: `${wageWidths.basicSalary}px`, minWidth: `${wageWidths.basicSalary}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                    >
                      {formatNumber(w.basicSalary, 0)}
                    </td>

                    {/* Rate Per Loom */}
                    <td
                      style={{ width: `${wageWidths.rateLoom}px`, minWidth: `${wageWidths.rateLoom}px` }}
                      className="border-r border-slate-100 py-1.5 px-1 text-center text-slate-600 font-mono whitespace-nowrap"
                    >
                      {formatNumber(w.rateLoom, 0)}
                    </td>

                    {/* Extra Looms Input */}
                    <td
                      style={{ width: `${wageWidths.extraLooms}px`, minWidth: `${wageWidths.extraLooms}px` }}
                      className="border-r border-slate-100 py-1 px-1 text-center"
                    >
                      <NumericCellInput
                        value={w.extraLooms || 0}
                        disabled={!canEditAccounts}
                        isDirty={isCellDirty(w.id, 'extraLooms')}
                        navRow={idx}
                        navCol={2}
                        onValueChange={(v) => handleCellChange(idx, 'extraLooms', v)}
                        className="w-full text-center bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-slate-900"
                      />
                    </td>

                    {/* Calculated Extra Amount */}
                    <td
                      style={{ width: `${wageWidths.extraAmount}px`, minWidth: `${wageWidths.extraAmount}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                    >
                      {formatNumber(w.extraLoomAmount ?? (w as any).extraAmount ?? 0, 0)}
                    </td>

                    {/* Attendance Allowance — editable */}
                    <td
                      style={{ width: `${wageWidths.attendanceAllowance}px`, minWidth: `${wageWidths.attendanceAllowance}px` }}
                      className="border-r border-slate-100 py-1 px-1 text-right"
                    >
                      <NumericCellInput
                        value={w.attendanceAllowance || 0}
                        disabled={!canEditAccounts}
                        isDirty={isCellDirty(w.id, 'attendanceAllowance')}
                        navRow={idx}
                        navCol={3}
                        onValueChange={(v) => handleCellChange(idx, 'attendanceAllowance', v)}
                        className="w-full text-right bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-slate-900"
                      />
                    </td>

                    {/* Calculated Gross Amount */}
                    <td
                      style={{ width: `${wageWidths.grossAmount}px`, minWidth: `${wageWidths.grossAmount}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right font-bold text-[#0066cc] whitespace-nowrap"
                    >
                      {formatNumber(w.grossAmount, 0)}
                    </td>

                    {/* Custom Column Cells */}
                    {customColumns.map((col) => {
                      const cWidth = col.width || 120
                      return (
                        <td
                          key={col.id}
                          style={{ width: `${cWidth}px`, minWidth: `${cWidth}px` }}
                          className="border-r border-slate-100 py-1 px-1 text-slate-700"
                        >
                          <input
                            type="text"
                            value={w.customFields?.[col.id] || ''}
                            disabled={!canEditAccounts}
                            onChange={(e) => handleCustomCellChange(idx, col.id, e.target.value)}
                            placeholder="—"
                            className={cn(
                              'w-full bg-transparent px-1 py-0.5 font-medium font-sans text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-center transition-colors',
                              isCellDirty(w.id, `cf_${col.id}`, w.customFields?.[col.id]) &&
                                'payroll-cell-dirty'
                            )}
                          />
                        </td>
                      )
                    })}

                    <td
                      style={{ width: `${wageWidths.action}px`, minWidth: `${wageWidths.action}px` }}
                      className="py-1 px-1 text-center print:hidden"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const slip = payrollService.generateEmployeePaySlip(selectedMonth, w.id)
                            setActiveSlip(slip)
                          }}
                          title="View Official Salary Slip / پرچی"
                          className="p-1 text-slate-400 hover:text-[#0066cc] transition-colors cursor-pointer"
                        >
                          <FileText className="size-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRow(w.id)}
                          title={REMOVE_ROW_TITLE}
                          disabled={!isEditable}
                          className="text-slate-400 hover:text-red-600 p-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-slate-900">
                  <td colSpan={5} className="border-r border-slate-200 py-2 px-2 text-center uppercase text-xs">Total Weaving Production:</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold">{formatNumber(totalBasic, 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-1 text-center text-slate-400">-</td>
                  <td className="border-r border-slate-200 py-2 px-1 text-center font-semibold">{weaversList.reduce((s, w) => s + (w.extraLooms || 0), 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold">{formatNumber(totalExtraLoom, 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold">{formatNumber(totalAttnAllow, 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-bold text-[#0066cc] text-sm">{formatCurrency(totalGross)}</td>
                  {customColumns.map((col) => (
                    <td key={col.id} className="border-r border-slate-200 py-2 px-2 text-center font-sans text-[10px] text-slate-500">
                      —
                    </td>
                  ))}
                  <td className="print:hidden"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Prominent Calculated Gross Total in Words */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 font-sans print:border-none print:p-2">
            <div>
              <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Gross Weavers Wages in Words (PKR):</span>
              <div className="text-xs font-semibold text-slate-900 mt-0.5">{numberToWordsPKR(totalGross)}</div>
            </div>
            <div className="sm:text-right border-t sm:border-t-0 border-slate-200 pt-2 sm:pt-0 w-full sm:w-auto">
              <span className="text-[11px] font-semibold uppercase text-slate-500">Calculated Total Gross:</span>
              <div className="text-lg font-bold text-[#0066cc]">{formatCurrency(totalGross)}</div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: Weavers OT (Sheets 9 & 16) */}
      {activeTab === 'overtime' && (
        <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
          <div className="text-center border-b border-slate-200 pb-3 mb-4">
            <h1 className="text-xl font-bold uppercase text-slate-900 tracking-wide">SARA TEXTILES</h1>
            <h2 className="text-xs font-semibold text-slate-600 mt-0.5">
              WEAVER HOLIDAYS & OVERTIME ({fortnightDisplayLabel(selectedMonth, activeFortnight)} ·{' '}
              {formatPayrollMonthLabel(selectedMonth)})
            </h2>
            <p className="text-[11px] text-slate-500 font-mono">Gazetted & weekly holiday shifts worked</p>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                  <ResizableTh
                    columnKey="serialNo"
                    width={otWidths.serialNo}
                    minWidth={45}
                    onResize={setOtColWidth}
                    onReset={resetOtColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-center"
                    title="Hover row serial to insert row at position"
                  >
                    S.#
                  </ResizableTh>

                  <ResizableTh
                    columnKey="employeeName"
                    width={otWidths.employeeName}
                    minWidth={130}
                    onResize={setOtColWidth}
                    onReset={resetOtColWidth}
                    className="border-r border-slate-200 py-2 px-3 font-sans"
                  >
                    EMPLOYEE NAME
                  </ResizableTh>

                  <ResizableTh
                    columnKey="designation"
                    width={otWidths.designation}
                    minWidth={110}
                    onResize={setOtColWidth}
                    onReset={resetOtColWidth}
                    className="border-r border-slate-200 py-2 px-3 font-sans"
                  >
                    Designation
                  </ResizableTh>

                  <ResizableTh
                    columnKey="holidayAttendance"
                    width={otWidths.holidayAttendance}
                    minWidth={90}
                    onResize={setOtColWidth}
                    onReset={resetOtColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-center"
                  >
                    H/Day Attendance
                  </ResizableTh>

                  <ResizableTh
                    columnKey="holidayRate"
                    width={otWidths.holidayRate}
                    minWidth={85}
                    onResize={setOtColWidth}
                    onReset={resetOtColWidth}
                    className="border-r border-slate-200 py-2 px-3 text-right whitespace-nowrap"
                  >
                    Overtime Rate
                  </ResizableTh>

                  <ResizableTh
                    columnKey="holidayAmount"
                    width={otWidths.holidayAmount}
                    minWidth={95}
                    onResize={setOtColWidth}
                    onReset={resetOtColWidth}
                    className="border-r border-slate-200 py-2 px-3 text-right font-semibold text-slate-900 whitespace-nowrap"
                  >
                    AMOUNT
                  </ResizableTh>
                  
                  {/* Custom Columns */}
                  {customColumns.map((col) => (
                    <CustomColumnHeader
                      key={col.id}
                      column={col}
                      onUpdateColumn={handleUpdateCustomColumn}
                      onRemoveColumn={handleRemoveCustomColumn}
                    />
                  ))}

                  <ResizableTh
                    columnKey="action"
                    width={otWidths.action}
                    minWidth={45}
                    enableResize={false}
                    className="py-2 px-1 text-center print:hidden"
                  >
                    Action
                  </ResizableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {weaversList.map((w, idx) => (
                  <tr
                    key={w.id}
                    className={cn(
                      'text-slate-800 hover:bg-slate-50/80 transition-colors',
                      isRowDirty(w.id) && 'payroll-row-dirty'
                    )}
                  >
                    {/* S.# with Hover Row Insertion */}
                    <SerialCellWithInsert
                      serialNo={w.serialNo}
                      index={idx}
                      onMoveUp={(i) => handleMoveRow(i, 'up')}
                      onMoveDown={(i) => handleMoveRow(i, 'down')}
                      canMoveUp={idx > 0}
                      canMoveDown={idx < weaversList.length - 1}
                    />
                    
                    <td
                      style={{ width: `${otWidths.employeeName}px`, minWidth: `${otWidths.employeeName}px` }}
                      className="border-r border-slate-100 py-1.5 px-3 font-sans font-semibold uppercase text-slate-900"
                    >
                      {w.employeeName}
                    </td>

                    <td
                      style={{ width: `${otWidths.designation}px`, minWidth: `${otWidths.designation}px` }}
                      className="border-r border-slate-100 py-1.5 px-3 font-sans text-slate-600"
                    >
                      {w.designation}
                    </td>

                    {/* H/Day Attendance — editable on sheet */}
                    <td
                      style={{ width: `${otWidths.holidayAttendance}px`, minWidth: `${otWidths.holidayAttendance}px` }}
                      className="border-r border-slate-100 py-1 px-1 text-center"
                    >
                      <NumericCellInput
                        value={w.holidayAttendance || 0}
                        disabled={!canEditAccounts}
                        isDirty={isCellDirty(w.id, 'holidayAttendance')}
                        navRow={idx}
                        navCol={0}
                        onValueChange={(v) => handleCellChange(idx, 'holidayAttendance', v)}
                        className="w-full text-center bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-slate-800"
                      />
                    </td>

                    <td
                      style={{ width: `${otWidths.holidayRate}px`, minWidth: `${otWidths.holidayRate}px` }}
                      className="border-r border-slate-100 py-1.5 px-3 text-right text-slate-600 font-mono whitespace-nowrap bg-slate-50/30"
                      title="Set in HR Profile Card"
                    >
                      {formatNumber(w.holidayRate, 0)}
                    </td>

                    <td
                      style={{ width: `${otWidths.holidayAmount}px`, minWidth: `${otWidths.holidayAmount}px` }}
                      className="border-r border-slate-100 py-1.5 px-3 text-right font-semibold text-slate-900 font-mono whitespace-nowrap"
                    >
                      {formatNumber(w.holidayAmount, 0)}
                    </td>

                    {/* Custom Column Cells */}
                    {customColumns.map((col) => {
                      const cWidth = col.width || 120
                      return (
                        <td
                          key={col.id}
                          style={{ width: `${cWidth}px`, minWidth: `${cWidth}px` }}
                          className="border-r border-slate-100 py-1 px-1 text-slate-700"
                        >
                          <input
                            type="text"
                            value={w.customFields?.[col.id] || ''}
                            disabled={!canEditAccounts}
                            onChange={(e) => handleCustomCellChange(idx, col.id, e.target.value)}
                            placeholder="—"
                            className={cn(
                              'w-full bg-transparent px-1 py-0.5 font-medium font-sans text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-center transition-colors',
                              isCellDirty(w.id, `cf_${col.id}`, w.customFields?.[col.id]) &&
                                'payroll-cell-dirty'
                            )}
                          />
                        </td>
                      )
                    })}

                    <td
                      style={{ width: `${otWidths.action}px`, minWidth: `${otWidths.action}px` }}
                      className="py-1 px-1 text-center print:hidden"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <Link
                          href={`/payroll/profiles?search=${encodeURIComponent(w.employeeName)}`}
                          className="p-1 text-[#0066cc] hover:text-blue-800 rounded hover:bg-blue-50 transition-colors"
                          title={`Edit Overtime for ${w.employeeName} in HR Profile`}
                        >
                          <Edit2 className="size-3.5" />
                        </Link>
                        <button
                          onClick={() => handleDeleteRow(w.id)}
                          title={REMOVE_ROW_TITLE}
                          disabled={!canEditAccounts}
                          className="text-slate-400 hover:text-red-600 p-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-slate-900">
                  <td colSpan={3} className="border-r border-slate-200 py-2 px-3 text-center uppercase text-xs">Total Holiday Overtime:</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-center font-semibold">{weaversList.reduce((s, w) => s + (w.holidayAttendance || 0), 0)} shifts</td>
                  <td className="border-r border-slate-200 py-2 px-3 text-right text-slate-400">-</td>
                  <td className="border-r border-slate-200 py-2 px-3 text-right font-bold text-[#0066cc] text-sm">{formatCurrency(totalHoliday)}</td>
                  {customColumns.map((col) => (
                    <td key={col.id} className="border-r border-slate-200 py-2 px-2 text-center font-sans text-[10px] text-slate-500">
                      —
                    </td>
                  ))}
                  <td className="print:hidden"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Prominent Calculated Holiday Total in Words */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 font-sans print:border-none print:p-2">
            <div>
              <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Total Holiday Overtime in Words (PKR):</span>
              <div className="text-xs font-semibold text-slate-900 mt-0.5">{numberToWordsPKR(totalHoliday)}</div>
            </div>
            <div className="sm:text-right border-t sm:border-t-0 border-slate-200 pt-2 sm:pt-0 w-full sm:w-auto">
              <span className="text-[11px] font-semibold uppercase text-slate-500">Calculated Holiday Total:</span>
              <div className="text-lg font-bold text-[#0066cc]">{formatCurrency(totalHoliday)}</div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: Net Payment Weavers (Sheets 10 & 17) */}
      {activeTab === 'net-payment' && (
        <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
          <div className="text-center border-b border-slate-200 pb-3 mb-4">
            <h1 className="text-xl font-bold uppercase text-slate-900 tracking-wide">SARA TEXTILES</h1>
            <h2 className="text-xs font-semibold text-slate-600 mt-0.5">
              WEAVERS SALARY & OVERTIME PAYMENT ({fortnightDisplayLabel(selectedMonth, activeFortnight)} ·{' '}
              {formatPayrollMonthLabel(selectedMonth)})
            </h2>
            <p className="text-[11px] text-slate-500 font-mono">Consolidated net payout rollup</p>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                  <ResizableTh
                    columnKey="serialNo"
                    width={netWidths.serialNo}
                    minWidth={45}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-1 text-center"
                    title="Hover row serial to insert row at position"
                  >
                    S.#
                  </ResizableTh>

                  <ResizableTh
                    columnKey="employeeName"
                    width={netWidths.employeeName}
                    minWidth={130}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-3 font-sans"
                  >
                    EMPLOYEE NAME
                  </ResizableTh>

                  <ResizableTh
                    columnKey="designation"
                    width={netWidths.designation}
                    minWidth={110}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-3 font-sans"
                  >
                    DESIGNATION
                  </ResizableTh>

                  <ResizableTh
                    columnKey="attendanceDays"
                    width={netWidths.attendanceDays}
                    minWidth={50}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-1 text-center whitespace-nowrap"
                  >
                    ATTN
                  </ResizableTh>

                  <ResizableTh
                    columnKey="extraLooms"
                    width={netWidths.extraLooms}
                    minWidth={60}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-1 text-center whitespace-nowrap"
                  >
                    EXTRA LOOM
                  </ResizableTh>

                  <ResizableTh
                    columnKey="extraLoomAmount"
                    width={netWidths.extraLoomAmount}
                    minWidth={85}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right whitespace-nowrap"
                  >
                    Extra Loom Amt
                  </ResizableTh>

                  <ResizableTh
                    columnKey="attendanceAllowance"
                    width={netWidths.attendanceAllowance}
                    minWidth={80}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right whitespace-nowrap"
                  >
                    ATTN Allow.
                  </ResizableTh>

                  <ResizableTh
                    columnKey="basicSalary"
                    width={netWidths.basicSalary}
                    minWidth={85}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                  >
                    WAGES
                  </ResizableTh>

                  <ResizableTh
                    columnKey="holidayAttendance"
                    width={netWidths.holidayAttendance}
                    minWidth={55}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-1 text-center whitespace-nowrap"
                  >
                    H/Days
                  </ResizableTh>

                  <ResizableTh
                    columnKey="holidayAmount"
                    width={netWidths.holidayAmount}
                    minWidth={85}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                  >
                    H/Days Amt
                  </ResizableTh>

                  <ResizableTh
                    columnKey="efficiencyAmount"
                    width={netWidths.efficiencyAmount}
                    minWidth={85}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-[#0066cc]"
                  >
                    Efficiency
                  </ResizableTh>

                  <ResizableTh
                    columnKey="netPay"
                    width={netWidths.netPay}
                    minWidth={95}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right font-bold text-[#0066cc] whitespace-nowrap"
                  >
                    Net Pay
                  </ResizableTh>
                  
                  {/* Custom Columns */}
                  {customColumns.map((col) => (
                    <CustomColumnHeader
                      key={col.id}
                      column={col}
                      onUpdateColumn={handleUpdateCustomColumn}
                      onRemoveColumn={handleRemoveCustomColumn}
                    />
                  ))}

                  <ResizableTh
                    columnKey="action"
                    width={netWidths.action}
                    minWidth={45}
                    enableResize={false}
                    className="py-2 px-1 text-center print:hidden"
                  >
                    Action
                  </ResizableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {weaversList.map((w, idx) => (
                  <tr
                    key={w.id}
                    className={cn(
                      'text-slate-800 hover:bg-slate-50/80 transition-colors',
                      isRowDirty(w.id) && 'payroll-row-dirty'
                    )}
                  >
                    {/* S.# with Hover Row Insertion */}
                    <SerialCellWithInsert
                      serialNo={w.serialNo}
                      index={idx}
                      onMoveUp={(i) => handleMoveRow(i, 'up')}
                      onMoveDown={(i) => handleMoveRow(i, 'down')}
                      canMoveUp={idx > 0}
                      canMoveDown={idx < weaversList.length - 1}
                    />
                    
                    <td
                      style={{ width: `${netWidths.employeeName}px`, minWidth: `${netWidths.employeeName}px` }}
                      className="border-r border-slate-100 py-1.5 px-3 font-sans font-semibold uppercase text-slate-900"
                    >
                      {w.employeeName}
                    </td>

                    <td
                      style={{ width: `${netWidths.designation}px`, minWidth: `${netWidths.designation}px` }}
                      className="border-r border-slate-100 py-1.5 px-3 font-sans text-slate-600"
                    >
                      {w.designation}
                    </td>

                    <td
                      style={{ width: `${netWidths.attendanceDays}px`, minWidth: `${netWidths.attendanceDays}px` }}
                      className="border-r border-slate-100 py-1.5 px-1 text-center whitespace-nowrap text-slate-700"
                    >
                      {w.attendanceDays}
                    </td>

                    <td
                      style={{ width: `${netWidths.extraLooms}px`, minWidth: `${netWidths.extraLooms}px` }}
                      className="border-r border-slate-100 py-1.5 px-1 text-center whitespace-nowrap text-slate-700"
                    >
                      {w.extraLooms || '-'}
                    </td>

                    <td
                      style={{ width: `${netWidths.extraLoomAmount}px`, minWidth: `${netWidths.extraLoomAmount}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right whitespace-nowrap text-slate-700"
                    >
                      {w.extraLoomAmount ? formatNumber(w.extraLoomAmount, 0) : '-'}
                    </td>

                    <td
                      style={{ width: `${netWidths.attendanceAllowance}px`, minWidth: `${netWidths.attendanceAllowance}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right whitespace-nowrap text-slate-700"
                    >
                      {w.attendanceAllowance ? formatNumber(w.attendanceAllowance, 0) : '-'}
                    </td>

                    <td
                      style={{ width: `${netWidths.basicSalary}px`, minWidth: `${netWidths.basicSalary}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                    >
                      {formatNumber(w.basicSalary, 0)}
                    </td>

                    <td
                      style={{ width: `${netWidths.holidayAttendance}px`, minWidth: `${netWidths.holidayAttendance}px` }}
                      className="border-r border-slate-100 py-1.5 px-1 text-center whitespace-nowrap text-slate-700"
                    >
                      {w.holidayAttendance || '-'}
                    </td>

                    <td
                      style={{ width: `${netWidths.holidayAmount}px`, minWidth: `${netWidths.holidayAmount}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                    >
                      {w.holidayAmount ? formatNumber(w.holidayAmount, 0) : '-'}
                    </td>

                    <td
                      style={{ width: `${netWidths.efficiencyAmount}px`, minWidth: `${netWidths.efficiencyAmount}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-[#0066cc]"
                    >
                      <NumericCellInput
                        value={w.efficiencyAmount || 0}
                        disabled={!canEditAccounts}
                        isDirty={isCellDirty(w.id, 'efficiencyAmount')}
                        navRow={idx}
                        navCol={0}
                        onValueChange={(v) => handleCellChange(idx, 'efficiencyAmount', v)}
                        className="w-full text-right bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-[#0066cc]"
                      />
                    </td>

                    <td
                      style={{ width: `${netWidths.netPay}px`, minWidth: `${netWidths.netPay}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right font-bold text-[#0066cc] whitespace-nowrap"
                    >
                      {formatNumber(w.netPay, 0)}
                    </td>

                    {/* Custom Column Cells */}
                    {customColumns.map((col) => {
                      const cWidth = col.width || 120
                      return (
                        <td
                          key={col.id}
                          style={{ width: `${cWidth}px`, minWidth: `${cWidth}px` }}
                          className="border-r border-slate-100 py-1 px-1 text-slate-700"
                        >
                          <input
                            type="text"
                            value={w.customFields?.[col.id] || ''}
                            disabled={!canEditAccounts}
                            onChange={(e) => handleCustomCellChange(idx, col.id, e.target.value)}
                            placeholder="—"
                            className={cn(
                              'w-full bg-transparent px-1 py-0.5 font-medium font-sans text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-center transition-colors',
                              isCellDirty(w.id, `cf_${col.id}`, w.customFields?.[col.id]) &&
                                'payroll-cell-dirty'
                            )}
                          />
                        </td>
                      )
                    })}

                    <td
                      style={{ width: `${netWidths.action}px`, minWidth: `${netWidths.action}px` }}
                      className="py-1 px-1 text-center print:hidden"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const slip = payrollService.generateEmployeePaySlip(selectedMonth, w.id)
                            setActiveSlip(slip)
                          }}
                          title="View Official Salary Slip / پرچی"
                          className="p-1 text-slate-400 hover:text-[#0066cc] transition-colors cursor-pointer"
                        >
                          <FileText className="size-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRow(w.id)}
                          title={REMOVE_ROW_TITLE}
                          disabled={!isEditable}
                          className="text-slate-400 hover:text-red-600 p-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-slate-900">
                  <td colSpan={4} className="border-r border-slate-200 py-2 px-2 text-center uppercase text-xs">Consolidated Disbursal:</td>
                  <td className="border-r border-slate-200 py-2 px-1 text-center font-semibold">{weaversList.reduce((s, w) => s + (w.extraLooms || 0), 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold">{formatNumber(totalExtraLoom, 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold">{formatNumber(totalAttnAllow, 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900">{formatNumber(totalBasic, 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-1 text-center font-semibold">{weaversList.reduce((s, w) => s + (w.holidayAttendance || 0), 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold">{formatNumber(totalHoliday, 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-[#0066cc]">{formatNumber(totalEfficiency, 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-bold text-[#0066cc] text-sm">{formatCurrency(totalNet)}</td>
                  {customColumns.map((col) => (
                    <td key={col.id} className="border-r border-slate-200 py-2.5 px-2 text-center font-sans text-[10px] text-slate-500">
                      —
                    </td>
                  ))}
                  <td className="print:hidden"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Prominent Calculated Net Disbursal Total in Words */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 font-sans print:border-none print:p-2">
            <div>
              <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Net Cash Disbursal in Words (PKR):</span>
              <div className="text-xs font-semibold text-slate-900 mt-0.5">{numberToWordsPKR(totalNet)}</div>
            </div>
            <div className="sm:text-right border-t sm:border-t-0 border-slate-200 pt-2 sm:pt-0 w-full sm:w-auto">
              <span className="text-[11px] font-semibold uppercase text-slate-500">Calculated Net Payout:</span>
              <div className="text-lg font-bold text-[#0066cc]">{formatCurrency(totalNet)}</div>
            </div>
          </div>
        </div>
      )}
      {/* Employee Pay Slip Modal */}
      {activeSlip && (
        <EmployeePaySlipModal
          slip={activeSlip}
          onClose={() => setActiveSlip(null)}
        />
      )}
    </div>
  )
}

export default function WeaversPayrollPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Weavers Sheet...</div>}>
      <WeaversPayrollContent />
    </Suspense>
  )
}
