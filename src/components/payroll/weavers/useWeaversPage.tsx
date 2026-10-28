'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { payrollService, formatPayrollMonthLabel } from '@/services/payrollService'
import { WeaverWageRecord, CustomColumn, EmployeePaySlip } from '@/types/payroll'
import { reorderSerialRows } from '@/components/shared/InlineRowActions'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { Save } from 'lucide-react'
import { usePayrollDirtyTracker } from '@/hooks/usePayrollDirtyTracker'
import { usePayrollModals } from '@/hooks/usePayrollModals'
import { removeRowConfirm } from '@/components/payroll/removeRowConfirm'

export const DEFAULT_WEAVER_WAGES_WIDTHS = {
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

export const DEFAULT_WEAVER_OT_WIDTHS = {
  serialNo: 56,
  employeeName: 220,
  designation: 170,
  holidayAttendance: 130,
  holidayRate: 110,
  holidayAmount: 130,
  action: 48,
}

export const DEFAULT_WEAVER_NET_WIDTHS = {
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
  signature: 150,
  action: 48,
}

/** State, data and handlers of the page (moved out of page.tsx; behaviour unchanged). */
export function useWeaversPage() {
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


  return {
    canEditAccounts,
    askConfirm,
    showSuccess,
    showError,
    modals,
    router,
    pathname,
    searchParams,
    initialTab,
    period,
    urlFn,
    activeFortnight,
    setActiveFortnight,
    activeTab,
    setActiveTab,
    pushFilters,
    selectedMonth,
    setSelectedMonth,
    weaversList,
    setWeaversList,
    customColumns,
    setCustomColumns,
    showGenerateDialog,
    setShowGenerateDialog,
    activeSlip,
    setActiveSlip,
    isLocked,
    isEditable,
    newMonth,
    setNewMonth,
    newFortnight,
    setNewFortnight,
    wageWidths,
    setWageColWidth,
    resetWageColWidth,
    otWidths,
    setOtColWidth,
    resetOtColWidth,
    netWidths,
    setNetColWidth,
    resetNetColWidth,
    isCellDirty,
    isRowDirty,
    dirtyCount,
    hasUnsavedChanges,
    commitSaved,
    resetSnapshot,
    discardChanges,
    requestNavigationGuard,
    reload,
    openGenerateDialog,
    confirmGenerateFortnight,
    handleCellChange,
    handleCustomCellChange,
    handleInsertRow,
    handleMoveRow,
    handleDeleteRow,
    handleSave,
    handleDiscard,
    handlePrint,
    handleAddCustomColumn,
    handleUpdateCustomColumn,
    handleRemoveCustomColumn,
    totalBasic,
    totalExtraLoom,
    totalAttnAllow,
    totalGross,
    totalHoliday,
    totalEfficiency,
    totalNet,
  }
}

export type WeaversPage = ReturnType<typeof useWeaversPage>
