'use client'

import { useMemo, useState } from 'react'
import {
  LoomMaster,
  QualityMaster,
  YarnMaster,
  YarnLoomIssuance,
  YarnMovementRecord,
  LBS_PER_KG,
  kgToLbs,
  lbsToKg,
} from '@/services/productionMastersService'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { NumericCellInput, TextCellInput } from '@/components/shared/NumericCellInput'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { AddYarnModal } from '@/components/floor/AddYarnModal'
import { IssueYarnModal } from '@/components/floor/IssueYarnModal'
import { useAuth } from '@/context/AuthContext'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { EmptyPlaceholder } from '@/components/shared/EmptyPlaceholder'
import { TablePanScroll } from '@/components/shared/TablePanScroll'

export type WeightUnit = 'KG' | 'LBS'
export type YarnViewMode = 'STOCK' | 'LEDGER'
export type YarnDateFilterMode = 'ALL' | 'DAILY' | 'WEEKLY' | 'MONTHLY'

function parseDay(dateStr: string) {
  return new Date(`${dateStr}T12:00:00`)
}

function toYmd(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getWeekRange(dateStr: string) {
  const d = parseDay(dateStr)
  const day = d.getDay() // 0 = Sun
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + mondayOffset)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: toYmd(monday), end: toYmd(sunday) }
}

function getMonthRange(dateStr: string) {
  const d = parseDay(dateStr)
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { start: toYmd(first), end: toYmd(last) }
}

function shortRangeLabel(start: string, end: string) {
  try {
    const a = parseDay(start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    const b = parseDay(end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return start === end ? a : `${a} – ${b}`
  } catch {
    return `${start} – ${end}`
  }
}

const DEFAULT_WIDTHS: Record<string, number> = {
  yarn: 160,
  bags: 80,
  received: 120,
  issued: 120,
  balance: 120,
  recentLooms: 190,
  actions: 125,
}

interface YarnStockTableProps {
  yarn: YarnMaster[]
  looms?: LoomMaster[]
  qualities?: QualityMaster[]
  onUpdate: (id: string, patch: Partial<YarnMaster>) => void
  onAdd: (
    yarn: Partial<YarnMaster>,
    arrival?: { date: string; bags: number; weightKg: number; lotOrSupplier?: string }
  ) => void
  onIssue?: (yarnId: string, loomNumber: number, issuedKg: number, pick: number, dateStr: string) => void
  issuances?: YarnLoomIssuance[]
  movements?: YarnMovementRecord[]
  readOnly?: boolean
  selectedDate: string
  dateFilterMode: YarnDateFilterMode
  setDateFilterMode: (mode: YarnDateFilterMode) => void
  onDelete?: (id: string) => void
  toolbarInChrome?: boolean
  tableEdit?: boolean
  onTableEditChange?: (next: boolean) => void
  addModalOpen?: boolean
  onAddModalOpenChange?: (open: boolean) => void
}

export function YarnStockTable({
  yarn,
  looms = [],
  qualities = [],
  onUpdate,
  onAdd,
  onIssue,
  issuances = [],
  movements = [],
  readOnly,
  selectedDate,
  dateFilterMode,
  setDateFilterMode,
  onDelete,
  toolbarInChrome = false,
  tableEdit: tableEditProp,
  onTableEditChange,
  addModalOpen: addModalOpenProp,
  onAddModalOpenChange,
}: YarnStockTableProps) {
  const { canEditProduction } = useAuth()
  const { showConfirm, showSuccessSoon } = useAlertDialog()
  const [mode, setMode] = useState<TableGridMode>('table')
  const [activeView, setActiveView] = useState<YarnViewMode>('STOCK')
  const [unit, setUnit] = useState<WeightUnit>('KG')
  const [movementTypeFilter, setMovementTypeFilter] = useState<'ALL' | 'INWARD' | 'OUTWARD'>('ALL')
  const [ledgerLoomFilter, setLedgerLoomFilter] = useState<string>('ALL')
  const [isAddModalOpenLocal, setIsAddModalOpenLocal] = useState(false)
  const [issuingYarn, setIssuingYarn] = useState<YarnMaster | null>(null)
  const [tableEditLocal, setTableEditLocal] = useState(false)

  const tableEdit = tableEditProp ?? tableEditLocal
  const setTableEdit = (next: boolean) => {
    onTableEditChange?.(next)
    if (tableEditProp === undefined) setTableEditLocal(next)
  }
  const isAddModalOpen = addModalOpenProp ?? isAddModalOpenLocal
  const setIsAddModalOpen = (next: boolean) => {
    onAddModalOpenChange?.(next)
    if (addModalOpenProp === undefined) setIsAddModalOpenLocal(next)
  }

  const { widths, setColumnWidth, resetColumnWidth } = useResizableColumns(
    'sara_yarn_col_widths_v5',
    DEFAULT_WIDTHS
  )
  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  )

  // Overall Stock Totals
  const totals = useMemo(() => {
    const totalReceivedKg = yarn.reduce((sum, y) => sum + (y.receivedKg || 0), 0)
    const totalReceivedLbs = yarn.reduce((sum, y) => sum + (y.receivedLbs || 0), 0)
    const totalIssuedKg = yarn.reduce((sum, y) => sum + (y.issuedKg || 0), 0)
    const totalIssuedLbs = yarn.reduce((sum, y) => sum + (y.issuedLbs || 0), 0)
    const totalBalanceKg = yarn.reduce((sum, y) => sum + (y.balanceKg || 0), 0)
    const totalBalanceLbs = yarn.reduce((sum, y) => sum + (y.balanceLbs || 0), 0)
    const totalBags = yarn.reduce((sum, y) => sum + (y.bags || 0), 0)

    return {
      received: unit === 'KG' ? totalReceivedKg : totalReceivedLbs,
      issued: unit === 'KG' ? totalIssuedKg : totalIssuedLbs,
      balance: unit === 'KG' ? totalBalanceKg : totalBalanceLbs,
      bags: totalBags,
    }
  }, [yarn, unit])

  const issuancesByYarn = useMemo(() => {
    const map = new Map<string, YarnLoomIssuance[]>()
    issuances.forEach((iss) => {
      const arr = map.get(iss.yarnId) || []
      arr.push(iss)
      map.set(iss.yarnId, arr)
    })
    return map
  }, [issuances])

  // Complete List of Movements (Inward Arrivals + Outward Issuances)
  const allMovements = useMemo((): YarnMovementRecord[] => {
    if (movements && movements.length > 0) return movements
    return issuances.map((iss) => ({
      id: `mov-${iss.id}`,
      type: 'OUTWARD' as const,
      yarnId: iss.yarnId,
      yarnType: iss.yarnType,
      date: iss.date,
      weightKg: iss.issuedKg,
      weightLbs: kgToLbs(iss.issuedKg),
      loomNumber: iss.loomNumber,
      pick: iss.pick,
      createdAt: iss.createdAt,
    }))
  }, [movements, issuances])

  // Filtered Movements for Ledger (Daily / Weekly / Monthly)
  const dateRange = useMemo(() => {
    if (dateFilterMode === 'DAILY') {
      return { start: selectedDate, end: selectedDate }
    }
    if (dateFilterMode === 'WEEKLY') {
      return getWeekRange(selectedDate)
    }
    if (dateFilterMode === 'MONTHLY') {
      return getMonthRange(selectedDate)
    }
    return null
  }, [dateFilterMode, selectedDate])

  const periodLabel = useMemo(() => {
    if (!dateRange) return 'All dates'
    if (dateFilterMode === 'DAILY') return shortRangeLabel(dateRange.start, dateRange.end)
    if (dateFilterMode === 'WEEKLY') return `Week ${shortRangeLabel(dateRange.start, dateRange.end)}`
    if (dateFilterMode === 'MONTHLY') {
      try {
        return parseDay(selectedDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      } catch {
        return selectedDate.slice(0, 7)
      }
    }
    return 'All dates'
  }, [dateRange, dateFilterMode, selectedDate])

  const filteredMovements = useMemo(() => {
    return allMovements.filter((mov) => {
      if (movementTypeFilter !== 'ALL' && mov.type !== movementTypeFilter) return false
      if (ledgerLoomFilter !== 'ALL') {
        if (mov.type === 'OUTWARD' && String(mov.loomNumber) !== ledgerLoomFilter) return false
        if (mov.type === 'INWARD') return false
      }
      if (dateRange) {
        if (mov.date < dateRange.start || mov.date > dateRange.end) return false
      }
      return true
    })
  }, [allMovements, movementTypeFilter, ledgerLoomFilter, dateRange])

  const opsEdit = canEditProduction && !readOnly && tableEdit && mode === 'table'
  const masterEdit = canEditProduction && !readOnly && tableEdit && mode === 'grid'
  const editActive = opsEdit || masterEdit

  const handleDeleteYarn = (y: YarnMaster) => {
    if (!masterEdit || !onDelete) return
    showConfirm({
      title: 'Yarn Delete Karein?',
      message: `Kya aap waqai yarn type "${y.yarnType}" ko delete karna chahte hain?`,
      type: 'confirm',
      confirmText: 'Haan, Delete Karein',
      cancelText: 'Cancel',
      onConfirm: () => {
        onDelete(y.id)
        showSuccessSoon({
          title: 'Deleted',
          message: `"${y.yarnType}" delete ho gaya.`,
        })
      },
    })
  }

  const patchYarn = (y: YarnMaster, field: 'received' | 'issued' | 'bags' | 'yarnType', val: string | number) => {
    if (field === 'yarnType') {
      onUpdate(y.id, { yarnType: String(val) })
      return
    }
    if (field === 'bags') {
      onUpdate(y.id, { bags: Number(val) || 0 })
      return
    }
    const receivedKg = y.receivedKg || 0
    const receivedLbs = y.receivedLbs || 0
    const issuedKg = y.issuedKg || 0
    const issuedLbs = y.issuedLbs || 0
    if (field === 'received') {
      const num = Number(val) || 0
      const next =
        unit === 'KG'
          ? { receivedKg: num, receivedLbs: kgToLbs(num) }
          : { receivedLbs: num, receivedKg: lbsToKg(num) }
      const rKg = next.receivedKg ?? receivedKg
      const rLbs = next.receivedLbs ?? receivedLbs
      onUpdate(y.id, {
        ...next,
        balanceKg: rKg - issuedKg,
        balanceLbs: rLbs - issuedLbs,
      })
      return
    }
    const num = Number(val) || 0
    const next =
      unit === 'KG'
        ? { issuedKg: num, issuedLbs: kgToLbs(num) }
        : { issuedLbs: num, issuedKg: lbsToKg(num) }
    const iKg = next.issuedKg ?? issuedKg
    const iLbs = next.issuedLbs ?? issuedLbs
    onUpdate(y.id, {
      ...next,
      balanceKg: receivedKg - iKg,
      balanceLbs: receivedLbs - iLbs,
    })
  }

  const stockEditToggle =
    activeView === 'STOCK' && canEditProduction && !readOnly ? (
      <button
        type="button"
        className={`btn btn-sm ${tableEdit ? 'btn-warning' : 'btn-outline-secondary'}`}
        title={tableEdit ? 'Lock table (view only)' : 'Enable editing'}
        onClick={() => {
          if (tableEdit) {
            setTableEdit(false)
            showSuccessSoon({
              title: 'Saved',
              message: 'Yarn edits save ho gayi hain.',
            })
          } else {
            setTableEdit(true)
          }
        }}
      >
        <i className={`bi ${tableEdit ? 'bi-lock' : 'bi-pencil-square'} me-1`} />
        {tableEdit ? 'Done' : 'Edit'}
      </button>
    ) : null

  const displayWeight = (kg: number, lbs: number) => {
    const val = unit === 'KG' ? kg : lbs
    return Number(val || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  return (
    <div className="d-flex flex-column gap-3">
      {/* 1. TOP SUMMARY CARDS (IN / OUT / BALANCE WITH ICONS) */}
      <div className="row g-3">
        <div className="col-12 col-md-4">
          <div className="card h-100">
            <div className="card-body p-3 d-flex align-items-center justify-content-between">
              <div>
                <span className="text-secondary small fw-semibold text-uppercase d-block mb-1">
                  Total Inward (Received)
                </span>
                <div className="fs-4 fw-bold text-success">
                  {totals.received.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                  <span className="fs-6 fw-semibold text-secondary">{unit.toLowerCase()}</span>
                </div>
                <div className="small text-muted mt-1">
                  <span className="badge bg-success-subtle text-success me-1">
                    <i className="bi bi-box-arrow-in-down me-1" />
                    Inward
                  </span>
                  {totals.bags} Total Bags
                </div>
              </div>
              <div
                className="rounded-circle bg-success-subtle d-flex align-items-center justify-content-center"
                style={{ width: 48, height: 48 }}
              >
                <i className="bi bi-box-arrow-in-down fs-4 text-success" />
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-4">
          <div className="card h-100">
            <div className="card-body p-3 d-flex align-items-center justify-content-between">
              <div>
                <span className="text-secondary small fw-semibold text-uppercase d-block mb-1">
                  Total Outward (To Looms)
                </span>
                <div className="fs-4 fw-bold text-danger">
                  {totals.issued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                  <span className="fs-6 fw-semibold text-secondary">{unit.toLowerCase()}</span>
                </div>
                <div className="small text-muted mt-1">
                  <span className="badge bg-danger-subtle text-danger me-1">
                    <i className="bi bi-box-arrow-up-right me-1" />
                    Outward
                  </span>
                  {issuances.length} Dispatches Recorded
                </div>
              </div>
              <div
                className="rounded-circle bg-danger-subtle d-flex align-items-center justify-content-center"
                style={{ width: 48, height: 48 }}
              >
                <i className="bi bi-box-arrow-up-right fs-4 text-danger" />
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-4">
          <div className="card h-100">
            <div className="card-body p-3 d-flex align-items-center justify-content-between">
              <div>
                <span className="text-secondary small fw-semibold text-uppercase d-block mb-1">
                  Available Warehouse Balance
                </span>
                <div className="fs-4 fw-bold text-primary">
                  {totals.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                  <span className="fs-6 fw-semibold text-secondary">{unit.toLowerCase()}</span>
                </div>
                <div className="small text-muted mt-1">
                  <span className="badge bg-primary-subtle text-primary me-1">
                    <i className="bi bi-boxes me-1" />
                    Net In-Stock
                  </span>
                  Ready for Floor Feeding
                </div>
              </div>
              <div
                className="rounded-circle bg-primary-subtle d-flex align-items-center justify-content-center"
                style={{ width: 48, height: 48 }}
              >
                <i className="bi bi-boxes fs-4 text-primary" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MAIN CARD WITH VIEW SWITCHER, UNIT FILTER & ACTIONS */}
      <div className="card">
        <div className="card-header d-flex flex-row flex-wrap gap-2 justify-content-between align-items-center">
          <div className="d-flex align-items-center gap-3">
            <h3 className="card-title mb-0">Yarn Stock (Weft)</h3>

            {/* Sub-view Switcher: Stock vs Daily Ledger */}
            <div className="btn-group btn-group-sm" role="group" aria-label="Yarn View Mode">
              <button
                type="button"
                className={`btn ${activeView === 'STOCK' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setActiveView('STOCK')}
              >
                <i className="bi bi-table me-1" />
                Stock Inventory
              </button>
              <button
                type="button"
                className={`btn ${activeView === 'LEDGER' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setActiveView('LEDGER')}
              >
                <i className="bi bi-journal-text me-1" />
                Daily Movement Ledger ({allMovements.length})
              </button>
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2 align-items-center ms-auto">
            {/* UNIT FILTER (KG / LBS TOGGLE) */}
            <div className="d-flex align-items-center gap-1 border rounded px-1.5 py-0.5 bg-light">
              <span className="small text-secondary fw-semibold pe-1">Unit:</span>
              <div className="btn-group btn-group-sm" role="group" aria-label="Weight Unit">
                <button
                  type="button"
                  className={`btn py-0 px-2 fw-semibold ${unit === 'KG' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  style={{ fontSize: '0.78rem', height: 26 }}
                  onClick={() => setUnit('KG')}
                >
                  KG
                </button>
                <button
                  type="button"
                  className={`btn py-0 px-2 fw-semibold ${unit === 'LBS' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  style={{ fontSize: '0.78rem', height: 26 }}
                  onClick={() => setUnit('LBS')}
                >
                  LBS
                </button>
              </div>
            </div>

            {activeView === 'STOCK' && tableEdit && (
              <span className="small text-warning align-self-center">Edit on — Enter / Tab next field</span>
            )}
            {!toolbarInChrome && stockEditToggle}
            {activeView === 'STOCK' && <ViewModeToggle mode={mode} onChange={setMode} />}

            {!toolbarInChrome && !readOnly && canEditProduction && (
              <button
                type="button"
                className="btn btn-sm btn-success"
                onClick={() => setIsAddModalOpen(true)}
              >
                <i className="bi bi-plus-lg me-1" /> Add Inward Yarn
              </button>
            )}
          </div>
        </div>

        {/* ============================================================== */}
        {/* VIEW 1: STOCK INVENTORY OVERVIEW                               */}
        {/* ============================================================== */}
        {activeView === 'STOCK' && (
          <>
            {mode === 'grid' ? (
              <div className="master-grid">
                {yarn.length === 0 ? (
                  <div className="w-100">
                    <EmptyPlaceholder
                      icon="bi-layers"
                      title="No yarn in stock"
                      hint="Add Inward Yarn se pehla stock entry karo — yahan balance dikhega."
                    />
                  </div>
                ) : (
                yarn.map((y, rowIdx) => {
                  const yarnIss = issuancesByYarn.get(y.id) || []

                  return (
                    <div
                      key={y.id}
                      className={`master-grid-card${editActive ? ' sara-edit-card' : ''}`}
                    >
                      <div className="d-flex justify-content-between align-items-start border-bottom pb-2">
                        <div className="flex-fill me-2">
                          {masterEdit ? (
                            <TextCellInput
                              className="form-control form-control-sm fw-bold"
                              value={y.yarnType}
                              navRow={rowIdx}
                              navCol={0}
                              onValueChange={(v) => patchYarn(y, 'yarnType', v)}
                            />
                          ) : (
                            <>
                              <div className="fw-bold fs-6">{y.yarnType}</div>
                              <div className="text-secondary small">{y.bags} Bags</div>
                            </>
                          )}
                        </div>
                        <div className="d-flex align-items-center gap-1">
                          {masterEdit && onDelete && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              title={`Delete ${y.yarnType}`}
                              onClick={() => handleDeleteYarn(y)}
                            >
                              <i className="bi bi-trash" />
                            </button>
                          )}
                          {onIssue && !readOnly && !editActive && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success"
                              disabled={y.balanceKg <= 0}
                              onClick={() => setIssuingYarn(y)}
                            >
                              <i className="bi bi-box-arrow-right me-1" /> Issue
                            </button>
                          )}
                        </div>
                      </div>

                      {masterEdit ? (
                        <div className="d-flex flex-column gap-2 mt-2">
                          <div className="d-flex gap-2">
                            <div className="flex-fill">
                              <label className="small mb-0">Bags</label>
                              <NumericCellInput
                                className="form-control form-control-sm text-end"
                                value={y.bags}
                                navRow={rowIdx}
                                navCol={1}
                                onValueChange={(v) => patchYarn(y, 'bags', v)}
                              />
                            </div>
                            <div className="flex-fill">
                              <label className="small mb-0">Inward ({unit})</label>
                              <NumericCellInput
                                className="form-control form-control-sm text-end"
                                value={unit === 'KG' ? y.receivedKg : y.receivedLbs}
                                navRow={rowIdx}
                                navCol={2}
                                onValueChange={(v) => patchYarn(y, 'received', v)}
                              />
                            </div>
                          </div>
                          <div className="d-flex gap-2">
                            <div className="flex-fill">
                              <label className="small mb-0">Outward ({unit})</label>
                              <NumericCellInput
                                className="form-control form-control-sm text-end"
                                value={unit === 'KG' ? y.issuedKg : y.issuedLbs}
                                navRow={rowIdx}
                                navCol={3}
                                onValueChange={(v) => patchYarn(y, 'issued', v)}
                              />
                            </div>
                            <div className="flex-fill">
                              <label className="small mb-0">Bal ({unit})</label>
                              <div className="form-control form-control-sm bg-light text-end fw-bold text-primary">
                                {displayWeight(y.balanceKg, y.balanceLbs)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="d-flex justify-content-between small text-secondary mt-2">
                          <span>
                            <i className="bi bi-box-arrow-in-down text-success me-1" />
                            In: <strong className="text-dark">{displayWeight(y.receivedKg, y.receivedLbs)}</strong>
                          </span>
                          <span>
                            <i className="bi bi-box-arrow-up-right text-danger me-1" />
                            Out: <strong className="text-dark">{displayWeight(y.issuedKg, y.issuedLbs)}</strong>
                          </span>
                          <span>
                            <i className="bi bi-boxes text-primary me-1" />
                            Bal: <strong className="text-primary">{displayWeight(y.balanceKg, y.balanceLbs)}</strong>
                          </span>
                        </div>
                      )}

                      {yarnIss.length > 0 && (
                        <div className="pt-2 border-top mt-2">
                          <span className="small text-secondary fw-semibold">Dispatched Looms:</span>
                          <div className="d-flex flex-wrap gap-1 mt-1">
                            {yarnIss.slice(0, 3).map((iss) => (
                              <span key={iss.id} className="badge bg-light text-dark border">
                                Loom {iss.loomNumber}: {displayWeight(iss.issuedKg, kgToLbs(iss.issuedKg))} ({iss.pick}p)
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
                )}
              </div>
            ) : (
              <TablePanScroll className="card-body p-0">
                <table
                  className="table table-sm table-hover mb-0 align-middle text-nowrap"
                  style={{ tableLayout: 'fixed', width: tableMinWidth, minWidth: tableMinWidth }}
                >
                  <colgroup>
                    {Object.keys(DEFAULT_WIDTHS).map((key) => (
                      <col key={key} style={{ width: widths[key] }} />
                    ))}
                  </colgroup>
                  <thead className="table-light">
                    <tr>
                      <ResizableTh columnKey="yarn" width={widths.yarn} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                        Yarn Type
                      </ResizableTh>
                      <ResizableTh columnKey="bags" width={widths.bags} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-end">
                        <i className="bi bi-bag me-1 text-secondary" />
                        Bags
                      </ResizableTh>
                      <ResizableTh columnKey="received" width={widths.received} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-end">
                        <i className="bi bi-box-arrow-in-down text-success me-1" />
                        Inward ({unit})
                      </ResizableTh>
                      <ResizableTh columnKey="issued" width={widths.issued} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-end">
                        <i className="bi bi-box-arrow-up-right text-danger me-1" />
                        Outward ({unit})
                      </ResizableTh>
                      <ResizableTh columnKey="balance" width={widths.balance} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-end">
                        <i className="bi bi-boxes text-primary me-1" />
                        Balance ({unit})
                      </ResizableTh>
                      <ResizableTh columnKey="recentLooms" width={widths.recentLooms} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                        Outward Destination / Looms
                      </ResizableTh>
                      <ResizableTh columnKey="actions" width={widths.actions} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-center">
                        Actions
                      </ResizableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {yarn.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-0 border-0">
                          <EmptyPlaceholder
                            icon="bi-layers"
                            title="No yarn in stock"
                            hint="Add Inward Yarn se pehla stock entry karo — yahan balance dikhega."
                            compact
                          />
                        </td>
                      </tr>
                    ) : (
                    yarn.map((y, rowIdx) => {
                      const yarnIss = issuancesByYarn.get(y.id) || []

                      return (
                        <tr
                          key={y.id}
                          className={editActive ? 'sara-edit-row' : undefined}
                        >
                          <td className="px-2">
                            <span className="fw-semibold">{y.yarnType}</span>
                          </td>
                          <td className="px-1">
                            {opsEdit ? (
                              <NumericCellInput
                                className="form-control form-control-sm text-end"
                                style={{ width: '100%', minWidth: 0 }}
                                value={y.bags}
                                navRow={rowIdx}
                                navCol={1}
                                onValueChange={(v) => patchYarn(y, 'bags', v)}
                              />
                            ) : (
                              <div className="text-end px-1">{y.bags}</div>
                            )}
                          </td>
                          <td className="px-1">
                            {opsEdit ? (
                              <NumericCellInput
                                className="form-control form-control-sm text-end"
                                style={{ width: '100%', minWidth: 0 }}
                                value={unit === 'KG' ? y.receivedKg : y.receivedLbs}
                                navRow={rowIdx}
                                navCol={2}
                                onValueChange={(v) => patchYarn(y, 'received', v)}
                              />
                            ) : (
                              <div className="text-end px-1 text-success fw-medium">
                                {displayWeight(y.receivedKg, y.receivedLbs)}
                              </div>
                            )}
                          </td>
                          <td className="px-1">
                            {opsEdit ? (
                              <NumericCellInput
                                className="form-control form-control-sm text-end"
                                style={{ width: '100%', minWidth: 0 }}
                                value={unit === 'KG' ? y.issuedKg : y.issuedLbs}
                                navRow={rowIdx}
                                navCol={3}
                                onValueChange={(v) => patchYarn(y, 'issued', v)}
                              />
                            ) : (
                              <div className="text-end px-1 text-danger fw-medium">
                                {displayWeight(y.issuedKg, y.issuedLbs)}
                              </div>
                            )}
                          </td>
                          <td className="fw-bold text-end pe-2 text-primary">
                            {displayWeight(y.balanceKg, y.balanceLbs)}
                          </td>
                          <td className="px-2" style={{ whiteSpace: 'normal', fontSize: '0.78rem' }}>
                            {yarnIss.length > 0 ? (
                              <div className="d-flex flex-wrap gap-1">
                                {yarnIss.slice(0, 3).map((iss) => (
                                  <span
                                    key={iss.id}
                                    className="badge bg-light text-dark border py-1 px-1.5"
                                    title={`Issued on ${iss.date}: ${iss.issuedKg} kg to Loom ${iss.loomNumber} (${iss.pick} picks)`}
                                  >
                                    Loom {iss.loomNumber}: <strong>{displayWeight(iss.issuedKg, kgToLbs(iss.issuedKg))}</strong> ({iss.pick}p)
                                  </span>
                                ))}
                                {yarnIss.length > 3 && (
                                  <button
                                    type="button"
                                    className="badge bg-secondary-subtle text-secondary border-0 py-1 px-1.5 text-decoration-none"
                                    onClick={() => setActiveView('LEDGER')}
                                    title="View full dispatch ledger"
                                  >
                                    +{yarnIss.length - 3} more…
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted small">In stock (no dispatches)</span>
                            )}
                          </td>
                          <td className="px-1 text-center">
                            {onIssue && !readOnly && !editActive && (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-success py-0 px-1.5"
                                style={{ fontSize: '0.75rem', height: 24 }}
                                title="Issue yarn to loom"
                                disabled={y.balanceKg <= 0}
                                onClick={() => setIssuingYarn(y)}
                              >
                                <i className="bi bi-box-arrow-right me-1" /> Issue
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                    )}
                  </tbody>
                </table>
              </TablePanScroll>
            )}
          </>
        )}

        {/* ============================================================== */}
        {/* VIEW 2: DAILY MOVEMENT LEDGER (DIN KA HISAAB: IN / OUT)        */}
        {/* ============================================================== */}
        {activeView === 'LEDGER' && (
          <div className="card-body p-0">
            {/* Filter Bar for Daily Ledger */}
            <div className="p-3 bg-light border-bottom d-flex flex-wrap gap-2 align-items-center justify-content-between">
              <div className="d-flex flex-wrap align-items-center gap-2">
                <span className="small fw-semibold text-secondary">Filter Ledger:</span>

                {/* Movement Type Toggle */}
                <div className="btn-group btn-group-sm" role="group" aria-label="Movement Type">
                  <button
                    type="button"
                    className={`btn py-0 px-2 fw-semibold ${movementTypeFilter === 'ALL' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    style={{ fontSize: '0.78rem', height: 28 }}
                    onClick={() => setMovementTypeFilter('ALL')}
                  >
                    All ({allMovements.length})
                  </button>
                  <button
                    type="button"
                    className={`btn py-0 px-2 fw-semibold ${
                      movementTypeFilter === 'INWARD' ? 'btn-success text-white' : 'btn-outline-success'
                    }`}
                    style={{ fontSize: '0.78rem', height: 28 }}
                    onClick={() => setMovementTypeFilter('INWARD')}
                  >
                    <i className="bi bi-box-arrow-in-down me-1" />
                    Inward ({allMovements.filter((m) => m.type === 'INWARD').length})
                  </button>
                  <button
                    type="button"
                    className={`btn py-0 px-2 fw-semibold ${
                      movementTypeFilter === 'OUTWARD' ? 'btn-danger text-white' : 'btn-outline-danger'
                    }`}
                    style={{ fontSize: '0.78rem', height: 28 }}
                    onClick={() => setMovementTypeFilter('OUTWARD')}
                  >
                    <i className="bi bi-box-arrow-up-right me-1" />
                    Outward ({allMovements.filter((m) => m.type === 'OUTWARD').length})
                  </button>
                </div>

                {/* Loom Filter */}
                <select
                  className="form-select form-select-sm"
                  style={{ width: 'auto', minWidth: 130, height: 28, fontSize: '0.78rem' }}
                  value={ledgerLoomFilter}
                  onChange={(e) => setLedgerLoomFilter(e.target.value)}
                >
                  <option value="ALL">All Looms (1–34)</option>
                  {Array.from({ length: 34 }, (_, i) => i + 1).map((num) => (
                    <option key={num} value={String(num)}>
                      Loom {num}
                    </option>
                  ))}
                </select>

                {(movementTypeFilter !== 'ALL' || ledgerLoomFilter !== 'ALL' || dateFilterMode !== 'ALL') && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary py-0 px-2"
                    style={{ height: 28, fontSize: '0.78rem' }}
                    onClick={() => {
                      setMovementTypeFilter('ALL')
                      setLedgerLoomFilter('ALL')
                      setDateFilterMode('ALL')
                    }}
                  >
                    <i className="bi bi-x-circle me-1" /> Reset Filters
                  </button>
                )}
              </div>

              <div className="text-secondary small">
                <span className="me-2">
                  <i className="bi bi-calendar3 me-1" />
                  {periodLabel}
                </span>
                Showing <strong>{filteredMovements.length}</strong> movements (
                <span className="text-success fw-bold me-1">
                  +{displayWeight(
                    filteredMovements.filter((m) => m.type === 'INWARD').reduce((s, m) => s + (m.weightKg || 0), 0),
                    kgToLbs(filteredMovements.filter((m) => m.type === 'INWARD').reduce((s, m) => s + (m.weightKg || 0), 0))
                  )}
                </span>
                /
                <span className="text-danger fw-bold ms-1">
                  -{displayWeight(
                    filteredMovements.filter((m) => m.type === 'OUTWARD').reduce((s, m) => s + (m.weightKg || 0), 0),
                    kgToLbs(filteredMovements.filter((m) => m.type === 'OUTWARD').reduce((s, m) => s + (m.weightKg || 0), 0))
                  )}
                </span>{' '}
                {unit.toLowerCase()})
              </div>
            </div>

            {/* Ledger Table */}
            <TablePanScroll>
              <table className="table table-sm table-hover mb-0 align-middle text-nowrap">
                <thead className="table-light">
                  <tr>
                    <th className="px-3" style={{ width: 130 }}>Date</th>
                    <th className="px-2" style={{ width: 130 }}>Movement</th>
                    <th className="px-2" style={{ width: 170 }}>Yarn Type</th>
                    <th className="px-2" style={{ width: 160 }}>Destination / Source</th>
                    <th className="px-2 text-end" style={{ width: 130 }}>
                      Weight ({unit})
                    </th>
                    <th className="px-2 text-end" style={{ width: 110 }}>Bags / Picks</th>
                    <th className="px-2" style={{ width: 140 }}>Recorded Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-0 border-0">
                        <EmptyPlaceholder
                          icon="bi-arrow-left-right"
                          title="No yarn movements"
                          hint="Selected filters pe koi inward / issue record nahi. Date ya period change karke dekho."
                          compact
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredMovements.map((mov) => {
                      const timeStr = mov.createdAt
                        ? new Date(mov.createdAt).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'
                      const isInward = mov.type === 'INWARD'
                      // Opening stock / corrections of a typed total (may be minus).
                      const isFix = mov.kind === 'CORRECTION' || mov.kind === 'OPENING'
                      const kg = Number(mov.weightKg) || 0
                      const sign = (isInward ? kg >= 0 : kg < 0) ? '+' : '-'

                      return (
                        <tr key={mov.id}>
                          <td className="px-3 fw-semibold text-dark">
                            <i className="bi bi-calendar3 text-secondary me-1.5" />
                            {mov.date}
                          </td>
                          <td className="px-2">
                            {isFix ? (
                              <span className="badge bg-warning-subtle text-dark border border-warning-subtle px-2 py-1">
                                <i className="bi bi-sliders me-1" />
                                {mov.kind === 'OPENING' ? 'Opening' : `Correction (${isInward ? 'In' : 'Out'})`}
                              </span>
                            ) : isInward ? (
                              <span className="badge bg-success-subtle text-success border border-success-subtle px-2 py-1">
                                <i className="bi bi-box-arrow-in-down me-1" />
                                IN (Arrival)
                              </span>
                            ) : (
                              <span className="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1">
                                <i className="bi bi-box-arrow-up-right me-1" />
                                OUT (Loom)
                              </span>
                            )}
                          </td>
                          <td className="px-2 fw-medium text-dark">{mov.yarnType}</td>
                          <td className="px-2">
                            {isInward || isFix ? (
                              <span className="badge bg-light text-secondary border px-2 py-1">
                                {mov.lotOrSupplier || 'Warehouse Receipt'}
                              </span>
                            ) : (
                              <span className="badge bg-light text-dark border px-2 py-1">
                                Loom {mov.loomNumber}
                              </span>
                            )}
                          </td>
                          <td className={`px-2 text-end fw-bold ${sign === '+' ? 'text-success' : 'text-danger'}`}>
                            {sign}
                            {displayWeight(Math.abs(kg), Math.abs(Number(mov.weightLbs) || 0))} {unit.toLowerCase()}
                          </td>
                          <td className="px-2 text-end fw-semibold text-secondary">
                            {isInward ? (mov.bags ? `${mov.bags} bags` : '—') : isFix ? '—' : `${mov.pick || '—'} picks`}
                          </td>
                          <td className="px-2 text-muted small">
                            <i className="bi bi-clock me-1" />
                            {timeStr}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </TablePanScroll>
          </div>
        )}
      </div>

      {/* Add Yarn Modal */}
      <AddYarnModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={(newYarn, arrival) => {
          onAdd(newYarn, arrival)
          showSuccessSoon({
            title: 'Yarn Added',
            message: `"${newYarn.yarnType || 'Yarn'}" — ${arrival?.bags ?? newYarn.bags ?? 0} bags, ${(arrival?.weightKg ?? newYarn.receivedKg ?? 0).toFixed(2)} kg.`,
          })
        }}
        activeDate={selectedDate}
        existingYarns={yarn}
      />

      {/* Issue Yarn Modal */}
      {issuingYarn && (
        <IssueYarnModal
          isOpen={true}
          yarn={issuingYarn}
          looms={looms}
          qualities={qualities}
          onClose={() => setIssuingYarn(null)}
          onIssue={(yarnId, loomNumber, issuedKg, pick, dateStr) => {
            if (onIssue) onIssue(yarnId, loomNumber, issuedKg, pick, dateStr)
          }}
          activeDate={selectedDate}
        />
      )}
    </div>
  )
}
