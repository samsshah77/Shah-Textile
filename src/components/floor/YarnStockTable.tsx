'use client'

import { useMemo, useState } from 'react'
import { YarnMaster } from '@/services/productionMastersService'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'

const DEFAULT_WIDTHS: Record<string, number> = {
  yarn: 130,
  bags: 72,
  rKg: 100,
  rLbs: 100,
  iKg: 100,
  iLbs: 100,
  bKg: 100,
  bLbs: 100,
}

interface YarnStockTableProps {
  yarn: YarnMaster[]
  onUpdate: (id: string, patch: Partial<YarnMaster>) => void
  onAdd: () => void
  readOnly?: boolean
}

export function YarnStockTable({ yarn, onUpdate, onAdd, readOnly }: YarnStockTableProps) {
  const [mode, setMode] = useState<TableGridMode>('table')
  const { widths, setColumnWidth, resetAllWidths, resetColumnWidth } = useResizableColumns(
    'sara_yarn_col_widths_v1',
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
          <h3 className="card-title mb-0">Yarn Stock</h3>
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center ms-auto">
          <ViewModeToggle mode={mode} onChange={setMode} />
          {mode === 'table' && (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={resetAllWidths}>
              Reset columns
            </button>
          )}
          {!readOnly && (
            <button type="button" className="btn btn-sm btn-primary" onClick={onAdd}>
              Add
            </button>
          )}
        </div>
      </div>

      {mode === 'grid' ? (
        <div className="master-grid">
          {yarn.map((y) => (
            <div key={y.id} className="master-grid-card">
              <input
                className="form-control form-control-sm"
                value={y.yarnType}
                disabled={readOnly}
                placeholder="Yarn Type"
                onChange={(e) => onUpdate(y.id, { yarnType: e.target.value })}
              />
              <input
                type="number"
                className="form-control form-control-sm"
                value={y.bags}
                disabled={readOnly}
                title="Bags"
                placeholder="Bags"
                onChange={(e) => onUpdate(y.id, { bags: Number(e.target.value) || 0 })}
              />
              <div className="d-flex gap-2">
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={y.receivedKg}
                  disabled={readOnly}
                  title="Received Kilograms"
                  placeholder="Received kg"
                  onChange={(e) => onUpdate(y.id, { receivedKg: Number(e.target.value) || 0 })}
                />
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={y.receivedLbs}
                  disabled={readOnly}
                  title="Received Pounds"
                  placeholder="Received lbs"
                  onChange={(e) => onUpdate(y.id, { receivedLbs: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="d-flex gap-2">
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={y.issuedKg}
                  disabled={readOnly}
                  title="Issued Kilograms"
                  placeholder="Issued kg"
                  onChange={(e) => onUpdate(y.id, { issuedKg: Number(e.target.value) || 0 })}
                />
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={y.issuedLbs}
                  disabled={readOnly}
                  title="Issued Pounds"
                  placeholder="Issued lbs"
                  onChange={(e) => onUpdate(y.id, { issuedLbs: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="small">
                Balance: <strong>{y.balanceKg.toFixed(1)}</strong> kilograms ·{' '}
                <strong>{y.balanceLbs.toFixed(1)}</strong> pounds
              </div>
            </div>
          ))}
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
                <ResizableTh columnKey="bags" width={widths.bags} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Bags
                </ResizableTh>
                <ResizableTh columnKey="rKg" width={widths.rKg} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Received Kilograms
                </ResizableTh>
                <ResizableTh columnKey="rLbs" width={widths.rLbs} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Received Pounds
                </ResizableTh>
                <ResizableTh columnKey="iKg" width={widths.iKg} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Issued Kilograms
                </ResizableTh>
                <ResizableTh columnKey="iLbs" width={widths.iLbs} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Issued Pounds
                </ResizableTh>
                <ResizableTh columnKey="bKg" width={widths.bKg} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Balance Kilograms
                </ResizableTh>
                <ResizableTh columnKey="bLbs" width={widths.bLbs} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Balance Pounds
                </ResizableTh>
              </tr>
            </thead>
            <tbody>
              {yarn.map((y) => (
                <tr key={y.id}>
                  <td className="px-1">
                    <input
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={y.yarnType}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(y.id, { yarnType: e.target.value })}
                    />
                  </td>
                  <td className="px-1">
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={y.bags}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(y.id, { bags: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="px-1">
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={y.receivedKg}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(y.id, { receivedKg: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="px-1">
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={y.receivedLbs}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(y.id, { receivedLbs: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="px-1">
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={y.issuedKg}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(y.id, { issuedKg: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="px-1">
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={y.issuedLbs}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(y.id, { issuedLbs: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="fw-semibold text-end pe-3">{y.balanceKg.toFixed(1)}</td>
                  <td className="fw-semibold text-end pe-3">{y.balanceLbs.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card-footer small text-secondary">
        Conversion: 1 kilogram = 2.2046 pounds · kilograms = pounds ÷ 2.2046
      </div>
    </div>
  )
}
