'use client'

import { useMemo, useState } from 'react'
import { DailyLoomProductionEntry } from '@/types/production'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { NumericCellInput, TextCellInput } from '@/components/shared/NumericCellInput'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { loomConditionRowStyle } from '@/constants/loomConditions'

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
}

/** Daily floor punch — table-level Edit; Enter moves to next field. */
export function FloorEntryTable({ entries, onUpdateEntry }: FloorEntryTableProps) {
  const { isAdmin } = useAuth()
  const [mode, setMode] = useState<TableGridMode>('table')
  const [tableEdit, setTableEdit] = useState(false)

  const { widths, setColumnWidth, resetAllWidths, resetColumnWidth } = useResizableColumns(
    'sara_prod_entry_col_widths_v3',
    DEFAULT_WIDTHS
  )

  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  )

  const canEdit = isAdmin && tableEdit

  const patchEntry = (loomNumber: number, patch: Partial<DailyLoomProductionEntry>) => {
    const current = entries.find((e) => e.loomNumber === loomNumber)
    const shiftA = patch.shiftAMeters ?? current?.shiftAMeters ?? 0
    const shiftB = patch.shiftBMeters ?? current?.shiftBMeters ?? 0
    onUpdateEntry(loomNumber, {
      ...patch,
      totalMeters:
        patch.totalMeters ??
        (patch.shiftAMeters !== undefined || patch.shiftBMeters !== undefined
          ? shiftA + shiftB
          : current?.totalMeters),
    })
  }

  const editToggle = (
    <button
      type="button"
      className={`btn btn-sm ${tableEdit ? 'btn-warning' : 'btn-outline-secondary'}`}
      disabled={!isAdmin}
      title={isAdmin ? (tableEdit ? 'Lock table (view only)' : 'Enable editing') : 'Admin only'}
      onClick={() => setTableEdit((v) => !v)}
    >
      <i className={`bi ${tableEdit ? 'bi-lock' : 'bi-pencil-square'} me-1`} />
      {tableEdit ? 'Done' : 'Edit'}
    </button>
  )

  return (
    <div className="card">
      <div className="card-header d-flex flex-row flex-wrap gap-2 justify-content-between align-items-center">
        <div className="min-w-0">
          <h3 className="card-title mb-0">Daily Entry</h3>
          {tableEdit && (
            <div className="small text-warning mt-1 mb-0">
              Edit on — Enter / Tab next field · arrows move cells
            </div>
          )}
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center ms-auto">
          {editToggle}
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
          {entries.map((e, rowIdx) => (
            <div
              key={e.loomNumber}
              className={`master-grid-card${canEdit ? ' sara-edit-card' : ''}`}
              style={canEdit ? undefined : loomConditionRowStyle(e.status, e.remarks)}
            >
              <div className="fw-semibold">Loom Number {e.loomNumber}</div>
              <div className="small text-secondary text-truncate">
                {e.qualityName || '—'} · {e.fabricType || '—'}
              </div>

              <label className="small mb-0">Roller Hours</label>
              {canEdit ? (
                <NumericCellInput
                  className="form-control form-control-sm text-end"
                  value={e.rollerHours ?? 0}
                  navRow={rowIdx}
                  navCol={0}
                  onValueChange={(v) => patchEntry(e.loomNumber, { rollerHours: v })}
                />
              ) : (
                <div className="form-control form-control-sm bg-light text-end">
                  {e.rollerHours ?? 0}
                </div>
              )}

              <div className="d-flex gap-2">
                <div className="flex-fill">
                  <label className="small mb-0">Actual Shift A</label>
                  {canEdit ? (
                    <NumericCellInput
                      className="form-control form-control-sm text-end"
                      value={e.shiftAMeters ?? 0}
                      navRow={rowIdx}
                      navCol={1}
                      onValueChange={(v) => patchEntry(e.loomNumber, { shiftAMeters: v })}
                    />
                  ) : (
                    <div className="form-control form-control-sm bg-light text-end">
                      {(e.shiftAMeters ?? 0).toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="flex-fill">
                  <label className="small mb-0">Actual Shift B</label>
                  {canEdit ? (
                    <NumericCellInput
                      className="form-control form-control-sm text-end"
                      value={e.shiftBMeters ?? 0}
                      navRow={rowIdx}
                      navCol={2}
                      onValueChange={(v) => patchEntry(e.loomNumber, { shiftBMeters: v })}
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
                <strong>{(e.totalMeters ?? 0).toLocaleString()}</strong>
              </div>

              <label className="small mb-0">Remarks</label>
              {canEdit ? (
                <TextCellInput
                  className="form-control form-control-sm"
                  value={e.remarks || ''}
                  placeholder="Remarks"
                  navRow={rowIdx}
                  navCol={3}
                  onValueChange={(v) => patchEntry(e.loomNumber, { remarks: v })}
                />
              ) : (
                <div className="small text-secondary">{e.remarks || '—'}</div>
              )}

              <label className="small mb-0">Lot Number</label>
              {canEdit ? (
                <TextCellInput
                  className="form-control form-control-sm"
                  value={e.lot || ''}
                  placeholder="Lot Number"
                  navRow={rowIdx}
                  navCol={4}
                  onValueChange={(v) => patchEntry(e.loomNumber, { lot: v })}
                />
              ) : (
                <div className="small text-secondary">{e.lot || '—'}</div>
              )}
            </div>
          ))}
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
              </tr>
            </thead>
            <tbody>
              {entries.map((e, rowIdx) => (
                <tr
                  key={e.loomNumber}
                  className={canEdit ? 'sara-edit-row' : undefined}
                  style={canEdit ? undefined : loomConditionRowStyle(e.status, e.remarks)}
                >
                  <td className="fw-semibold px-2">{e.loomNumber}</td>
                  <td className="px-2 text-truncate">{e.qualityName || '—'}</td>
                  <td className="small text-secondary px-2 text-truncate">
                    {e.fabricType || '—'}
                  </td>
                  <td className="px-1">
                    {canEdit ? (
                      <NumericCellInput
                        className="form-control form-control-sm text-end"
                        style={{ width: '100%', minWidth: 0 }}
                        value={e.rollerHours ?? 0}
                        navRow={rowIdx}
                        navCol={0}
                        onValueChange={(v) => patchEntry(e.loomNumber, { rollerHours: v })}
                      />
                    ) : (
                      <div className="text-end px-1">{e.rollerHours ?? 0}</div>
                    )}
                  </td>
                  <td className="px-1">
                    {canEdit ? (
                      <NumericCellInput
                        className="form-control form-control-sm text-end"
                        style={{ width: '100%', minWidth: 0 }}
                        value={e.shiftAMeters ?? 0}
                        navRow={rowIdx}
                        navCol={1}
                        onValueChange={(v) => patchEntry(e.loomNumber, { shiftAMeters: v })}
                      />
                    ) : (
                      <div className="text-end px-1">{(e.shiftAMeters ?? 0).toLocaleString()}</div>
                    )}
                  </td>
                  <td className="px-1">
                    {canEdit ? (
                      <NumericCellInput
                        className="form-control form-control-sm text-end"
                        style={{ width: '100%', minWidth: 0 }}
                        value={e.shiftBMeters ?? 0}
                        navRow={rowIdx}
                        navCol={2}
                        onValueChange={(v) => patchEntry(e.loomNumber, { shiftBMeters: v })}
                      />
                    ) : (
                      <div className="text-end px-1">{(e.shiftBMeters ?? 0).toLocaleString()}</div>
                    )}
                  </td>
                  <td className="text-end fw-semibold px-2">
                    {(e.totalMeters ?? 0).toLocaleString()}
                  </td>
                  <td className="px-1">
                    {canEdit ? (
                      <TextCellInput
                        className="form-control form-control-sm"
                        style={{ width: '100%', minWidth: 0 }}
                        value={e.remarks || ''}
                        placeholder="Beam End, Fault…"
                        navRow={rowIdx}
                        navCol={3}
                        onValueChange={(v) => patchEntry(e.loomNumber, { remarks: v })}
                      />
                    ) : (
                      <div className="px-1 text-truncate" title={e.remarks || ''}>
                        {e.remarks || '—'}
                      </div>
                    )}
                  </td>
                  <td className="px-1">
                    {canEdit ? (
                      <TextCellInput
                        className="form-control form-control-sm"
                        style={{ width: '100%', minWidth: 0 }}
                        value={e.lot || ''}
                        placeholder="Lot Number…"
                        navRow={rowIdx}
                        navCol={4}
                        onValueChange={(v) => patchEntry(e.loomNumber, { lot: v })}
                      />
                    ) : (
                      <div className="px-1 text-truncate" title={e.lot || ''}>
                        {e.lot || '—'}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
