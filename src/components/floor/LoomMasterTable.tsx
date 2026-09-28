'use client'

import { useMemo, useState } from 'react'
import {
  LoomMaster,
  YarnMaster,
  getLoomPictures,
  normalizeLoomPictures,
} from '@/services/productionMastersService'
import { LoomCategory } from '@/types/loom'
import { LoomPictureThumb } from '@/components/floor/LoomPictureThumb'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { NumericCellInput, TextCellInput } from '@/components/shared/NumericCellInput'
import { LoomStatusSelect } from '@/components/floor/LoomStatusSelect'
import { AddLoomModal } from '@/components/floor/AddLoomModal'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { useAlertDialog } from '@/context/AlertDialogContext'

const MODELS: LoomCategory[] = ['G6200', 'G6300', 'PU']

const DEFAULT_WIDTHS: Record<string, number> = {
  loom: 72,
  picture: 72,
  name: 150,
  model: 95,
  year: 70,
  rpm: 95,
  shed: 110,
  status: 130,
}

interface LoomMasterTableProps {
  looms: LoomMaster[]
  yarn?: YarnMaster[]
  onUpdate: (loomNumber: number, patch: Partial<LoomMaster>) => void
  onAdd: (partial?: Partial<LoomMaster>) => void
  onDelete?: (loomNumber: number) => void
  readOnly?: boolean
}

export function LoomMasterTable({
  looms,
  onUpdate,
  onAdd,
  onDelete,
  readOnly,
}: LoomMasterTableProps) {
  const [mode, setMode] = useState<TableGridMode>('table')
  const [modelFilter, setModelFilter] = useState<'ALL' | LoomCategory>('ALL')
  const [tableEdit, setTableEdit] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const { canEditProduction } = useAuth()
  const { showConfirm } = useAlertDialog()
  const opsEdit = canEditProduction && !readOnly && tableEdit && mode === 'table'
  const masterEdit = canEditProduction && !readOnly && tableEdit && mode === 'grid'
  const editActive = opsEdit || masterEdit

  const { widths, setColumnWidth, resetColumnWidth } = useResizableColumns(
    'sara_loom_col_widths_v5',
    DEFAULT_WIDTHS
  )
  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  )

  const filteredLooms = useMemo(() => {
    if (modelFilter === 'ALL') return looms
    return looms.filter((l) => (l.model || l.category) === modelFilter)
  }, [looms, modelFilter])

  const canManagePics = canEditProduction && !readOnly

  const applyLoomPictures = (loom: LoomMaster, urls: string[]) => {
    const pics = normalizeLoomPictures({
      loomNumber: loom.loomNumber,
      pictureDataUrls: urls,
    })
    onUpdate(loom.loomNumber, pics)
  }

  const editToggle =
    canEditProduction && !readOnly ? (
      <button
        type="button"
        className={`btn btn-sm ${tableEdit ? 'btn-warning' : 'btn-outline-secondary'}`}
        title={tableEdit ? 'Lock table (view only)' : 'Enable editing'}
        onClick={() => setTableEdit((v) => !v)}
      >
        <i className={`bi ${tableEdit ? 'bi-lock' : 'bi-pencil-square'} me-1`} />
        {tableEdit ? 'Done' : 'Edit'}
      </button>
    ) : null

  const nextLoomNumber = useMemo(
    () => looms.reduce((m, l) => Math.max(m, l.loomNumber), 0) + 1,
    [looms]
  )

  const handleDeleteLoom = (l: LoomMaster) => {
    if (!masterEdit || !onDelete) return
    showConfirm({
      title: 'Loom Delete Karein?',
      message: `Kya aap waqai "${l.name || `Loom ${l.loomNumber}`}" (Loom #${l.loomNumber}) ko delete karna chahte hain?`,
      type: 'confirm',
      confirmText: 'Haan, Delete Karein',
      cancelText: 'Cancel',
      onConfirm: () => onDelete(l.loomNumber),
    })
  }

  return (
    <div className="card">
      <div className="card-header d-flex flex-row flex-wrap gap-2 justify-content-between align-items-center">
        <div className="min-w-0">
          <h3 className="card-title mb-0">Looms</h3>
          {tableEdit && (
            <div className="small text-warning mt-1 mb-0">
              {mode === 'table'
                ? 'Table edit — sirf RPM, Quality, Status'
                : 'Grid edit — full master fields + Delete'}
            </div>
          )}
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center ms-auto">
          {editToggle}
          <select
            className="form-select form-select-sm"
            style={{ width: 'auto', minWidth: 120 }}
            value={modelFilter}
            title="Filter by model"
            onChange={(e) => setModelFilter(e.target.value as 'ALL' | LoomCategory)}
          >
            <option value="ALL">All Models</option>
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <ViewModeToggle mode={mode} onChange={setMode} />
          {!readOnly && canEditProduction && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => setIsAddModalOpen(true)}
            >
              <i className="bi bi-plus-lg me-1" /> Add
            </button>
          )}
        </div>
      </div>

      {mode === 'grid' ? (
        <div className="master-grid">
          {filteredLooms.map((l, rowIdx) => {
            return (
              <div
                key={l.loomNumber}
                className={`master-grid-card${editActive ? ' sara-edit-card' : ''}`}
              >
                <div className="d-flex align-items-center gap-2 border-bottom pb-2">
                  <LoomPictureThumb
                    images={getLoomPictures(l)}
                    alt={l.name || `Loom ${l.loomNumber}`}
                    size={52}
                    editable={canManagePics}
                    onImagesChange={
                      canManagePics ? (urls) => applyLoomPictures(l, urls) : undefined
                    }
                  />
                  <div className="flex-fill">
                    {masterEdit ? (
                      <TextCellInput
                        className="form-control form-control-sm fw-bold"
                        value={l.name || ''}
                        navRow={rowIdx}
                        navCol={0}
                        onValueChange={(v) =>
                          onUpdate(l.loomNumber, { name: v.trim() || `Loom ${l.loomNumber}` })
                        }
                      />
                    ) : (
                      <div className="fw-bold">{l.name}</div>
                    )}
                    <div className="small text-muted">Loom #{l.loomNumber}</div>
                  </div>
                  {masterEdit && onDelete && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      title={`Delete Loom ${l.loomNumber}`}
                      onClick={() => handleDeleteLoom(l)}
                    >
                      <i className="bi bi-trash" />
                    </button>
                  )}
                </div>

                <div className="d-flex justify-content-between small text-secondary py-1 gap-2">
                  <span>
                    Year:{' '}
                    {masterEdit ? (
                      <NumericCellInput
                        className="form-control form-control-sm d-inline-block text-end"
                        style={{ width: 72 }}
                        value={l.year || 0}
                        navRow={rowIdx}
                        navCol={1}
                        onValueChange={(v) => onUpdate(l.loomNumber, { year: v })}
                      />
                    ) : (
                      <strong className="text-dark">{l.year}</strong>
                    )}
                  </span>
                  <span className="flex-fill">
                    Shed:{' '}
                    {masterEdit ? (
                      <TextCellInput
                        className="form-control form-control-sm d-inline-block"
                        style={{ width: 100 }}
                        value={l.shed || 'Main Floor'}
                        navRow={rowIdx}
                        navCol={3}
                        onValueChange={(v) => onUpdate(l.loomNumber, { shed: v.trim() || 'Main Floor' })}
                      />
                    ) : (
                      <strong className="text-dark">{l.shed || 'Main Floor'}</strong>
                    )}
                  </span>
                </div>

                <div>
                  <label className="form-label small mb-1 fw-semibold">Model</label>
                  {masterEdit ? (
                    <select
                      className="form-select form-select-sm"
                      value={l.model || 'G6200'}
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
                  ) : (
                    <div>
                      <span className="badge bg-secondary-subtle text-secondary">{l.model}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="form-label small mb-1 fw-semibold">RPM</label>
                  {masterEdit ? (
                    <NumericCellInput
                      className="form-control form-control-sm text-end"
                      value={l.defaultRpm || 0}
                      navRow={rowIdx}
                      navCol={2}
                      onValueChange={(v) => onUpdate(l.loomNumber, { defaultRpm: v })}
                    />
                  ) : (
                    <div className="form-control form-control-sm bg-light text-end">{l.defaultRpm}</div>
                  )}
                </div>

                <div>
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <label className="form-label small mb-0 fw-semibold">Status</label>
                    {!masterEdit && l.status !== 'RUNNING' && l.statusSince && (
                      <span className="text-muted small" style={{ fontSize: '0.70rem' }}>
                        Since {l.statusSince}
                      </span>
                    )}
                  </div>
                  <LoomStatusSelect
                    value={l.status}
                    disabled={!masterEdit}
                    onChange={(status) => onUpdate(l.loomNumber, { status })}
                  />
                </div>
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
              </tr>
            </thead>
            <tbody>
              {filteredLooms.map((l, rowIdx) => {
                return (
                  <tr
                    key={l.loomNumber}
                    className={editActive ? 'sara-edit-row' : undefined}
                  >
                    <td className="fw-semibold px-2">{l.loomNumber}</td>
                    <td className="px-2 text-center">
                      <LoomPictureThumb
                        images={getLoomPictures(l)}
                        alt={l.name || `Loom ${l.loomNumber}`}
                        size={40}
                        editable={canManagePics}
                        onImagesChange={
                          canManagePics ? (urls) => applyLoomPictures(l, urls) : undefined
                        }
                      />
                    </td>
                    <td className="px-2">
                      <span className="fw-semibold text-dark">{l.name}</span>
                    </td>
                    <td className="px-2">
                      <span className="badge bg-light text-dark border px-2 py-1">{l.model}</span>
                    </td>
                    <td className="px-2">
                      <span className="text-secondary">{l.year}</span>
                    </td>
                    <td className="px-1">
                      {opsEdit ? (
                        <NumericCellInput
                          className="form-control form-control-sm text-end"
                          style={{ width: '100%', minWidth: 0 }}
                          value={l.defaultRpm || 0}
                          navRow={rowIdx}
                          navCol={2}
                          onValueChange={(v) => onUpdate(l.loomNumber, { defaultRpm: v })}
                        />
                      ) : (
                        <div className="text-end px-1">{l.defaultRpm}</div>
                      )}
                    </td>
                    <td className="px-2">
                      <span className="text-secondary">{l.shed || 'Main Floor'}</span>
                    </td>
                    <td className="px-1">
                      <div className="d-flex flex-column">
                        <LoomStatusSelect
                          value={l.status}
                          disabled={!opsEdit}
                          style={{ width: '100%', minWidth: 0 }}
                          onChange={(status) => onUpdate(l.loomNumber, { status })}
                        />
                        {!opsEdit && l.status !== 'RUNNING' && l.statusSince && (
                          <span className="text-muted text-nowrap mt-0.5" style={{ fontSize: '0.68rem' }}>
                            <i className="bi bi-clock-history me-1" />
                            Since {l.statusSince}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddLoomModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={onAdd}
        suggestedLoomNumber={nextLoomNumber}
      />
    </div>
  )
}
