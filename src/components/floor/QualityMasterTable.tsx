'use client'

import { useMemo, useState } from 'react'
import { QualityMaster } from '@/services/productionMastersService'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'

const DEFAULT_WIDTHS: Record<string, number> = {
  name: 140,
  type: 120,
  warp: 120,
  weft: 120,
  reed: 72,
  pick: 72,
  width: 72,
  gsm: 100,
}

interface QualityMasterTableProps {
  qualities: QualityMaster[]
  onUpdate: (id: string, patch: Partial<QualityMaster>) => void
  onAdd: () => void
  readOnly?: boolean
}

export function QualityMasterTable({
  qualities,
  onUpdate,
  onAdd,
  readOnly,
}: QualityMasterTableProps) {
  const [mode, setMode] = useState<TableGridMode>('table')
  const { widths, setColumnWidth, resetAllWidths, resetColumnWidth } = useResizableColumns(
    'sara_quality_col_widths_v1',
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
          <h3 className="card-title mb-0">Quality</h3>
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
          {qualities.map((q) => (
            <div key={q.id} className="master-grid-card">
              <input
                className="form-control form-control-sm"
                value={q.name}
                disabled={readOnly}
                placeholder="Quality Name"
                onChange={(e) => onUpdate(q.id, { name: e.target.value })}
              />
              <input
                className="form-control form-control-sm"
                value={q.fabricType}
                disabled={readOnly}
                placeholder="Fabric Type"
                onChange={(e) => onUpdate(q.id, { fabricType: e.target.value })}
              />
              <input
                className="form-control form-control-sm"
                value={q.warpYarn}
                disabled={readOnly}
                placeholder="Warp Yarn"
                onChange={(e) => onUpdate(q.id, { warpYarn: e.target.value })}
              />
              <input
                className="form-control form-control-sm"
                value={q.weftYarn}
                disabled={readOnly}
                placeholder="Weft Yarn"
                onChange={(e) => onUpdate(q.id, { weftYarn: e.target.value })}
              />
              <div className="d-flex gap-2">
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={q.reed}
                  disabled={readOnly}
                  title="Reed"
                  onChange={(e) => onUpdate(q.id, { reed: Number(e.target.value) || 0 })}
                />
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={q.pick}
                  disabled={readOnly}
                  title="Pick"
                  onChange={(e) => onUpdate(q.id, { pick: Number(e.target.value) || 0 })}
                />
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={q.widthInch}
                  disabled={readOnly}
                  title="Width"
                  onChange={(e) => onUpdate(q.id, { widthInch: Number(e.target.value) || 0 })}
                />
              </div>
              <input
                type="number"
                step="0.01"
                className="form-control form-control-sm"
                value={q.gsm ?? 0}
                disabled={readOnly}
                title="Grams Per Square Meter"
                placeholder="Grams Per Square Meter"
                onChange={(e) => onUpdate(q.id, { gsm: Number(e.target.value) || 0 })}
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
                <ResizableTh columnKey="name" width={widths.name} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Quality Name
                </ResizableTh>
                <ResizableTh columnKey="type" width={widths.type} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Fabric Type
                </ResizableTh>
                <ResizableTh columnKey="warp" width={widths.warp} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Warp Yarn
                </ResizableTh>
                <ResizableTh columnKey="weft" width={widths.weft} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Weft Yarn
                </ResizableTh>
                <ResizableTh columnKey="reed" width={widths.reed} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Reed
                </ResizableTh>
                <ResizableTh columnKey="pick" width={widths.pick} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Pick
                </ResizableTh>
                <ResizableTh columnKey="width" width={widths.width} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Width
                </ResizableTh>
                <ResizableTh columnKey="gsm" width={widths.gsm} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
                  style={{ whiteSpace: 'normal', fontSize: '0.72rem' }}>
                  Grams Per Square Meter
                </ResizableTh>
              </tr>
            </thead>
            <tbody>
              {qualities.map((q) => (
                <tr key={q.id}>
                  <td className="px-1">
                    <input
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={q.name}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(q.id, { name: e.target.value })}
                    />
                  </td>
                  <td className="px-1">
                    <input
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={q.fabricType}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(q.id, { fabricType: e.target.value })}
                    />
                  </td>
                  <td className="px-1">
                    <input
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={q.warpYarn}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(q.id, { warpYarn: e.target.value })}
                    />
                  </td>
                  <td className="px-1">
                    <input
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={q.weftYarn}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(q.id, { weftYarn: e.target.value })}
                    />
                  </td>
                  <td className="px-1">
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={q.reed}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(q.id, { reed: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="px-1">
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={q.pick}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(q.id, { pick: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="px-1">
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={q.widthInch}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(q.id, { widthInch: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="px-1">
                    <input
                      type="number"
                      step="0.01"
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={q.gsm ?? 0}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(q.id, { gsm: Number(e.target.value) || 0 })}
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
