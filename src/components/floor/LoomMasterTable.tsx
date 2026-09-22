'use client'

import { useMemo, useState } from 'react'
import { LoomMaster, QualityMaster, YarnMaster } from '@/services/productionMastersService'
import { LoomCategory } from '@/types/loom'
import { AvatarImageUpload } from '@/components/shared/AvatarImageUpload'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { LoomStatusSelect } from '@/components/floor/LoomStatusSelect'
import { useResizableColumns } from '@/hooks/useResizableColumns'

const MODELS: LoomCategory[] = ['G6200', 'G6300', 'PU']

const DEFAULT_WIDTHS: Record<string, number> = {
  loom: 72,
  picture: 64,
  name: 140,
  model: 100,
  year: 72,
  rpm: 88,
  quality: 140,
  weft: 140,
  shed: 100,
  status: 130,
}

interface LoomMasterTableProps {
  looms: LoomMaster[]
  qualities: QualityMaster[]
  yarn: YarnMaster[]
  onUpdate: (loomNumber: number, patch: Partial<LoomMaster>) => void
  onAdd: () => void
  readOnly?: boolean
}

function LoomFields({
  l,
  qualities,
  yarn,
  onUpdate,
  readOnly,
}: {
  l: LoomMaster
  qualities: QualityMaster[]
  yarn: YarnMaster[]
  onUpdate: LoomMasterTableProps['onUpdate']
  readOnly?: boolean
}) {
  return (
    <>
      <input
        className="form-control form-control-sm"
        value={l.name}
        disabled={readOnly}
        placeholder="Machine Name"
        onChange={(e) => onUpdate(l.loomNumber, { name: e.target.value })}
      />
      <select
        className="form-select form-select-sm"
        value={l.model}
        disabled={readOnly}
        onChange={(e) => onUpdate(l.loomNumber, { model: e.target.value as LoomCategory })}
      >
        {MODELS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <input
        type="number"
        className="form-control form-control-sm"
        value={l.year}
        disabled={readOnly}
        title="Year"
        onChange={(e) => onUpdate(l.loomNumber, { year: Number(e.target.value) || 0 })}
      />
      <input
        type="number"
        className="form-control form-control-sm"
        title="Revolutions Per Minute"
        value={l.defaultRpm}
        disabled={readOnly}
        onChange={(e) => onUpdate(l.loomNumber, { defaultRpm: Number(e.target.value) || 0 })}
      />
      <select
        className="form-select form-select-sm"
        value={l.qualityId || ''}
        disabled={readOnly}
        onChange={(e) => onUpdate(l.loomNumber, { qualityId: e.target.value || null })}
      >
        <option value="">Quality —</option>
        {qualities.map((q) => (
          <option key={q.id} value={q.id}>
            {q.name}
          </option>
        ))}
      </select>
      <select
        className="form-select form-select-sm"
        value={l.weftYarnId || ''}
        disabled={readOnly}
        onChange={(e) => onUpdate(l.loomNumber, { weftYarnId: e.target.value || null })}
      >
        <option value="">Weft Yarn —</option>
        {yarn.map((y) => (
          <option key={y.id} value={y.id}>
            {y.yarnType}
          </option>
        ))}
      </select>
      <input
        className="form-control form-control-sm"
        value={l.shed}
        disabled={readOnly}
        placeholder="Shed"
        onChange={(e) => onUpdate(l.loomNumber, { shed: e.target.value })}
      />
      <LoomStatusSelect
        value={l.status}
        disabled={readOnly}
        onChange={(status) => onUpdate(l.loomNumber, { status })}
      />
    </>
  )
}

export function LoomMasterTable({
  looms,
  qualities,
  yarn,
  onUpdate,
  onAdd,
  readOnly,
}: LoomMasterTableProps) {
  const [mode, setMode] = useState<TableGridMode>('table')
  const { widths, setColumnWidth, resetAllWidths, resetColumnWidth } = useResizableColumns(
    'sara_loom_col_widths_v1',
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
          <h3 className="card-title mb-0">Looms</h3>
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
          {looms.map((l) => (
            <div key={l.loomNumber} className="master-grid-card">
              <div className="d-flex align-items-center gap-3">
                <AvatarImageUpload
                  src={l.pictureDataUrl}
                  alt={l.name || `Loom ${l.loomNumber}`}
                  size={64}
                  disabled={readOnly}
                  onChange={(dataUrl) => onUpdate(l.loomNumber, { pictureDataUrl: dataUrl })}
                />
                <div>
                  <div className="fw-semibold">Loom Number {l.loomNumber}</div>
                </div>
              </div>
              <LoomFields
                l={l}
                qualities={qualities}
                yarn={yarn}
                onUpdate={onUpdate}
                readOnly={readOnly}
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
                <ResizableTh columnKey="loom" width={widths.loom} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Loom Number
                </ResizableTh>
                <ResizableTh columnKey="picture" width={widths.picture} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-center">
                  Picture
                </ResizableTh>
                <ResizableTh columnKey="name" width={widths.name} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Machine Name
                </ResizableTh>
                <ResizableTh columnKey="model" width={widths.model} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Model
                </ResizableTh>
                <ResizableTh columnKey="year" width={widths.year} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Year
                </ResizableTh>
                <ResizableTh columnKey="rpm" width={widths.rpm} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
                  style={{ whiteSpace: 'normal', fontSize: '0.72rem' }}>
                  Revolutions Per Minute
                </ResizableTh>
                <ResizableTh columnKey="quality" width={widths.quality} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Quality Name
                </ResizableTh>
                <ResizableTh columnKey="weft" width={widths.weft} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Weft Yarn
                </ResizableTh>
                <ResizableTh columnKey="shed" width={widths.shed} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Shed
                </ResizableTh>
                <ResizableTh columnKey="status" width={widths.status} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Status
                </ResizableTh>
              </tr>
            </thead>
            <tbody>
              {looms.map((l) => (
                <tr key={l.loomNumber}>
                  <td className="fw-semibold px-2">{l.loomNumber}</td>
                  <td className="px-2 text-center">
                    <AvatarImageUpload
                      src={l.pictureDataUrl}
                      alt={l.name || `Loom ${l.loomNumber}`}
                      size={40}
                      disabled={readOnly}
                      onChange={(dataUrl) => onUpdate(l.loomNumber, { pictureDataUrl: dataUrl })}
                    />
                  </td>
                  <td className="px-1">
                    <input
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={l.name}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(l.loomNumber, { name: e.target.value })}
                    />
                  </td>
                  <td className="px-1">
                    <select
                      className="form-select form-select-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={l.model}
                      disabled={readOnly}
                      onChange={(e) =>
                        onUpdate(l.loomNumber, { model: e.target.value as LoomCategory })
                      }
                    >
                      {MODELS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1">
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={l.year}
                      disabled={readOnly}
                      onChange={(e) =>
                        onUpdate(l.loomNumber, { year: Number(e.target.value) || 0 })
                      }
                    />
                  </td>
                  <td className="px-1">
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={l.defaultRpm}
                      disabled={readOnly}
                      onChange={(e) =>
                        onUpdate(l.loomNumber, { defaultRpm: Number(e.target.value) || 0 })
                      }
                    />
                  </td>
                  <td className="px-1">
                    <select
                      className="form-select form-select-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={l.qualityId || ''}
                      disabled={readOnly}
                      onChange={(e) =>
                        onUpdate(l.loomNumber, { qualityId: e.target.value || null })
                      }
                    >
                      <option value="">—</option>
                      {qualities.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1">
                    <select
                      className="form-select form-select-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={l.weftYarnId || ''}
                      disabled={readOnly}
                      onChange={(e) =>
                        onUpdate(l.loomNumber, { weftYarnId: e.target.value || null })
                      }
                    >
                      <option value="">—</option>
                      {yarn.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.yarnType}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1">
                    <input
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={l.shed}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(l.loomNumber, { shed: e.target.value })}
                    />
                  </td>
                  <td className="px-1">
                    <LoomStatusSelect
                      value={l.status}
                      disabled={readOnly}
                      style={{ width: '100%', minWidth: 0 }}
                      onChange={(status) => onUpdate(l.loomNumber, { status })}
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
