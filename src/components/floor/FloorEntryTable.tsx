'use client'

import { useMemo, useState } from 'react'
import { DailyLoomProductionEntry } from '@/types/production'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { NumericCellInput } from '@/components/shared/NumericCellInput'
import { useResizableColumns } from '@/hooks/useResizableColumns'

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
  totalAB: 88,
  remarks: 160,
  lot: 140,
}

/** Daily floor punch: Roller Hours, Actual A/B, Remarks, Lot. Sheet calcs stay on Production Sheet. */
export function FloorEntryTable({ entries, onUpdateEntry, canEdit }: FloorEntryTableProps) {
  const [mode, setMode] = useState<TableGridMode>('table')
  const { widths, setColumnWidth, resetAllWidths, resetColumnWidth } = useResizableColumns(
    'sara_prod_entry_col_widths_v1',
    DEFAULT_WIDTHS
  )

  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  )

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
          {entries.map((e, rowIdx) => (
            <div key={e.loomNumber} className="master-grid-card">
              <div className="fw-semibold">Loom Number {e.loomNumber}</div>
              <div className="small text-secondary text-truncate">
                {e.qualityName || '—'} · {e.fabricType || '—'}
              </div>
              <label className="small mb-0">Roller Hours</label>
              <NumericCellInput
                className="form-control form-control-sm"
                value={e.rollerHours ?? 0}
                disabled={!canEdit}
                navRow={rowIdx}
                navCol={0}
                onValueChange={(v) => onUpdateEntry(e.loomNumber, { rollerHours: v })}
              />
              <div className="d-flex gap-2">
                <div className="flex-fill">
                  <label className="small mb-0">Actual Shift A</label>
                  <NumericCellInput
                    className="form-control form-control-sm"
                    value={e.shiftAMeters ?? 0}
                    disabled={!canEdit}
                    navRow={rowIdx}
                    navCol={1}
                    onValueChange={(v) => onUpdateEntry(e.loomNumber, { shiftAMeters: v })}
                  />
                </div>
                <div className="flex-fill">
                  <label className="small mb-0">Actual Shift B</label>
                  <NumericCellInput
                    className="form-control form-control-sm"
                    value={e.shiftBMeters ?? 0}
                    disabled={!canEdit}
                    navRow={rowIdx}
                    navCol={2}
                    onValueChange={(v) => onUpdateEntry(e.loomNumber, { shiftBMeters: v })}
                  />
                </div>
              </div>
              <div className="small">
                Actual Total (A Plus B): <strong>{(e.totalMeters ?? 0).toLocaleString()}</strong>
              </div>
              <input
                className="form-control form-control-sm"
                value={e.remarks || ''}
                disabled={!canEdit}
                placeholder="Remarks"
                onChange={(ev) => onUpdateEntry(e.loomNumber, { remarks: ev.target.value })}
              />
              <input
                className="form-control form-control-sm"
                value={e.lot || ''}
                disabled={!canEdit}
                placeholder="Lot Number"
                onChange={(ev) => onUpdateEntry(e.loomNumber, { lot: ev.target.value })}
              />
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
                <tr key={e.loomNumber}>
                  <td className="fw-semibold px-2">{e.loomNumber}</td>
                  <td className="px-2 text-truncate">{e.qualityName || '—'}</td>
                  <td className="small text-secondary px-2 text-truncate">
                    {e.fabricType || '—'}
                  </td>
                  <td className="px-1">
                    <NumericCellInput
                      className="form-control form-control-sm text-end"
                      style={{ width: '100%', minWidth: 0 }}
                      value={e.rollerHours ?? 0}
                      disabled={!canEdit}
                      navRow={rowIdx}
                      navCol={0}
                      onValueChange={(v) => onUpdateEntry(e.loomNumber, { rollerHours: v })}
                    />
                  </td>
                  <td className="px-1">
                    <NumericCellInput
                      className="form-control form-control-sm text-end"
                      style={{ width: '100%', minWidth: 0 }}
                      value={e.shiftAMeters ?? 0}
                      disabled={!canEdit}
                      navRow={rowIdx}
                      navCol={1}
                      onValueChange={(v) => onUpdateEntry(e.loomNumber, { shiftAMeters: v })}
                    />
                  </td>
                  <td className="px-1">
                    <NumericCellInput
                      className="form-control form-control-sm text-end"
                      style={{ width: '100%', minWidth: 0 }}
                      value={e.shiftBMeters ?? 0}
                      disabled={!canEdit}
                      navRow={rowIdx}
                      navCol={2}
                      onValueChange={(v) => onUpdateEntry(e.loomNumber, { shiftBMeters: v })}
                    />
                  </td>
                  <td className="text-end fw-semibold px-2">
                    {(e.totalMeters ?? 0).toLocaleString()}
                  </td>
                  <td className="px-1">
                    <input
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={e.remarks || ''}
                      disabled={!canEdit}
                      placeholder="Beam End, Electric Fault…"
                      data-nav-row={rowIdx}
                      data-nav-col={3}
                      onChange={(ev) =>
                        onUpdateEntry(e.loomNumber, { remarks: ev.target.value })
                      }
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') {
                          ev.preventDefault()
                          const next = document.querySelector<HTMLElement>(
                            `[data-nav-row="${rowIdx + 1}"][data-nav-col="3"]`
                          )
                          next?.focus()
                        }
                      }}
                    />
                  </td>
                  <td className="px-1">
                    <input
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={e.lot || ''}
                      disabled={!canEdit}
                      placeholder="Lot Number…"
                      data-nav-row={rowIdx}
                      data-nav-col={4}
                      onChange={(ev) => onUpdateEntry(e.loomNumber, { lot: ev.target.value })}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') {
                          ev.preventDefault()
                          const next = document.querySelector<HTMLElement>(
                            `[data-nav-row="${rowIdx + 1}"][data-nav-col="4"]`
                          )
                          next?.focus()
                        }
                      }}
                    />
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
