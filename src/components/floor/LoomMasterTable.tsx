'use client'

import { useMemo, useState } from 'react'
import {
  LoomMaster,
  QualityMaster,
  YarnMaster,
  getLoomPictures,
  normalizeLoomPictures,
} from '@/services/productionMastersService'
import { LoomCategory } from '@/types/loom'
import { LoomPictureThumb } from '@/components/floor/LoomPictureThumb'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { LoomStatusSelect } from '@/components/floor/LoomStatusSelect'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'

const MODELS: LoomCategory[] = ['G6200', 'G6300', 'PU']

const DEFAULT_WIDTHS: Record<string, number> = {
  loom: 72,
  picture: 72,
  name: 150,
  model: 95,
  year: 70,
  rpm: 95,
  quality: 150,
  shed: 110,
  status: 130,
  actions: 110,
}

interface LoomDraft {
  name: string
  model: LoomCategory
  year: number
  defaultRpm: number
  qualityId: string
  shed: string
  status: LoomMaster['status']
  pictureDataUrls: string[]
}

interface LoomMasterTableProps {
  looms: LoomMaster[]
  qualities?: QualityMaster[]
  yarn?: YarnMaster[]
  onUpdate: (loomNumber: number, patch: Partial<LoomMaster>) => void
  onAdd: () => void
  readOnly?: boolean
}

function toDraft(l: LoomMaster): LoomDraft {
  return {
    name: l.name || `Loom ${l.loomNumber}`,
    model: l.model || 'G6200',
    year: l.year || new Date().getFullYear(),
    defaultRpm: l.defaultRpm || 340,
    qualityId: l.qualityId || '',
    shed: l.shed || 'Main Floor',
    status: l.status || 'RUNNING',
    pictureDataUrls: getLoomPictures(l),
  }
}

export function LoomMasterTable({
  looms,
  qualities = [],
  onUpdate,
  onAdd,
  readOnly,
}: LoomMasterTableProps) {
  const [mode, setMode] = useState<TableGridMode>('table')
  const [modelFilter, setModelFilter] = useState<'ALL' | LoomCategory>('ALL')
  const [editingNumber, setEditingNumber] = useState<number | null>(null)
  const [draft, setDraft] = useState<LoomDraft | null>(null)
  const [adminNotice, setAdminNotice] = useState<string | null>(null)
  const { isAdmin } = useAuth()

  const { widths, setColumnWidth, resetColumnWidth } = useResizableColumns(
    'sara_loom_col_widths_v4',
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

  const patchDraft = (partial: Partial<LoomDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...partial } : prev))
  }

  const startEdit = (loom: LoomMaster) => {
    if (!isAdmin) {
      setAdminNotice('Only administrators can edit machine configurations.')
      setTimeout(() => setAdminNotice(null), 4000)
      return
    }
    setEditingNumber(loom.loomNumber)
    setDraft(toDraft(loom))
  }

  const cancelEdit = () => {
    setEditingNumber(null)
    setDraft(null)
  }

  const saveEdit = () => {
    if (editingNumber == null || !draft) return
    const pics = normalizeLoomPictures({
      loomNumber: editingNumber,
      pictureDataUrls: draft.pictureDataUrls,
    })
    onUpdate(editingNumber, {
      name: draft.name.trim() || `Loom ${editingNumber}`,
      model: draft.model,
      year: Number(draft.year) || 0,
      defaultRpm: Number(draft.defaultRpm) || 0,
      qualityId: draft.qualityId || null,
      shed: draft.shed.trim() || 'Main Floor',
      status: draft.status,
      ...pics,
    })
    cancelEdit()
  }

  const canManagePics = isAdmin && !readOnly

  const applyLoomPictures = (loom: LoomMaster, urls: string[]) => {
    if (editingNumber === loom.loomNumber && draft) {
      patchDraft({ pictureDataUrls: urls })
      return
    }
    const pics = normalizeLoomPictures({
      loomNumber: loom.loomNumber,
      pictureDataUrls: urls,
    })
    onUpdate(loom.loomNumber, pics)
  }

  const qualityName = (qualityId: string | null) =>
    qualities.find((q) => q.id === qualityId)?.name || '—'

  const actionButtons = (l: LoomMaster, editing: boolean) => {
    if (editing) {
      return (
        <div className="d-flex align-items-center justify-content-center gap-1">
          <button
            type="button"
            className="btn btn-sm btn-success py-0 px-2 d-inline-flex align-items-center gap-1 shadow-sm"
            style={{ height: 26, fontSize: '0.78rem' }}
            title="Save changes"
            onClick={saveEdit}
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
      )
    }
    return (
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
          title={isAdmin ? `Edit Loom ${l.loomNumber}` : 'Admin privileges required'}
          disabled={readOnly || editingNumber != null}
          onClick={() => startEdit(l)}
        >
          <i className="bi bi-pencil" style={{ fontSize: '0.68rem' }} />
        </button>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header d-flex flex-row flex-wrap gap-2 justify-content-between align-items-center">
        <div className="min-w-0">
          <h3 className="card-title mb-0">Looms</h3>
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center ms-auto">
          <select
            className="form-select form-select-sm"
            style={{ width: 'auto', minWidth: 120 }}
            value={modelFilter}
            title="Filter by model"
            onChange={(e) => {
              cancelEdit()
              setModelFilter(e.target.value as 'ALL' | LoomCategory)
            }}
          >
            <option value="ALL">All Models</option>
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
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
          {filteredLooms.map((l) => {
            const editing = editingNumber === l.loomNumber && !!draft
            const d = editing ? draft! : null
            return (
              <div
                key={l.loomNumber}
                className={`master-grid-card${editing ? ' border border-primary' : ''}`}
              >
                <div className="d-flex align-items-center justify-content-between gap-2 border-bottom pb-2">
                  <div className="d-flex align-items-center gap-2">
                    <LoomPictureThumb
                      images={d ? d.pictureDataUrls : getLoomPictures(l)}
                      alt={d?.name || l.name || `Loom ${l.loomNumber}`}
                      size={52}
                      editable={canManagePics}
                      onImagesChange={
                        canManagePics ? (urls) => applyLoomPictures(l, urls) : undefined
                      }
                    />
                    <div>
                      {editing ? (
                        <input
                          className="form-control form-control-sm fw-bold"
                          value={d!.name}
                          onChange={(e) => patchDraft({ name: e.target.value })}
                        />
                      ) : (
                        <div className="fw-bold">{l.name}</div>
                      )}
                      <div className="small text-muted">Loom #{l.loomNumber}</div>
                    </div>
                  </div>
                  {actionButtons(l, editing)}
                </div>

                <div className="d-flex justify-content-between small text-secondary py-1 gap-2">
                  <span>
                    Year:{' '}
                    {editing ? (
                      <input
                        type="number"
                        className="form-control form-control-sm d-inline-block"
                        style={{ width: 72 }}
                        value={d!.year}
                        onChange={(e) => patchDraft({ year: Number(e.target.value) || 0 })}
                      />
                    ) : (
                      <strong className="text-dark">{l.year}</strong>
                    )}
                  </span>
                  <span>
                    Shed:{' '}
                    {editing ? (
                      <input
                        className="form-control form-control-sm d-inline-block"
                        style={{ width: 100 }}
                        value={d!.shed}
                        onChange={(e) => patchDraft({ shed: e.target.value })}
                      />
                    ) : (
                      <strong className="text-dark">{l.shed || 'Main Floor'}</strong>
                    )}
                  </span>
                </div>

                <div>
                  <label className="form-label small mb-1 fw-semibold">Model</label>
                  {editing ? (
                    <select
                      className="form-select form-select-sm"
                      value={d!.model}
                      onChange={(e) => patchDraft({ model: e.target.value as LoomCategory })}
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
                  <label className="form-label small mb-1 fw-semibold">Quality</label>
                  <select
                    className="form-select form-select-sm"
                    value={editing ? d!.qualityId : l.qualityId || ''}
                    disabled={!editing}
                    onChange={(e) => patchDraft({ qualityId: e.target.value })}
                  >
                    <option value="">—</option>
                    {qualities.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label small mb-1 fw-semibold">RPM</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    title="RPM"
                    value={editing ? d!.defaultRpm : l.defaultRpm}
                    disabled={!editing}
                    onChange={(e) => patchDraft({ defaultRpm: Number(e.target.value) || 0 })}
                  />
                </div>

                <div>
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <label className="form-label small mb-0 fw-semibold">Status</label>
                    {!editing && l.status !== 'RUNNING' && l.statusSince && (
                      <span className="text-muted small" style={{ fontSize: '0.70rem' }}>
                        Since {l.statusSince}
                      </span>
                    )}
                  </div>
                  <LoomStatusSelect
                    value={editing ? d!.status : l.status}
                    disabled={!editing}
                    onChange={(status) => patchDraft({ status })}
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
                <ResizableTh columnKey="quality" width={widths.quality} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Quality Name
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
              {filteredLooms.map((l) => {
                const editing = editingNumber === l.loomNumber && !!draft
                const d = editing ? draft! : null
                return (
                  <tr
                    key={l.loomNumber}
                    className={editing ? 'table-primary' : undefined}
                    style={editing ? { backgroundColor: '#eef5ff', boxShadow: 'inset 0 0 0 1px #90b8f8' } : undefined}
                  >
                    <td className="fw-semibold px-2">{l.loomNumber}</td>
                    <td className="px-2 text-center">
                      <LoomPictureThumb
                        images={d ? d.pictureDataUrls : getLoomPictures(l)}
                        alt={d?.name || l.name || `Loom ${l.loomNumber}`}
                        size={40}
                        editable={canManagePics}
                        onImagesChange={
                          canManagePics ? (urls) => applyLoomPictures(l, urls) : undefined
                        }
                      />
                    </td>
                    <td className="px-2">
                      {editing ? (
                        <input
                          className="form-control form-control-sm"
                          style={{ width: '100%', minWidth: 0 }}
                          value={d!.name}
                          onChange={(e) => patchDraft({ name: e.target.value })}
                        />
                      ) : (
                        <span className="fw-semibold text-dark">{l.name}</span>
                      )}
                    </td>
                    <td className="px-2">
                      {editing ? (
                        <select
                          className="form-select form-select-sm"
                          style={{ width: '100%', minWidth: 0 }}
                          value={d!.model}
                          onChange={(e) => patchDraft({ model: e.target.value as LoomCategory })}
                        >
                          {MODELS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="badge bg-light text-dark border px-2 py-1">{l.model}</span>
                      )}
                    </td>
                    <td className="px-2">
                      {editing ? (
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          style={{ width: '100%', minWidth: 0 }}
                          value={d!.year}
                          onChange={(e) => patchDraft({ year: Number(e.target.value) || 0 })}
                        />
                      ) : (
                        <span className="text-secondary">{l.year}</span>
                      )}
                    </td>
                    <td className="px-1">
                      <input
                        type="number"
                        className="form-control form-control-sm text-end"
                        style={{ width: '100%', minWidth: 0 }}
                        value={editing ? d!.defaultRpm : l.defaultRpm}
                        disabled={!editing}
                        onChange={(e) =>
                          patchDraft({ defaultRpm: Number(e.target.value) || 0 })
                        }
                      />
                    </td>
                    <td className="px-1">
                      <select
                        className="form-select form-select-sm"
                        style={{ width: '100%', minWidth: 0 }}
                        value={editing ? d!.qualityId : l.qualityId || ''}
                        disabled={!editing}
                        title={qualityName(editing ? d!.qualityId || null : l.qualityId)}
                        onChange={(e) => patchDraft({ qualityId: e.target.value })}
                      >
                        <option value="">—</option>
                        {qualities.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2">
                      {editing ? (
                        <input
                          className="form-control form-control-sm"
                          style={{ width: '100%', minWidth: 0 }}
                          value={d!.shed}
                          onChange={(e) => patchDraft({ shed: e.target.value })}
                        />
                      ) : (
                        <span className="text-secondary">{l.shed || 'Main Floor'}</span>
                      )}
                    </td>
                    <td className="px-1">
                      <div className="d-flex flex-column">
                        <LoomStatusSelect
                          value={editing ? d!.status : l.status}
                          disabled={!editing}
                          style={{ width: '100%', minWidth: 0 }}
                          onChange={(status) => patchDraft({ status })}
                        />
                        {!editing && l.status !== 'RUNNING' && l.statusSince && (
                          <span className="text-muted text-nowrap mt-0.5" style={{ fontSize: '0.68rem' }}>
                            <i className="bi bi-clock-history me-1" />
                            Since {l.statusSince}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-1 text-center">{actionButtons(l, editing)}</td>
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
