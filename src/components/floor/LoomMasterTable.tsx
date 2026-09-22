'use client'

import { useMemo, useState } from 'react'
import { LoomMaster, QualityMaster, YarnMaster, getDummyLoomImage } from '@/services/productionMastersService'
import { LoomCategory } from '@/types/loom'
import { AvatarImageUpload } from '@/components/shared/AvatarImageUpload'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { LoomStatusSelect } from '@/components/floor/LoomStatusSelect'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { EditLoomModal } from '@/components/floor/EditLoomModal'

const DEFAULT_WIDTHS: Record<string, number> = {
  loom: 72,
  picture: 64,
  name: 150,
  model: 95,
  year: 70,
  rpm: 95,
  shed: 110,
  status: 130,
  actions: 75,
}

interface LoomMasterTableProps {
  looms: LoomMaster[]
  qualities?: QualityMaster[]
  yarn?: YarnMaster[]
  onUpdate: (loomNumber: number, patch: Partial<LoomMaster>) => void
  onAdd: () => void
  readOnly?: boolean
}

export function LoomMasterTable({
  looms,
  onUpdate,
  onAdd,
  readOnly,
}: LoomMasterTableProps) {
  const [mode, setMode] = useState<TableGridMode>('table')
  const [editingLoom, setEditingLoom] = useState<LoomMaster | null>(null)
  const [adminNotice, setAdminNotice] = useState<string | null>(null)
  const { isAdmin } = useAuth()

  const { widths, setColumnWidth, resetColumnWidth } = useResizableColumns(
    'sara_loom_col_widths_v2',
    DEFAULT_WIDTHS
  )
  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  )

  const handleEditClick = (loom: LoomMaster) => {
    if (!isAdmin) {
      setAdminNotice('Only administrators can edit machine configurations.')
      setTimeout(() => setAdminNotice(null), 4000)
      return
    }
    setEditingLoom(loom)
  }

  return (
    <div className="card">
      <div className="card-header d-flex flex-row flex-wrap gap-2 justify-content-between align-items-center">
        <div className="min-w-0">
          <h3 className="card-title mb-0">Looms</h3>
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center ms-auto">
          <ViewModeToggle mode={mode} onChange={setMode} />
          {!readOnly && (
            <button type="button" className="btn btn-sm btn-primary" onClick={onAdd}>
              <i className="bi bi-plus-lg me-1" /> Add
            </button>
          )}
        </div>
      </div>

      {adminNotice && (
        <div className="alert alert-warning py-2 px-3 mx-3 mt-3 mb-0 small d-flex align-items-center justify-content-between">
          <span>
            <i className="bi bi-exclamation-triangle-fill me-1" /> {adminNotice}
          </span>
          <button
            type="button"
            className="btn-close btn-close-sm"
            aria-label="Close"
            onClick={() => setAdminNotice(null)}
          />
        </div>
      )}

      {mode === 'grid' ? (
        <div className="master-grid">
          {looms.map((l) => (
            <div key={l.loomNumber} className="master-grid-card">
              <div className="d-flex align-items-center justify-content-between gap-2 border-bottom pb-2">
                <div className="d-flex align-items-center gap-2">
                  <AvatarImageUpload
                    src={l.pictureDataUrl || getDummyLoomImage(l.loomNumber)}
                    alt={l.name || `Loom ${l.loomNumber}`}
                    size={52}
                    disabled={readOnly}
                    onChange={(dataUrl) => onUpdate(l.loomNumber, { pictureDataUrl: dataUrl })}
                  />
                  <div>
                    <div className="fw-bold">{l.name}</div>
                    <div className="small text-muted">
                      Loom #{l.loomNumber} · <span className="badge bg-secondary-subtle text-secondary">{l.model}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  title="Edit Loom Configuration"
                  disabled={readOnly}
                  onClick={() => handleEditClick(l)}
                >
                  <i className="bi bi-pencil" />
                </button>
              </div>

              <div className="d-flex justify-content-between small text-secondary py-1">
                <span>Year: <strong className="text-dark">{l.year}</strong></span>
                <span>Shed: <strong className="text-dark">{l.shed || 'Main Floor'}</strong></span>
              </div>

              <div>
                <label className="form-label small mb-1 fw-semibold">RPM</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  title="RPM"
                  value={l.defaultRpm}
                  disabled={readOnly}
                  onChange={(e) => onUpdate(l.loomNumber, { defaultRpm: Number(e.target.value) || 0 })}
                />
              </div>

              <div>
                <label className="form-label small mb-1 fw-semibold">Status</label>
                <LoomStatusSelect
                  value={l.status}
                  disabled={readOnly}
                  onChange={(status) => onUpdate(l.loomNumber, { status })}
                />
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
                <ResizableTh columnKey="rpm" width={widths.rpm} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center">
                  RPM
                </ResizableTh>
                <ResizableTh columnKey="shed" width={widths.shed} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Shed
                </ResizableTh>
                <ResizableTh columnKey="status" width={widths.status} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Status
                </ResizableTh>
                <ResizableTh columnKey="actions" width={widths.actions} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-center">
                  Actions
                </ResizableTh>
              </tr>
            </thead>
            <tbody>
              {looms.map((l) => (
                <tr key={l.loomNumber}>
                  <td className="fw-semibold px-2">{l.loomNumber}</td>
                  <td className="px-2 text-center">
                    <AvatarImageUpload
                      src={l.pictureDataUrl || getDummyLoomImage(l.loomNumber)}
                      alt={l.name || `Loom ${l.loomNumber}`}
                      size={40}
                      disabled={readOnly}
                      onChange={(dataUrl) => onUpdate(l.loomNumber, { pictureDataUrl: dataUrl })}
                    />
                  </td>
                  <td className="px-2">
                    <span className="fw-semibold text-dark">{l.name}</span>
                  </td>
                  <td className="px-2">
                    <span className="badge bg-light text-dark border px-2 py-1">{l.model}</span>
                  </td>
                  <td className="px-2 text-secondary">{l.year}</td>
                  <td className="px-1">
                    <input
                      type="number"
                      className="form-control form-control-sm text-end"
                      style={{ width: '100%', minWidth: 0 }}
                      value={l.defaultRpm}
                      disabled={readOnly}
                      onChange={(e) =>
                        onUpdate(l.loomNumber, { defaultRpm: Number(e.target.value) || 0 })
                      }
                    />
                  </td>
                  <td className="px-2 text-secondary">{l.shed || 'Main Floor'}</td>
                  <td className="px-1">
                    <LoomStatusSelect
                      value={l.status}
                      disabled={readOnly}
                      style={{ width: '100%', minWidth: 0 }}
                      onChange={(status) => onUpdate(l.loomNumber, { status })}
                    />
                  </td>
                  <td className="px-1 text-center">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary py-0 px-2"
                      title={isAdmin ? `Edit Loom ${l.loomNumber}` : 'Admin privileges required to edit loom'}
                      disabled={readOnly}
                      onClick={() => handleEditClick(l)}
                    >
                      <i className="bi bi-pencil" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EditLoomModal
        loom={editingLoom}
        isOpen={!!editingLoom}
        onClose={() => setEditingLoom(null)}
        onSave={(loomNum, patch) => onUpdate(loomNum, patch)}
      />
    </div>
  )
}
