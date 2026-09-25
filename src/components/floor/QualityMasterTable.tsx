'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  QualityMaster,
  LoomMaster,
  orderQualitiesByLoomAllotment,
} from '@/services/productionMastersService'
import { PRODUCTION_TODAY } from '@/constants/productionCalendar'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { NumericCellInput, TextCellInput } from '@/components/shared/NumericCellInput'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { DailyLoomProductionEntry } from '@/types/production'
import { useAlertDialog } from '@/context/AlertDialogContext'

const DEFAULT_WIDTHS: Record<string, number> = {
  sr: 46,
  name: 135,
  type: 115,
  warp: 110,
  weft: 110,
  reed: 65,
  pick: 65,
  width: 65,
  gsm: 80,
  production: 105,
  actions: 120,
  endedOn: 95,
}

export type QualityStatusFilter = 'ACTIVE' | 'ENDED'

export function qualityStatusCounts(qualities: QualityMaster[]) {
  const active = qualities.filter((q) => (q.status ?? 'ACTIVE') !== 'ENDED').length
  const ended = qualities.filter((q) => q.status === 'ENDED').length
  return { active, ended }
}

export function QualityStatusFilterBar({
  filter,
  onChange,
  counts,
}: {
  filter: QualityStatusFilter
  onChange: (f: QualityStatusFilter) => void
  counts: ReturnType<typeof qualityStatusCounts>
}) {
  return (
    <div className="btn-group btn-group-sm" role="group" aria-label="Quality status filter">
      <button
        type="button"
        className={`btn ${filter === 'ACTIVE' ? 'btn-primary' : 'btn-outline-secondary'}`}
        onClick={() => onChange('ACTIVE')}
      >
        Active ({counts.active})
      </button>
      <button
        type="button"
        className={`btn ${filter === 'ENDED' ? 'btn-primary' : 'btn-outline-secondary'}`}
        onClick={() => onChange('ENDED')}
      >
        Quality Ends ({counts.ended})
      </button>
    </div>
  )
}

function formatShortDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  try {
    const d = new Date(`${dateStr}T12:00:00`)
    return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

interface QualityMasterTableProps {
  qualities: QualityMaster[]
  onUpdate: (id: string, patch: Partial<QualityMaster>) => void
  onAdd: (newQuality?: Partial<QualityMaster>) => void
  onDelete: (id: string) => void
  readOnly?: boolean
  entries?: DailyLoomProductionEntry[]
  looms?: LoomMaster[]
  statusFilter?: QualityStatusFilter
  onStatusFilterChange?: (f: QualityStatusFilter) => void
  endDateDefault?: string
}

export function QualityMasterTable({
  qualities,
  onUpdate,
  onAdd,
  onDelete,
  readOnly,
  entries = [],
  looms = [],
  statusFilter = 'ACTIVE',
  endDateDefault = PRODUCTION_TODAY,
}: QualityMasterTableProps) {
  const { isAdmin } = useAuth()
  const { showConfirm } = useAlertDialog()
  const [mode, setMode] = useState<TableGridMode>('table')
  const [tableEdit, setTableEdit] = useState(false)

  // Add Quality Modal Dialog State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [addForm, setAddForm] = useState({
    name: '',
    fabricType: 'Suiting',
    warpYarn: '20/1-Pv-China',
    weftYarn: '20/1-Pv-China',
    reed: 120,
    pick: 60,
    widthInch: 66,
    gsm: 1.77,
  })

  const { widths, setColumnWidth, resetAllWidths, resetColumnWidth } = useResizableColumns(
    'sara_quality_col_widths_v6',
    DEFAULT_WIDTHS
  )

  const counts = useMemo(() => qualityStatusCounts(qualities), [qualities])
  const isEndedView = statusFilter === 'ENDED'

  const displayedQualities = useMemo(() => {
    if (isEndedView) {
      return qualities
        .filter((q) => q.status === 'ENDED')
        .sort((a, b) => (b.endedOn || '').localeCompare(a.endedOn || ''))
    }
    const active = qualities.filter((q) => (q.status ?? 'ACTIVE') !== 'ENDED')
    return orderQualitiesByLoomAllotment(active, looms, entries)
  }, [qualities, looms, entries, isEndedView])

  // Calculate production meters for each quality from production sheet entries
  const productionByQuality = useMemo(() => {
    const stats: Record<string, number> = {}
    const clean = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

    for (const q of qualities) {
      const qClean = clean(q.name)
      const matching = (entries || []).filter((e) => {
        const eClean = clean(e.qualityName)
        return (
          eClean === qClean ||
          (qClean.length >= 4 && (eClean.includes(qClean) || qClean.includes(eClean)))
        )
      })
      const total = matching.reduce(
        (s, e) => s + (e.totalMeters ?? (e.shiftAMeters || 0) + (e.shiftBMeters || 0)),
        0
      )
      stats[q.id] = total
    }
    return stats
  }, [qualities, entries])

  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  )

  const opsEdit = isAdmin && !readOnly && !isEndedView && tableEdit && mode === 'table'
  const masterEdit = isAdmin && !readOnly && !isEndedView && tableEdit && mode === 'grid'
  const editActive = opsEdit || masterEdit

  const cardTitle =
    statusFilter === 'ENDED'
      ? `Quality — Ended (${counts.ended})`
      : `Quality — Active (${counts.active})`

  const handleEndQuality = (q: QualityMaster) => {
    showConfirm({
      title: 'End this quality?',
      message: `"${q.name}" Quality Ends list me chali jayegi. Dobara Start se active kar sakte ho.`,
      type: 'confirm',
      confirmText: 'Yes, end it',
      cancelText: 'Cancel',
      onConfirm: () => {
        onUpdate(q.id, { status: 'ENDED', endedOn: endDateDefault })
      },
    })
  }

  const handleRestartQuality = (q: QualityMaster) => {
    showConfirm({
      title: 'Quality dubara start?',
      message: `Kya aap "${q.name}" ko active list me wapas lana chahte hain?`,
      type: 'confirm',
      confirmText: 'Start again',
      cancelText: 'Cancel',
      onConfirm: () => {
        onUpdate(q.id, { status: 'ACTIVE', endedOn: null })
      },
    })
  }

  const editToggle =
    isAdmin && !readOnly && !isEndedView ? (
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

  const handleDelete = (q: QualityMaster) => {
    if (!masterEdit) return
    showConfirm({
      title: 'Quality Delete Karein?',
      message: `Kya aap waqai quality "${q.name}" ko delete karna chahte hain? Ye permanent delete ho jayegi.`,
      type: 'confirm',
      confirmText: 'Haan, Delete Karein',
      cancelText: 'Cancel',
      onConfirm: () => {
        onDelete(q.id)
      },
    })
  }

  const handleCreateQuality = (e: React.FormEvent) => {
    e.preventDefault()
    if (!addForm.name.trim()) return
    onAdd({
      name: addForm.name.trim(),
      fabricType: addForm.fabricType.trim() || 'Suiting',
      warpYarn: addForm.warpYarn.trim() || '20/1',
      weftYarn: addForm.weftYarn.trim() || '20/1',
      reed: Number(addForm.reed) || 0,
      pick: Number(addForm.pick) || 0,
      widthInch: Number(addForm.widthInch) || 0,
      gsm: Number(Number(addForm.gsm).toFixed(2)) || 0,
    })
    setIsAddModalOpen(false)
    setAddForm({
      name: '',
      fabricType: 'Suiting',
      warpYarn: '20/1-Pv-China',
      weftYarn: '20/1-Pv-China',
      reed: 120,
      pick: 60,
      widthInch: 66,
      gsm: 1.77,
    })
  }

  return (
    <div className="card">
      <div className="card-header d-flex flex-row flex-wrap gap-2 justify-content-between align-items-center">
        <div className="min-w-0">
          <h3 className="card-title mb-0">{cardTitle}</h3>
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
          {!readOnly && isAdmin && !isEndedView && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => setIsAddModalOpen(true)}
            >
              <i className="bi bi-plus-lg me-1" /> Add Quality
            </button>
          )}
        </div>
      </div>

      {mode === 'grid' ? (
        <div className="master-grid">
          {displayedQualities.map((q, rowIdx) => {
            const prod = productionByQuality[q.id] || 0
            const showEndBtn = isAdmin && !readOnly && !isEndedView

            return (
              <div
                key={q.id}
                className={`master-grid-card${editActive ? ' sara-edit-card' : ''}`}
              >
                <div className="d-flex align-items-center justify-content-between">
                  <div className="fw-semibold d-flex align-items-center gap-1.5">
                    <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '0.74rem' }}>
                      #{rowIdx + 1}
                    </span>
                    {!masterEdit && <span>{q.name}</span>}
                  </div>
                  {masterEdit && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger p-0"
                      style={{
                        width: 24,
                        height: 24,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 4,
                      }}
                      title={`Delete ${q.name}`}
                      onClick={() => handleDelete(q)}
                    >
                      <i className="bi bi-trash" style={{ fontSize: '0.70rem' }} />
                    </button>
                  )}
                </div>

                <label className="small mb-0">Quality Name</label>
                {masterEdit ? (
                  <TextCellInput
                    className="form-control form-control-sm"
                    value={q.name}
                    navRow={rowIdx}
                    navCol={0}
                    onValueChange={(v) => onUpdate(q.id, { name: v })}
                  />
                ) : (
                  <div className="small fw-semibold">{q.name}</div>
                )}

                <label className="small mb-0">Fabric Type</label>
                {masterEdit ? (
                  <TextCellInput
                    className="form-control form-control-sm"
                    value={q.fabricType || ''}
                    navRow={rowIdx}
                    navCol={1}
                    onValueChange={(v) => onUpdate(q.id, { fabricType: v })}
                  />
                ) : (
                  <div className="small text-secondary">{q.fabricType || '—'}</div>
                )}

                <div className="d-flex gap-2">
                  <div className="flex-fill">
                    <label className="small mb-0">Warp Yarn</label>
                    {masterEdit ? (
                      <TextCellInput
                        className="form-control form-control-sm"
                        value={q.warpYarn || ''}
                        navRow={rowIdx}
                        navCol={2}
                        onValueChange={(v) => onUpdate(q.id, { warpYarn: v })}
                      />
                    ) : (
                      <div className="small text-secondary">{q.warpYarn || '—'}</div>
                    )}
                  </div>
                  <div className="flex-fill">
                    <label className="small mb-0">Weft Yarn</label>
                    {masterEdit ? (
                      <TextCellInput
                        className="form-control form-control-sm"
                        value={q.weftYarn || ''}
                        navRow={rowIdx}
                        navCol={3}
                        onValueChange={(v) => onUpdate(q.id, { weftYarn: v })}
                      />
                    ) : (
                      <div className="small text-secondary">{q.weftYarn || '—'}</div>
                    )}
                  </div>
                </div>

                <div className="d-flex gap-2">
                  <div className="flex-fill">
                    <label className="small mb-0">Reed</label>
                    {masterEdit ? (
                      <NumericCellInput
                        className="form-control form-control-sm text-end"
                        value={q.reed}
                        navRow={rowIdx}
                        navCol={4}
                        onValueChange={(v) => onUpdate(q.id, { reed: v })}
                      />
                    ) : (
                      <div className="small">{q.reed}</div>
                    )}
                  </div>
                  <div className="flex-fill">
                    <label className="small mb-0">Pick</label>
                    {masterEdit ? (
                      <NumericCellInput
                        className="form-control form-control-sm text-end"
                        value={q.pick}
                        navRow={rowIdx}
                        navCol={5}
                        onValueChange={(v) => onUpdate(q.id, { pick: v })}
                      />
                    ) : (
                      <div className="small">{q.pick}</div>
                    )}
                  </div>
                  <div className="flex-fill">
                    <label className="small mb-0">Width</label>
                    {masterEdit ? (
                      <NumericCellInput
                        className="form-control form-control-sm text-end"
                        value={q.widthInch}
                        navRow={rowIdx}
                        navCol={6}
                        onValueChange={(v) => onUpdate(q.id, { widthInch: v })}
                      />
                    ) : (
                      <div className="small">{q.widthInch}&quot;</div>
                    )}
                  </div>
                </div>

                <label className="small mb-0">GSM</label>
                {masterEdit ? (
                  <NumericCellInput
                    className="form-control form-control-sm text-end"
                    value={q.gsm ?? 0}
                    navRow={rowIdx}
                    navCol={7}
                    onValueChange={(v) => onUpdate(q.id, { gsm: Number(Number(v).toFixed(2)) })}
                  />
                ) : (
                  <div className="small fw-semibold font-monospace">
                    {q.gsm != null && q.gsm !== 0 ? Number(q.gsm).toFixed(2) : '—'}
                  </div>
                )}

                {isEndedView && (
                  <>
                    <label className="small mb-0 mt-1">Ended On</label>
                    <div className="small fw-semibold">{formatShortDate(q.endedOn)}</div>
                  </>
                )}

                <div className="d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
                  <span className="small text-muted">Production:</span>
                  <span className="small fw-bold text-success font-monospace">
                    {prod > 0 ? `${prod.toLocaleString()} m` : '0 m'}
                  </span>
                </div>

                {showEndBtn && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger mt-2 w-100"
                    onClick={() => handleEndQuality(q)}
                  >
                    <i className="bi bi-stop-circle me-1" />
                    End Quality
                  </button>
                )}

                {isEndedView && (
                  <div className="d-flex flex-column gap-2 mt-2">
                    {!readOnly && isAdmin && (
                      <button
                        type="button"
                        className="btn btn-sm btn-success"
                        onClick={() => handleRestartQuality(q)}
                      >
                        <i className="bi bi-play-circle me-1" />
                        Start again
                      </button>
                    )}
                    <Link
                      href={`/floor/reports/total?quality=${encodeURIComponent(q.id)}&name=${encodeURIComponent(q.name)}`}
                      className="btn btn-sm btn-outline-primary"
                    >
                      <i className="bi bi-graph-up me-1" />
                      Open Tracking
                    </Link>
                  </div>
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
              {Object.keys(DEFAULT_WIDTHS)
                .filter((key) => (isEndedView ? true : key !== 'endedOn'))
                .map((key) => (
                  <col key={key} style={{ width: widths[key] }} />
                ))}
            </colgroup>
            <thead className="table-light">
              <tr>
                <ResizableTh columnKey="sr" width={widths.sr} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center">
                  #
                </ResizableTh>
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
                <ResizableTh columnKey="production" width={widths.production} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-end">
                  Production
                </ResizableTh>
                {isEndedView && (
                  <ResizableTh columnKey="endedOn" width={widths.endedOn} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                    Ended On
                  </ResizableTh>
                )}
                <ResizableTh columnKey="actions" width={widths.actions} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
                  style={{ fontSize: '0.75rem' }}>
                  Action
                </ResizableTh>
              </tr>
            </thead>
            <tbody>
              {displayedQualities.map((q, rowIdx) => {
                const prod = productionByQuality[q.id] || 0

                return (
                  <tr
                    key={q.id}
                    className={editActive ? 'sara-edit-row' : undefined}
                  >
                    <td className="px-1 text-center text-muted fw-semibold font-monospace" style={{ fontSize: '0.8rem' }}>
                      {rowIdx + 1}
                    </td>
                    <td className="px-2">
                      <span className="fw-semibold">{q.name}</span>
                    </td>
                    <td className="px-2 text-truncate">
                      <span className="text-secondary">{q.fabricType || '—'}</span>
                    </td>
                    <td className="px-2 text-truncate">
                      <span className="text-secondary">{q.warpYarn || '—'}</span>
                    </td>
                    <td className="px-2 text-truncate">
                      <span className="text-secondary">{q.weftYarn || '—'}</span>
                    </td>
                    <td className="px-1">
                      {opsEdit ? (
                        <NumericCellInput
                          className="form-control form-control-sm text-end"
                          style={{ width: '100%', minWidth: 0 }}
                          value={q.reed}
                          navRow={rowIdx}
                          navCol={4}
                          onValueChange={(v) => onUpdate(q.id, { reed: v })}
                        />
                      ) : (
                        <div className="text-end px-1">{q.reed}</div>
                      )}
                    </td>
                    <td className="px-1">
                      {opsEdit ? (
                        <NumericCellInput
                          className="form-control form-control-sm text-end"
                          style={{ width: '100%', minWidth: 0 }}
                          value={q.pick}
                          navRow={rowIdx}
                          navCol={5}
                          onValueChange={(v) => onUpdate(q.id, { pick: v })}
                        />
                      ) : (
                        <div className="text-end px-1">{q.pick}</div>
                      )}
                    </td>
                    <td className="px-1">
                      {opsEdit ? (
                        <NumericCellInput
                          className="form-control form-control-sm text-end"
                          style={{ width: '100%', minWidth: 0 }}
                          value={q.widthInch}
                          navRow={rowIdx}
                          navCol={6}
                          onValueChange={(v) => onUpdate(q.id, { widthInch: v })}
                        />
                      ) : (
                        <div className="text-end px-1">{q.widthInch}&quot;</div>
                      )}
                    </td>
                    <td className="px-1">
                      {opsEdit ? (
                        <NumericCellInput
                          className="form-control form-control-sm text-end"
                          style={{ width: '100%', minWidth: 0 }}
                          value={q.gsm ?? 0}
                          navRow={rowIdx}
                          navCol={7}
                          onValueChange={(v) => onUpdate(q.id, { gsm: Number(Number(v).toFixed(2)) })}
                        />
                      ) : (
                        <div className="text-end px-1 fw-semibold font-monospace">
                          {q.gsm != null && q.gsm !== 0 ? Number(q.gsm).toFixed(2) : '—'}
                        </div>
                      )}
                    </td>
                    <td className="px-2 text-end">
                      <span className="fw-bold text-success font-monospace">
                        {prod > 0 ? `${prod.toLocaleString()} m` : '0 m'}
                      </span>
                    </td>
                    {isEndedView && (
                      <td className="px-2 small">{formatShortDate(q.endedOn)}</td>
                    )}
                    <td className="px-1 text-center">
                      {isAdmin && !readOnly && !isEndedView && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger py-0 px-1"
                          style={{ fontSize: '0.72rem' }}
                          title="End Quality"
                          onClick={() => handleEndQuality(q)}
                        >
                          End
                        </button>
                      )}
                      {isEndedView && (
                        <div className="d-flex flex-column gap-1 align-items-stretch">
                          {!readOnly && isAdmin && (
                            <button
                              type="button"
                              className="btn btn-sm btn-success py-0"
                              style={{ fontSize: '0.72rem' }}
                              onClick={() => handleRestartQuality(q)}
                            >
                              Start
                            </button>
                          )}
                          <Link
                            href={`/floor/reports/total?quality=${encodeURIComponent(q.id)}&name=${encodeURIComponent(q.name)}`}
                            className="btn btn-sm btn-outline-primary py-0"
                            style={{ fontSize: '0.72rem' }}
                          >
                            Track
                          </Link>
                        </div>
                      )}
                      {!isEndedView && (readOnly || !isAdmin) && (
                        <span className="text-muted small">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Quality Modal Dialog */}
      {isAddModalOpen && (
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)', zIndex: 1055 }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow-lg border-0">
              <div className="modal-header bg-primary text-white py-2.5 px-3">
                <h5 className="modal-title fs-6 fw-semibold mb-0">
                  <i className="bi bi-plus-circle me-1.5" />
                  Nayi Quality Shamil Karein (Add Quality)
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  aria-label="Close"
                  onClick={() => setIsAddModalOpen(false)}
                />
              </div>
              <form onSubmit={handleCreateQuality}>
                <div className="modal-body p-3">
                  <div className="row g-2">
                    <div className="col-12">
                      <label className="form-label small fw-semibold mb-1">
                        Quality Name <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        autoFocus
                        className="form-control form-control-sm"
                        placeholder="e.g. PARCOPV, EVEREST"
                        value={addForm.name}
                        onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-semibold mb-1">Fabric Type</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="e.g. Suiting, Shirting"
                        value={addForm.fabricType}
                        onChange={(e) => setAddForm({ ...addForm, fabricType: e.target.value })}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-semibold mb-1">Width (Inches)</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        placeholder="e.g. 66"
                        value={addForm.widthInch}
                        onChange={(e) => setAddForm({ ...addForm, widthInch: Number(e.target.value) || 0 })}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-semibold mb-1">Warp Yarn</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="e.g. 20/1-Pv-China"
                        value={addForm.warpYarn}
                        onChange={(e) => setAddForm({ ...addForm, warpYarn: e.target.value })}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-semibold mb-1">Weft Yarn</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="e.g. 20/1-Pv-China"
                        value={addForm.weftYarn}
                        onChange={(e) => setAddForm({ ...addForm, weftYarn: e.target.value })}
                      />
                    </div>

                    <div className="col-md-4">
                      <label className="form-label small fw-semibold mb-1">Reed</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        placeholder="120"
                        value={addForm.reed}
                        onChange={(e) => setAddForm({ ...addForm, reed: Number(e.target.value) || 0 })}
                      />
                    </div>

                    <div className="col-md-4">
                      <label className="form-label small fw-semibold mb-1">Pick</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        placeholder="60"
                        value={addForm.pick}
                        onChange={(e) => setAddForm({ ...addForm, pick: Number(e.target.value) || 0 })}
                      />
                    </div>

                    <div className="col-md-4">
                      <label className="form-label small fw-semibold mb-1">GSM (2 Decimals)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-control form-control-sm"
                        placeholder="e.g. 1.77"
                        value={addForm.gsm}
                        onChange={(e) => setAddForm({ ...addForm, gsm: Number(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-footer py-2 px-3 bg-light">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setIsAddModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-sm btn-primary">
                    <i className="bi bi-check-lg me-1" /> Quality Save Karein
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



