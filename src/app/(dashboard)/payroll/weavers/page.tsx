'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { payrollService, formatPayrollMonthLabel } from '@/services/payrollService'
import { WeaverWageRecord, CustomColumn } from '@/types/payroll'
import { AddColumnButton, CustomColumnHeader } from '@/components/shared/CustomColumnModal'
import { SerialCellWithInsert, reorderSerialRows } from '@/components/shared/InlineRowActions'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatNumber, numberToWordsPKR } from '@/lib/utils'
import {
  DollarSign,
  Award,
  Plus,
  Trash2,
  RotateCcw,
  Save,
  CheckCircle2,
  Clock,
  Banknote,
  Printer,
  Lock,
  CalendarPlus,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { NumericCellInput } from '@/components/shared/NumericCellInput'

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
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as 'wages' | 'overtime' | 'net-payment') || 'wages'
  const period = payrollService.getActiveFortnightPeriod()
  const urlFn = searchParams.get('fortnight') as '1-15' | '16-31' | null

  const [activeFortnight, setActiveFortnight] = useState<'1-15' | '16-31'>(
    urlFn === '1-15' || urlFn === '16-31' ? urlFn : period.fortnight
  )
  const [activeTab, setActiveTab] = useState<'wages' | 'overtime' | 'net-payment'>(initialTab)
  const [selectedMonth, setSelectedMonth] = useState(period.month)
  const [weaversList, setWeaversList] = useState<WeaverWageRecord[]>([])
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([])
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
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

  useEffect(() => {
    const fn = searchParams.get('fortnight') as '1-15' | '16-31'
    if (fn === '1-15' || fn === '16-31') setActiveFortnight(fn)

    const tab = searchParams.get('tab') as 'wages' | 'overtime' | 'net-payment'
    if (tab === 'overtime' || tab === 'net-payment' || tab === 'wages') setActiveTab(tab)
  }, [searchParams])

  const reload = () => {
    setWeaversList(payrollService.getWeaversWages(selectedMonth, activeFortnight))
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

  const handleGenerateFortnight = async () => {
    if (!canEditAccounts) return
    setStatusNotice('Fortnight save ho raha hai…')
    const result = await payrollService.generateFortnightCycle(newMonth, newFortnight)
    setStatusNotice(result.message)
    if (result.ok) {
      setSelectedMonth(newMonth)
      setActiveFortnight(newFortnight)
      const months = payrollService.listFortnightMonths()
      const last = months[months.length - 1] || newMonth
      const [y, m] = last.split('-').map(Number)
      const next =
        newFortnight === '1-15'
          ? last
          : m === 12
            ? `${y + 1}-01`
            : `${y}-${String(m + 1).padStart(2, '0')}`
      setNewMonth(newFortnight === '1-15' ? last : next)
      setNewFortnight(newFortnight === '1-15' ? '16-31' : '1-15')
    }
    setTimeout(() => setStatusNotice(null), 6000)
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

  const handleDeleteRow = (id: string) => {
    if (!canEditAccounts) return
    const filtered = weaversList
      .filter((w) => w.id !== id)
      .map((item, i) => ({ ...item, serialNo: i + 1 }))
    setWeaversList(filtered)
  }

  const handleReset = () => {
    if (!canEditAccounts) return
    if (confirm('Reset this fortnightly sheet back to template values?')) {
      payrollService.resetAllToDefault()
      setWeaversList(payrollService.getWeaversWages(selectedMonth, activeFortnight))
      setCustomColumns([])
    }
  }

  const handleSave = () => {
    if (!canEditAccounts) return
    payrollService.saveWeaversWages(selectedMonth, activeFortnight, weaversList)
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
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
      <div className="print:hidden">
        <PageHeader
          title={
            activeTab === 'overtime'
              ? `Weawers OT ${activeFortnight}`
              : activeTab === 'net-payment'
                ? `Net Payment Weawers ${activeFortnight}`
                : `Weawers Wages ${activeFortnight}`
          }
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
              <button
                type="button"
                onClick={() => handleInsertRow()}
                disabled={!canEditAccounts}
                className="erp-btn-secondary"
              >
                <Plus className="size-3.5 text-[#0066cc]" />
                <span>Add Weaver</span>
              </button>
              <AddColumnButton onAddColumn={handleAddCustomColumn} />
              <button
                type="button"
                onClick={handleReset}
                disabled={!canEditAccounts}
                title={canEditAccounts ? 'Reset to default template' : 'Enable Editing to reset'}
                className="erp-btn-secondary"
              >
                <RotateCcw className="size-3.5" />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canEditAccounts}
                className="erp-btn-primary"
              >
                <Save className="size-3.5" />
                <span>Save</span>
              </button>
              <button type="button" onClick={handlePrint} className="erp-btn-secondary">
                <Printer className="size-3.5" />
                <span>Print</span>
              </button>
              <ExportPdfButton filename={`Weavers-${selectedMonth}-${activeFortnight || 'all'}`} />
            </>
          }
        />
      </div>

      {canEditAccounts && (
        <div className="print:hidden erp-card p-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
              Active fortnight cycle
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Yahan se 15-din generate karo — Helpers, Contractors, Net Payment, Synopsis isi pe khulenge.
              Active:{' '}
              <strong>
                {formatPayrollMonthLabel(selectedMonth)} ({activeFortnight})
              </strong>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={newMonth}
              onChange={(e) => setNewMonth(e.target.value)}
              className="form-control form-control-sm"
              style={{ width: 'auto' }}
              aria-label="New fortnight month"
            />
            <select
              value={newFortnight}
              onChange={(e) => setNewFortnight(e.target.value as '1-15' | '16-31')}
              className="form-select form-select-sm"
              aria-label="Fortnight half"
            >
              <option value="1-15">1–15</option>
              <option value="16-31">16–31</option>
            </select>
            <button
              type="button"
              onClick={handleGenerateFortnight}
              className="erp-btn-primary text-xs flex items-center gap-1.5"
            >
              <CalendarPlus className="size-3.5" />
              <span>Generate Fortnight</span>
            </button>
          </div>
        </div>
      )}

      {statusNotice && (
        <div className="flex items-center gap-2 rounded-md bg-blue-50 border border-blue-200 p-3 text-xs font-semibold text-blue-900 print:hidden animate-in fade-in">
          <CheckCircle2 className="size-4 text-blue-600" />
          <span>{statusNotice}</span>
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

      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-900 print:hidden animate-in fade-in">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span>Weavers wage data and calculations successfully stored and updated!</span>
        </div>
      )}

      {/* VIEW 1: Weavers Wages (Sheets 8 & 15) */}
      {activeTab === 'wages' && (
        <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
          <div className="text-center border-b border-slate-200 pb-3 mb-4">
            <h1 className="text-xl font-bold uppercase text-slate-900 tracking-wide">SARA TEXTILES</h1>
            <h2 className="text-xs font-semibold text-slate-600 mt-0.5">
              WEAVERS WAGES ({activeFortnight === '1-15' ? '1–15' : '16–31'} ·{' '}
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
                  <tr key={w.id} className="text-slate-800 hover:bg-slate-50/80 transition-colors">
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

                    {/* Wage Per Day Input */}
                    <td
                      style={{ width: `${wageWidths.wagePerDay}px`, minWidth: `${wageWidths.wagePerDay}px` }}
                      className="border-r border-slate-100 py-1 px-1"
                    >
                      <NumericCellInput
                        value={w.wagePerDay || 0}
                        disabled={!canEditAccounts}
                        navRow={idx}
                        navCol={0}
                        onValueChange={(v) => handleCellChange(idx, 'wagePerDay', v)}
                        className="w-full text-right bg-transparent px-2 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-slate-900"
                      />
                    </td>

                    {/* Attendance Days */}
                    <td
                      style={{ width: `${wageWidths.attendanceDays}px`, minWidth: `${wageWidths.attendanceDays}px` }}
                      className="border-r border-slate-100 py-1 px-1 text-center"
                    >
                      <NumericCellInput
                        value={w.attendanceDays || 0}
                        disabled={!canEditAccounts}
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

                    {/* Attendance Allowance Input */}
                    <td
                      style={{ width: `${wageWidths.attendanceAllowance}px`, minWidth: `${wageWidths.attendanceAllowance}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                    >
                      {formatNumber(w.attendanceAllowance, 0)}
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
                            className="w-full bg-transparent px-1 py-0.5 font-medium font-sans text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-center"
                          />
                        </td>
                      )
                    })}

                    <td
                      style={{ width: `${wageWidths.action}px`, minWidth: `${wageWidths.action}px` }}
                      className="py-1 px-1 text-center print:hidden"
                    >
                      <button
                        onClick={() => handleDeleteRow(w.id)}
                        disabled={!canEditAccounts}
                        className="text-slate-400 hover:text-red-600 p-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
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
              WEAVER HOLIDAYS & OVERTIME ({activeFortnight} · {formatPayrollMonthLabel(selectedMonth)})
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
                  <tr key={w.id} className="text-slate-800 hover:bg-slate-50/80 transition-colors">
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

                    <td
                      style={{ width: `${otWidths.holidayAttendance}px`, minWidth: `${otWidths.holidayAttendance}px` }}
                      className="border-r border-slate-100 py-1 px-2 text-center"
                    >
                      <NumericCellInput
                        value={w.holidayAttendance || 0}
                        disabled={!canEditAccounts}
                        navRow={idx}
                        navCol={0}
                        onValueChange={(v) => handleCellChange(idx, 'holidayAttendance', v)}
                        className="w-20 text-center bg-transparent px-1 py-0.5 font-semibold text-xs text-slate-900 focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded mx-auto"
                      />
                    </td>

                    <td
                      style={{ width: `${otWidths.holidayRate}px`, minWidth: `${otWidths.holidayRate}px` }}
                      className="border-r border-slate-100 py-1.5 px-3 text-right text-slate-600 font-mono whitespace-nowrap"
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
                            className="w-full bg-transparent px-1 py-0.5 font-medium font-sans text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-center"
                          />
                        </td>
                      )
                    })}

                    <td
                      style={{ width: `${otWidths.action}px`, minWidth: `${otWidths.action}px` }}
                      className="py-1 px-1 text-center print:hidden"
                    >
                      <button
                        onClick={() => handleDeleteRow(w.id)}
                        disabled={!canEditAccounts}
                        className="text-slate-400 hover:text-red-600 p-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
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
              WEAVERS SALARY & OVERTIME PAYMENT ({activeFortnight} ·{' '}
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
                  <tr key={w.id} className="text-slate-800 hover:bg-slate-50/80 transition-colors">
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
                            className="w-full bg-transparent px-1 py-0.5 font-medium font-sans text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-center"
                          />
                        </td>
                      )
                    })}

                    <td
                      style={{ width: `${netWidths.action}px`, minWidth: `${netWidths.action}px` }}
                      className="py-1 px-1 text-center print:hidden"
                    >
                      <button
                        onClick={() => handleDeleteRow(w.id)}
                        disabled={!canEditAccounts}
                        className="text-slate-400 hover:text-red-600 p-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
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
