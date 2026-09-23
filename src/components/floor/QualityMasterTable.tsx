'use client'

import { useMemo, useState } from 'react'
import { QualityMaster } from '@/services/productionMastersService'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'

const DEFAULT_WIDTHS: Record<string, number> = {
  name: 140,
  type: 120,
  warp: 110,
  weft: 110,
  reed: 68,
  pick: 68,
  width: 68,
  gsm: 90,
  actions: 80,
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
  const { isAdmin } = useAuth()
  const [mode, setMode] = useState<TableGridMode>('table')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<QualityMaster | null>(null)

  const { widths, setColumnWidth, resetAllWidths, resetColumnWidth } = useResizableColumns(
    'sara_quality_col_widths_v2',
    DEFAULT_WIDTHS
  )

  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  )

  const startEdit = (q: QualityMaster) => {
    if (!isAdmin || readOnly) return
    setEditingId(q.id)
    setDraft({ ...q })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft(null)
  }

  const saveEdit = (id: string) => {
    if (!draft) return
    onUpdate(id, {
      name: draft.name,
      fabricType: draft.fabricType,
      warpYarn: draft.warpYarn,
      weftYarn: draft.weftYarn,
      reed: draft.reed,
      pick: draft.pick,
      widthInch: draft.widthInch,
      gsm: draft.gsm,
    })
    setEditingId(null)
    setDraft(null)
  }

  const patchDraft = (patch: Partial<QualityMaster>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : null))
  }

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
          {!readOnly && isAdmin && (
            <button type="button" className="btn btn-sm btn-primary" onClick={onAdd}>
              <i className="bi bi-plus-lg me-1" /> Add
            </button>
          )}
        </div>
      </div>

      {mode === 'grid' ? (
        <div className="master-grid">
          {qualities.map((q) => {
            const isEditing = editingId === q.id && !!draft
            const d = isEditing ? draft! : null

            return (
              <div
                key={q.id}
                className={`master-grid-card ${isEditing ? 'border border-primary shadow-sm' : ''}`}
                style={isEditing ? { backgroundColor: '#eef5ff' } : undefined}
              >
                <div className="d-flex align-items-center justify-content-between">
                  <div className="fw-semibold">{q.name}</div>
                  {isEditing ? (
                    <div className="d-flex align-items-center gap-1">
                      <button
                        type="button"
                        className="btn btn-sm btn-success py-0 px-2 d-inline-flex align-items-center gap-1 shadow-sm"
                        style={{ height: 26, fontSize: '0.78rem' }}
                        title="Save changes"
                        onClick={() => saveEdit(q.id)}
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
                      title={isAdmin ? `Edit ${q.name}` : 'Admin privileges required'}
                      disabled={!isAdmin || readOnly || (editingId !== null && editingId !== q.id)}
                      onClick={() => startEdit(q)}
                    >
                      <i className="bi bi-pencil" style={{ fontSize: '0.68rem' }} />
                    </button>
                  )}
                </div>

                <label className="small mb-0">Quality Name</label>
                {isEditing ? (
                  <input
                    className="form-control form-control-sm"
                    value={d!.name}
                    onChange={(e) => patchDraft({ name: e.target.value })}
                  />
                ) : (
                  <div className="small fw-semibold">{q.name}</div>
                )}

                <label className="small mb-0">Fabric Type</label>
                {isEditing ? (
                  <input
                    className="form-control form-control-sm"
                    value={d!.fabricType}
                    onChange={(e) => patchDraft({ fabricType: e.target.value })}
                  />
                ) : (
                  <div className="small text-secondary">{q.fabricType || '—'}</div>
                )}

                <div className="d-flex gap-2">
                  <div className="flex-fill">
                    <label className="small mb-0">Warp Yarn</label>
                    {isEditing ? (
                      <input
                        className="form-control form-control-sm"
                        value={d!.warpYarn}
                        onChange={(e) => patchDraft({ warpYarn: e.target.value })}
                      />
                    ) : (
                      <div className="small text-secondary">{q.warpYarn || '—'}</div>
                    )}
                  </div>
                  <div className="flex-fill">
                    <label className="small mb-0">Weft Yarn</label>
                    {isEditing ? (
                      <input
                        className="form-control form-control-sm"
                        value={d!.weftYarn}
                        onChange={(e) => patchDraft({ weftYarn: e.target.value })}
                      />
                    ) : (
                      <div className="small text-secondary">{q.weftYarn || '—'}</div>
                    )}
                  </div>
                </div>

                <div className="d-flex gap-2">
                  <div className="flex-fill">
                    <label className="small mb-0">Reed</label>
                    {isEditing ? (
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={d!.reed}
                        onChange={(e) => patchDraft({ reed: Number(e.target.value) || 0 })}
                      />
                    ) : (
                      <div className="small">{q.reed}</div>
                    )}
                  </div>
                  <div className="flex-fill">
                    <label className="small mb-0">Pick</label>
                    {isEditing ? (
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={d!.pick}
                        onChange={(e) => patchDraft({ pick: Number(e.target.value) || 0 })}
                      />
                    ) : (
                      <div className="small">{q.pick}</div>
                    )}
                  </div>
                  <div className="flex-fill">
                    <label className="small mb-0">Width</label>
                    {isEditing ? (
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={d!.widthInch}
                        onChange={(e) => patchDraft({ widthInch: Number(e.target.value) || 0 })}
                      />
                    ) : (
                      <div className="small">{q.widthInch}&quot;</div>
                    )}
                  </div>
                </div>

                <label className="small mb-0">GSM</label>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    className="form-control form-control-sm"
                    value={d!.gsm ?? 0}
                    onChange={(e) => patchDraft({ gsm: Number(e.target.value) || 0 })}
                  />
                ) : (
                  <div className="small">{q.gsm ? q.gsm.toFixed(1) : '—'}</div>
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
                <ResizableTh columnKey="reed" width={widths.reed} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-end">
                  Reed
                </ResizableTh>
                <ResizableTh columnKey="pick" width={widths.pick} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-end">
                  Pick
                </ResizableTh>
                <ResizableTh columnKey="width" width={widths.width} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-end">
                  Width
                </ResizableTh>
                <ResizableTh columnKey="gsm" width={widths.gsm} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-end">
                  GSM
                </ResizableTh>
                <ResizableTh columnKey="actions" width={widths.actions} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
                  style={{ fontSize: '0.75rem' }}>
                  Action
                </ResizableTh>
              </tr>
            </thead>
            <tbody>
              {qualities.map((q) => {
                const isEditing = editingId === q.id && !!draft
                const d = isEditing ? draft! : null

                return (
                  <tr
                    key={q.id}
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
                          className="form-control form-control-sm"
                          style={{ width: '100%', minWidth: 0 }}
                          value={d!.name}
                          autoFocus
                          onChange={(e) => patchDraft({ name: e.target.value })}
                        />
                      ) : (
                        <span className="fw-semibold">{q.name}</span>
                      )}
                    </td>
                    <td className="px-2 text-truncate">
                      {isEditing ? (
                        <input
                          className="form-control form-control-sm"
                          style={{ width: '100%', minWidth: 0 }}
                          value={d!.fabricType}
                          onChange={(e) => patchDraft({ fabricType: e.target.value })}
                        />
                      ) : (
                        <span className="text-secondary">{q.fabricType || '—'}</span>
                      )}
                    </td>
                    <td className="px-2 text-truncate">
                      {isEditing ? (
                        <input
                          className="form-control form-control-sm"
                          style={{ width: '100%', minWidth: 0 }}
                          value={d!.warpYarn}
                          onChange={(e) => patchDraft({ warpYarn: e.target.value })}
                        />
                      ) : (
                        <span className="text-secondary">{q.warpYarn || '—'}</span>
                      )}
                    </td>
                    <td className="px-2 text-truncate">
                      {isEditing ? (
                        <input
                          className="form-control form-control-sm"
                          style={{ width: '100%', minWidth: 0 }}
                          value={d!.weftYarn}
                          onChange={(e) => patchDraft({ weftYarn: e.target.value })}
                        />
                      ) : (
                        <span className="text-secondary">{q.weftYarn || '—'}</span>
                      )}
                    </td>
                    <td className="px-1">
                      {isEditing ? (
                        <input
                          type="number"
                          className="form-control form-control-sm text-end"
                          style={{ width: '100%', minWidth: 0 }}
                          value={d!.reed}
                          onChange={(e) => patchDraft({ reed: Number(e.target.value) || 0 })}
                        />
                      ) : (
                        <div className="text-end px-1">{q.reed}</div>
                      )}
                    </td>
                    <td className="px-1">
                      {isEditing ? (
                        <input
                          type="number"
                          className="form-control form-control-sm text-end"
                          style={{ width: '100%', minWidth: 0 }}
                          value={d!.pick}
                          onChange={(e) => patchDraft({ pick: Number(e.target.value) || 0 })}
                        />
                      ) : (
                        <div className="text-end px-1">{q.pick}</div>
                      )}
                    </td>
                    <td className="px-1">
                      {isEditing ? (
                        <input
                          type="number"
                          className="form-control form-control-sm text-end"
                          style={{ width: '100%', minWidth: 0 }}
                          value={d!.widthInch}
                          onChange={(e) => patchDraft({ widthInch: Number(e.target.value) || 0 })}
                        />
                      ) : (
                        <div className="text-end px-1">{q.widthInch}&quot;</div>
                      )}
                    </td>
                    <td className="px-1">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          className="form-control form-control-sm text-end"
                          style={{ width: '100%', minWidth: 0 }}
                          value={d!.gsm ?? 0}
                          onChange={(e) => patchDraft({ gsm: Number(e.target.value) || 0 })}
                        />
                      ) : (
                        <div className="text-end px-1">{q.gsm ? q.gsm.toFixed(1) : '—'}</div>
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
                            onClick={() => saveEdit(q.id)}
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
                              opacity: isAdmin && !readOnly ? 0.75 : 0.35,
                            }}
                            title={isAdmin ? `Edit ${q.name}` : 'Admin privileges required'}
                            disabled={!isAdmin || readOnly || (editingId !== null && editingId !== q.id)}
                            onClick={() => startEdit(q)}
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
