'use client'

import { useMemo, useState } from 'react'
import {
  LoomMaster,
  QualityMaster,
  YarnMaster,
  getLoomPictures,
  normalizeLoomPictures,
  qualityDisplayName,
  qualityNameKey,
  qualityIdOnLoomForDate,
  qualityIdsOnLoomForDate,
  qualityActiveOnSheetDate,
  rpmOnLoomForDate,
  statusOnLoomForDate,
  mergeSheetEntriesForDate,
  normalizeQualityStatus,
  sheetSegmentIndex,
} from '@/services/productionMastersService'
import { PRODUCTION_TODAY } from '@/constants/productionCalendar'
import { LoomCategory } from '@/types/loom'
import { DailyLoomProductionEntry } from '@/types/production'
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
  quality: 150,
  shed: 110,
  status: 130,
}

interface LoomMasterTableProps {
  looms: LoomMaster[]
  yarn?: YarnMaster[]
  qualities?: QualityMaster[]
  entries?: DailyLoomProductionEntry[]
  sheetDate?: string
  onUpdate: (
    loomNumber: number,
    patch: Partial<LoomMaster>
  ) => void | { forwardFillSkipped?: { date: string; qualityName: string; loomNumber: number }[] }
  /** Same-day dual quality: create part 2+ on sheetDate for this loom. */
  onAddQualitySegment?: (loomNumber: number, qualityId: string) => boolean
  onAdd: (partial?: Partial<LoomMaster>) => void
  onDelete?: (loomNumber: number) => void
  readOnly?: boolean
  toolbarInChrome?: boolean
  tableEdit?: boolean
  onTableEditChange?: (next: boolean) => void
  addModalOpen?: boolean
  onAddModalOpenChange?: (open: boolean) => void
}

export function LoomMasterTable({
  looms,
  qualities = [],
  entries = [],
  sheetDate = PRODUCTION_TODAY,
  onUpdate,
  onAddQualitySegment,
  onAdd,
  onDelete,
  readOnly,
  toolbarInChrome = false,
  tableEdit: tableEditProp,
  onTableEditChange,
  addModalOpen: addModalOpenProp,
  onAddModalOpenChange,
}: LoomMasterTableProps) {
  const [mode, setMode] = useState<TableGridMode>('table')
  const [modelFilter, setModelFilter] = useState<'ALL' | LoomCategory>('ALL')
  const [tableEditLocal, setTableEditLocal] = useState(false)
  const [isAddModalOpenLocal, setIsAddModalOpenLocal] = useState(false)
  /** Loom # whose Part 2 quality picker is open (edit mode only). */
  const [part2ForLoom, setPart2ForLoom] = useState<number | null>(null)
  const [part2QualityId, setPart2QualityId] = useState('')
  const { canEditProduction } = useAuth()
  const { showConfirm, showSuccessSoon, showError } = useAlertDialog()

  const formatShortDate = (dateStr?: string | null) => {
    if (!dateStr) return '—'
    try {
      const d = new Date(`${dateStr}T12:00:00`)
      return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch {
      return dateStr
    }
  }

  const assignQuality = (loomNumber: number, qualityId: string | null) => {
    const result = onUpdate(loomNumber, { qualityId })
    const skips = result && 'forwardFillSkipped' in result ? result.forwardFillSkipped : undefined
    if (skips && skips.length > 0) {
      const detail = skips
        .map((s) => `${formatShortDate(s.date)} → "${s.qualityName}"`)
        .join('; ')
      showError({
        title: 'Kuch din pehle se busy the',
        message: `L#${loomNumber} pe ye din doosri quality pe pehle se lage hue the, is liye wahan nahi badla: ${detail}. Selected date pe agar pehle se meters/quality thi to same-day part 2 ban sakti hai; baaki busy din skip.`,
      })
    }
  }

  const tableEdit = tableEditProp ?? tableEditLocal
  const setTableEdit = (next: boolean) => {
    onTableEditChange?.(next)
    if (tableEditProp === undefined) setTableEditLocal(next)
  }
  const isAddModalOpen = addModalOpenProp ?? isAddModalOpenLocal
  const setIsAddModalOpen = (next: boolean) => {
    onAddModalOpenChange?.(next)
    if (addModalOpenProp === undefined) setIsAddModalOpenLocal(next)
  }

  const opsEdit = canEditProduction && !readOnly && tableEdit && mode === 'table'
  const masterEdit = canEditProduction && !readOnly && tableEdit && mode === 'grid'
  const editActive = opsEdit || masterEdit

  const { widths, setColumnWidth, resetColumnWidth } = useResizableColumns(
    'sara_loom_col_widths_v6',
    DEFAULT_WIDTHS
  )
  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  )

  const dayRows = useMemo(
    () => mergeSheetEntriesForDate(sheetDate, entries || []),
    [entries, sheetDate]
  )

  const filteredLooms = useMemo(() => {
    if (modelFilter === 'ALL') return looms
    return looms.filter((l) => (l.model || l.category) === modelFilter)
  }, [looms, modelFilter])

  const dayQualityId = (loom: LoomMaster) =>
    qualityIdOnLoomForDate(loom, qualities, dayRows, sheetDate)

  const daySegmentCount = (loom: LoomMaster) => {
    const rows = dayRows.filter((e) => e.loomNumber === loom.loomNumber)
    if (rows.length === 0) return 0
    return Math.max(...rows.map((e) => sheetSegmentIndex(e)), rows.length)
  }

  const dayHasNamedPose = (loom: LoomMaster) =>
    dayRows.some((e) => {
      if (e.loomNumber !== loom.loomNumber) return false
      const n = (e.qualityName || '').trim()
      return n !== '' && n !== '—' && n !== '-'
    }) || Boolean(dayQualityId(loom))

  const dayRpm = (loom: LoomMaster) => rpmOnLoomForDate(loom, dayRows)

  const dayStatus = (loom: LoomMaster) => statusOnLoomForDate(loom, dayRows)

  const openPart2Picker = (loom: LoomMaster) => {
    if (!onAddQualitySegment || !editActive) return
    if (!dayHasNamedPose(loom)) {
      showError({
        title: 'Pehle Part 1 quality lagao',
        message: `Loom #${loom.loomNumber} pe is date (${formatShortDate(sheetDate)}) pe pehle quality assign karo, phir Part 2 banao.`,
      })
      return
    }
    setPart2ForLoom(loom.loomNumber)
    setPart2QualityId('')
  }

  const part2OptionsFor = (loom: LoomMaster) => {
    const onDay = new Set(qualityIdsOnLoomForDate(loom, qualities, dayRows, sheetDate))
    return qualityOptionsFor(loom).filter((q) => !onDay.has(q.id))
  }

  const confirmPart2 = (loom: LoomMaster) => {
    if (!onAddQualitySegment || !part2QualityId) return
    const q = qualities.find((item) => item.id === part2QualityId)
    const label = q ? qualityDisplayName(q, qualities) : part2QualityId
    const nextPart = Math.max(2, daySegmentCount(loom) + 1)
    showConfirm({
      title: `Part ${nextPart} add karein?`,
      message: `Loom #${loom.loomNumber} pe ${formatShortDate(sheetDate)} ko Part ${nextPart} → "${label}". Pehli quality / meters same rahengi.`,
      type: 'confirm',
      confirmText: `Part ${nextPart}`,
      cancelText: 'Cancel',
      onConfirm: () => {
        const ok = onAddQualitySegment(loom.loomNumber, part2QualityId)
        setPart2ForLoom(null)
        setPart2QualityId('')
        if (ok) {
          showSuccessSoon({
            title: `Part ${nextPart} added`,
            message: `Loom #${loom.loomNumber}: "${label}" — Daily Entry / Sheet pe part ${nextPart} dikhegi.`,
          })
        } else {
          showError({
            title: 'Part add nahi hua',
            message: 'Dobara try karo, ya pehle loom pe Part 1 quality check karo.',
          })
        }
      },
    })
  }

  const loomNumberCell = (loom: LoomMaster) => {
    const segs = daySegmentCount(loom)
    const picking = part2ForLoom === loom.loomNumber
    const canPart2 = Boolean(onAddQualitySegment) && editActive
    const part2Opts = picking ? part2OptionsFor(loom) : []
    const nextPart = Math.max(2, segs + 1)

    return (
      <div className="sara-loom-num-cell position-relative d-inline-flex align-items-center gap-1">
        <span className="fw-semibold">{loom.loomNumber}</span>
        {segs > 1 && (
          <span
            className="d-inline-flex align-items-center"
            style={{ gap: 2 }}
            title={`${segs} qualities on ${formatShortDate(sheetDate)}`}
          >
            {Array.from({ length: segs }, (_, i) => i + 1).map((seg) => (
              <span
                key={`loom-${loom.loomNumber}-badge-p${seg}`}
                className={`badge ${seg <= 1 ? 'text-bg-primary' : 'text-bg-warning'}`}
                style={{ fontSize: '0.58rem' }}
              >
                P{seg}
              </span>
            ))}
          </span>
        )}
        {canPart2 && (
          <button
            type="button"
            className={`btn btn-sm py-0 px-1 sara-loom-part2-btn ${
              picking ? 'btn-warning' : 'btn-outline-warning'
            }`}
            style={{ fontSize: '0.65rem', lineHeight: 1.2, opacity: picking ? 1 : undefined }}
            title={`Part ${nextPart} — same day dusri quality`}
            onClick={(e) => {
              e.stopPropagation()
              if (picking) {
                setPart2ForLoom(null)
                setPart2QualityId('')
              } else {
                openPart2Picker(loom)
              }
            }}
          >
            +P{nextPart}
          </button>
        )}
        {picking && (
          <div
            className="sara-loom-part2-popover shadow border rounded bg-white p-2"
            style={{
              position: 'absolute',
              left: 0,
              top: '100%',
              zIndex: 30,
              minWidth: 220,
              marginTop: 4,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="small fw-semibold mb-1">
              Loom #{loom.loomNumber} · Part {nextPart}
            </div>
            {part2Opts.length === 0 ? (
              <div className="small text-muted mb-2">
                Is din pe aur Active quality nahi — pehle Quality tab se nayi Active banao, ya dusri quality free karo.
              </div>
            ) : (
              <select
                className="form-select form-select-sm mb-2"
                value={part2QualityId}
                onChange={(e) => setPart2QualityId(e.target.value)}
                autoFocus
              >
                <option value="">Quality choose…</option>
                {part2Opts.map((q) => (
                  <option key={q.id} value={q.id}>
                    {qualityOptionLabel(q)}
                  </option>
                ))}
              </select>
            )}
            <div className="d-flex gap-1 justify-content-end">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary py-0 px-2"
                style={{ fontSize: '0.72rem' }}
                onClick={() => {
                  setPart2ForLoom(null)
                  setPart2QualityId('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-warning py-0 px-2"
                style={{ fontSize: '0.72rem' }}
                disabled={!part2QualityId || part2Opts.length === 0}
                onClick={() => confirmPart2(loom)}
              >
                Add Part {nextPart}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const qualityOptionsFor = (loom: LoomMaster) => {
    const currentId = dayQualityId(loom)
    const day = String(sheetDate || '').slice(0, 10)
    const visible = qualities.filter((q) => {
      // Keep current selection visible even if it would otherwise be filtered.
      if (q.id === currentId) return true
      // Loom dropdown = Active only; qualities created after this date stay hidden
      // (e.g. made on 3 Oct must not appear when assigning on 2 Oct).
      if (normalizeQualityStatus(q.status) !== 'ACTIVE') return false
      return qualityActiveOnSheetDate(q, day, dayRows, qualities)
    })

    // One option per name (+ pick) if reuse left duplicate Active rows.
    const rank = (q: QualityMaster) => {
      let score = 0
      if (q.id === currentId) score += 1000
      if ((q.status ?? 'ACTIVE') === 'ACTIVE') score += 100
      const created = q.createdOn ? String(q.createdOn).slice(0, 10) : ''
      score += created ? Number(created.replace(/-/g, '')) / 1e8 : 0
      return score
    }
    const optionKey = (q: QualityMaster) => {
      const bare = (q.name || '').replace(/\s*\(\s*pick\s*\d+\s*\)\s*$/i, '').trim()
      return `${qualityNameKey(bare)}:${Number(q.pick) || 0}`
    }

    const bestByKey = new Map<string, QualityMaster>()
    for (const q of visible) {
      const key = optionKey(q)
      const prev = bestByKey.get(key)
      if (!prev || rank(q) > rank(prev)) bestByKey.set(key, q)
    }
    return [...bestByKey.values()].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    )
  }

  const qualityOptionLabel = (q: QualityMaster) => {
    return (q.name || '').replace(/\s*\(\s*pick\s*\d+\s*\)\s*$/i, '').trim() || q.name
  }

  const namedPose = (name?: string | null) => {
    const n = (name || '').trim()
    return n !== '' && n !== '—' && n !== '-'
  }

  /** Same-day quality parts for loom (Part 1, Part 2, …) for display. */
  const dayQualityParts = (loom: LoomMaster): { seg: number; name: string }[] => {
    const rows = dayRows
      .filter((e) => e.loomNumber === loom.loomNumber)
      .sort((a, b) => sheetSegmentIndex(a) - sheetSegmentIndex(b))
    const parts: { seg: number; name: string }[] = []
    for (const row of rows) {
      if (!namedPose(row.qualityName)) continue
      parts.push({
        seg: sheetSegmentIndex(row),
        name: (row.qualityName || '').trim(),
      })
    }
    if (parts.length > 0) return parts
    const id = dayQualityId(loom)
    if (id) {
      const q = qualities.find((item) => item.id === id)
      if (q && q.status !== 'ENDED' && q.status !== 'HOLD') {
        return [{ seg: 1, name: qualityDisplayName(q, qualities) }]
      }
    }
    return []
  }

  const qualityLabel = (loom: LoomMaster) => {
    const parts = dayQualityParts(loom)
    if (parts.length === 0) return '—'
    if (parts.length === 1) return parts[0].name
    return parts.map((p) => `P${p.seg}: ${p.name}`).join(' · ')
  }

  const qualityCellClass = (loom: LoomMaster) => {
    if (dayQualityParts(loom).length > 0) return 'fw-semibold'
    return 'fw-semibold text-muted'
  }

  const partChipClass = (seg: number) =>
    seg <= 1
      ? 'bg-primary-subtle text-primary-emphasis border border-primary-subtle'
      : 'bg-warning-subtle text-warning-emphasis border border-warning-subtle'

  const partBadgeClass = (seg: number) =>
    seg <= 1 ? 'text-bg-primary' : 'text-bg-warning'

  const qualityPartsView = (loom: LoomMaster) => {
    const parts = dayQualityParts(loom)
    if (parts.length === 0) {
      return <span className="fw-semibold text-muted">—</span>
    }
    if (parts.length === 1) {
      return (
        <span className="text-truncate d-block fw-semibold" title={parts[0].name}>
          {parts[0].name}
        </span>
      )
    }
    return (
      <div className="d-flex flex-column gap-1" title={qualityLabel(loom)}>
        {parts.map((p) => (
          <div
            key={`${loom.loomNumber}-p${p.seg}`}
            className={`d-flex align-items-center gap-1 rounded px-1 py-0 small ${partChipClass(p.seg)}`}
            style={{ lineHeight: 1.35 }}
          >
            <span className={`badge ${partBadgeClass(p.seg)}`} style={{ fontSize: '0.58rem' }}>
              P{p.seg}
            </span>
            <span className="text-truncate fw-semibold">{p.name}</span>
          </div>
        ))}
      </div>
    )
  }

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
        onClick={() => {
          if (tableEdit) {
            setTableEdit(false)
            showSuccessSoon({
              title: 'Saved',
              message: 'Loom edits save ho gayi hain.',
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

  const nextLoomNumber = useMemo(
    () => looms.reduce((m, l) => Math.max(m, l.loomNumber), 0) + 1,
    [looms]
  )

  const handleDeleteLoom = (l: LoomMaster) => {
    if (!masterEdit || !onDelete) return
    const label = l.name || `Loom ${l.loomNumber}`
    showConfirm({
      title: 'Loom Delete Karein?',
      message: `Kya aap waqai "${label}" (Loom #${l.loomNumber}) ko delete karna chahte hain?`,
      type: 'confirm',
      confirmText: 'Haan, Delete Karein',
      cancelText: 'Cancel',
      onConfirm: () => {
        onDelete(l.loomNumber)
        showSuccessSoon({
          title: 'Deleted',
          message: `"${label}" delete ho gayi.`,
        })
      },
    })
  }

  return (
    <div className="card">
      <style>{`
        .sara-loom-part2-btn {
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.12s ease;
        }
        .sara-loom-num-cell:hover .sara-loom-part2-btn,
        .sara-loom-num-cell:focus-within .sara-loom-part2-btn,
        tr:hover .sara-loom-part2-btn,
        .master-grid-card:hover .sara-loom-part2-btn {
          opacity: 1;
          pointer-events: auto;
        }
        .sara-loom-num-cell .sara-loom-part2-btn.btn-warning {
          opacity: 1;
          pointer-events: auto;
        }
        td:has(.sara-loom-part2-popover) {
          overflow: visible;
          position: relative;
          z-index: 5;
        }
      `}</style>
      <div className="card-header d-flex flex-row flex-wrap gap-2 justify-content-between align-items-center">
        <div className="min-w-0">
          <h3 className="card-title mb-0">Looms</h3>
          {tableEdit && (
            <div className="small text-warning mt-1 mb-0">
              {mode === 'table'
                ? 'Table edit — RPM, Quality, Status · loom # pe hover → +P2 (same-day Part 2)'
                : 'Grid edit — full master + Delete · loom # pe hover → +P2'}
            </div>
          )}
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center ms-auto">
          {!toolbarInChrome && editToggle}
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
          {!toolbarInChrome && !readOnly && canEditProduction && (
            <button
              type="button"
              className="btn btn-sm btn-success"
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
                    <div className="small text-muted d-flex align-items-center gap-1">
                      <span>Loom #</span>
                      {loomNumberCell(l)}
                    </div>
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
                      value={dayRpm(l)}
                      navRow={rowIdx}
                      navCol={2}
                      onValueChange={(v) => onUpdate(l.loomNumber, { defaultRpm: v })}
                    />
                  ) : (
                    <div className="form-control form-control-sm bg-light text-end">{dayRpm(l)}</div>
                  )}
                </div>

                <div>
                  <label className="form-label small mb-1 fw-semibold">Quality</label>
                  {masterEdit ? (
                    <div className="d-flex flex-column gap-1">
                      <div
                        className={
                          dayQualityParts(l).length > 1
                            ? `rounded p-1 ${partChipClass(1)}`
                            : undefined
                        }
                      >
                        {dayQualityParts(l).length > 1 && (
                          <span className={`badge ${partBadgeClass(1)} mb-1`} style={{ fontSize: '0.58rem' }}>
                            P1
                          </span>
                        )}
                        <select
                          className="form-select form-select-sm"
                          value={dayQualityId(l) || ''}
                          onChange={(e) => assignQuality(l.loomNumber, e.target.value || null)}
                        >
                          <option value="">—</option>
                          {qualityOptionsFor(l).map((q) => (
                            <option key={q.id} value={q.id}>
                              {qualityOptionLabel(q)}
                            </option>
                          ))}
                        </select>
                      </div>
                      {dayQualityParts(l).filter((p) => p.seg > 1).map((p) => (
                        <div
                          key={`grid-edit-p${p.seg}`}
                          className={`d-flex align-items-center gap-1 rounded px-1 py-0 small ${partChipClass(p.seg)}`}
                        >
                          <span className={`badge ${partBadgeClass(p.seg)}`} style={{ fontSize: '0.58rem' }}>
                            P{p.seg}
                          </span>
                          <span className="text-truncate fw-semibold">{p.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`small ${qualityCellClass(l)}`}>{qualityPartsView(l)}</div>
                  )}
                </div>

                <div>
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <label className="form-label small mb-0 fw-semibold">Status</label>
                    {!masterEdit && dayStatus(l) !== 'RUNNING' && sheetDate && (
                      <span className="text-muted small" style={{ fontSize: '0.70rem' }}>
                        {sheetDate}
                      </span>
                    )}
                  </div>
                  <LoomStatusSelect
                    value={dayStatus(l)}
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
                <ResizableTh columnKey="rpm" width={widths.rpm} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-center">
                  RPM
                </ResizableTh>
                <ResizableTh columnKey="quality" width={widths.quality} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-start">
                  Quality
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
                    <td className="px-2">{loomNumberCell(l)}</td>
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
                    <td className="px-2 text-center">
                      {opsEdit ? (
                        <NumericCellInput
                          className="form-control form-control-sm text-center"
                          style={{ width: '100%', minWidth: 0 }}
                          value={dayRpm(l)}
                          navRow={rowIdx}
                          navCol={2}
                          onValueChange={(v) => onUpdate(l.loomNumber, { defaultRpm: v })}
                        />
                      ) : (
                        <div className="text-center">{dayRpm(l)}</div>
                      )}
                    </td>
                    <td className="px-2 text-start">
                      {opsEdit ? (
                        <div className="d-flex flex-column gap-1">
                          <div
                            className={
                              dayQualityParts(l).length > 1
                                ? `rounded p-1 ${partChipClass(1)}`
                                : undefined
                            }
                          >
                            {dayQualityParts(l).length > 1 && (
                              <span className={`badge ${partBadgeClass(1)} mb-1`} style={{ fontSize: '0.58rem' }}>
                                P1
                              </span>
                            )}
                            <select
                              className="form-select form-select-sm"
                              style={{ width: '100%', minWidth: 0 }}
                              value={dayQualityId(l) || ''}
                              onChange={(e) => assignQuality(l.loomNumber, e.target.value || null)}
                            >
                              <option value="">—</option>
                              {qualityOptionsFor(l).map((q) => (
                                <option key={q.id} value={q.id}>
                                  {qualityOptionLabel(q)}
                                </option>
                              ))}
                            </select>
                          </div>
                          {dayQualityParts(l).filter((p) => p.seg > 1).map((p) => (
                            <div
                              key={`tbl-edit-p${p.seg}`}
                              className={`d-flex align-items-center gap-1 rounded px-1 py-0 small ${partChipClass(p.seg)}`}
                            >
                              <span className={`badge ${partBadgeClass(p.seg)}`} style={{ fontSize: '0.58rem' }}>
                                P{p.seg}
                              </span>
                              <span className="text-truncate fw-semibold">{p.name}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={`text-start ${qualityCellClass(l)}`} style={{ maxWidth: '100%' }}>
                          {qualityPartsView(l)}
                        </div>
                      )}
                    </td>
                    <td className="px-2">
                      <span className="text-secondary">{l.shed || 'Main Floor'}</span>
                    </td>
                    <td className="px-1">
                      <div className="d-flex flex-column">
                        <LoomStatusSelect
                          value={dayStatus(l)}
                          disabled={!opsEdit}
                          style={{ width: '100%', minWidth: 0 }}
                          onChange={(status) => onUpdate(l.loomNumber, { status })}
                        />
                        {!opsEdit && dayStatus(l) !== 'RUNNING' && sheetDate && (
                          <span className="text-muted text-nowrap mt-0.5" style={{ fontSize: '0.68rem' }}>
                            <i className="bi bi-clock-history me-1" />
                            {sheetDate}
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
        onAdd={(partial) => {
          onAdd(partial)
          showSuccessSoon({
            title: 'Loom Added',
            message: 'Naya loom add ho gaya.',
          })
        }}
        suggestedLoomNumber={nextLoomNumber}
      />
    </div>
  )
}
