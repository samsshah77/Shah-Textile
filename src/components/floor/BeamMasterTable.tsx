'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BeamMaster,
  LoomMaster,
  QualityMaster,
  composeLot,
  formatSwLotForDailyEntry,
  parseLotKind,
  preloadAllFloorSheets,
  productionMastersService,
  type LotKind,
  type MountBeamResult,
} from '@/services/productionMastersService'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { NumericCellInput, TextCellInput } from '@/components/shared/NumericCellInput'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { LOOM_STATUS_COLOR, LOOM_STATUS_LABEL } from '@/components/floor/LoomStatusSelect'
import type { LoomStatus } from '@/types/loom'
import { AddBeamModal } from '@/components/floor/AddBeamModal'
import { useAuth } from '@/context/AuthContext'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { EmptyPlaceholder } from '@/components/shared/EmptyPlaceholder'
import { TablePanScroll } from '@/components/shared/TablePanScroll'


function SwLotCell({
  beamNo,
  value,
  enabled,
  navRow,
  navCol,
  onCommit,
}: {
  beamNo: string
  value: string
  enabled: boolean
  navRow: number
  navCol: number
  onCommit: (swLot: string | null) => void
}) {
  const parsed = parseLotKind(value)
  const [kind, setKind] = useState<LotKind>(parsed.kind)
  const [draft, setDraft] = useState(parsed.num)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const next = parseLotKind(value)
    setKind(next.kind)
    setDraft(next.num)
  }, [value, beamNo])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const commit = (nextKind: LotKind, rawNum: string) => {
    const next = composeLot(nextKind, rawNum) || null
    const prev = (value || '').trim() || null
    if (next !== prev) onCommit(next)
  }

  if (!enabled) {
    return (
      <span className="small px-1 fw-semibold">
        {value?.trim() ? formatSwLotForDailyEntry(value) : '—'}
      </span>
    )
  }

  return (
    <div className="input-group input-group-sm">
      <button
        type="button"
        className="btn btn-outline-secondary btn-sm sara-lot-kind-btn"
        aria-label="Lot kind — click to switch Sw / Wp"
        title="Click: Sw # ↔ Wp #"
        onClick={() => {
          const nextKind: LotKind = kind === 'Sw' ? 'Wp' : 'Sw'
          setKind(nextKind)
          if (timerRef.current) clearTimeout(timerRef.current)
          commit(nextKind, draft)
        }}
      >
        {kind} #
      </button>
      <input
        type="text"
        className="form-control"
        placeholder="331"
        autoComplete="off"
        data-nav-row={navRow}
        data-nav-col={navCol}
        value={draft}
        onChange={(e) => {
          const v = e.target.value
          setDraft(v)
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => commit(kind, v), 350)
        }}
        onBlur={() => {
          if (timerRef.current) clearTimeout(timerRef.current)
          commit(kind, draft)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (timerRef.current) clearTimeout(timerRef.current)
            commit(kind, draft)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
    </div>
  )
}

const DEFAULT_WIDTHS: Record<string, number> = {
  beam: 110,
  location: 165,
  swLot: 150,
  beamRepeat: 110,
  warp: 200,
  reed: 68,
  width: 68,
  threads: 95,
  length: 95,
  machine: 100,
  status: 180,
  track: 88,
}

export type BeamFilterType = 'IN_STOCK' | 'ON_LOOM' | 'AT_SIZING'

function isEmptyBeam(b: BeamMaster) {
  return !b.usedInLoom && b.location === 'SIZING'
}

export function beamStockCounts(beams: BeamMaster[]) {
  const inStock = beams.filter((b) => !b.usedInLoom && (b.location || 'STORE') === 'STORE').length
  const atSizing = beams.filter((b) => isEmptyBeam(b)).length
  const onLoom = beams.filter((b) => Boolean(b.usedInLoom)).length
  return { inStock, atSizing, onLoom }
}

function filterLabel(f: BeamFilterType): string {
  if (f === 'IN_STOCK') return 'In Stock'
  if (f === 'ON_LOOM') return 'On Loom'
  return 'Empty Beam'
}

/** Empty Beam tab: specs live on Track — list is identity + status only. */
function isCompactBeamTab(f: BeamFilterType): boolean {
  return f === 'AT_SIZING'
}

export function BeamStockFilterBar({
  filter,
  onChange,
  counts,
}: {
  filter: BeamFilterType
  onChange: (f: BeamFilterType) => void
  counts: ReturnType<typeof beamStockCounts>
}) {
  return (
    <div className="btn-group btn-group-sm" role="group" aria-label="Beam Stock Category Filter">
      <button
        type="button"
        className={`btn ${filter === 'IN_STOCK' ? 'btn-success' : 'btn-outline-success'}`}
        onClick={() => onChange('IN_STOCK')}
      >
        In Stock ({counts.inStock})
      </button>
      <button
        type="button"
        className={`btn ${filter === 'ON_LOOM' ? 'sara-btn-hold' : 'sara-btn-hold-outline'}`}
        onClick={() => onChange('ON_LOOM')}
      >
        On Loom ({counts.onLoom})
      </button>
      <button
        type="button"
        className={`btn ${filter === 'AT_SIZING' ? 'btn-secondary' : 'btn-outline-secondary'}`}
        onClick={() => onChange('AT_SIZING')}
      >
        Empty Beam ({counts.atSizing})
      </button>
    </div>
  )
}

interface BeamMasterTableProps {
  beams: BeamMaster[]
  looms: LoomMaster[]
  qualities?: QualityMaster[]
  selectedDate: string
  onUpdate: (beamNo: string, patch: Partial<BeamMaster>) => void
  onAdd: (beam: Partial<BeamMaster> & { beamNo: string }) => void | Promise<void>
  onMount: (beamNo: string, loomNumber: number, dateStr?: string) => MountBeamResult
  onUnmount: (beamNo: string, location?: 'STORE' | 'SIZING', dateStr?: string) => void
  onReceiveFromSizing: (beamNo: string) => void
  onSendToSizing: (beamNo: string, dateStr?: string) => void
  onDelete?: (beamNo: string) => void
  readOnly?: boolean
  /** Controlled stock filter (PageHeader). */
  filter?: BeamFilterType
  onFilterChange?: (f: BeamFilterType) => void
  toolbarInChrome?: boolean
  tableEdit?: boolean
  onTableEditChange?: (next: boolean) => void
  addModalOpen?: boolean
  onAddModalOpenChange?: (open: boolean) => void
}

function formatShortDate(dateStr?: string | null) {
  if (!dateStr) return ''
  try {
    const d = new Date(`${dateStr}T12:00:00`)
    return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
  } catch {
    return dateStr
  }
}

/** Status column — mounted looms show loom # + mount date. */
function LoomStatusNote({ beam }: { beam: BeamMaster }) {
  if (beam.usedInLoom) {
    const datePart = beam.mountedOn ? formatShortDate(beam.mountedOn) : ''
    return (
      <span className="text-secondary small">
        Mounted on Loom #{beam.usedInLoom}
        {datePart ? ` · ${datePart}` : ''}
      </span>
    )
  }

  if (beam.location === 'SIZING') {
    return (
      <div className="d-flex flex-column">
        <span className="badge bg-warning-subtle text-warning-emphasis align-self-start">
          Empty Beam
        </span>
        {beam.beamEndedOn && (
          <span className="text-muted" style={{ fontSize: '0.72rem' }}>
            Ended {formatShortDate(beam.beamEndedOn)}
            {beam.endedFromLoom ? ` · Loom ${beam.endedFromLoom}` : ''}
          </span>
        )}
      </div>
    )
  }

  if (beam.beamEndedOn) {
    const from =
      beam.endedFromLoom != null && beam.endedFromLoom !== ''
        ? ` · Loom ${beam.endedFromLoom}`
        : ''
    return (
      <div className="d-flex flex-column">
        <span className="fw-semibold" style={{ color: LOOM_STATUS_COLOR.BEAM_END }}>
          {LOOM_STATUS_LABEL.BEAM_END}
          {from}
        </span>
        <span className="text-muted" style={{ fontSize: '0.72rem' }}>
          <i className="bi bi-calendar-x text-danger me-1" />
          Ended {formatShortDate(beam.beamEndedOn)}
        </span>
      </div>
    )
  }

  if (beam.fillStatus === 'EMPTY') {
    return <span className="badge bg-secondary-subtle text-secondary">Empty — needs sizing</span>
  }

  return <span className="text-secondary small">In Stock</span>
}

export function BeamMasterTable({
  beams,
  looms,
  qualities = [],
  selectedDate,
  onUpdate,
  onAdd,
  onMount,
  onUnmount,
  onReceiveFromSizing,
  onSendToSizing,
  onDelete,
  readOnly,
  filter: filterProp,
  onFilterChange,
  toolbarInChrome = false,
  tableEdit: tableEditProp,
  onTableEditChange,
  addModalOpen: addModalOpenProp,
  onAddModalOpenChange,
}: BeamMasterTableProps) {
  const { canEditProduction } = useAuth()
  const { showError, showConfirm, showSuccessSoon } = useAlertDialog()
  const [filterInternal, setFilterInternal] = useState<BeamFilterType>('IN_STOCK')
  const filter = filterProp ?? filterInternal
  const setFilter = onFilterChange ?? setFilterInternal
  const [lotKindFilter, setLotKindFilter] = useState<'ALL' | LotKind>('ALL')
  const [isAddModalOpenLocal, setIsAddModalOpenLocal] = useState(false)
  const [mode, setMode] = useState<TableGridMode>('table')
  const [tableEditLocal, setTableEditLocal] = useState(false)

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

  const { widths, setColumnWidth, resetColumnWidth } = useResizableColumns(
    'sara_beam_col_widths_v11',
    DEFAULT_WIDTHS
  )
  const activeLooms = looms.filter((l) => l.isActive)
  const compactTab = isCompactBeamTab(filter)
  /** Empty Beam keeps Machine Type; other compact cols stay hidden. */
  const tableColCount = compactTab ? 6 : 12
  const visibleColKeys = useMemo(() => {
    if (!compactTab) return Object.keys(DEFAULT_WIDTHS)
    return ['beam', 'swLot', 'beamRepeat', 'machine', 'status', 'track']
  }, [compactTab])
  const tableMinWidthVisible = useMemo(
    () => visibleColKeys.reduce((sum, k) => sum + (widths[k] || 80), 0),
    [visibleColKeys, widths]
  )

  const filteredBeams = useMemo(() => {
    let list: BeamMaster[]
    if (filter === 'IN_STOCK') {
      list = beams.filter((b) => !b.usedInLoom && (b.location || 'STORE') === 'STORE')
    } else if (filter === 'AT_SIZING') {
      list = beams.filter((b) => isEmptyBeam(b))
    } else {
      list = beams.filter((b) => Boolean(b.usedInLoom))
    }

    if (lotKindFilter !== 'ALL') {
      list = list.filter((b) => parseLotKind(b.swLot).kind === lotKindFilter)
    }

    // Same Sw# together, ascending (334, 334, 335…). Empty Sw# last.
    const swKey = (b: BeamMaster) => String(b.swLot || '').trim()
    const swSort = (a: BeamMaster, b: BeamMaster) => {
      const sa = swKey(a)
      const sb = swKey(b)
      if (!sa && !sb) return (a.beamNo || '').localeCompare(b.beamNo || '', undefined, { numeric: true })
      if (!sa) return 1
      if (!sb) return -1
      const na = Number(sa)
      const nb = Number(sb)
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
      const cmp = sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' })
      if (cmp !== 0) return cmp
      return (a.beamNo || '').localeCompare(b.beamNo || '', undefined, { numeric: true })
    }
    return list.slice().sort(swSort)
  }, [beams, filter, lotKindFilter])

  const opsEdit = canEditProduction && !readOnly && tableEdit && mode === 'table'
  const masterEdit = canEditProduction && !readOnly && tableEdit && mode === 'grid'
  const editActive = opsEdit || masterEdit

  const patchBeam = (b: BeamMaster, patch: Partial<BeamMaster>) => {
    // Reed/width change → auto threads, unless caller set totalThreads explicitly.
    if (
      (patch.reed !== undefined || patch.width !== undefined) &&
      patch.totalThreads === undefined
    ) {
      const reed = patch.reed ?? b.reed
      const width = patch.width ?? b.width
      onUpdate(b.beamNo, {
        ...patch,
        totalThreads: Math.round((width || 0) * (reed || 0) * 0.95),
      })
      return
    }
    onUpdate(b.beamNo, patch)
  }

  const openTrack = (b: BeamMaster) => {
    const qs = new URLSearchParams({ beam: b.beamNo })
    const href = `/floor/reports/beam?${qs.toString()}`
    // Sheets may not be in memory on Beams tab — preload then open (or open anyway).
    void (async () => {
      try {
        await preloadAllFloorSheets()
      } catch {
        // still open Track page; it hydrates itself
      }
      window.location.assign(href)
    })()
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
              message: 'Beam edits save ho gayi hain.',
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

  const handleLocationChange = (b: BeamMaster, v: string) => {
    if (v === 'STORE') {
      if (b.location === 'SIZING' && !b.usedInLoom) {
        onReceiveFromSizing(b.beamNo)
        return
      }
      onUnmount(b.beamNo, 'STORE', selectedDate)
      return
    }

    if (v === 'SIZING') {
      onSendToSizing(b.beamNo, selectedDate)
      return
    }

    const loomNum = Number(v)
    if (!Number.isFinite(loomNum) || loomNum <= 0) return

    const res = onMount(b.beamNo, loomNum, selectedDate)
    if (!res.ok) {
      showError({
        title: `Loom ${loomNum} pe mount nahi hua`,
        message: res.message,
        confirmText: 'Theek hai',
        type: 'error',
      })
    }
  }

  const handleDeleteBeam = (b: BeamMaster) => {
    if (!masterEdit || !onDelete) return
    showConfirm({
      title: 'Beam Delete Karein?',
      message: `Kya aap waqai Beam "${b.beamNo}" ko inventory se delete karna chahte hain?`,
      type: 'confirm',
      confirmText: 'Haan, Delete Karein',
      cancelText: 'Cancel',
      onConfirm: () => {
        onDelete(b.beamNo)
        showSuccessSoon({
          title: 'Deleted',
          message: `Beam "${b.beamNo}" delete ho gaya.`,
        })
      },
    })
  }

  const renderLocationSelect = (b: BeamMaster, enabled: boolean) => {
    const currentValue = b.usedInLoom ? String(b.usedInLoom) : (b.location || 'STORE')

    return (
      <select
        className="form-select form-select-sm"
        style={{ width: '100%', minWidth: 0 }}
        value={currentValue}
        disabled={readOnly || !canEditProduction || !enabled}
        onChange={(e) => handleLocationChange(b, e.target.value)}
      >
        <option value="STORE">In Stock (Store)</option>
        <option value="SIZING">Empty Beam</option>
        <optgroup label="Mount on Loom">
          {activeLooms.map((l) => (
            <option key={l.loomNumber} value={String(l.loomNumber)}>
              Loom {l.loomNumber}
              {l.model ? ` (${l.model})` : ''} — {LOOM_STATUS_LABEL[l.status as LoomStatus]}
            </option>
          ))}
        </optgroup>
      </select>
    )
  }

  return (
    <div className="card">
      <div className="card-header d-flex flex-row flex-wrap gap-2 justify-content-between align-items-center">
        <div className="min-w-0">
          <h3 className="card-title mb-0">Beams</h3>
          {tableEdit && (
            <div className="small text-warning mt-1 mb-0">Edit on — Enter / Tab next field</div>
          )}
        </div>

        <div className="d-flex flex-wrap gap-2 align-items-center ms-auto justify-content-end">
          <div className="btn-group btn-group-sm" role="group" aria-label="Sw / Wp filter">
            <button
              type="button"
              className={`btn ${lotKindFilter === 'ALL' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setLotKindFilter('ALL')}
            >
              All
            </button>
            <button
              type="button"
              className={`btn ${lotKindFilter === 'Sw' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setLotKindFilter('Sw')}
            >
              Sw #
            </button>
            <button
              type="button"
              className={`btn ${lotKindFilter === 'Wp' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setLotKindFilter('Wp')}
            >
              Wp #
            </button>
          </div>
          {!toolbarInChrome && editToggle}
          <ViewModeToggle mode={mode} onChange={setMode} />
          {!toolbarInChrome && !readOnly && canEditProduction && (
            <button
              type="button"
              className="btn btn-sm btn-success"
              onClick={() => setIsAddModalOpen(true)}
            >
              <i className="bi bi-plus-lg me-1" /> Add Beam
            </button>
          )}
        </div>
      </div>

      {mode === 'grid' ? (
        <div className="master-grid">
          {filteredBeams.length === 0 ? (
            <EmptyPlaceholder
              icon="bi-bounding-box"
              title="No beams in this category"
              hint={`Filter: ${filterLabel(filter)}. Add Beam ya dusra filter try karo.`}
            />
          ) : (
            filteredBeams.map((b, rowIdx) => {
              return (
                <div
                  key={b.beamNo}
                  className={`master-grid-card${editActive ? ' sara-edit-card' : ''}`}
                >
                  <div className="d-flex justify-content-between align-items-start gap-2 border-bottom pb-2">
                    <div>
                      <div className="fw-semibold">Beam #{b.beamNo}</div>
                      <LoomStatusNote beam={b} />
                    </div>
                    <div className="d-flex flex-column align-items-end gap-1">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary py-0"
                        style={{ fontSize: '0.72rem' }}
                        title="Beam Length Track"
                        onClick={() => openTrack(b)}
                      >
                        Track
                      </button>
                      {masterEdit && onDelete && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          title={`Delete Beam ${b.beamNo}`}
                          onClick={() => handleDeleteBeam(b)}
                        >
                          <i className="bi bi-trash" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="form-label small mb-1 fw-semibold">
                      {parseLotKind(b.swLot).kind} #
                    </label>
                    {masterEdit ? (
                      <SwLotCell
                        beamNo={b.beamNo}
                        value={b.swLot || ''}
                        enabled
                        navRow={rowIdx}
                        navCol={5}
                        onCommit={(swLot) => patchBeam(b, { swLot })}
                      />
                    ) : (
                      <div className="small fw-semibold">
                        {b.swLot?.trim() ? formatSwLotForDailyEntry(b.swLot) : '—'}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="form-label small mb-1 fw-semibold">Beam Repeat</label>
                    {masterEdit ? (
                      <TextCellInput
                        className="form-control form-control-sm"
                        value={b.beamRepeat || ''}
                        placeholder="optional"
                        navRow={rowIdx}
                        navCol={6}
                        onValueChange={(v) => patchBeam(b, { beamRepeat: v.trim() || null })}
                      />
                    ) : (
                      <div className="small">{b.beamRepeat || '—'}</div>
                    )}
                  </div>

                  {!compactTab && (
                  <div>
                    <label className="form-label small mb-1 fw-semibold">Yarn Warp</label>
                    {masterEdit ? (
                      <TextCellInput
                        className="form-control form-control-sm"
                        value={b.warp || ''}
                        placeholder="e.g. 45/1 Pv White+46/1 Pv Silver"
                        navRow={rowIdx}
                        navCol={0}
                        onValueChange={(v) => patchBeam(b, { warp: v })}
                      />
                    ) : (
                      <div className="small">{b.warp || '—'}</div>
                    )}
                  </div>
                  )}

                  {!compactTab && (
                    <>
                      <div className="d-flex gap-2">
                        <div className="flex-fill">
                          <label className="form-label small mb-1 fw-semibold">Reed</label>
                          {masterEdit ? (
                            <NumericCellInput
                              className="form-control form-control-sm text-end"
                              value={b.reed}
                              placeholder="60"
                              navRow={rowIdx}
                              navCol={1}
                              onValueChange={(v) => patchBeam(b, { reed: v })}
                            />
                          ) : (
                            <div className="small">{b.reed}</div>
                          )}
                        </div>
                        <div className="flex-fill">
                          <label className="form-label small mb-1 fw-semibold">Width (in)</label>
                          {masterEdit ? (
                            <NumericCellInput
                              className="form-control form-control-sm text-end"
                              value={b.width}
                              placeholder="66"
                              navRow={rowIdx}
                              navCol={2}
                              onValueChange={(v) => patchBeam(b, { width: v })}
                            />
                          ) : (
                            <div className="small">{b.width}</div>
                          )}
                        </div>
                        <div className="flex-fill">
                          <label className="form-label small mb-1 fw-semibold">Threads</label>
                          {masterEdit ? (
                            <NumericCellInput
                              className="form-control form-control-sm text-end"
                              value={b.totalThreads}
                              placeholder="auto"
                              navRow={rowIdx}
                              navCol={3}
                              onValueChange={(v) =>
                                patchBeam(b, { totalThreads: Math.round(Number(v) || 0) })
                              }
                            />
                          ) : (
                            <div className="small">{b.totalThreads.toLocaleString()}</div>
                          )}
                        </div>
                      </div>

                      <div className="flex-fill">
                        <label className="form-label small mb-1 fw-semibold">Length (m)</label>
                        {masterEdit ? (
                          <NumericCellInput
                            className="form-control form-control-sm text-end"
                            value={b.length}
                            navRow={rowIdx}
                            navCol={4}
                            onValueChange={(v) => patchBeam(b, { length: v })}
                          />
                        ) : (
                          <div className="small">{b.length.toLocaleString()}</div>
                        )}
                      </div>
                    </>
                  )}

                  <div>
                    <label className="form-label small mb-1 fw-semibold">Machine Type</label>
                    {masterEdit ? (
                      <select
                        className="form-select form-select-sm"
                        value={b.loomType}
                        onChange={(e) => patchBeam(b, { loomType: e.target.value })}
                      >
                        <option value="G6200">G6200</option>
                        <option value="G6300">G6300</option>
                        <option value="PU">PU</option>
                      </select>
                    ) : (
                      <div className="small">{b.loomType}</div>
                    )}
                  </div>

                  {compactTab && (
                    <div className="pt-2 border-top mt-2">
                      <LoomStatusNote beam={b} />
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      ) : (
        <TablePanScroll className="card-body p-0">
          <table
            className="table table-sm table-hover mb-0 align-middle text-nowrap"
            style={{
              tableLayout: 'fixed',
              width: tableMinWidthVisible,
              minWidth: tableMinWidthVisible,
            }}
          >
            <colgroup>
              {visibleColKeys.map((key) => (
                <col key={key} style={{ width: widths[key] }} />
              ))}
            </colgroup>
            <thead className="table-light">
              <tr>
                <ResizableTh columnKey="beam" width={widths.beam} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Beam Identity
                </ResizableTh>
                {!compactTab && (
                  <ResizableTh columnKey="location" width={widths.location} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                    Location / Loom
                  </ResizableTh>
                )}
                <ResizableTh columnKey="swLot" width={widths.swLot} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Sw / Wp #
                </ResizableTh>
                <ResizableTh columnKey="beamRepeat" width={widths.beamRepeat} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Beam Repeat
                </ResizableTh>
                {!compactTab && (
                  <>
                    <ResizableTh columnKey="warp" width={widths.warp} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                      Yarn Warp
                    </ResizableTh>
                    <ResizableTh columnKey="reed" width={widths.reed} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                      Reed
                    </ResizableTh>
                    <ResizableTh columnKey="width" width={widths.width} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                      Width
                    </ResizableTh>
                    <ResizableTh columnKey="threads" width={widths.threads} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                      Total Thread
                    </ResizableTh>
                    <ResizableTh columnKey="length" width={widths.length} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                      Length (meters)
                    </ResizableTh>
                  </>
                )}
                <ResizableTh columnKey="machine" width={widths.machine} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Machine Type
                </ResizableTh>
                <ResizableTh columnKey="status" width={widths.status} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Status
                </ResizableTh>
                <ResizableTh columnKey="track" width={widths.track} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Track
                </ResizableTh>
              </tr>
            </thead>
            <tbody>
              {filteredBeams.length === 0 ? (
                <tr>
                  <td colSpan={tableColCount} className="p-0 border-0">
                    <EmptyPlaceholder
                      icon="bi-bounding-box"
                      title="No beams in this category"
                      hint={`Filter: ${filterLabel(filter)}. Add Beam ya dusra filter try karo.`}
                      compact
                    />
                  </td>
                </tr>
              ) : (
                filteredBeams.map((b, rowIdx) => {
                  return (
                    <tr
                      key={b.beamNo}
                      className={editActive ? 'sara-edit-row' : undefined}
                    >
                      <td className="fw-semibold px-2">{b.beamNo}</td>
                      {!compactTab && (
                        <td className="px-1">{renderLocationSelect(b, opsEdit)}</td>
                      )}
                      <td className="px-1">
                        <SwLotCell
                          beamNo={b.beamNo}
                          value={b.swLot || ''}
                          enabled={editActive}
                          navRow={rowIdx}
                          navCol={0}
                          onCommit={(swLot) => patchBeam(b, { swLot })}
                        />
                      </td>
                      <td className="px-1">
                        {editActive ? (
                          <TextCellInput
                            className="form-control form-control-sm"
                            value={b.beamRepeat || ''}
                            placeholder="optional"
                            navRow={rowIdx}
                            navCol={1}
                            onValueChange={(v) => patchBeam(b, { beamRepeat: v.trim() || null })}
                          />
                        ) : (
                          <span className="small px-1">{b.beamRepeat || '—'}</span>
                        )}
                      </td>
                      {!compactTab && (
                        <>
                          <td
                            className="px-2 text-truncate"
                            style={{
                              maxWidth: widths.warp,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={b.warp || undefined}
                          >
                            {editActive ? (
                              <TextCellInput
                                className="form-control form-control-sm"
                                value={b.warp || ''}
                                placeholder="e.g. 45/1 Pv White+46/1"
                                navRow={rowIdx}
                                navCol={2}
                                onValueChange={(v) => patchBeam(b, { warp: v })}
                              />
                            ) : (
                              <span
                                className="text-secondary d-block text-truncate"
                                title={b.warp || undefined}
                              >
                                {b.warp || '—'}
                              </span>
                            )}
                          </td>
                          <td className="px-1">
                            {editActive ? (
                              <NumericCellInput
                                className="form-control form-control-sm text-end"
                                value={b.reed}
                                placeholder="60"
                                navRow={rowIdx}
                                navCol={3}
                                onValueChange={(v) => patchBeam(b, { reed: v })}
                              />
                            ) : (
                              <div className="text-end px-1">{b.reed}</div>
                            )}
                          </td>
                          <td className="px-1">
                            {editActive ? (
                              <NumericCellInput
                                className="form-control form-control-sm text-end"
                                value={b.width}
                                placeholder="66"
                                navRow={rowIdx}
                                navCol={4}
                                onValueChange={(v) => patchBeam(b, { width: v })}
                              />
                            ) : (
                              <div className="text-end px-1">{b.width}</div>
                            )}
                          </td>
                          <td className="px-1">
                            {editActive ? (
                              <NumericCellInput
                                className="form-control form-control-sm text-end fw-semibold"
                                value={b.totalThreads}
                                placeholder="threads"
                                navRow={rowIdx}
                                navCol={5}
                                onValueChange={(v) =>
                                  patchBeam(b, { totalThreads: Math.round(Number(v) || 0) })
                                }
                              />
                            ) : (
                              <div className="fw-semibold text-end pe-3">
                                {b.totalThreads.toLocaleString()}
                              </div>
                            )}
                          </td>
                          <td className="px-1">
                            <div className="text-end px-1">{b.length.toLocaleString()}</div>
                          </td>
                        </>
                      )}
                      <td className="px-1">
                        {editActive ? (
                          <select
                            className="form-select form-select-sm"
                            value={b.loomType}
                            onChange={(e) => patchBeam(b, { loomType: e.target.value })}
                          >
                            <option value="G6200">G6200</option>
                            <option value="G6300">G6300</option>
                            <option value="PU">PU</option>
                          </select>
                        ) : (
                          <span className="badge bg-light text-dark border px-2 py-1">
                            {b.loomType}
                          </span>
                        )}
                      </td>
                      <td className="px-2">
                        {opsEdit && b.usedInLoom ? (
                          <div className="d-flex flex-column gap-1">
                            <LoomStatusNote beam={b} />
                            <input
                              type="date"
                              className="form-control form-control-sm py-0 px-1"
                              style={{ width: 110, fontSize: '0.72rem', height: 22 }}
                              title="Mount date"
                              value={b.mountedOn || ''}
                              onChange={(e) => patchBeam(b, { mountedOn: e.target.value })}
                            />
                          </div>
                        ) : compactTab && opsEdit ? (
                          <div className="d-flex flex-column gap-1 align-items-start">
                            <LoomStatusNote beam={b} />
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary py-0"
                              style={{ fontSize: '0.72rem' }}
                              onClick={() => onReceiveFromSizing(b.beamNo)}
                            >
                              → In Stock
                            </button>
                          </div>
                        ) : (
                          <LoomStatusNote beam={b} />
                        )}
                      </td>
                      <td className="px-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary py-0"
                          style={{ fontSize: '0.72rem' }}
                          onClick={() => openTrack(b)}
                        >
                          Track
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </TablePanScroll>
      )}

      {/* Add Beam Modal Dialog */}
      <AddBeamModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={async (newBeam) => {
          await Promise.resolve(onAdd(newBeam))
          showSuccessSoon({
            title: 'Beam Added',
            message: `Beam "${newBeam.beamNo}" add ho gaya.`,
          })
        }}
        existingBeamNos={beams.map((b) => b.beamNo)}
        activeLooms={activeLooms}
        qualities={qualities}
      />
    </div>
  )
}
