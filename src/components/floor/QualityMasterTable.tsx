'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import {
  QualityMaster,
  LoomMaster,
  BeamMaster,
  YarnMaster,
  qualityDisplayName,
  mergeSheetEntriesForDate,
  mergedSheetEntriesForTotals,
  qualityActiveOnSheetDate,
  sheetRowShowsQuality,
  QUALITY_FABRIC_TYPES,
  normalizeFabricType,
  qualityRunThatOwnsSheetEntry,
  qualityEndedVisibleOnDate,
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
  loom: 168,
  name: 150,
  type: 100,
  warp: 110,
  weft: 110,
  weavePlan: 110,
  reed: 65,
  pick: 65,
  width: 65,
  gsm: 80,
  production: 105,
  actions: 140,
  endedOn: 95,
}

export type QualityStatusFilter = 'ACTIVE' | 'HOLD' | 'ENDED'

export function qualityStatusCounts(qualities: QualityMaster[], sheetDate?: string) {
  const active = qualities.filter((q) => (q.status ?? 'ACTIVE') === 'ACTIVE').length
  const day = String(sheetDate || '').slice(0, 10)
  const hold = qualities.filter((q) => (q.status ?? 'ACTIVE') === 'HOLD').length
  const ended = qualities.filter((q) => {
    if (!day) return (q.status ?? 'ACTIVE') === 'ENDED'
    return qualityEndedVisibleOnDate(q, day)
  }).length
  return { active, hold, ended }
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
        className={`btn ${filter === 'HOLD' ? 'btn-primary' : 'btn-outline-secondary'}`}
        onClick={() => onChange('HOLD')}
      >
        Hold ({counts.hold})
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

function formatLoomList(nums: number[]) {
  if (!nums.length) return 'not assigned'
  return nums.map((n) => `L#${n}`).join(', ')
}

function LoomListCell({ nums }: { nums: number[] }) {
  const label = formatLoomList(nums)
  const empty = nums.length === 0
  return (
    <span
      className={`small text-truncate d-inline-block ${empty ? 'text-muted fst-italic' : 'fw-semibold'}`}
      style={{ maxWidth: '100%' }}
      title={label}
    >
      {label}
    </span>
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
  beams?: BeamMaster[]
  yarn?: YarnMaster[]
  statusFilter?: QualityStatusFilter
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
  beams = [],
  yarn = [],
  statusFilter = 'ACTIVE',
  sheetDate = PRODUCTION_TODAY,
}: QualityMasterTableProps) {
  const { canEditProduction } = useAuth()
  const { showConfirm, showSuccessSoon, showInfo } = useAlertDialog()
  const [mode, setMode] = useState<TableGridMode>('table')
  const [tableEdit, setTableEdit] = useState(false)

  // Add Quality Modal Dialog State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [addForm, setAddForm] = useState({
    name: '',
    fabricType: 'Suiting' as string,
    weavePlan: '',
    warpYarn: '',
    weftYarn: '',
    reed: 120,
    pick: 60,
    widthInch: 66,
    gsm: 1.77,
  })
  const [endsFabricFilter, setEndsFabricFilter] = useState<'ALL' | 'Suiting' | 'Shirting'>('ALL')

  const { widths, setColumnWidth, resetColumnWidth } = useResizableColumns(
    'sara_quality_col_widths_v11',
    DEFAULT_WIDTHS
  )

  const isEndedView = statusFilter === 'ENDED'
  const isHoldView = statusFilter === 'HOLD'
  const isArchiveView = isEndedView || isHoldView

  const dayRows = useMemo(
    () => mergeSheetEntriesForDate(sheetDate, entries || []),
    [entries, sheetDate]
  )

  const counts = useMemo(() => qualityStatusCounts(qualities, sheetDate), [qualities, sheetDate])

  /** Keep card/row order fixed while editing so renaming does not reshuffle the grid. */
  const frozenOrderRef = useRef<string[] | null>(null)

  const displayedQualities = useMemo(() => {
    const matchesFabric = (q: QualityMaster) => {
      if (!isEndedView || endsFabricFilter === 'ALL') return true
      return normalizeFabricType(q.fabricType) === endsFabricFilter
    }
    if (isEndedView) {
      const day = String(sheetDate || '').slice(0, 10)
      return qualities
        .filter((q) => {
          if (!day) return (q.status ?? 'ACTIVE') === 'ENDED' && matchesFabric(q)
          if (!qualityEndedVisibleOnDate(q, day)) return false
          return matchesFabric(q)
        })
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    }
    if (isHoldView) {
      return qualities
        .filter((q) => (q.status ?? 'ACTIVE') === 'HOLD')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    }
    const activeOnDay = qualities.filter((q) =>
      qualityActiveOnSheetDate(q, sheetDate, dayRows, qualities)
    )
    // Prefer loom.qualityId order (stable on rename); catalog index for the rest.
    const indexById = new Map(qualities.map((q, i) => [q.id, i]))
    const byLoomId: QualityMaster[] = []
    const seen = new Set<string>()
    const sortedLooms = [...looms].sort((a, b) => a.loomNumber - b.loomNumber)
    for (const l of sortedLooms) {
      if (!l.qualityId || seen.has(l.qualityId)) continue
      const q = activeOnDay.find((item) => item.id === l.qualityId)
      if (!q) continue
      seen.add(q.id)
      byLoomId.push(q)
    }
    const rest = activeOnDay
      .filter((q) => !seen.has(q.id))
      .sort((a, b) => (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0))
    return [...byLoomId, ...rest]
  }, [qualities, looms, dayRows, sheetDate, isEndedView, isHoldView, endsFabricFilter])

  const orderedForView = useMemo(() => {
    if (!tableEdit || isArchiveView) {
      frozenOrderRef.current = displayedQualities.map((q) => q.id)
      return displayedQualities
    }
    const frozen = frozenOrderRef.current
    if (!frozen || frozen.length === 0) {
      frozenOrderRef.current = displayedQualities.map((q) => q.id)
      return displayedQualities
    }
    const byId = new Map(displayedQualities.map((q) => [q.id, q]))
    const kept: QualityMaster[] = []
    for (const id of frozen) {
      const q = byId.get(id)
      if (q) {
        kept.push(q)
        byId.delete(id)
      }
    }
    // Newly appeared rows (rare while editing) go at the end.
    for (const q of byId.values()) kept.push(q)
    return kept
  }, [displayedQualities, tableEdit, isArchiveView])

  useEffect(() => {
    if (!tableEdit) frozenOrderRef.current = null
  }, [tableEdit])

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

  const assignedByQuality = useMemo(() => {
    const map = new Map<string, number[]>()
    const day = (entries || []).filter((e) => !e.date || !sheetDate || e.date === sheetDate)
    const sheetBuilt = day.length > 0
    for (const q of qualities) {
      const fromSheet = [
        ...new Set(
          day.filter((e) => sheetRowShowsQuality(e, q, qualities)).map((e) => e.loomNumber)
        ),
      ].sort((a, b) => a - b)
      if (sheetBuilt) {
        map.set(q.id, fromSheet)
        continue
      }
      const fromLooms = looms
        .filter((l) => l.qualityId === q.id)
        .map((l) => l.loomNumber)
      map.set(q.id, [...new Set(fromLooms)].sort((a, b) => a - b))
    }
    return map
  }, [entries, qualities, sheetDate, looms])

  const productionByQuality = useMemo(() => {
    const stats: Record<string, number> = {}
    for (const q of qualities) stats[q.id] = 0

    const allDays = mergedSheetEntriesForTotals(sheetDate, entries || [])

    for (const e of allDays) {
      const owner = qualityRunThatOwnsSheetEntry(e, qualities, sheetDate)
      if (!owner) continue
      stats[owner.id] = (stats[owner.id] || 0) + meterOf(e)
    }
    return stats
  }, [qualities, entries, sheetDate])

  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  )

  /** Field edits — only while Edit is on. Loom assign is on Looms table. */
  const canOps = canEditProduction && !readOnly && !isArchiveView
  const canArchiveOps = canEditProduction && !readOnly
  const opsEdit = canOps && tableEdit && mode === 'table'
  const masterEdit = canOps && tableEdit && mode === 'grid'
  const editActive = opsEdit || masterEdit

  const cardTitle =
    statusFilter === 'ENDED'
      ? `Quality — Ended (${counts.ended})`
      : statusFilter === 'HOLD'
        ? `Quality — Hold (${counts.hold})`
        : `Quality — Active (${counts.active})`

  const editToggle =
    canEditProduction && !readOnly && !isArchiveView ? (
      <button
        type="button"
        className={`btn btn-sm ${tableEdit ? 'btn-warning' : 'btn-outline-secondary'}`}
        title={tableEdit ? 'Lock table (view only)' : 'Enable editing'}
        onClick={() => {
          if (tableEdit) {
            setTableEdit(false)
            showSuccessSoon({
              title: 'Saved',
              message: 'Quality edits save ho gayi hain.',
            })
          } else {
            setTableEdit(true)
          }
        }}
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
        showSuccessSoon({
          title: 'Deleted',
          message: `"${q.name}" delete ho gayi.`,
        })
      },
    })
  }

  const handleEnd = (q: QualityMaster) => {
    if (!canOps) return
    if ((q.status ?? 'ACTIVE') === 'ENDED') return
    const endDate = String(sheetDate || '').slice(0, 10)
    const label = qualityDisplayName(q, qualities)
    showConfirm({
      title: 'Quality End Karein?',
      message: `"${label}" ko ${formatShortDate(endDate)} pe end kar dein? Loom se bhi hata di jayegi.`,
      type: 'confirm',
      confirmText: 'End',
      cancelText: 'Cancel',
      onConfirm: () => {
        onUpdate(q.id, { status: 'ENDED', endedOn: endDate })
        showSuccessSoon({
          title: 'Quality Ended',
          message: `"${label}" end ho gayi. Related looms pe “Ended” dikhega.`,
        })
      },
    })
  }

  const handleHold = (q: QualityMaster) => {
    if (!canOps) return
    if ((q.status ?? 'ACTIVE') !== 'ACTIVE') return
    const holdDate = String(sheetDate || '').slice(0, 10)
    const label = qualityDisplayName(q, qualities)
    showConfirm({
      title: 'Quality Hold Karein?',
      message: `"${label}" ko hold pe rakh dein? Loom se hata di jayegi; baad mein resume kar sakte ho.`,
      type: 'confirm',
      confirmText: 'Hold',
      cancelText: 'Cancel',
      onConfirm: () => {
        onUpdate(q.id, { status: 'HOLD', endedOn: holdDate })
        showSuccessSoon({
          title: 'Quality On Hold',
          message: `"${label}" hold pe aa gayi. Related looms pe “Hold” dikhega.`,
        })
      },
    })
  }

  const handleResume = (q: QualityMaster) => {
    if (!canArchiveOps) return
    const label = qualityDisplayName(q, qualities)
    showConfirm({
      title: 'Quality Resume?',
      message: `"${label}" ko Active pe wapas laayein?`,
      type: 'confirm',
      confirmText: 'Resume',
      cancelText: 'Cancel',
      onConfirm: () => {
        onUpdate(q.id, { status: 'ACTIVE', endedOn: null })
        showSuccessSoon({
          title: 'Quality Resumed',
          message: `"${label}" Active pe wapas aa gayi.`,
        })
      },
    })
  }

  const handleReassign = (q: QualityMaster) => {
    if (!canArchiveOps) return
    const day = String(sheetDate || '').slice(0, 10)
    const label = qualityDisplayName(q, qualities)
    showConfirm({
      title: 'Quality Reassign?',
      message: `"${label}" ko Active pe wapas laayein? Overall meters zero se shuru hongi.`,
      type: 'confirm',
      confirmText: 'Reassign',
      cancelText: 'Cancel',
      onConfirm: () => {
        onUpdate(q.id, { status: 'ACTIVE', endedOn: null, createdOn: day })
        showSuccessSoon({
          title: 'Quality Reassigned',
          message: `"${label}" Active pe aa gayi — meters zero se shuru.`,
        })
      },
    })
  }

  const rowMenu = (q: QualityMaster, compact?: boolean) => {
    if (!canOps) return null
    return (
      <div className="dropdown">
        <button
          type="button"
          className={`btn btn-sm btn-outline-secondary ${compact ? 'py-0 px-1' : ''}`}
          style={compact ? { fontSize: '0.85rem', lineHeight: 1 } : undefined}
          data-bs-toggle="dropdown"
          aria-expanded="false"
          title="More actions"
        >
          <i className="bi bi-three-dots-vertical" />
        </button>
        <ul className="dropdown-menu dropdown-menu-end">
          <li>
            <button type="button" className="dropdown-item" onClick={() => handleHold(q)}>
              <i className="bi bi-pause-circle me-2" /> Hold
            </button>
          </li>
          <li>
            <button type="button" className="dropdown-item text-danger" onClick={() => handleEnd(q)}>
              <i className="bi bi-stop-circle me-2" /> End
            </button>
          </li>
        </ul>
      </div>
    )
  }

  const archiveAction = (q: QualityMaster, compact?: boolean) => {
    if (!canArchiveOps) return null
    if (!isHoldView && !isEndedView) return null
    return (
      <div className="dropdown">
        <button
          type="button"
          className={`btn btn-sm btn-outline-secondary ${compact ? 'py-0 px-1' : ''}`}
          style={compact ? { fontSize: '0.85rem', lineHeight: 1 } : undefined}
          data-bs-toggle="dropdown"
          aria-expanded="false"
          title="More actions"
        >
          <i className="bi bi-three-dots-vertical" />
        </button>
        <ul className="dropdown-menu dropdown-menu-end">
          {isHoldView && (
            <li>
              <button type="button" className="dropdown-item" onClick={() => handleResume(q)}>
                <i className="bi bi-play-circle me-2" /> Resume
              </button>
            </li>
          )}
          {isEndedView && (
            <li>
              <button type="button" className="dropdown-item" onClick={() => handleReassign(q)}>
                <i className="bi bi-arrow-repeat me-2" /> Reassign
              </button>
            </li>
          )}
        </ul>
      </div>
    )
  }

  const openTrack = (q: QualityMaster) => {
    const overall = Number(productionByQuality[q.id] || 0)
    // Re-add / reassign run with no meters yet → dialog only, never open Track page.
    if (!(overall > 0)) {
      showInfo({
        title: 'Abhi Production Start Nahi Hui',
        message: `"${qualityDisplayName(q, qualities)}" pe abhi production start nahi hui. Jab meters aayein tab Track zero se shuru hoga.`,
      })
      return
    }
    const from = q.createdOn ? String(q.createdOn).slice(0, 10) : ''
    const qs = new URLSearchParams({
      quality: q.id,
      name: q.name,
    })
    if (from) qs.set('from', from)
    window.location.assign(`/floor/reports/total?${qs.toString()}`)
  }

  const handleCreateQuality = (e: React.FormEvent) => {
    e.preventDefault()
    if (!addForm.name.trim()) return
    const name = addForm.name.trim()
    onAdd({
      name,
      fabricType: normalizeFabricType(addForm.fabricType),
      weavePlan: addForm.weavePlan.trim(),
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
      weavePlan: '',
      warpYarn: '',
      weftYarn: '',
      reed: 120,
      pick: 60,
      widthInch: 66,
      gsm: 1.77,
    })
    showSuccessSoon({
      title: 'Quality Added',
      message: `"${name}" add ho gayi — meters zero se shuru.`,
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
          {isEndedView && (
            <div className="btn-group btn-group-sm" role="group" aria-label="Fabric type filter">
              <button
                type="button"
                className={`btn ${endsFabricFilter === 'ALL' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                onClick={() => setEndsFabricFilter('ALL')}
              >
                All
              </button>
              <button
                type="button"
                className={`btn ${endsFabricFilter === 'Suiting' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                onClick={() => setEndsFabricFilter('Suiting')}
              >
                Suiting
              </button>
              <button
                type="button"
                className={`btn ${endsFabricFilter === 'Shirting' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                onClick={() => setEndsFabricFilter('Shirting')}
              >
                Shirting
              </button>
            </div>
          )}
          {editToggle}
          <ViewModeToggle mode={mode} onChange={setMode} />
          {!readOnly && canEditProduction && !isArchiveView && (
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
        isArchiveView ? (
          <div className="card-body p-3">
            {orderedForView.length === 0 ? (
              <p className="text-muted small mb-0">
                {isHoldView
                  ? 'Koi quality hold pe nahi hai.'
                  : `Is date (${formatShortDate(sheetDate)}) pe koi quality end nahi hui.`}
              </p>
            ) : (
              <ul className="list-group list-group-flush">
                {orderedForView.map((q, rowIdx) => {
                  const overall = productionByQuality[q.id] || 0
                  return (
                  <li
                    key={q.id}
                    className="list-group-item d-flex flex-column gap-2 px-0"
                  >
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                      <div className="d-flex align-items-center gap-2 min-w-0">
                        <span className="badge bg-secondary-subtle text-secondary font-monospace">
                          #{rowIdx + 1}
                        </span>
                        <span className="fw-semibold text-truncate">{qualityDisplayName(q, qualities)}</span>
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <span className="small fw-bold text-success font-monospace">
                          {overall > 0 ? `${overall.toLocaleString()} m` : '0 m'}
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary py-0"
                          style={{ fontSize: '0.72rem' }}
                          onClick={() => openTrack(q)}
                        >
                          Track
                        </button>
                        {archiveAction(q)}
                      </div>
                    </div>
                    <div className="small text-muted ps-4 d-flex flex-wrap gap-x-3 gap-y-1">
                      <span>{q.fabricType || '—'}</span>
                      <span>Warp: {q.warpYarn || '—'}</span>
                      <span>Weft: {q.weftYarn || '—'}</span>
                      <span>Weave: {q.weavePlan || '—'}</span>
                      <span>Reed: {q.reed || '—'}</span>
                      <span>Pick: {q.pick || '—'}</span>
                      <span>Width: {q.widthInch ? `${q.widthInch}"` : '—'}</span>
                      <span>
                        GSM:{' '}
                        {q.gsm != null && q.gsm !== 0 ? Number(q.gsm).toFixed(2) : '—'}
                      </span>
                      <span>
                        {isHoldView ? 'Held' : 'Ended'}: {formatShortDate(q.endedOn || sheetDate)}
                      </span>
                    </div>
                  </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : (
        <div className="master-grid">
          {orderedForView.map((q, rowIdx) => {
            const overall = productionByQuality[q.id] || 0

            return (
              <div
                key={q.id}
                className={`master-grid-card${editActive ? ' sara-edit-card' : ''}`}
              >
                <div className="d-flex align-items-center justify-content-between">
                  <div className="fw-semibold d-flex align-items-center gap-1.5 min-w-0">
                    <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '0.74rem' }}>
                      #{rowIdx + 1}
                    </span>
                    <span className="text-truncate">{q.name || '—'}</span>
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
                <LoomListCell nums={assignedByQuality.get(q.id) || []} />

                {masterEdit && (
                  <>
                    <label className="small mb-0">Quality Name</label>
                    <TextCellInput
                      className="form-control form-control-sm"
                      value={q.name}
                      navRow={rowIdx}
                      navCol={0}
                      onValueChange={(v) => onUpdate(q.id, { name: v })}
                    />
                  </>
                )}

                <label className="small mb-0">Fabric Type</label>
                {masterEdit ? (
                  <select
                    className="form-select form-select-sm"
                    value={normalizeFabricType(q.fabricType)}
                    onChange={(e) => onUpdate(q.id, { fabricType: e.target.value })}
                  >
                    {QUALITY_FABRIC_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
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

                <label className="small mb-0">Weave Plan</label>
                {masterEdit ? (
                  <TextCellInput
                    className="form-control form-control-sm"
                    value={q.weavePlan || ''}
                    navRow={rowIdx}
                    navCol={4}
                    onValueChange={(v) => onUpdate(q.id, { weavePlan: v })}
                  />
                ) : (
                  <div className="small">{q.weavePlan || '—'}</div>
                )}

                <div className="d-flex gap-2">
                  <div className="flex-fill">
                    <label className="small mb-0">Reed</label>
                    {masterEdit ? (
                      <NumericCellInput
                        className="form-control form-control-sm text-end"
                        value={q.reed}
                        navRow={rowIdx}
                        navCol={5}
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
                        navCol={6}
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
                        navCol={7}
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
                    navCol={8}
                    onValueChange={(v) => onUpdate(q.id, { gsm: Number(Number(v).toFixed(2)) })}
                  />
                ) : (
                  <div className="small fw-semibold font-monospace">
                    {q.gsm != null && q.gsm !== 0 ? Number(q.gsm).toFixed(2) : '—'}
                  </div>
                )}

                <div className="d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
                  <span className="small text-muted">Overall:</span>
                  <span className="small fw-bold text-success font-monospace">
                    {overall > 0 ? `${overall.toLocaleString()} m` : '0 m'}
                  </span>
                </div>

                <div className="d-flex gap-1 mt-2 align-items-center">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary flex-fill"
                    onClick={() => openTrack(q)}
                  >
                    Track
                  </button>
                  {rowMenu(q)}
                </div>

              </div>
            )
          })}
        </div>
        )
      ) : isArchiveView ? (
        <div className="card-body p-0">
          <table className="table table-sm table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th className="px-2 text-center" style={{ width: 46 }}>
                  #
                </th>
                <th className="px-2">Quality Name</th>
                <th className="px-2">Type</th>
                <th className="px-2">Warp Yarn</th>
                <th className="px-2">Weft Yarn</th>
                <th className="px-2">Weave Plan</th>
                <th className="px-2 text-end">Reed</th>
                <th className="px-2 text-end">Pick</th>
                <th className="px-2 text-end">Width</th>
                <th className="px-2 text-end">GSM</th>
                <th className="px-2 text-end">Overall</th>
                <th className="px-2" style={{ width: 110 }}>
                  {isHoldView ? 'Held On' : 'Ended On'}
                </th>
                <th className="px-2 text-center" style={{ width: 140 }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {orderedForView.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3 py-4 text-muted small text-center">
                    {isHoldView
                      ? 'Koi quality hold pe nahi hai.'
                      : `Is date (${formatShortDate(sheetDate)}) pe koi quality end nahi hui.`}
                  </td>
                </tr>
              ) : (
                orderedForView.map((q, rowIdx) => {
                  const overall = productionByQuality[q.id] || 0
                  return (
                  <tr key={q.id}>
                    <td className="px-2 text-center text-muted fw-semibold font-monospace">{rowIdx + 1}</td>
                    <td className="px-2 fw-semibold">{qualityDisplayName(q, qualities)}</td>
                    <td className="px-2 text-secondary">{q.fabricType || '—'}</td>
                    <td className="px-2 small">{q.warpYarn || '—'}</td>
                    <td className="px-2 small">{q.weftYarn || '—'}</td>
                    <td className="px-2 small">{q.weavePlan || '—'}</td>
                    <td className="px-2 text-end font-monospace">{q.reed || '—'}</td>
                    <td className="px-2 text-end font-monospace">{q.pick || '—'}</td>
                    <td className="px-2 text-end font-monospace">{q.widthInch ? `${q.widthInch}"` : '—'}</td>
                    <td className="px-2 text-end font-monospace">
                      {q.gsm != null && q.gsm !== 0 ? Number(q.gsm).toFixed(2) : '—'}
                    </td>
                    <td className="px-2 text-end">
                      <span className="fw-bold text-success font-monospace">
                        {overall > 0 ? `${overall.toLocaleString()} m` : '0 m'}
                      </span>
                    </td>
                    <td className="px-2 font-monospace small">{formatShortDate(q.endedOn || sheetDate)}</td>
                    <td className="px-2 text-center">
                      <div className="d-inline-flex align-items-center gap-1">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary py-0"
                          style={{ fontSize: '0.72rem' }}
                          onClick={() => openTrack(q)}
                        >
                          Track
                        </button>
                        {archiveAction(q, true)}
                      </div>
                    </td>
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
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
                .filter((key) => key !== 'endedOn')
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
                <ResizableTh columnKey="weavePlan" width={widths.weavePlan} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Weave Plan
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
                  Overall
                </ResizableTh>
                <ResizableTh columnKey="actions" width={widths.actions} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
                  style={{ fontSize: '0.75rem' }}>
                  Action
                </ResizableTh>
              </tr>
            </thead>
            <tbody>
              {orderedForView.map((q, rowIdx) => {
                const overall = productionByQuality[q.id] || 0

                return (
                  <tr
                    key={q.id}
                    className={editActive ? 'sara-edit-row' : undefined}
                  >
                    <td className="px-1 text-center text-muted fw-semibold font-monospace" style={{ fontSize: '0.8rem' }}>
                      {rowIdx + 1}
                    </td>
                    <td className="px-1">
                      <LoomListCell nums={assignedByQuality.get(q.id) || []} />
                    </td>
                    <td className="px-2">
                      <span className="fw-semibold">{qualityDisplayName(q, qualities)}</span>
                    </td>
                    <td className="px-2 text-truncate">
                      {opsEdit ? (
                        <select
                          className="form-select form-select-sm"
                          style={{ width: '100%', minWidth: 0 }}
                          value={normalizeFabricType(q.fabricType)}
                          onChange={(e) => onUpdate(q.id, { fabricType: e.target.value })}
                        >
                          {QUALITY_FABRIC_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-secondary">{q.fabricType || '—'}</span>
                      )}
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
                        <TextCellInput
                          className="form-control form-control-sm"
                          style={{ width: '100%', minWidth: 0 }}
                          value={q.weavePlan || ''}
                          navRow={rowIdx}
                          navCol={4}
                          onValueChange={(v) => onUpdate(q.id, { weavePlan: v })}
                        />
                      ) : (
                        <span className="text-secondary text-truncate d-inline-block" style={{ maxWidth: '100%' }}>
                          {q.weavePlan || '—'}
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
                          navCol={5}
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
                          navCol={6}
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
                          navCol={7}
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
                          navCol={8}
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
                        {overall > 0 ? `${overall.toLocaleString()} m` : '0 m'}
                      </span>
                    </td>
                    <td className="px-1 text-center">
                      <div className="d-inline-flex align-items-center gap-1">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary py-0"
                          style={{ fontSize: '0.72rem' }}
                          onClick={() => openTrack(q)}
                        >
                          Track
                        </button>
                        {rowMenu(q, true)}
                      </div>
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
                      <select
                        className="form-select form-select-sm"
                        value={normalizeFabricType(addForm.fabricType)}
                        onChange={(e) => setAddForm({ ...addForm, fabricType: e.target.value })}
                      >
                        {QUALITY_FABRIC_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
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
                      <label className="form-label small fw-semibold mb-1">Weave Plan</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="e.g. 2/1 Twill"
                        value={addForm.weavePlan}
                        onChange={(e) => setAddForm({ ...addForm, weavePlan: e.target.value })}
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
    </div>
  )
}



