'use client'

import { useMemo, useState } from 'react'
import { DailyLoomProductionEntry } from '@/types/production'
import type { LoomStatus } from '@/types/loom'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { NumericCellInput } from '@/components/shared/NumericCellInput'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import {
  LOOM_STATUSES,
  LOOM_STATUS_LABEL,
  loomConditionRowStyle,
  resolveLoomCondition,
} from '@/constants/loomConditions'

interface FloorEntryTableProps {
  entries: DailyLoomProductionEntry[]
  onUpdateEntry: (loomNumber: number, patch: Partial<DailyLoomProductionEntry>) => void
  canEdit?: boolean
}

const DEFAULT_WIDTHS: Record<string, number> = {
  loom: 72,
  quality: 120,
  type: 100,
  roller: 88,
  shiftA: 88,
  shiftB: 88,
  totalAB: 94,
  remarks: 150,
  lot: 130,
  actions: 80,
}

interface DraftRow {
  rollerHours: number
  shiftAMeters: number
  shiftBMeters: number
  remarks: string
  lot: string
  status?: LoomStatus
}

/** Daily floor punch: Roller Hours, Actual A/B, Remarks, Lot with row-by-row editing. */
export function FloorEntryTable({ entries, onUpdateEntry }: FloorEntryTableProps) {
  const { isAdmin } = useAuth()
  const [mode, setMode] = useState<TableGridMode>('table')
  const [editingLoomNumber, setEditingLoomNumber] = useState<number | null>(null)
  const [draft, setDraft] = useState<DraftRow | null>(null)

  const { widths, setColumnWidth, resetAllWidths, resetColumnWidth } = useResizableColumns(
    'sara_prod_entry_col_widths_v2',
    DEFAULT_WIDTHS
  )

  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  )

  const startEdit = (e: DailyLoomProductionEntry) => {
    if (!isAdmin) return
    setEditingLoomNumber(e.loomNumber)
    setDraft({
      rollerHours: e.rollerHours ?? 0,
      shiftAMeters: e.shiftAMeters ?? 0,
      shiftBMeters: e.shiftBMeters ?? 0,
      remarks: e.remarks || '',
      lot: e.lot || '',
      status: e.status,
    })
  }

  const cancelEdit = () => {
    setEditingLoomNumber(null)
    setDraft(null)
  }

  const saveEdit = (loomNumber: number) => {
    if (!draft) return
    const totalMeters = (draft.shiftAMeters ?? 0) + (draft.shiftBMeters ?? 0)
    onUpdateEntry(loomNumber, {
      rollerHours: draft.rollerHours,
      shiftAMeters: draft.shiftAMeters,
      shiftBMeters: draft.shiftBMeters,
      totalMeters,
      remarks: draft.remarks,
      lot: draft.lot,
      ...(draft.status ? { status: draft.status } : {}),
    })
    setEditingLoomNumber(null)
    setDraft(null)
  }

  const patchDraft = (patch: Partial<DraftRow>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : null))
  }

  return (
    <div className="card">
      <div className="card-header d-flex flex-row flex-wrap gap-2 justify-content-between align-items-center">
        <div className="min-w-0">
          <h3 className="card-title mb-0">Daily Entry</h3>
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center ms-auto">
          <ViewModeToggle mode={mode} onChange={setMode} />
          {mode === 'table' && (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={resetAllWidths}>
              Reset columns
            </button>
          )}
        </div>
      </div>

      {mode === 'grid' ? (
        <div className="master-grid">
          {entries.map((e, rowIdx) => {
            const isEditing = editingLoomNumber === e.loomNumber && !!draft
            const d = isEditing ? draft! : null
            return (
              <div
                key={e.loomNumber}
                className={`master-grid-card ${isEditing ? 'border border-primary shadow-sm' : ''}`}
                style={
                  isEditing
                    ? { backgroundColor: '#eef5ff' }
                    : loomConditionRowStyle(e.status, e.remarks)
                }
              >
                <div className="d-flex align-items-center justify-content-between">
                  <div className="fw-semibold">Loom Number {e.loomNumber}</div>
                  {isEditing ? (
                    <div className="d-flex align-items-center gap-1">
                      <button
                        type="button"
                        className="btn btn-sm btn-success py-0 px-2 d-inline-flex align-items-center gap-1 shadow-sm"
                        style={{ height: 26, fontSize: '0.78rem' }}
                        title="Save changes"
                        onClick={() => saveEdit(e.loomNumber)}
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
                        opacity: isAdmin ? 0.75 : 0.35,
                      }}
                      title={isAdmin ? `Edit Loom ${e.loomNumber}` : 'Admin privileges required'}
                      disabled={!isAdmin || (editingLoomNumber !== null && editingLoomNumber !== e.loomNumber)}
                      onClick={() => startEdit(e)}
                    >
                      <i className="bi bi-pencil" style={{ fontSize: '0.68rem' }} />
                    </button>
                  )}
                </div>

                <div className="small text-secondary text-truncate">
                  {e.qualityName || '—'} · {e.fabricType || '—'}
                </div>

                <label className="small mb-0">Roller Hours</label>
                {isEditing ? (
                  <NumericCellInput
                    className="form-control form-control-sm text-end"
                    value={d!.rollerHours}
                    navRow={rowIdx}
                    navCol={0}
                    onValueChange={(v) => patchDraft({ rollerHours: v })}
                  />
                ) : (
                  <div className="form-control form-control-sm bg-light text-end">
                    {e.rollerHours ?? 0}
                  </div>
                )}

                <div className="d-flex gap-2">
                  <div className="flex-fill">
                    <label className="small mb-0">Actual Shift A</label>
                    {isEditing ? (
                      <NumericCellInput
                        className="form-control form-control-sm text-end"
                        value={d!.shiftAMeters}
                        navRow={rowIdx}
                        navCol={1}
                        onValueChange={(v) => patchDraft({ shiftAMeters: v })}
                      />
                    ) : (
                      <div className="form-control form-control-sm bg-light text-end">
                        {(e.shiftAMeters ?? 0).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="flex-fill">
                    <label className="small mb-0">Actual Shift B</label>
                    {isEditing ? (
                      <NumericCellInput
                        className="form-control form-control-sm text-end"
                        value={d!.shiftBMeters}
                        navRow={rowIdx}
                        navCol={2}
                        onValueChange={(v) => patchDraft({ shiftBMeters: v })}
                      />
                    ) : (
                      <div className="form-control form-control-sm bg-light text-end">
                        {(e.shiftBMeters ?? 0).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>

                <div className="small">
                  Actual Total (A Plus B):{' '}
                  <strong>
                    {isEditing
                      ? ((d!.shiftAMeters || 0) + (d!.shiftBMeters || 0)).toLocaleString()
                      : (e.totalMeters ?? 0).toLocaleString()}
                  </strong>
                </div>

                <label className="small mb-0">Remarks</label>
                {isEditing ? (
                  <input
                    className="form-control form-control-sm"
                    value={d!.remarks}
                    placeholder="Remarks"
                    onChange={(ev) => patchDraft({ remarks: ev.target.value })}
                  />
                ) : (
                  <div className="small text-secondary">{e.remarks || '—'}</div>
                )}

                <label className="small mb-0">Lot Number</label>
                {isEditing ? (
                  <input
                    className="form-control form-control-sm"
                    value={d!.lot}
                    placeholder="Lot Number"
                    onChange={(ev) => patchDraft({ lot: ev.target.value })}
                  />
                ) : (
                  <div className="small text-secondary">{e.lot || '—'}</div>
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
            className="table table-sm table-bordered table-hover mb-0 align-middle text-nowrap"
            style={{ tableLayout: 'fixed', width: tableMinWidth, minWidth: tableMinWidth }}
          >
            <colgroup>
              {Object.keys(DEFAULT_WIDTHS).map((key) => (
                <col key={key} style={{ width: widths[key] }} />
              ))}
            </colgroup>
            <thead className="table-light">
              <tr>
                <ResizableTh columnKey="loom" width={widths.loom} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Loom Number
                </ResizableTh>
                <ResizableTh columnKey="quality" width={widths.quality} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Quality Name
                </ResizableTh>
                <ResizableTh columnKey="type" width={widths.type} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Fabric Type
                </ResizableTh>
                <ResizableTh columnKey="roller" width={widths.roller} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
                  style={{ whiteSpace: 'normal', fontSize: '0.75rem' }}>
                  Roller Hours
                </ResizableTh>
                <ResizableTh columnKey="shiftA" width={widths.shiftA} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
                  style={{ whiteSpace: 'normal', fontSize: '0.75rem' }}>
                  Actual Shift A
                </ResizableTh>
                <ResizableTh columnKey="shiftB" width={widths.shiftB} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
                  style={{ whiteSpace: 'normal', fontSize: '0.75rem' }}>
                  Actual Shift B
                </ResizableTh>
                <ResizableTh columnKey="totalAB" width={widths.totalAB} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
                  style={{ whiteSpace: 'normal', fontSize: '0.75rem' }}>
                  Actual Total (A Plus B)
                </ResizableTh>
                <ResizableTh columnKey="remarks" width={widths.remarks} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Remarks
                </ResizableTh>
                <ResizableTh columnKey="lot" width={widths.lot} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Lot Number
                </ResizableTh>
                <ResizableTh columnKey="actions" width={widths.actions} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
                  style={{ fontSize: '0.75rem' }}>
                  Action
                </ResizableTh>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, rowIdx) => {
                const isEditing = editingLoomNumber === e.loomNumber && !!draft
                const d = isEditing ? draft! : null
                const totalLive = isEditing
                  ? (d!.shiftAMeters || 0) + (d!.shiftBMeters || 0)
                  : e.totalMeters ?? 0

                return (
                  <tr
                    key={e.loomNumber}
                    className={isEditing ? 'table-primary' : undefined}
                    style={
                      isEditing
                        ? { backgroundColor: '#eef5ff', boxShadow: 'inset 0 0 0 1px #90b8f8' }
                        : loomConditionRowStyle(e.status, e.remarks)
                    }
                  >
                    <td className="fw-semibold px-2">{e.loomNumber}</td>
                    <td className="px-2 text-truncate">{e.qualityName || '—'}</td>
                    <td className="small text-secondary px-2 text-truncate">
                      {e.fabricType || '—'}
                    </td>
                    <td className="px-1">
                      {isEditing ? (
                        <NumericCellInput
                          className="form-control form-control-sm text-end"
                          style={{ width: '100%', minWidth: 0 }}
                          value={d!.rollerHours}
                          navRow={rowIdx}
                          navCol={0}
                          autoFocus
                          onValueChange={(v) => patchDraft({ rollerHours: v })}
                        />
                      ) : (
                        <div className="text-end px-1">{e.rollerHours ?? 0}</div>
                      )}
                    </td>
                    <td className="px-1">
                      {isEditing ? (
                        <NumericCellInput
                          className="form-control form-control-sm text-end"
                          style={{ width: '100%', minWidth: 0 }}
                          value={d!.shiftAMeters}
                          navRow={rowIdx}
                          navCol={1}
                          onValueChange={(v) => patchDraft({ shiftAMeters: v })}
                        />
                      ) : (
                        <div className="text-end px-1">{(e.shiftAMeters ?? 0).toLocaleString()}</div>
                      )}
                    </td>
                    <td className="px-1">
                      {isEditing ? (
                        <NumericCellInput
                          className="form-control form-control-sm text-end"
                          style={{ width: '100%', minWidth: 0 }}
                          value={d!.shiftBMeters}
                          navRow={rowIdx}
                          navCol={2}
                          onValueChange={(v) => patchDraft({ shiftBMeters: v })}
                        />
                      ) : (
                        <div className="text-end px-1">{(e.shiftBMeters ?? 0).toLocaleString()}</div>
                      )}
                    </td>
                    <td className="text-end fw-semibold px-2">
                      <span className={isEditing ? 'text-primary fw-bold' : ''}>
                        {totalLive.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-1">
                      {isEditing ? (
                        <input
                          className="form-control form-control-sm"
                          style={{ width: '100%', minWidth: 0 }}
                          value={d!.remarks}
                          placeholder="Beam End, Fault…"
                          data-nav-row={rowIdx}
                          data-nav-col={3}
                          onChange={(ev) => patchDraft({ remarks: ev.target.value })}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') saveEdit(e.loomNumber)
                            if (ev.key === 'Escape') cancelEdit()
                          }}
                        />
                      ) : (
                        <div className="px-1 text-truncate" title={e.remarks || ''}>
                          {e.remarks || '—'}
                        </div>
                      )}
                    </td>
                    <td className="px-1">
                      {isEditing ? (
                        <input
                          className="form-control form-control-sm"
                          style={{ width: '100%', minWidth: 0 }}
                          value={d!.lot}
                          placeholder="Lot Number…"
                          data-nav-row={rowIdx}
                          data-nav-col={4}
                          onChange={(ev) => patchDraft({ lot: ev.target.value })}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') saveEdit(e.loomNumber)
                            if (ev.key === 'Escape') cancelEdit()
                          }}
                        />
                      ) : (
                        <div className="px-1 text-truncate" title={e.lot || ''}>
                          {e.lot || '—'}
                        </div>
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
                            onClick={() => saveEdit(e.loomNumber)}
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
                        <div className="d-flex align-items-center justify-content-center">
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
                              opacity: isAdmin ? 0.75 : 0.35,
                            }}
                            title={isAdmin ? `Edit Loom ${e.loomNumber}` : 'Admin privileges required'}
                            disabled={!isAdmin || (editingLoomNumber !== null && editingLoomNumber !== e.loomNumber)}
                            onClick={() => startEdit(e)}
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
    </div>
  )
}
