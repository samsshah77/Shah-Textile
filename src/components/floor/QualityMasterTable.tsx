'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  QualityMaster,
  LoomMaster,
  BeamMaster,
  YarnMaster,
  orderQualitiesByLoomAllotment,
  qualityNameKey,
  qualityDisplayName,
  compareLoomsLikeProductionSheet,
  listPersistedSheetEntries,
  sheetRowShowsQuality,
} from '@/services/productionMastersService'
import { PRODUCTION_TODAY } from '@/constants/productionCalendar'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { NumericCellInput, TextCellInput } from '@/components/shared/NumericCellInput'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { DailyLoomProductionEntry } from '@/types/production'
import { getExcelHistoryEntries } from '@/data/productionData'
import { useAlertDialog } from '@/context/AlertDialogContext'

const DEFAULT_WIDTHS: Record<string, number> = {
  sr: 46,
  loom: 168,
  name: 150,
  type: 115,
  warp: 110,
  weft: 110,
  reed: 65,
  pick: 65,
  width: 65,
  gsm: 80,
  day: 88,
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

function formatDayHeading(dateStr?: string | null) {
  if (!dateStr) return 'Day'
  try {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return 'Day'
  }
}

function loomChoiceLabel(loom: LoomMaster) {
  return `L#${loom.loomNumber}(${loom.defaultRpm || 0})`
}

function QualityLoomAssign({
  qualityId,
  qualityName,
  looms,
  assignedLoomNumbers,
  busyLoomNumbers,
  canAssign,
  onAssign,
}: {
  qualityId: string
  qualityName: string
  looms: LoomMaster[]
  assignedLoomNumbers: number[]
  /** Already on another quality this day — not offered here. */
  busyLoomNumbers: number[]
  canAssign: boolean
  onAssign?: (loomNumber: number, qualityId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const assignedSet = new Set(assignedLoomNumbers)
  const busySet = new Set(busyLoomNumbers)
  const assigned = looms
    .filter((l) => assignedSet.has(l.loomNumber))
    .sort(compareLoomsLikeProductionSheet)
  const choices = looms
    .filter((l) => assignedSet.has(l.loomNumber) || !busySet.has(l.loomNumber))
    .sort(compareLoomsLikeProductionSheet)
  const label = assigned.length ? assigned.map((l) => `L#${l.loomNumber}`).join(', ') : '—'

  if (!canAssign || !onAssign) {
    return (
      <span className="small fw-semibold text-truncate d-inline-block" style={{ maxWidth: '100%' }} title={label}>
        {label}
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary py-0 text-start text-truncate"
        style={{ maxWidth: '100%' }}
        title={label}
        onClick={() => setOpen(true)}
      >
        {label === '—' ? 'Select looms' : label}
      </button>
      {open && (
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          role="dialog"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)', zIndex: 1055 }}
          onClick={() => setOpen(false)}
        >
          <div
            className="modal-dialog modal-dialog-centered modal-dialog-scrollable"
            role="document"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content shadow-lg border-0">
              <div className="modal-header py-2.5 px-3">
                <h5 className="modal-title fs-6 fw-semibold mb-0">Select looms — {qualityName}</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setOpen(false)} />
              </div>
              <div className="modal-body p-3">
                <div className="d-flex flex-column gap-1">
                  {choices.map((l) => {
                    const checked = assignedSet.has(l.loomNumber)
                    return (
                      <label
                        key={l.loomNumber}
                        className="d-flex align-items-center gap-2 mb-0 px-2 py-1 border-bottom rounded-1"
                        style={checked ? { background: 'rgba(13, 110, 253, 0.15)' } : undefined}
                      >
                        <input
                          type="checkbox"
                          className="form-check-input m-0"
                          checked={checked}
                          onChange={() => {
                            if (!checked && busySet.has(l.loomNumber)) return
                            onAssign(l.loomNumber, checked ? null : qualityId)
                          }}
                        />
                        <span className={checked ? 'fw-semibold text-primary' : 'fw-semibold'}>
                          {loomChoiceLabel(l)}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
              <div className="modal-footer py-2 px-3">
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
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
  onAssignLoom?: (loomNumber: number, qualityId: string | null) => void
  beams?: BeamMaster[]
  yarn?: YarnMaster[]
  statusFilter?: QualityStatusFilter
  onStatusFilterChange?: (f: QualityStatusFilter) => void
  endDateDefault?: string
  /** Production day whose looms and meters this table is showing. */
  sheetDate?: string
}

export function QualityMasterTable({
  qualities,
  onUpdate,
  onAdd,
  onDelete,
  readOnly,
  entries = [],
  looms = [],
  onAssignLoom,
  beams = [],
  yarn = [],
  statusFilter = 'ACTIVE',
  endDateDefault = PRODUCTION_TODAY,
  sheetDate = PRODUCTION_TODAY,
}: QualityMasterTableProps) {
  const { canEditProduction } = useAuth()
  const { showConfirm } = useAlertDialog()
  const [mode, setMode] = useState<TableGridMode>('table')
  const [tableEdit, setTableEdit] = useState(false)

  // Add Quality Modal Dialog State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [endPick, setEndPick] = useState<{ quality: QualityMaster; selected: number[] } | null>(null)
  const [addForm, setAddForm] = useState({
    name: '',
    fabricType: 'Suiting',
    warpYarn: '',
    weftYarn: '',
    reed: 120,
    pick: 60,
    widthInch: 66,
    gsm: 1.77,
  })

  const { widths, setColumnWidth, resetColumnWidth } = useResizableColumns(
    'sara_quality_col_widths_v7',
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
  const warpOptions = useMemo(() => {
    const set = new Set<string>()
    for (const b of beams) {
      const warp = (b.warp || '').trim()
      if (warp) set.add(warp)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [beams])

  const weftOptions = useMemo(() => {
    const set = new Set<string>()
    for (const y of yarn) {
      const name = (y.yarnType || '').trim()
      if (name) set.add(name)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [yarn])

  const meterOf = (e: DailyLoomProductionEntry) =>
    e.totalMeters != null
      ? Number(e.totalMeters) || 0
      : (Number(e.shiftAMeters) || 0) + (Number(e.shiftBMeters) || 0)

  const dayRows = useMemo(() => {
    const saved = listPersistedSheetEntries().filter((e) => e.date === sheetDate)
    if (saved.some((e) => meterOf(e) > 0)) return saved
    const excel = getExcelHistoryEntries().filter((e) => e.date === sheetDate)
    if (excel.some((e) => meterOf(e) > 0)) return excel
    return (entries || []).filter((e) => !e.date || e.date === sheetDate)
  }, [entries, sheetDate])

  const assignedByQuality = useMemo(() => {
    const map = new Map<string, number[]>()
    const day = (entries || []).filter((e) => !e.date || !sheetDate || e.date === sheetDate)
    for (const q of qualities) {
      map.set(
        q.id,
        day.filter((e) => sheetRowShowsQuality(e, q, qualities)).map((e) => e.loomNumber)
      )
    }
    return map
  }, [entries, qualities, sheetDate])

  const busyExcept = (qualityId: string) => {
    const taken: number[] = []
    for (const [id, nums] of assignedByQuality) {
      if (id === qualityId) continue
      taken.push(...nums)
    }
    return taken
  }

  const productionByQuality = useMemo(() => {
    const stats: Record<string, { day: number; overall: number }> = {}
    const nameCounts = new Map<string, number>()
    for (const q of qualities) {
      const key = qualityNameKey(q.name)
      nameCounts.set(key, (nameCounts.get(key) || 0) + 1)
    }

    const saved = listPersistedSheetEntries()
    const datesWithMeters = new Set(saved.filter((e) => meterOf(e) > 0).map((e) => e.date))
    const excel = getExcelHistoryEntries().filter((e) => e.date && !datesWithMeters.has(e.date))
    const covered = new Set([...datesWithMeters, ...excel.map((e) => e.date)])
    const allDays = [
      ...saved.filter((e) => datesWithMeters.has(e.date)),
      ...excel,
      ...(entries || []).filter((e) => e.date && !covered.has(e.date)),
    ]

    const sumMatching = (rows: DailyLoomProductionEntry[], q: QualityMaster) => {
      const qClean = qualityNameKey(q.name)
      const sharedName = (nameCounts.get(qClean) || 0) > 1
      return rows
        .filter((e) => {
          const eClean = qualityNameKey(e.qualityName)
          const nameHit =
            eClean === qClean ||
            (qClean.length >= 4 && (eClean.includes(qClean) || qClean.includes(eClean)))
          if (!nameHit) return false
          if (sharedName) return Number(e.pick) === Number(q.pick)
          return true
        })
        .reduce((s, e) => s + meterOf(e), 0)
    }

    for (const q of qualities) {
      stats[q.id] = {
        day: sumMatching(dayRows, q),
        overall: sumMatching(allDays, q),
      }
    }
    return stats
  }, [qualities, entries, dayRows])

  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  )

  const opsEdit = canEditProduction && !readOnly && !isEndedView && tableEdit && mode === 'table'
  const masterEdit = canEditProduction && !readOnly && !isEndedView && tableEdit && mode === 'grid'
  const editActive = opsEdit || masterEdit

  const cardTitle =
    statusFilter === 'ENDED'
      ? `Quality — Ended (${counts.ended})`
      : `Quality — Active (${counts.active})`

  const handleEndQuality = (q: QualityMaster) => {
    const running = assignedByQuality.get(q.id) || []
    if (running.length === 0) {
      showConfirm({
        title: 'End this quality?',
        message: `"${q.name}" kisi loom pe nahi chal rahi. Quality Ends list me chali jayegi.`,
        type: 'confirm',
        confirmText: 'Yes, end it',
        cancelText: 'Cancel',
        onConfirm: () => {
          onUpdate(q.id, { status: 'ENDED', endedOn: endDateDefault })
        },
      })
      return
    }
    setEndPick({ quality: q, selected: [] })
  }

  const toggleEndLoom = (loomNumber: number) => {
    setEndPick((cur) => {
      if (!cur) return cur
      const selected = cur.selected.includes(loomNumber)
        ? cur.selected.filter((n) => n !== loomNumber)
        : [...cur.selected, loomNumber]
      return { ...cur, selected }
    })
  }

  const confirmEndLooms = () => {
    if (!endPick) return
    const running = assignedByQuality.get(endPick.quality.id) || []
    const chosen = endPick.selected.filter((n) => running.includes(n))
    if (chosen.length === 0) return
    for (const loomNumber of chosen) {
      onAssignLoom?.(loomNumber, null)
    }
    const left = running.filter((n) => !chosen.includes(n))
    if (left.length === 0) {
      onUpdate(endPick.quality.id, { status: 'ENDED', endedOn: endDateDefault })
    }
    setEndPick(null)
  }

  const editToggle =
    canEditProduction && !readOnly && !isEndedView ? (
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
      warpYarn: addForm.warpYarn.trim(),
      weftYarn: addForm.weftYarn.trim(),
      reed: Number(addForm.reed) || 0,
      pick: Number(addForm.pick) || 0,
      widthInch: Number(addForm.widthInch) || 0,
      gsm: Number(Number(addForm.gsm).toFixed(2)) || 0,
    })
    setIsAddModalOpen(false)
    setAddForm({
      name: '',
      fabricType: 'Suiting',
      warpYarn: '',
      weftYarn: '',
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
          {!readOnly && canEditProduction && !isEndedView && (
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
            const totals = productionByQuality[q.id] || { day: 0, overall: 0 }
            const showEndBtn = canEditProduction && !readOnly && !isEndedView

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
                    {!masterEdit && <span>{qualityDisplayName(q, qualities)}</span>}
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

                <label className="small mb-0">Looms</label>
                <QualityLoomAssign
                  qualityId={q.id}
                  qualityName={qualityDisplayName(q, qualities)}
                  looms={looms}
                  assignedLoomNumbers={assignedByQuality.get(q.id) || []}
                  busyLoomNumbers={busyExcept(q.id)}
                  canAssign={masterEdit}
                  onAssign={onAssignLoom}
                />

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
                        list="quality-warp-stock"
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
                        list="quality-weft-stock"
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
                  <span className="small text-muted">{formatDayHeading(sheetDate)}:</span>
                  <span className="small fw-bold font-monospace">
                    {totals.day > 0 ? `${totals.day.toLocaleString()} m` : '0 m'}
                  </span>
                </div>
                <div className="d-flex justify-content-between align-items-center">
                  <span className="small text-muted">Overall:</span>
                  <span className="small fw-bold text-success font-monospace">
                    {totals.overall > 0 ? `${totals.overall.toLocaleString()} m` : '0 m'}
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
                  <Link
                    href={`/floor/reports/total?quality=${encodeURIComponent(q.id)}&name=${encodeURIComponent(q.name)}`}
                    className="btn btn-sm btn-outline-primary mt-2"
                  >
                    <i className="bi bi-graph-up me-1" />
                    Open Tracking
                  </Link>
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
                <ResizableTh columnKey="loom" width={widths.loom} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  L#
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
                <ResizableTh columnKey="day" width={widths.day} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-end" title={sheetDate}>
                  {formatDayHeading(sheetDate)}
                </ResizableTh>
                <ResizableTh columnKey="production" width={widths.production} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-end">
                  Overall
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
                const totals = productionByQuality[q.id] || { day: 0, overall: 0 }

                return (
                  <tr
                    key={q.id}
                    className={editActive ? 'sara-edit-row' : undefined}
                  >
                    <td className="px-1 text-center text-muted fw-semibold font-monospace" style={{ fontSize: '0.8rem' }}>
                      {rowIdx + 1}
                    </td>
                    <td className="px-1">
                      <QualityLoomAssign
                        qualityId={q.id}
                        qualityName={qualityDisplayName(q, qualities)}
                        looms={looms}
                        assignedLoomNumbers={assignedByQuality.get(q.id) || []}
                        busyLoomNumbers={busyExcept(q.id)}
                        canAssign={opsEdit}
                        onAssign={onAssignLoom}
                      />
                    </td>
                    <td className="px-2">
                      <span className="fw-semibold">{qualityDisplayName(q, qualities)}</span>
                    </td>
                    <td className="px-2 text-truncate">
                      <span className="text-secondary">{q.fabricType || '—'}</span>
                    </td>
                    <td className="px-1">
                      {opsEdit ? (
                        <TextCellInput
                          className="form-control form-control-sm"
                          style={{ width: '100%', minWidth: 0 }}
                          list="quality-warp-stock"
                          value={q.warpYarn || ''}
                          navRow={rowIdx}
                          navCol={2}
                          onValueChange={(v) => onUpdate(q.id, { warpYarn: v })}
                        />
                      ) : (
                        <span className="text-secondary text-truncate d-inline-block" style={{ maxWidth: '100%' }}>
                          {q.warpYarn || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-1">
                      {opsEdit ? (
                        <TextCellInput
                          className="form-control form-control-sm"
                          style={{ width: '100%', minWidth: 0 }}
                          list="quality-weft-stock"
                          value={q.weftYarn || ''}
                          navRow={rowIdx}
                          navCol={3}
                          onValueChange={(v) => onUpdate(q.id, { weftYarn: v })}
                        />
                      ) : (
                        <span className="text-secondary text-truncate d-inline-block" style={{ maxWidth: '100%' }}>
                          {q.weftYarn || '—'}
                        </span>
                      )}
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
                      <span className="fw-semibold font-monospace">
                        {totals.day > 0 ? `${totals.day.toLocaleString()} m` : '0 m'}
                      </span>
                    </td>
                    <td className="px-2 text-end">
                      <span className="fw-bold text-success font-monospace">
                        {totals.overall > 0 ? `${totals.overall.toLocaleString()} m` : '0 m'}
                      </span>
                    </td>
                    {isEndedView && (
                      <td className="px-2 small">{formatShortDate(q.endedOn)}</td>
                    )}
                    <td className="px-1 text-center">
                      {canEditProduction && !readOnly && !isEndedView && (
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
                        <Link
                          href={`/floor/reports/total?quality=${encodeURIComponent(q.id)}&name=${encodeURIComponent(q.name)}`}
                          className="btn btn-sm btn-outline-primary py-0"
                          style={{ fontSize: '0.72rem' }}
                        >
                          Track
                        </Link>
                      )}
                      {!isEndedView && (readOnly || !canEditProduction) && (
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
                        list="quality-warp-stock"
                        className="form-control form-control-sm"
                        placeholder="Beam stock se warp likho"
                        value={addForm.warpYarn}
                        onChange={(e) => setAddForm({ ...addForm, warpYarn: e.target.value })}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-semibold mb-1">Weft Yarn</label>
                      <input
                        type="text"
                        list="quality-weft-stock"
                        className="form-control form-control-sm"
                        placeholder="Yarn stock se weft likho"
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
      <datalist id="quality-warp-stock">
        {warpOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="quality-weft-stock">
        {weftOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {endPick && (
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          role="dialog"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)', zIndex: 1055 }}
          onClick={() => setEndPick(null)}
        >
          <div
            className="modal-dialog modal-dialog-centered modal-dialog-scrollable"
            role="document"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content shadow-lg border-0">
              <div className="modal-header py-2.5 px-3">
                <h5 className="modal-title fs-6 fw-semibold mb-0">
                  End {qualityDisplayName(endPick.quality, qualities)} — kon si loom?
                </h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setEndPick(null)} />
              </div>
              <div className="modal-body p-3">
                <p className="small text-secondary mb-2">
                  Sirf choose ki hui looms se yeh quality is date pe hat jayegi. Baqi looms pe chalti rahegi.
                </p>
                <div className="d-flex flex-column gap-1">
                  {(assignedByQuality.get(endPick.quality.id) || []).map((loomNumber) => {
                    const loom = looms.find((l) => l.loomNumber === loomNumber)
                    const checked = endPick.selected.includes(loomNumber)
                    return (
                      <label
                        key={loomNumber}
                        className="d-flex align-items-center gap-2 mb-0 px-2 py-1 border-bottom rounded-1"
                        style={checked ? { background: 'rgba(220, 53, 69, 0.12)' } : undefined}
                      >
                        <input
                          type="checkbox"
                          className="form-check-input m-0"
                          checked={checked}
                          onChange={() => toggleEndLoom(loomNumber)}
                        />
                        <span className={checked ? 'fw-semibold text-danger' : 'fw-semibold'}>
                          {loom ? loomChoiceLabel(loom) : `L#${loomNumber}`}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
              <div className="modal-footer py-2 px-3">
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEndPick(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  disabled={endPick.selected.length === 0}
                  onClick={confirmEndLooms}
                >
                  End selected ({endPick.selected.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



