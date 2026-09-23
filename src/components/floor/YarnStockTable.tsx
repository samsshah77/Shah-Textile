'use client'

import { useMemo, useState } from 'react'
import {
  YarnMaster,
  YarnLoomIssuance,
  YarnMovementRecord,
  LBS_PER_KG,
  kgToLbs,
  lbsToKg,
} from '@/services/productionMastersService'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { AddYarnModal } from '@/components/floor/AddYarnModal'
import { IssueYarnModal } from '@/components/floor/IssueYarnModal'
import { useAuth } from '@/context/AuthContext'

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
}

export function YarnStockTable({
  yarn,
  onUpdate,
  onAdd,
  onIssue,
  issuances = [],
  movements = [],
  readOnly,
  selectedDate,
  dateFilterMode,
  setDateFilterMode,
}: YarnStockTableProps) {
  const { isAdmin } = useAuth()
  const [mode, setMode] = useState<TableGridMode>('table')
  const [activeView, setActiveView] = useState<YarnViewMode>('STOCK')
  const [unit, setUnit] = useState<WeightUnit>('KG')
  const [movementTypeFilter, setMovementTypeFilter] = useState<'ALL' | 'INWARD' | 'OUTWARD'>('ALL')
  const [ledgerLoomFilter, setLedgerLoomFilter] = useState<string>('ALL')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [issuingYarn, setIssuingYarn] = useState<YarnMaster | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<YarnMaster | null>(null)

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
  const allMovements = useMemo(() => {
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

  const startEdit = (y: YarnMaster) => {
    if (!isAdmin || readOnly) return
    setEditingId(y.id)
    setDraft({ ...y })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft(null)
  }

  const saveEdit = (id: string) => {
    if (!draft) return
    const balanceKg = (draft.receivedKg || 0) - (draft.issuedKg || 0)
    const balanceLbs = (draft.receivedLbs || 0) - (draft.issuedLbs || 0)
    onUpdate(id, {
      yarnType: draft.yarnType,
      bags: draft.bags,
      receivedKg: draft.receivedKg,
      receivedLbs: draft.receivedLbs,
      issuedKg: draft.issuedKg,
      issuedLbs: draft.issuedLbs,
      balanceKg,
      balanceLbs,
    })
    setEditingId(null)
    setDraft(null)
  }

  const patchDraftVal = (field: 'received' | 'issued' | 'bags' | 'yarnType', val: any) => {
    setDraft((prev) => {
      if (!prev) return null
      const updated = { ...prev }
      if (field === 'yarnType') {
        updated.yarnType = val
      } else if (field === 'bags') {
        updated.bags = Number(val) || 0
      } else if (field === 'received') {
        const num = Number(val) || 0
        if (unit === 'KG') {
          updated.receivedKg = num
          updated.receivedLbs = kgToLbs(num)
        } else {
          updated.receivedLbs = num
          updated.receivedKg = lbsToKg(num)
        }
        updated.balanceKg = updated.receivedKg - (updated.issuedKg || 0)
        updated.balanceLbs = updated.receivedLbs - (updated.issuedLbs || 0)
      } else if (field === 'issued') {
        const num = Number(val) || 0
        if (unit === 'KG') {
          updated.issuedKg = num
          updated.issuedLbs = kgToLbs(num)
        } else {
          updated.issuedLbs = num
          updated.issuedKg = lbsToKg(num)
        }
        updated.balanceKg = (updated.receivedKg || 0) - updated.issuedKg
        updated.balanceLbs = (updated.receivedLbs || 0) - updated.issuedLbs
      }
      return updated
    })
  }

  const displayWeight = (kg: number, lbs: number) => {
    const val = unit === 'KG' ? kg : lbs
    return Number(val || 0).toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
  }

  return (
    <div className="d-flex flex-column gap-3">
      {/* 1. TOP SUMMARY CARDS (IN / OUT / BALANCE WITH ICONS) */}
      <div className="row g-3">
        <div className="col-12 col-md-4">
          <div className="card shadow-sm border-0 border-start border-4 border-success h-100">
            <div className="card-body p-3 d-flex align-items-center justify-content-between">
              <div>
                <span className="text-secondary small fw-semibold text-uppercase d-block mb-1">
                  Total Inward (Received)
                </span>
                <div className="fs-4 fw-bold text-success">
                  {totals.received.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{' '}
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
          <div className="card shadow-sm border-0 border-start border-4 border-danger h-100">
            <div className="card-body p-3 d-flex align-items-center justify-content-between">
              <div>
                <span className="text-secondary small fw-semibold text-uppercase d-block mb-1">
                  Total Outward (To Looms)
                </span>
                <div className="fs-4 fw-bold text-danger">
                  {totals.issued.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{' '}
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
          <div className="card shadow-sm border-0 border-start border-4 border-primary h-100">
            <div className="card-body p-3 d-flex align-items-center justify-content-between">
              <div>
                <span className="text-secondary small fw-semibold text-uppercase d-block mb-1">
                  Available Warehouse Balance
                </span>
                <div className="fs-4 fw-bold text-primary">
                  {totals.balance.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{' '}
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

            {activeView === 'STOCK' && <ViewModeToggle mode={mode} onChange={setMode} />}

            {!readOnly && isAdmin && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
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
                {yarn.map((y) => {
                  const yarnIss = issuancesByYarn.get(y.id) || []
                  const isEditing = editingId === y.id && !!draft
                  const d = isEditing ? draft! : null

                  return (
                    <div
                      key={y.id}
                      className={`master-grid-card ${isEditing ? 'border border-primary shadow-sm' : ''}`}
                      style={isEditing ? { backgroundColor: '#eef5ff' } : undefined}
                    >
                      <div className="d-flex justify-content-between align-items-start border-bottom pb-2">
                        <div>
                          {isEditing ? (
                            <input
                              className="form-control form-control-sm fw-bold"
                              value={d!.yarnType}
                              onChange={(e) => patchDraftVal('yarnType', e.target.value)}
                            />
                          ) : (
                            <>
                              <div className="fw-bold fs-6">{y.yarnType}</div>
                              <div className="text-secondary small">{y.bags} Bags</div>
                            </>
                          )}
                        </div>
                        <div className="d-flex align-items-center gap-1">
                          {onIssue && !readOnly && !isEditing && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success"
                              disabled={y.balanceKg <= 0}
                              onClick={() => setIssuingYarn(y)}
                            >
                              <i className="bi bi-box-arrow-right me-1" /> Issue
                            </button>
                          )}
                          {isEditing ? (
                            <div className="d-flex gap-1">
                              <button
                                type="button"
                                className="btn btn-sm btn-success py-0 px-2 d-inline-flex align-items-center gap-1 shadow-sm"
                                style={{ height: 26, fontSize: '0.78rem' }}
                                title="Save changes"
                                onClick={() => saveEdit(y.id)}
                              >
                                <i className="bi bi-check-lg" />
                                <span>Save</span>
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary py-0 px-1"
                                style={{ height: 26, width: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                title="Cancel"
                                onClick={cancelEdit}
                              >
                                <i className="bi bi-x-lg" style={{ fontSize: '0.72rem' }} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary p-0"
                              style={{
                                width: 22,
                                height: 22,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 4,
                                opacity: isAdmin && !readOnly ? 0.75 : 0.35,
                              }}
                              title={isAdmin ? `Edit ${y.yarnType}` : 'Admin privileges required'}
                              disabled={!isAdmin || readOnly || (editingId !== null && editingId !== y.id)}
                              onClick={() => startEdit(y)}
                            >
                              <i className="bi bi-pencil" style={{ fontSize: '0.68rem' }} />
                            </button>
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="d-flex flex-column gap-2 mt-2">
                          <div className="d-flex gap-2">
                            <div className="flex-fill">
                              <label className="small mb-0">Bags</label>
                              <input
                                type="number"
                                className="form-control form-control-sm text-end"
                                value={d!.bags}
                                onChange={(e) => patchDraftVal('bags', e.target.value)}
                              />
                            </div>
                            <div className="flex-fill">
                              <label className="small mb-0">Inward ({unit})</label>
                              <input
                                type="number"
                                step="0.5"
                                className="form-control form-control-sm text-end"
                                value={unit === 'KG' ? d!.receivedKg : d!.receivedLbs}
                                onChange={(e) => patchDraftVal('received', e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="d-flex gap-2">
                            <div className="flex-fill">
                              <label className="small mb-0">Outward ({unit})</label>
                              <input
                                type="number"
                                step="0.5"
                                className="form-control form-control-sm text-end"
                                value={unit === 'KG' ? d!.issuedKg : d!.issuedLbs}
                                onChange={(e) => patchDraftVal('issued', e.target.value)}
                              />
                            </div>
                            <div className="flex-fill">
                              <label className="small mb-0">Bal ({unit})</label>
                              <div className="form-control form-control-sm bg-light text-end fw-bold text-primary">
                                {displayWeight(d!.balanceKg, d!.balanceLbs)}
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
                })}
              </div>
            ) : (
              <div
                className="card-body p-0"
                style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
              >
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
                    {yarn.map((y) => {
                      const yarnIss = issuancesByYarn.get(y.id) || []
                      const isEditing = editingId === y.id && !!draft
                      const d = isEditing ? draft! : null

                      return (
                        <tr
                          key={y.id}
                          className={isEditing ? 'table-primary' : undefined}
                          style={
                            isEditing
                              ? { backgroundColor: '#eef5ff', boxShadow: 'inset 0 0 0 1px #90b8f8' }
                              : undefined
                          }
                        >
                          <td className="px-2">
                            {isEditing ? (
                              <input
                                className="form-control form-control-sm fw-medium"
                                style={{ width: '100%', minWidth: 0 }}
                                value={d!.yarnType}
                                autoFocus
                                onChange={(e) => patchDraftVal('yarnType', e.target.value)}
                              />
                            ) : (
                              <span className="fw-semibold">{y.yarnType}</span>
                            )}
                          </td>
                          <td className="px-1">
                            {isEditing ? (
                              <input
                                type="number"
                                className="form-control form-control-sm text-end"
                                style={{ width: '100%', minWidth: 0 }}
                                value={d!.bags}
                                onChange={(e) => patchDraftVal('bags', e.target.value)}
                              />
                            ) : (
                              <div className="text-end px-1">{y.bags}</div>
                            )}
                          </td>
                          <td className="px-1">
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.5"
                                className="form-control form-control-sm text-end"
                                style={{ width: '100%', minWidth: 0 }}
                                value={unit === 'KG' ? d!.receivedKg : d!.receivedLbs}
                                onChange={(e) => patchDraftVal('received', e.target.value)}
                              />
                            ) : (
                              <div className="text-end px-1 text-success fw-medium">
                                {displayWeight(y.receivedKg, y.receivedLbs)}
                              </div>
                            )}
                          </td>
                          <td className="px-1">
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.5"
                                className="form-control form-control-sm text-end"
                                style={{ width: '100%', minWidth: 0 }}
                                value={unit === 'KG' ? d!.issuedKg : d!.issuedLbs}
                                onChange={(e) => patchDraftVal('issued', e.target.value)}
                              />
                            ) : (
                              <div className="text-end px-1 text-danger fw-medium">
                                {displayWeight(y.issuedKg, y.issuedLbs)}
                              </div>
                            )}
                          </td>
                          <td className="fw-bold text-end pe-2 text-primary">
                            {displayWeight(
                              isEditing ? d!.balanceKg : y.balanceKg,
                              isEditing ? d!.balanceLbs : y.balanceLbs
                            )}
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
                            {isEditing ? (
                              <div className="d-flex align-items-center justify-content-center gap-1">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-success py-0 px-2 d-inline-flex align-items-center gap-1 shadow-sm"
                                  style={{ height: 26, fontSize: '0.78rem' }}
                                  title="Save changes"
                                  onClick={() => saveEdit(y.id)}
                                >
                                  <i className="bi bi-check-lg" />
                                  <span>Save</span>
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary py-0 px-1"
                                  style={{ height: 26, width: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                  title="Cancel"
                                  onClick={cancelEdit}
                                >
                                  <i className="bi bi-x-lg" style={{ fontSize: '0.72rem' }} />
                                </button>
                              </div>
                            ) : (
                              <div className="d-flex align-items-center justify-content-center gap-1">
                                {onIssue && !readOnly && (
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
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary p-0"
                                  style={{
                                    width: 22,
                                    height: 22,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: 4,
                                    opacity: isAdmin && !readOnly ? 0.75 : 0.35,
                                  }}
                                  title={isAdmin ? `Edit ${y.yarnType}` : 'Admin privileges required'}
                                  disabled={!isAdmin || readOnly || (editingId !== null && editingId !== y.id)}
                                  onClick={() => startEdit(y)}
                                >
                                  <i className="bi bi-pencil" style={{ fontSize: '0.68rem' }} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
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
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
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
                      <td colSpan={7} className="py-4 text-center text-muted">
                        <i className="bi bi-inbox fs-4 d-block mb-2" />
                        No movement records found for the selected filters.
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

                      return (
                        <tr key={mov.id}>
                          <td className="px-3 fw-semibold text-dark">
                            <i className="bi bi-calendar3 text-secondary me-1.5" />
                            {mov.date}
                          </td>
                          <td className="px-2">
                            {isInward ? (
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
                            {isInward ? (
                              <span className="badge bg-light text-secondary border px-2 py-1">
                                {mov.lotOrSupplier || 'Warehouse Receipt'}
                              </span>
                            ) : (
                              <span className="badge bg-light text-dark border px-2 py-1">
                                Loom {mov.loomNumber}
                              </span>
                            )}
                          </td>
                          <td className={`px-2 text-end fw-bold ${isInward ? 'text-success' : 'text-danger'}`}>
                            {isInward ? '+' : '-'}
                            {displayWeight(mov.weightKg, mov.weightLbs)} {unit.toLowerCase()}
                          </td>
                          <td className="px-2 text-end fw-semibold text-secondary">
                            {isInward ? (mov.bags ? `${mov.bags} bags` : '—') : `${mov.pick || '—'} picks`}
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
            </div>
          </div>
        )}
      </div>

      {/* Add Yarn Modal */}
      <AddYarnModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={(newYarn, arrival) => onAdd(newYarn, arrival)}
        activeDate={selectedDate}
      />

      {/* Issue Yarn Modal */}
      {issuingYarn && (
        <IssueYarnModal
          isOpen={true}
          yarn={issuingYarn}
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
