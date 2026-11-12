'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  getMountedBeamsOnLoom,
  loomBeamCapacity,
  loomHasFreeBeamSlot,
  mergeSheetEntriesForDate,
  statusOnLoomForDate,
} from '@/services/productionMastersService'
import type { DailyLoomProductionEntry } from '@/types/production'
import { BeamHistoryDialog } from '@/components/floor/BeamHistoryDialog'
import { editRunOnDay } from '@/lib/floor/beamStints'
import { getProductionTodayMonth } from '@/constants/productionCalendar'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { NumericCellInput, TextCellInput } from '@/components/shared/NumericCellInput'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { LOOM_STATUS_COLOR, LOOM_STATUS_LABEL } from '@/components/floor/LoomStatusSelect'
import type { LoomStatus } from '@/types/loom'
import { AddBeamModal } from '@/components/floor/AddBeamModal'
import { useAuth } from '@/context/AuthContext'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { longDateFromYmd } from '@/lib/longDate'
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
  track: 150,
}

/** ENDED = record of beams taken off a loom (beam history, see BeamEndedHistory). */
export type BeamFilterType = 'IN_STOCK' | 'ON_LOOM' | 'AT_SIZING' | 'ENDED'

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
  if (f === 'ENDED') return 'Ended'
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
      <button
        type="button"
        className={`btn ${filter === 'ENDED' ? 'btn-danger' : 'btn-outline-danger'}`}
        onClick={() => onChange('ENDED')}
        title="Record of beams taken off looms (kept even after restocking)"
      >
        Ended
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
  /** Daily Entry rows — the loom's status on selectedDate (B/End / B/Cut flags its beam). */
  entries?: DailyLoomProductionEntry[]
  /**
   * A past date is open: every beam as it stood that day. A beam that was then on a loom in an
   * older run (ended since) shows that run's details in Edit (shaded row); changes there go to
   * that run only, never to the beam as it is now.
   */
  dayState?: BeamMaster[]
  /** An older run was changed here — read the day's beams again. */
  onDayStateChanged?: () => void
  /** May correct dates in Beam History (Beams edit permission). */
  historyEdit?: boolean
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
  entries = [],
  historyEdit = false,
  dayState,
  onDayStateChanged,
}: BeamMasterTableProps) {
  const [historyBeam, setHistoryBeam] = useState<string | null>(null)
  const { canEditProduction } = useAuth()
  const { showError, showConfirm, showSuccessSoon } = useAlertDialog()
  const [filterInternal, setFilterInternal] = useState<BeamFilterType>('IN_STOCK')
  const filter = filterProp ?? filterInternal
  const setFilter = onFilterChange ?? setFilterInternal
  const [lotKindFilter, setLotKindFilter] = useState<'ALL' | LotKind>('ALL')
  const [search, setSearch] = useState('')
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
    'sara_beam_col_widths_v12',
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

  const baseBeamsForTab = useMemo(() => {
    if (filter === 'IN_STOCK') {
      return beams.filter((b) => !b.usedInLoom && (b.location || 'STORE') === 'STORE')
    } else if (filter === 'AT_SIZING') {
      return beams.filter((b) => isEmptyBeam(b))
    } else {
      return beams.filter((b) => Boolean(b.usedInLoom))
    }
  }, [beams, filter])

  const lotCounts = useMemo(() => {
    let all = baseBeamsForTab.length
    let sw = 0
    let wp = 0
    for (const b of baseBeamsForTab) {
      const kind = parseLotKind(b.swLot).kind
      if (kind === 'Sw') sw++
      else if (kind === 'Wp') wp++
    }
    return { all, sw, wp }
  }, [baseBeamsForTab])

  /**
   * Search: beam #, Sw / Wp #, loom #, warp, quality, machine type.
   * Just a number (e.g. "2"): the beam on Loom 2 — or Sw # 2 / beam # 2 — exactly, not every
   * beam with a 2 in it. If nothing matches exactly, any beam containing it.
   */
  const searchText = search.trim().toLowerCase()
  const digitsOf = (v: unknown) => String(v ?? '').replace(/\D+/g, '').replace(/^0+(?=\d)/, '')
  const exactNumber = useCallback(
    (b: BeamMaster, n: string) =>
      (b.usedInLoom != null && digitsOf(b.usedInLoom) === n) ||
      (Boolean(b.swLot) && digitsOf(b.swLot) === n) ||
      digitsOf(b.beamNo) === n,
    []
  )
  const numberQuery = /^\d+$/.test(searchText) ? searchText.replace(/^0+(?=\d)/, '') : ''
  const numberHasExact = useMemo(
    () => Boolean(numberQuery) && beams.some((b) => exactNumber(b, numberQuery)),
    [numberQuery, beams, exactNumber]
  )
  const matchesSearch = useCallback(
    (b: BeamMaster) => {
      if (!searchText) return true
      if (numberQuery && numberHasExact) return exactNumber(b, numberQuery)
      const quality = b.qualityId ? qualities.find((q) => q.id === b.qualityId) : null
      const hay = [
        b.beamNo,
        b.swLot,
        b.swLot ? formatSwLotForDailyEntry(b.swLot) : '',
        b.usedInLoom ? `loom ${b.usedInLoom}` : '',
        b.usedInLoom,
        b.warp,
        b.loomType,
        quality?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return searchText.split(/\s+/).every((w) => hay.includes(w))
    },
    [searchText, qualities, numberQuery, numberHasExact, exactNumber]
  )
  /** Matches in the other tabs (so a beam is found even when this tab does not hold it). */
  const searchElsewhere = useMemo(() => {
    if (!searchText) return [] as Array<{ tab: BeamFilterType; label: string; count: number }>
    const tabs: Array<{ tab: BeamFilterType; label: string; test: (b: BeamMaster) => boolean }> = [
      { tab: 'IN_STOCK', label: 'In Stock', test: (b) => !b.usedInLoom && (b.location || 'STORE') === 'STORE' },
      { tab: 'ON_LOOM', label: 'On Loom', test: (b) => Boolean(b.usedInLoom) },
      { tab: 'AT_SIZING', label: 'Empty Beam', test: (b) => isEmptyBeam(b) },
    ]
    return tabs
      .filter((t) => t.tab !== filter)
      .map((t) => ({ tab: t.tab, label: t.label, count: beams.filter((b) => t.test(b) && matchesSearch(b)).length }))
      .filter((t) => t.count > 0)
  }, [searchText, beams, filter, matchesSearch])

  const filteredBeams = useMemo(() => {
    let list = baseBeamsForTab.filter(matchesSearch)

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
  }, [baseBeamsForTab, lotKindFilter, matchesSearch])

  /**
   * Beams still mounted on a loom that is on B/End or B/Cut for selectedDate — the loom
   * came off but the beam was not ended yet. Highlighted, with a prompt to end them.
   */
  /** Daily Entry rows of selectedDate — each loom's state that day (Running, B/End, Knotting…). */
  const dayRows = useMemo(() => mergeSheetEntriesForDate(selectedDate, entries), [selectedDate, entries])
  const loomDayStatus = (l: LoomMaster): LoomStatus => statusOnLoomForDate(l, dayRows) as LoomStatus

  const beamsToEnd = useMemo(() => {
    const out = new Map<string, LoomStatus>()
    // Alerts start from this month: a date in an earlier month shows none.
    if (selectedDate.slice(0, 7) < getProductionTodayMonth()) return out
    for (const b of beams) {
      if (!b.usedInLoom) continue
      const loom = looms.find((l) => String(l.loomNumber) === String(b.usedInLoom))
      if (!loom) continue
      const st = statusOnLoomForDate(loom, dayRows)
      if (st === 'BEAM_END' || st === 'BEAM_CUT') out.set(b.beamNo, st)
    }
    return out
  }, [beams, looms, dayRows, selectedDate])

  const endFlaggedBeam = (b: BeamMaster) => {
    const label = beamsToEnd.get(b.beamNo) === 'BEAM_CUT' ? 'B/Cut' : 'B/End'
    showConfirm({
      title: `End beam ${b.beamNo}?`,
      message: `Loom #${b.usedInLoom} is on ${label}. End beam ${b.beamNo}${b.swLot ? ` (${formatSwLotForDailyEntry(b.swLot)})` : ''} (move to Empty Beam) from ${longDateFromYmd(selectedDate)}?`,
      type: 'confirm',
      confirmText: 'Yes, end it',
      cancelText: 'Not now',
      onConfirm: () => {
        onSendToSizing(b.beamNo, selectedDate)
        showSuccessSoon({
          title: 'Beam ended',
          message: `Beam ${b.beamNo} moved to Empty Beam. If this was a mistake, put it back on the loom from Ended → Edit.`,
        })
      },
    })
  }

  const opsEdit = canEditProduction && !readOnly && tableEdit && mode === 'table'
  const masterEdit = canEditProduction && !readOnly && tableEdit && mode === 'grid'
  const editActive = opsEdit || masterEdit
  const editActiveAll = editActive
  const masterEditAll = masterEdit
  /** On the open past date, this beam was on a loom in a different (older, ended) run than now. */
  const oldRunOnDay = useMemo(() => {
    const out = new Map<string, { loom: string; from: string; beam: BeamMaster }>()
    if (!dayState) return out
    const live = new Map(beams.map((b) => [b.beamNo, b]))
    for (const d of dayState) {
      if (!d.usedInLoom) continue
      const now = live.get(d.beamNo)
      const sameRun =
        now && String(now.usedInLoom || '') === String(d.usedInLoom) && String(now.mountedOn || '').slice(0, 10) === String(d.mountedOn || '').slice(0, 10)
      if (!sameRun) out.set(d.beamNo, { loom: String(d.usedInLoom), from: String(d.mountedOn || '').slice(0, 10), beam: d })
    }
    return out
  }, [dayState, beams])

  // Changes typed into an older run's row: shown at once, saved to that run a moment later.
  const [oldEdits, setOldEdits] = useState<Record<string, Partial<BeamMaster>>>({})
  const oldPending = useRef(new Map<string, { patch: Partial<BeamMaster>; timer: ReturnType<typeof setTimeout> }>())
  useEffect(() => {
    // The day was read again: keep only what is still being saved.
    setOldEdits((cur) => {
      const keep = Object.fromEntries(Object.entries(cur).filter(([no]) => oldPending.current.has(no)))
      return Object.keys(keep).length === Object.keys(cur).length ? cur : keep
    })
  }, [dayState])
  useEffect(() => {
    const pending = oldPending.current
    return () => pending.forEach((p) => clearTimeout(p.timer))
  }, [])
  const oldRunView = (beamNo: string): BeamMaster | null => {
    const o = oldRunOnDay.get(beamNo)
    return o ? { ...o.beam, ...(oldEdits[beamNo] || {}) } : null
  }
  const OLD_RUN_FIELDS = ['swLot', 'warp', 'length', 'reed', 'width', 'totalThreads', 'beamRepeat', 'loomType'] as const
  const patchOldRun = (b: BeamMaster, raw: Partial<BeamMaster>) => {
    const o = oldRunOnDay.get(b.beamNo)
    if (!o) return
    const patch: Partial<BeamMaster> = {}
    for (const k of OLD_RUN_FIELDS) if (raw[k] !== undefined) (patch as Record<string, unknown>)[k] = raw[k]
    if ((raw.reed !== undefined || raw.width !== undefined) && raw.totalThreads === undefined) {
      const reed = raw.reed ?? b.reed
      const width = raw.width ?? b.width
      patch.totalThreads = Math.round((width || 0) * (reed || 0) * 0.95)
    }
    if (!Object.keys(patch).length) return
    setOldEdits((cur) => ({ ...cur, [b.beamNo]: { ...(cur[b.beamNo] || {}), ...patch } }))
    const prev = oldPending.current.get(b.beamNo)
    if (prev) clearTimeout(prev.timer)
    const merged = { ...(prev?.patch || {}), ...patch }
    const date = selectedDate
    const timer = setTimeout(() => {
      oldPending.current.delete(b.beamNo)
      editRunOnDay(b.beamNo, date, Number(o.loom), merged)
        .then(() => onDayStateChanged?.())
        .catch((err: unknown) => {
          setOldEdits((cur) => {
            const next = { ...cur }
            delete next[b.beamNo]
            return next
          })
          showError({
            title: `Beam ${b.beamNo} — old run not saved`,
            message: err instanceof Error ? err.message : 'Could not save.',
          })
        })
    }, 700)
    oldPending.current.set(b.beamNo, { patch: merged, timer })
  }
  const oldRunTitle = (b: BeamMaster) => {
    const o = oldRunOnDay.get(b.beamNo)
    if (!o) return undefined
    return `On ${longDateFromYmd(selectedDate)} this beam was on Loom ${o.loom}${o.from ? ` (mounted ${longDateFromYmd(o.from)})` : ''} in a run that has ended. This row shows that run; changes here change that run only, not the beam as it is now.`
  }

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
              message: 'Beam changes saved.',
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
    // Taking a beam off its loom puts this run in the Ended tab — ask first.
    if (b.usedInLoom && (v === 'STORE' || v === 'SIZING')) {
      const toEmpty = v === 'SIZING'
      const sw = b.swLot ? ` (${formatSwLotForDailyEntry(b.swLot)})` : ''
      showConfirm({
        title: toEmpty ? `End beam ${b.beamNo}?` : `Remove beam ${b.beamNo} from the loom?`,
        message: toEmpty
          ? `Beam ${b.beamNo}${sw} will be taken off Loom #${b.usedInLoom} and moved to Empty Beam from ${longDateFromYmd(selectedDate)}.\n\nThis run will show in the Ended tab.`
          : `Beam ${b.beamNo}${sw} will be taken off Loom #${b.usedInLoom} and moved back to In Stock (Store) from ${longDateFromYmd(selectedDate)}.\n\nThis run will show in the Ended tab.`,
        type: 'confirm',
        confirmText: toEmpty ? 'Yes, end it' : 'Yes, remove',
        cancelText: 'Cancel',
        onConfirm: () => {
          if (toEmpty) onSendToSizing(b.beamNo, selectedDate)
          else onUnmount(b.beamNo, 'STORE', selectedDate)
          showSuccessSoon({
            title: toEmpty ? 'Beam ended' : 'Beam removed',
            message: `Beam ${b.beamNo} is off Loom #${b.usedInLoom}. You can see this run in the Ended tab.`,
          })
        },
      })
      return
    }
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
        title: `Could not mount on Loom ${loomNum}`,
        message: res.message,
        confirmText: 'OK',
        type: 'error',
      })
    }
  }

  const handleDeleteBeam = (b: BeamMaster) => {
    if (!masterEdit || !onDelete) return
    showConfirm({
      title: 'Delete beam?',
      message: `Delete beam "${b.beamNo}" from the inventory?`,
      type: 'confirm',
      confirmText: 'Yes, delete',
      cancelText: 'Cancel',
      onConfirm: () => {
        onDelete(b.beamNo)
        showSuccessSoon({
          title: 'Deleted',
          message: `Beam "${b.beamNo}" deleted.`,
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
          {activeLooms
            .filter((l) => {
              if (String(l.loomNumber) === currentValue) return true
              return loomHasFreeBeamSlot(l, beams, b.beamNo)
            })
            .map((l) => {
              const isTwin = Boolean(l.isTwinBeam)
              const otherMounted = getMountedBeamsOnLoom(beams, l.loomNumber, b.beamNo)
              const count = otherMounted.length
              const max = loomBeamCapacity(l)
              const isFull = count >= max
              return (
                <option key={l.loomNumber} value={String(l.loomNumber)}>
                  Loom {l.loomNumber}
                  {l.model ? ` (${l.model})` : ''}
                  {isTwin ? ` [Twin Beam${count > 0 ? `: ${count}/${max}` : ''}]` : ''}
                  {isFull ? ' — FULL' : ` — ${LOOM_STATUS_LABEL[loomDayStatus(l)] || loomDayStatus(l)}`}
                </option>
              )
            })}
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
          <div className="input-group input-group-sm" style={{ width: 230 }}>
            <span className="input-group-text bg-white">
              <i className="bi bi-search" />
            </span>
            <input
              type="search"
              className="form-control"
              placeholder="Beam #, Sw #, loom # (e.g. 2)…"
              aria-label="Search beams"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="btn-group btn-group-sm" role="group" aria-label="Sw / Wp filter">
            <button
              type="button"
              className={`btn ${lotKindFilter === 'ALL' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setLotKindFilter('ALL')}
            >
              All ({lotCounts.all})
            </button>
            <button
              type="button"
              className={`btn ${lotKindFilter === 'Sw' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setLotKindFilter('Sw')}
            >
              Sw # ({lotCounts.sw})
            </button>
            <button
              type="button"
              className={`btn ${lotKindFilter === 'Wp' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setLotKindFilter('Wp')}
            >
              Wp # ({lotCounts.wp})
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
      {searchText && (
        <div className="px-3 py-2 small border-bottom bg-light d-flex flex-wrap gap-2 align-items-center d-print-none">
          <span>
            &quot;{search.trim()}&quot; — <strong>{filteredBeams.length}</strong> in this tab
          </span>
          {searchElsewhere.map((t) => (
            <button key={t.tab} type="button" className="btn btn-sm btn-outline-primary py-0" onClick={() => setFilter(t.tab)}>
              {t.count} in {t.label} →
            </button>
          ))}
          <button type="button" className="btn btn-sm btn-link py-0 ms-auto" onClick={() => setSearch('')}>
            Clear search
          </button>
        </div>
      )}

      {beamsToEnd.size > 0 && (
        <div className="alert alert-danger rounded-0 border-start-0 border-end-0 mb-0 py-2 px-3 small d-flex flex-wrap align-items-center gap-2">
          <span className="fw-semibold">
            <i className="bi bi-exclamation-triangle-fill me-1" />
            Loom is on B/End / B/Cut but the beam is not ended yet:
          </span>
          {beams
            .filter((b) => beamsToEnd.has(b.beamNo))
            .map((b) => (
              <span key={b.beamNo} className="d-inline-flex align-items-center gap-1 bg-white border border-danger-subtle rounded px-2 py-1">
                <span>
                  Beam <b>{b.beamNo}</b> · Loom {b.usedInLoom}
                  {b.swLot ? ` · ${formatSwLotForDailyEntry(b.swLot)}` : ''}
                </span>
                {!readOnly && canEditProduction && (
                  <button type="button" className="btn btn-danger btn-sm py-0 px-2" onClick={() => endFlaggedBeam(b)}>
                    End it
                  </button>
                )}
              </span>
            ))}
        </div>
      )}

      {mode === 'grid' ? (
        <div className="master-grid">
          {filteredBeams.length === 0 ? (
            <EmptyPlaceholder
              icon="bi-bounding-box"
              title="No beams in this category"
              hint={`Filter: ${filterLabel(filter)}. Add a beam or try another filter.`}
            />
          ) : (
            filteredBeams.map((liveBeam, rowIdx) => {
              // A beam of an older (ended) run on this past date: in Edit the card shows that
              // run, shaded, and changes go to that run only.
              const oldView = editActiveAll ? oldRunView(liveBeam.beamNo) : null
              const b = oldView || liveBeam
              const masterEdit = masterEditAll
              const editActive = editActiveAll
              const patchRow = (patch: Partial<BeamMaster>) => (oldView ? patchOldRun(b, patch) : patchBeam(b, patch))
              return (
                <div
                  key={b.beamNo}
                  className={`master-grid-card${oldView ? ' sara-old-run-card' : editActive ? ' sara-edit-card' : ''}${beamsToEnd.has(b.beamNo) && !oldView ? ' sara-beam-to-end' : ''}`}
                  title={oldView ? oldRunTitle(b) : undefined}
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
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary py-0"
                        style={{ fontSize: '0.72rem' }}
                        title="When the beam was mounted on / removed from each loom — correct the dates"
                        onClick={() => setHistoryBeam(b.beamNo)}
                      >
                        History
                      </button>
                      {masterEdit && !oldView && onDelete && (
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
                        onCommit={(swLot) => patchRow({ swLot })}
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
                        onValueChange={(v) => patchRow({ beamRepeat: v.trim() || null })}
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
                        onValueChange={(v) => patchRow({ warp: v })}
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
                              onValueChange={(v) => patchRow({ reed: v })}
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
                              onValueChange={(v) => patchRow({ width: v })}
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
                                patchRow({ totalThreads: Math.round(Number(v) || 0) })
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
                            onValueChange={(v) => patchRow({ length: v })}
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
                        onChange={(e) => patchRow({ loomType: e.target.value })}
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
                      hint={`Filter: ${filterLabel(filter)}. Add a beam or try another filter.`}
                      compact
                    />
                  </td>
                </tr>
              ) : (
                filteredBeams.map((liveBeam, rowIdx) => {
                  // A beam of an older (ended) run on this past date: in Edit the row shows that
                  // run, shaded, and changes go to that run only.
                  const oldView = editActiveAll ? oldRunView(liveBeam.beamNo) : null
                  const b = oldView || liveBeam
                  const editActive = editActiveAll
                  const patchRow = (patch: Partial<BeamMaster>) => (oldView ? patchOldRun(b, patch) : patchBeam(b, patch))
                  const toEnd = beamsToEnd.has(b.beamNo) && !oldView
                  return (
                    <tr
                      key={b.beamNo}
                      className={[oldView ? 'sara-old-run-row' : editActive ? 'sara-edit-row' : '', toEnd ? 'sara-beam-to-end' : ''].filter(Boolean).join(' ') || undefined}
                      title={oldView ? oldRunTitle(b) : toEnd ? 'Loom is on B/End / B/Cut — the beam needs to be ended' : undefined}
                    >
                      <td className="fw-semibold px-2">{b.beamNo}</td>
                      {!compactTab && (
                        <td className="px-1">{renderLocationSelect(b, opsEdit && !oldView)}</td>
                      )}
                      <td className="px-1">
                        <SwLotCell
                          beamNo={b.beamNo}
                          value={b.swLot || ''}
                          enabled={editActive}
                          navRow={rowIdx}
                          navCol={0}
                          onCommit={(swLot) => patchRow({ swLot })}
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
                            onValueChange={(v) => patchRow({ beamRepeat: v.trim() || null })}
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
                                onValueChange={(v) => patchRow({ warp: v })}
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
                                onValueChange={(v) => patchRow({ reed: v })}
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
                                onValueChange={(v) => patchRow({ width: v })}
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
                                  patchRow({ totalThreads: Math.round(Number(v) || 0) })
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
                            onChange={(e) => patchRow({ loomType: e.target.value })}
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
                        {opsEdit && b.usedInLoom && !oldView ? (
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
                        ) : compactTab && opsEdit && !oldView ? (
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
                        <div className="d-flex gap-1 justify-content-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary py-0"
                            style={{ fontSize: '0.72rem' }}
                            onClick={() => openTrack(b)}
                          >
                            Track
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary py-0"
                            style={{ fontSize: '0.72rem' }}
                            title="When the beam was mounted on / removed from each loom — correct the dates"
                            onClick={() => setHistoryBeam(b.beamNo)}
                          >
                            History
                          </button>
                        </div>
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
            message: `Beam "${newBeam.beamNo}" added.`,
          })
        }}
        existingBeamNos={beams.map((b) => b.beamNo)}
        activeLooms={activeLooms}
        beams={beams}
        qualities={qualities}
      />
      {historyBeam && (
        <BeamHistoryDialog beamNo={historyBeam} canEdit={historyEdit} onClose={() => setHistoryBeam(null)} />
      )}
    </div>
  )
}
