'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { payrollService, hydratePayrollFromDb } from '@/services/payrollService'
import { ContractSalaryRecord, CustomColumn, EmployeePaySlip } from '@/types/payroll'
import { reorderSerialRows } from '@/components/shared/InlineRowActions'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { Save } from 'lucide-react'
import { usePayrollModals } from '@/hooks/usePayrollModals'
import { usePayrollDirtyTracker } from '@/hooks/usePayrollDirtyTracker'
import { removeRowConfirm } from '@/components/payroll/removeRowConfirm'

export const DEFAULT_CONTRACT_SALARY_WIDTHS = {
  serialNo: 56,
  employeeName: 200,
  designation: 160,
  salary: 100,
  attendanceDays: 70,
  ratePerDay: 90,
  ratePerHr: 85,
  basicSalary: 100,
  lateHours: 75,
  lateAmount: 95,
  advanceDeduction: 90,
  ticketCharges: 70,
  netAmount: 110,
  signature: 140,
  action: 48,
}

export const DEFAULT_CONTRACT_OT_WIDTHS = {
  serialNo: 56,
  employeeName: 220,
  designation: 180,
  otHours: 110,
  ratePerHr: 100,
  otAmount: 130,
  action: 48,
}

export const DEFAULT_CONTRACT_NET_WIDTHS = {
  serialNo: 56,
  employeeName: 220,
  designation: 180,
  salary: 100,
  attendanceDays: 65,
  basicSalary: 100,
  otHours: 75,
  otAmount: 100,
  efficiencyAmount: 100,
  grossSalary: 105,
  advanceDeduction: 95,
  ticketCharges: 65,
  netAmount: 120,
  action: 48,
}

/** State, data and handlers of the page (moved out of page.tsx; behaviour unchanged). */
export function useContractPage() {
  const { canEditAccounts } = useAuth()
  const { askConfirm, showSuccess, modals } = usePayrollModals()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<'employees' | 'overtime' | 'net-payment'>('employees')

  useEffect(() => {
    if (tabParam === 'overtime') setActiveTab('overtime')
    else if (tabParam === 'net-payment') setActiveTab('net-payment')
    else setActiveTab('employees')
  }, [tabParam])

  const [contractList, setContractList] = useState<ContractSalaryRecord[]>([])
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([])
  const [selectedMonth, setSelectedMonth] = useState(() => payrollService.getActiveSalariedMonth())
  // Contract Excel Sheet 4 / General Wages use 30-day rate base (not calendar 31).
  const [daysInMonth, setDaysInMonth] = useState<number>(30)
  const [activeSlip, setActiveSlip] = useState<EmployeePaySlip | null>(null)

  const isLocked = payrollService.isMonthLocked(selectedMonth)
  const isEditable = canEditAccounts && !isLocked

  const {
    isCellDirty,
    isRowDirty,
    dirtyCount,
    hasUnsavedChanges,
    commitSaved,
    resetSnapshot,
    discardChanges,
    requestNavigationGuard,
  } = usePayrollDirtyTracker(contractList, selectedMonth, {
    sheetName: 'Contract',
    editableFields: [
      'attendanceDays',
      'lateHours',
      'lateAmount',
      'advanceDeduction',
      'ticketCharges',
      'otHours',
      'efficiencyAmount',
    ],
  })

  // Resizable column width hooks for all 3 views
  const {
    widths: salaryWidths,
    setColumnWidth: setSalaryColWidth,
    resetColumnWidth: resetSalaryColWidth,
  } = useResizableColumns('contract_salary', DEFAULT_CONTRACT_SALARY_WIDTHS)

  const {
    widths: otWidths,
    setColumnWidth: setOtColWidth,
    resetColumnWidth: resetOtColWidth,
  } = useResizableColumns('contract_ot', DEFAULT_CONTRACT_OT_WIDTHS)

  const {
    widths: netWidths,
    setColumnWidth: setNetColWidth,
    resetColumnWidth: resetNetColWidth,
  } = useResizableColumns('contract_net', DEFAULT_CONTRACT_NET_WIDTHS)

  /** Rows as saved, and the ones whose amounts the Excel-like hisab (paise) would change. */
  const [savedRows, setSavedRows] = useState<ContractSalaryRecord[]>([])
  const [recalcRows, setRecalcRows] = useState<ContractSalaryRecord[]>([])

  const reload = (force = false) => {
    if (!force && hasUnsavedChanges) return
    const days = daysInMonth || 30
    const saved = payrollService.getContractSalaries(selectedMonth)
    const fresh = saved.map((row) => payrollService.calculateContractSalaryRow(row, days))
    setContractList(fresh)
    resetSnapshot(fresh)
    setSavedRows(saved)
    setRecalcRows(fresh)
  }

  /**
   * Saved rows of this month whose amounts differ from today's hisab (Excel-like, with
   * paise) — e.g. September saved before the 22 Oct fix. Shown so the accountant can
   * apply and Save; nothing changes on its own.
   */
  const AMOUNT_FIELDS = ['basicSalary', 'otAmount', 'lateAmount', 'grossSalary', 'netSalary', 'netAmount'] as const
  const staleRows = recalcRows.filter((r) => {
    const s = savedRows.find((x) => x.id === r.id)
    return Boolean(s && AMOUNT_FIELDS.some((f) => Math.abs((Number(s[f]) || 0) - (Number(r[f]) || 0)) >= 0.005))
  })
  const staleTotals = {
    otBefore: savedRows.reduce((t, r) => t + (Number(r.otAmount) || 0), 0),
    otAfter: recalcRows.reduce((t, r) => t + (Number(r.otAmount) || 0), 0),
    netBefore: savedRows.reduce((t, r) => t + (Number(r.netAmount) || 0), 0),
    netAfter: recalcRows.reduce((t, r) => t + (Number(r.netAmount) || 0), 0),
  }
  /** Save the sheet with the Excel-like amounts (the table already shows them). */
  const saveRecalc = () => {
    if (!isEditable || staleRows.length === 0) return
    const r = (v: number) => Math.round(v).toLocaleString('en-US')
    askConfirm({
      title: 'Naya (Excel jaisa) hisab save karein?',
      message:
        `${staleRows.length} logon ki raqam paise ke hisab se 1–2 rupay badlegi. ` +
        `OT total ${r(staleTotals.otBefore)} → ${r(staleTotals.otAfter)}, ` +
        `Net total ${r(staleTotals.netBefore)} → ${r(staleTotals.netAfter)}.`,
      confirmText: 'Save',
      onConfirm: () => {
        payrollService.saveContractSalaries(selectedMonth, contractList)
        commitSaved(contractList)
        setSavedRows(contractList)
        showSuccess('Saved', 'Contract sheet naye hisab se save ho gayi.')
      },
    })
  }

  useEffect(() => {
    let cancelled = false
    if (daysInMonth !== 28 && daysInMonth !== 30 && daysInMonth !== 31) {
      setDaysInMonth(30)
    }

    // Wait for DB hydrate so we don't flash local/seed count (e.g. 15 → 12).
    void hydratePayrollFromDb().then(() => {
      if (!cancelled) reload(true)
    })

    const handleSync = (e: Event) => {
      const detailMonth = (e as CustomEvent<{ month?: string }>).detail?.month
      const next =
        detailMonth && /^\d{4}-\d{2}$/.test(detailMonth)
          ? detailMonth
          : payrollService.getActiveSalariedMonth()
      if (next !== selectedMonth) {
        setSelectedMonth(next)
        return
      }
      reload()
    }
    window.addEventListener('payroll_synced', handleSync)
    return () => {
      cancelled = true
      window.removeEventListener('payroll_synced', handleSync)
    }
  }, [selectedMonth, daysInMonth])

  // Handle cell edit with live formula recalculation
  const handleCellChange = (
    index: number,
    field: keyof ContractSalaryRecord,
    value: string | number
  ) => {
    if (!canEditAccounts) return
    setContractList((prev) => {
      const updated = [...prev]
      const current = { ...updated[index], [field]: value }
      // When late hours change, clear lateAmount so calculator re-derives from hrs × rate
      if (field === 'lateHours') {
        current.lateAmount = undefined
      }
      const recalculated = payrollService.calculateContractSalaryRow(current, daysInMonth)
      updated[index] = recalculated
      return updated
    })
  }

  const handleCustomCellChange = (index: number, colId: string, value: string) => {
    if (!canEditAccounts) return
    setContractList((prev) => {
      const updated = [...prev]
      const currentCustom = updated[index].customFields || {}
      updated[index] = {
        ...updated[index],
        customFields: { ...currentCustom, [colId]: value },
      }
      return updated
    })
  }

  // Insert row anywhere with auto-renumber (inserts BELOW the selected row)
  const handleInsertRow = (insertIdx?: number) => {
    if (!canEditAccounts) return
    const raw: ContractSalaryRecord = {
      id: `cnt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      serialNo: insertIdx !== undefined ? insertIdx + 2 : contractList.length + 1,
      employeeName: 'New Contract Worker',
      designation: 'Technician',
      salary: 40000,
      attendanceDays: daysInMonth,
      ratePerDay: Math.round(40000 / daysInMonth),
      ratePerHr: Number((40000 / (30 * 12)).toFixed(2)),
      basicSalary: 40000,
      otHours: 0,
      otAmount: 0,
      efficiencyAmount: 0,
      grossSalary: 40000,
      advanceDeduction: 0,
      ticketCharges: 5,
      netAmount: 39995,
      month: selectedMonth,
    }
    const newRecord = payrollService.calculateContractSalaryRow(raw, daysInMonth)

    const updated = [...contractList]
    if (insertIdx !== undefined) {
      updated.splice(insertIdx + 1, 0, newRecord)
    } else {
      updated.push(newRecord)
    }

    const renumbered = updated.map((item, i) => ({
      ...item,
      serialNo: i + 1,
    }))
    setContractList(renumbered)
  }

  const handleMoveRow = (index: number, direction: 'up' | 'down') => {
    if (!canEditAccounts) return
    const next = reorderSerialRows(contractList, index, direction)
    if (!next) return
    setContractList(next)
  }

  // Delete row with confirmation
  const handleDeleteRow = (id: string) => {
    if (!canEditAccounts) return
    const row = contractList.find((c) => c.id === id)
    if (!row) return
    const empName = row?.employeeName || 'Contract Employee'
    askConfirm({
      ...removeRowConfirm(empName, 'is mahine ki Contract sheet'),
      onConfirm: () => {
        const filtered = contractList
          .filter((c) => c.id !== id)
          .map((item, i) => ({ ...item, serialNo: i + 1 }))
        setContractList(filtered)
      },
    })
  }


  const handleSave = () => {
    if (!canEditAccounts) return
    askConfirm({
      title: 'Save contract sheet?',
      message: 'Contract salaries save ho jayengi.',
      confirmText: 'Save',
      onConfirm: () => {
        payrollService.saveContractSalaries(selectedMonth, contractList)
        commitSaved(contractList)
        showSuccess('Saved', 'Contract salaries successfully saved.')
      },
    })
  }

  const handleDiscard = () => {
    askConfirm({
      title: 'Discard unsaved changes?',
      message: 'Unsaved edits revert ho jayenge. Proceed karein?',
      confirmText: 'Discard',
      onConfirm: () => {
        setContractList(discardChanges())
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
  const totalBasic = contractList.reduce((sum, c) => sum + (c.basicSalary || 0), 0)
  const totalLateAmount = contractList.reduce((sum, c) => sum + (c.lateAmount || 0), 0)
  const totalOT = contractList.reduce((sum, c) => sum + (c.otAmount || 0), 0)
  const totalOTHours = contractList.reduce((sum, c) => sum + (c.otHours || 0), 0)
  const totalEfficiency = contractList.reduce((sum, c) => sum + (c.efficiencyAmount || 0), 0)
  const totalGross = contractList.reduce((sum, c) => sum + (c.grossSalary || 0), 0)
  const totalAdvance = contractList.reduce((sum, c) => sum + (c.advanceDeduction || 0), 0)
  const totalTicket = contractList.reduce((sum, c) => sum + (c.ticketCharges || 0), 0)
  // Sheet 4 Net Base Salary (Basic - Late - Advance - Ticket) - NO OT, NO Efficiency
  const totalNetSalary = contractList.reduce(
    (sum, c) =>
      sum +
      (c.netSalary !== undefined
        ? c.netSalary
        : Math.max(
            0,
            (c.basicSalary || 0) -
              (c.lateAmount || 0) -
              (c.advanceDeduction || 0) -
              (c.ticketCharges || 0)
          )),
    0
  )
  // Sheet 10 Consolidated Net Amount (Gross - Late - Advance - Ticket) - INCLUDES Basic + OT + Efficiency
  const totalNet = contractList.reduce((sum, c) => sum + (c.netAmount || 0), 0)


  return {
    staleRows,
    staleTotals,
    saveRecalc,
    canEditAccounts,
    askConfirm,
    showSuccess,
    modals,
    searchParams,
    tabParam,
    activeTab,
    setActiveTab,
    contractList,
    setContractList,
    customColumns,
    setCustomColumns,
    selectedMonth,
    setSelectedMonth,
    daysInMonth,
    setDaysInMonth,
    activeSlip,
    setActiveSlip,
    isLocked,
    isEditable,
    isCellDirty,
    isRowDirty,
    dirtyCount,
    hasUnsavedChanges,
    commitSaved,
    resetSnapshot,
    discardChanges,
    requestNavigationGuard,
    salaryWidths,
    setSalaryColWidth,
    resetSalaryColWidth,
    otWidths,
    setOtColWidth,
    resetOtColWidth,
    netWidths,
    setNetColWidth,
    resetNetColWidth,
    reload,
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
    totalLateAmount,
    totalOT,
    totalOTHours,
    totalEfficiency,
    totalGross,
    totalAdvance,
    totalTicket,
    totalNetSalary,
    totalNet,
  }
}

export type ContractPage = ReturnType<typeof useContractPage>
