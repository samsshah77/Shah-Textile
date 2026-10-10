'use client'

import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import {
  QualityMaster,
  LoomMaster,
  BeamMaster,
  YarnMaster,
  qualityDisplayName,
  mergeSheetEntriesForDate,
  mergedSheetEntriesForTotals,
  qualityActiveOnSheetDate,
  QUALITY_FABRIC_TYPES,
  normalizeFabricType,
  qualityRunThatOwnsSheetEntry,
  qualityEndedVisibleOnDate,
  qualityNameKey,
  qualityLoomEndsOnDate,
  loomHasQualityOnDate,
  qualityHeldButVisibleOnPastDay,
  findLiveQualityByName,
} from '@/services/productionMastersService'
import { PRODUCTION_TODAY, getProductionToday } from '@/constants/productionCalendar'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { NumericCellInput, TextCellInput } from '@/components/shared/NumericCellInput'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { DailyLoomProductionEntry } from '@/types/production'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { TablePanScroll } from '@/components/shared/TablePanScroll'
import {
  rememberQualityAssignFlash,
  peekQualityAssignFlashIds,
  clearQualityAssignFlashIds,
} from '@/lib/qualityAssignFlash'
import { EmptyPlaceholder } from '@/components/shared/EmptyPlaceholder'

/** Today only: looms from Hold that already carry another live quality. */
function loomsBusyOnResumeToday(
  q: QualityMaster,
  looms: LoomMaster[],
  qualities: QualityMaster[]
): { loomNumber: number; qualityName: string }[] {
  const holdDay = q.endedOn ? String(q.endedOn).slice(0, 10) : ''
  const loomNums = [
    ...new Set([...qualityLoomEndsOnDate(q, holdDay), ...qualityLoomEndsOnDate(q)]),
  ]
  const out: { loomNumber: number; qualityName: string }[] = []
  for (const n of loomNums) {
    const loom = looms.find((l) => l.loomNumber === n)
    if (!loom?.qualityId || loom.qualityId === q.id) continue
    const other = qualities.find((x) => x.id === loom.qualityId)
    out.push({ loomNumber: n, qualityName: other?.name || String(loom.qualityId) })
  }
  return out
}

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
  start: 118,
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
        className={`btn ${filter === 'ACTIVE' ? 'btn-success' : 'btn-outline-success'}`}
        onClick={() => onChange('ACTIVE')}
      >
        Active ({counts.active})
      </button>
      <button
        type="button"
        className={`btn ${filter === 'HOLD' ? 'sara-btn-hold' : 'sara-btn-hold-outline'}`}
        onClick={() => onChange('HOLD')}
      >
        Hold ({counts.hold})
      </button>
      <button
        type="button"
        className={`btn ${filter === 'ENDED' ? 'btn-secondary' : 'btn-outline-secondary'}`}
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
  onUpdate: (id: string, patch: Partial<QualityMaster>) => boolean | void
  onAdd: (newQuality?: Partial<QualityMaster>) => string | null | void
  onDelete: (id: string) => void
  /** Keep ENDED row for month PDF; fork a new Active run from zero. Returns new Active id. */
  onReassignEnded: (id: string, createdOn: string) => string | null | void
  readOnly?: boolean
  entries?: DailyLoomProductionEntry[]
  looms?: LoomMaster[]
  beams?: BeamMaster[]
  yarn?: YarnMaster[]
  statusFilter?: QualityStatusFilter
  /** Switch Active / Hold / Ends tab after End / Hold / Resume / etc. */
  onStatusFilterChange?: (filter: QualityStatusFilter) => void
  /** Production day whose looms and meters this table is showing. */
  sheetDate?: string
  /** Put Edit / View / Add in the page sticky chrome (not the scrolling card header). */
  toolbarInChrome?: boolean
  tableEdit?: boolean
  onTableEditChange?: (next: boolean) => void
  viewMode?: TableGridMode
  onViewModeChange?: (mode: TableGridMode) => void
  addModalOpen?: boolean
  onAddModalOpenChange?: (open: boolean) => void
}

type FlashTone = 'ended' | 'hold' | 'active' | 'reuse'

/** Row stays highlighted this long after assign / End / Hold / etc. */
const QUALITY_FLASH_MS = 8500

const FLASH_CLASS: Record<FlashTone, string> = {
  ended: 'sara-quality-flash-ended',
  hold: 'sara-quality-flash-hold',
  active: 'sara-quality-flash-active',
  reuse: 'sara-quality-flash-reuse',
}

export function QualityMasterTable({
  qualities,
  onUpdate,
  onAdd,
  onDelete,
  onReassignEnded,
  readOnly,
  entries = [],
  looms = [],
  beams = [],
  yarn = [],
  statusFilter = 'ACTIVE',
  onStatusFilterChange,
  sheetDate = PRODUCTION_TODAY,
  toolbarInChrome = false,
  tableEdit: tableEditProp,
  onTableEditChange,
  viewMode: viewModeProp,
  onViewModeChange,
  addModalOpen: addModalOpenProp,
  onAddModalOpenChange,
}: QualityMasterTableProps) {
  const { canEditProduction } = useAuth()
  const { showConfirm, showSuccessSoon, showInfo, showError } = useAlertDialog()
  const [modeLocal, setModeLocal] = useState<TableGridMode>('table')
  const [tableEditLocal, setTableEditLocal] = useState(false)
  const [flashIds, setFlashIds] = useState<Set<string>>(() => new Set())
  const [flashTone, setFlashTone] = useState<FlashTone>('active')
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const assignFlashShownRef = useRef(false)

  // Add Quality Modal Dialog State
  const emptyAddForm = {
    name: '',
    fabricType: 'Suiting' as string,
    weavePlan: '',
    warpYarn: '',
    weftYarn: '',
    reed: '',
    pick: '',
    widthInch: '',
    gsm: '',
  }
  const [isAddModalOpenLocal, setIsAddModalOpenLocal] = useState(false)
  const [addForm, setAddForm] = useState(emptyAddForm)
  const [endsFabricFilter, setEndsFabricFilter] = useState<'ALL' | 'Suiting' | 'Shirting'>('ALL')

  const mode = viewModeProp ?? modeLocal
  const setMode = (next: TableGridMode) => {
    onViewModeChange?.(next)
    if (viewModeProp === undefined) setModeLocal(next)
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

  useEffect(() => {
    if (isAddModalOpen) setAddForm({ ...emptyAddForm })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when modal opens
  }, [isAddModalOpen])

  const { widths, setColumnWidth, resetColumnWidth } = useResizableColumns(
    'sara_quality_col_widths_v12',
    DEFAULT_WIDTHS
  )

  const qualityStartDay = (q: QualityMaster) =>
    q.createdOn ? String(q.createdOn).slice(0, 10) : ''

  const patchQualityStart = (q: QualityMaster, next: string) => {
    const day = String(next || '').slice(0, 10)
    if (!day || day === qualityStartDay(q)) return
    onUpdate(q.id, { createdOn: day })
  }

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
    const dayKey = String(sheetDate || '').slice(0, 10)
    const isToday = !dayKey || dayKey === getProductionToday()
    for (const q of qualities) {
      const status = q.status ?? 'ACTIVE'
      // Active / Hold: L# is day-wise. Past dates use that day's sheet (never leak
      // today's loom master — e.g. Loom 4 on DUM DUM only from the day it started).
      if (status === 'ACTIVE' || status === 'HOLD') {
        if (isToday) {
          // Today: live master + any same-day dual segments still on the sheet.
          const fromLooms = looms
            .filter(
              (l) =>
                l.qualityId === q.id ||
                loomHasQualityOnDate(l, q.id, qualities, dayRows, sheetDate)
            )
            .map((l) => l.loomNumber)
          map.set(q.id, [...new Set(fromLooms)].sort((a, b) => a - b))
        } else {
          const fromDay = looms
            .filter((l) => loomHasQualityOnDate(l, q.id, qualities, dayRows, sheetDate))
            .map((l) => l.loomNumber)
          map.set(q.id, [...new Set(fromDay)].sort((a, b) => a - b))
        }
        continue
      }
      // Ended: stamped loom ends for this close, else sheet rows this run owns (by id).
      const fromEnds = qualityLoomEndsOnDate(q, sheetDate)
      if (fromEnds.length > 0) {
        map.set(q.id, fromEnds)
        continue
      }
      const fromAllEnds = qualityLoomEndsOnDate(q)
      if (fromAllEnds.length > 0) {
        map.set(q.id, fromAllEnds)
        continue
      }
      const fromSheet = [
        ...new Set(
          dayRows
            .filter(
              (e) =>
                qualityRunThatOwnsSheetEntry(e, qualities, e.date || sheetDate)?.id === q.id
            )
            .map((e) => e.loomNumber)
        ),
      ].sort((a, b) => a - b)
      map.set(q.id, fromSheet)
    }
    return map
  }, [dayRows, qualities, sheetDate, looms])

  const productionByQuality = useMemo(() => {
    const stats: Record<string, number> = {}
    for (const q of qualities) stats[q.id] = 0

    const allDays = mergedSheetEntriesForTotals(sheetDate, entries || [])

    for (const e of allDays) {
      const owner = qualityRunThatOwnsSheetEntry(e, qualities, e.date || sheetDate)
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
    if (qualityHeldButVisibleOnPastDay(q, sheetDate)) return
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

  /** Highlight only — no tab switch, no scroll navigation. */
  const flashRows = useCallback((ids: string | string[], tone: FlashTone) => {
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean)
    if (list.length === 0) return
    setFlashTone(tone)
    setFlashIds(new Set(list))
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlashIds(new Set()), QUALITY_FLASH_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [])

  // Quality Active: briefly tint rows newly assigned from Looms (no auto-navigation).
  useEffect(() => {
    if (statusFilter !== 'ACTIVE') {
      assignFlashShownRef.current = false
      return
    }
    if (assignFlashShownRef.current) return
    const pending = peekQualityAssignFlashIds()
    if (pending.length === 0) {
      assignFlashShownRef.current = true
      return
    }
    const visible = pending.filter((id) => qualities.some((q) => q.id === id))
    // Wait until qualities list has loaded before consuming pending ids.
    if (visible.length === 0 && qualities.length === 0) return
    assignFlashShownRef.current = true
    clearQualityAssignFlashIds()
    if (visible.length > 0) flashRows(visible, 'active')
  }, [statusFilter, qualities, flashRows])

  const flashClassFor = (id: string) =>
    flashIds.has(id) ? FLASH_CLASS[flashTone] : undefined

  /** HOLD quality on a past day (was running then) — show on Active with muted/amber bg. */
  const heldHistoryClass = (q: QualityMaster) =>
    !isHoldView && !isEndedView && qualityHeldButVisibleOnPastDay(q, sheetDate)
      ? 'sara-quality-held-history'
      : undefined

  const rowClassFor = (q: QualityMaster) =>
    [flashClassFor(q.id), heldHistoryClass(q)].filter(Boolean).join(' ') || undefined

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
          message: `"${label}" Ends pe chali gayi.`,
        })
      },
    })
  }

  const handleHold = (q: QualityMaster) => {
    if (!canOps) return
    if ((q.status ?? 'ACTIVE') !== 'ACTIVE') return
    const holdDate = String(sheetDate || '').slice(0, 10)
    const today = getProductionToday()
    const label = qualityDisplayName(q, qualities)
    // Natural flow: past date Hold nahi — us din ki production / Track confuse ho jati.
    if (holdDate !== today) {
      showError({
        title: 'Hold sirf aaj (Today)',
        message: `Pichli date (${formatShortDate(holdDate)}) pe Hold nahi ho sakta. Us din ki production pehle se sheet pe hai — usko Hold se wipe / confuse nahi karna. Date picker se Today kholo, phir Hold karo.`,
      })
      return
    }
    showConfirm({
      title: 'Quality Hold Karein?',
      message: `"${label}" ko aaj Hold pe rakh dein? Loom se hata di jayegi; baad mein Resume se wapas Active kar sakte ho. Pichli dates ki production Same rehti hai.`,
      type: 'confirm',
      confirmText: 'Hold',
      cancelText: 'Cancel',
      onConfirm: () => {
        onUpdate(q.id, { status: 'HOLD', endedOn: holdDate })
        showSuccessSoon({
          title: 'Quality On Hold',
          message: `"${label}" aaj Hold pe chali gayi.`,
        })
      },
    })
  }

  const handleResume = (q: QualityMaster) => {
    if (!canArchiveOps) return
    const label = qualityDisplayName(q, qualities)
    const resumeDate = String(sheetDate || '').slice(0, 10)
    const holdDate = q.endedOn ? String(q.endedOn).slice(0, 10) : ''
    const liveSame = findLiveQualityByName(qualities, q.name, q.id)
    if (liveSame) {
      showError({
        title: 'Resume nahi ho sakta',
        message: `"${liveSame.name}" pehle se Active/Hold pe hai. Same naam do baar nahi chalega.`,
      })
      return
    }
    // Resume only on hold day or any later day — not from days before Hold (those are history-only).
    if (holdDate && resumeDate && resumeDate < holdDate) {
      showError({
        title: 'Resume hold se pehle nahi',
        message: `"${label}" Hold thi ${formatShortDate(holdDate)}. Pichle din (${formatShortDate(resumeDate)}) sirf history hain (H badge) — wahan se Resume nahi. Date picker pe Hold wali date ya uske baad koi din kholo, phir Resume.`,
      })
      return
    }
    // Busy looms are not stolen — Resume still goes Active; free looms restore from resumeDate.
    const conflicts = loomsBusyOnResumeToday(q, looms, qualities)
    const busyNote =
      conflicts.length > 0
        ? ` Busy looms skip: ${conflicts
            .map((c) => `L#${c.loomNumber} → "${c.qualityName}"`)
            .join('; ')}. Free loom assign / meters baad mein.`
        : ''
    showConfirm({
      title: 'Quality Resume?',
      message: `"${label}" ${formatShortDate(resumeDate)} se Active (aaj tak khali din). Hold thi: ${formatShortDate(holdDate)}. Busy din skip.${busyNote}`,
      type: 'confirm',
      confirmText: 'Resume',
      cancelText: 'Cancel',
      onConfirm: () => {
        const ok = onUpdate(q.id, { status: 'ACTIVE', endedOn: null })
        if (ok === false) {
          showError({
            title: 'Resume nahi hua',
            message: `"${label}" Active pe nahi aayi. Dobara try karo.`,
          })
          return
        }
        rememberQualityAssignFlash(q.id)
        flashRows(q.id, 'active')
        onStatusFilterChange?.('ACTIVE')
        showSuccessSoon({
          title: 'Quality Resumed',
          message: `"${label}" ${formatShortDate(resumeDate)} se Active. Hold thi ${formatShortDate(holdDate)}. Ab meters / loom assign kar sakte ho.${busyNote}`,
        })
      },
    })
  }

  const handleReassign = (q: QualityMaster) => {
    if (!canArchiveOps) return
    const day = String(sheetDate || '').slice(0, 10)
    const label = qualityDisplayName(q, qualities)
    const liveSame = findLiveQualityByName(qualities, q.name, q.id)
    if (liveSame) {
      showError({
        title: 'Same name Active pe pehle se hai',
        message: `"${liveSame.name}" Active/Hold pe already hai. Same quality name do baar nahi ho sakta. Pehle usko End karo, ya sirf Continue use karo (purane meters). Reuse = naya run zero se — tabhi jab Active pe ye naam na ho.`,
      })
      return
    }
    showConfirm({
      title: 'Quality Reuse / Reassign?',
      message: `"${label}" ka naya Active run banega — meters zero se. Purana Ends record month hisab / PDF ke liye waisa hi rahega.`,
      type: 'confirm',
      confirmText: 'Reuse',
      cancelText: 'Cancel',
      onConfirm: () => {
        const newId = onReassignEnded(q.id, day) || null
        if (!newId) {
          showError({
            title: 'Reuse nahi hua',
            message: `Same naam Active pe pehle se maujood hai, ya Ends row reuse nahi ho sakti.`,
          })
          return
        }
        rememberQualityAssignFlash(newId)
        showSuccessSoon({
          title: 'Quality Reused',
          message: `"${label}" Active pe naya run — zero se. Quality Active pe jao — thodi der highlight dikhegi.`,
        })
      },
    })
  }

  /** Accidental End undo — same id / createdOn, Track zero nahi hota. */
  const handleContinue = (q: QualityMaster) => {
    if (!canArchiveOps) return
    const label = qualityDisplayName(q, qualities)
    const endDate = q.endedOn ? String(q.endedOn).slice(0, 10) : ''
    const liveSame = findLiveQualityByName(qualities, q.name, q.id)
    if (liveSame) {
      showError({
        title: 'Continue nahi ho sakta',
        message: `"${liveSame.name}" pehle se Active/Hold pe hai. Continue sirf tab jab galti se End hua ho aur Active pe same naam na ho. Agar zero se naya run chahiye to Reuse use karo.`,
      })
      return
    }
    const conflicts = loomsBusyOnResumeToday(q, looms, qualities)
    if (conflicts.length > 0) {
      const detail = conflicts
        .map((c) => `L#${c.loomNumber} → "${c.qualityName}"`)
        .join('; ')
      showError({
        title: 'Continue nahi ho sakta — loom busy',
        message: `Ye looms ab doosri quality pe hain: ${detail}. Pehle free karo, phir Continue.`,
      })
      return
    }
    showConfirm({
      title: 'Quality Continue?',
      message: `"${label}" galti se End hui thi? Active pe wapas — Ends se hat jayegi, purane meters same. Ended thi: ${formatShortDate(endDate)}.`,
      type: 'confirm',
      confirmText: 'Continue',
      cancelText: 'Cancel',
      onConfirm: () => {
        const ok = onUpdate(q.id, { status: 'ACTIVE', endedOn: null })
        if (ok === false) {
          showError({
            title: 'Continue nahi hua',
            message: `"${label}" Ends se nahi hati. Agar same naam Active pe hai to pehle usko End karo, ya Reuse (zero se) use karo.`,
          })
          return
        }
        rememberQualityAssignFlash(q.id)
        onStatusFilterChange?.('ACTIVE')
        showSuccessSoon({
          title: 'Quality Continued',
          message: `"${label}" Active pe aa gayi — purane meters same.`,
        })
      },
    })
  }

  const rowMenu = (q: QualityMaster, compact?: boolean) => {
    if (!canOps) return null
    // Past-day HOLD history is read-only on Active (Resume from Hold tab).
    if (qualityHeldButVisibleOnPastDay(q, sheetDate)) return null
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
            <>
              <li>
                <button type="button" className="dropdown-item" onClick={() => handleReassign(q)}>
                  <i className="bi bi-arrow-repeat me-2" /> Reuse (zero se)
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="dropdown-item text-success"
                  onClick={() => handleContinue(q)}
                >
                  <i className="bi bi-play-circle me-2" /> Continue (same meters)
                </button>
              </li>
            </>
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

  const addFormFieldOrder = [
    'name',
    'fabricType',
    'widthInch',
    'warpYarn',
    'weftYarn',
    'weavePlan',
    'reed',
    'pick',
    'gsm',
  ] as const

  const focusAddFormField = useCallback((name: string) => {
    const el = document.querySelector<HTMLElement>(`[data-add-q-field="${name}"]`)
    if (!el) return
    el.focus()
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.select?.()
    }
  }, [])

  const handleAddFormKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>, field: (typeof addFormFieldOrder)[number]) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsAddModalOpen(false)
        return
      }
      if (e.key !== 'Enter') return
      // Ctrl/Cmd+Enter → save from any field
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const form = e.currentTarget.closest('form')
        form?.requestSubmit()
        return
      }
      e.preventDefault()
      const idx = addFormFieldOrder.indexOf(field)
      if (idx < 0) return
      if (idx < addFormFieldOrder.length - 1) {
        focusAddFormField(addFormFieldOrder[idx + 1])
        return
      }
      // Last field → submit
      const form = e.currentTarget.closest('form')
      form?.requestSubmit()
    },
    [focusAddFormField, setIsAddModalOpen]
  )

  useEffect(() => {
    if (!isAddModalOpen) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsAddModalOpen(false)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [isAddModalOpen, setIsAddModalOpen])

  const handleCreateQuality = (e: React.FormEvent) => {
    e.preventDefault()
    if (!addForm.name.trim()) return
    const name = addForm.name.trim()
    const key = qualityNameKey(name)
    const duplicate = findLiveQualityByName(qualities, name) || qualities.find((q) => qualityNameKey(q.name) === key)
    if (duplicate) {
      showError({
        title: 'Quality pehle se maujood hai',
        message:
          (duplicate.status ?? 'ACTIVE') === 'ACTIVE' || (duplicate.status ?? '') === 'HOLD'
            ? `"${duplicate.name}" Active/Hold pe pehle se hai. Same naam do baar nahi. Ends pe ho to wahan se Reuse (zero se) karo.`
            : `"${duplicate.name}" Ends list me pehle se hai. Naya Add mat karo — Ends se Reuse (zero se) karo, ya Continue (same meters).`,
      })
      return
    }
    const newId = onAdd({
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
    setAddForm({ ...emptyAddForm })
    if (newId) {
      rememberQualityAssignFlash(newId)
      flashRows(newId, 'active')
    }
    showSuccessSoon({
      title: 'Quality Added',
      message: `"${name}" add ho gayi — thodi der highlight.`,
    })
  }

  const emptyCopy = isHoldView
    ? {
        icon: 'bi-pause-circle',
        title: 'No qualities on Hold',
        hint: 'Active se Hold karne par yahan dikhengi — baad mein Resume se wapas Active.',
      }
    : isEndedView
      ? {
          icon: 'bi-stop-circle',
          title: `No ends on ${formatShortDate(sheetDate)}`,
          hint: 'Is date pe koi quality end nahi hui. Jab End karoge, Ends list yahan aayegi.',
        }
      : {
          icon: 'bi-stars',
          title: 'No active qualities yet',
          hint: 'Add Quality se naya run banao, phir Looms pe assign karo — list yahan dikhegi.',
        }

  return (
    <div className="card">
      <style>{`
        /* Flat soft row tint — one solid color, no per-cell accent stripes */
        .sara-quality-flash-ended,
        .sara-quality-flash-ended.master-grid-card,
        li.sara-quality-flash-ended {
          background-color: var(--bs-danger-bg-subtle, #f8d7da) !important;
          box-shadow: none !important;
        }
        tr.sara-quality-flash-ended > td {
          background-color: var(--bs-danger-bg-subtle, #f8d7da) !important;
          border-color: var(--bs-danger-bg-subtle, #f8d7da) !important;
          box-shadow: none !important;
        }
        .sara-quality-flash-hold,
        .sara-quality-flash-hold.master-grid-card,
        li.sara-quality-flash-hold {
          background-color: var(--bs-warning-bg-subtle, #fff3cd) !important;
          box-shadow: none !important;
        }
        tr.sara-quality-flash-hold > td {
          background-color: var(--bs-warning-bg-subtle, #fff3cd) !important;
          border-color: var(--bs-warning-bg-subtle, #fff3cd) !important;
          box-shadow: none !important;
        }
        .sara-quality-flash-active,
        .sara-quality-flash-active.master-grid-card,
        li.sara-quality-flash-active {
          background-color: var(--bs-success-bg-subtle, #d1e7dd) !important;
          box-shadow: none !important;
        }
        tr.sara-quality-flash-active > td {
          background-color: var(--bs-success-bg-subtle, #d1e7dd) !important;
          border-color: var(--bs-success-bg-subtle, #d1e7dd) !important;
          box-shadow: none !important;
        }
        .sara-quality-flash-reuse,
        .sara-quality-flash-reuse.master-grid-card,
        li.sara-quality-flash-reuse {
          background-color: var(--bs-info-bg-subtle, #cff4fc) !important;
          box-shadow: none !important;
        }
        tr.sara-quality-flash-reuse > td {
          background-color: var(--bs-info-bg-subtle, #cff4fc) !important;
          border-color: var(--bs-info-bg-subtle, #cff4fc) !important;
          box-shadow: none !important;
        }
        /* HOLD on past Active days (was running then) — history only, not Resume. */
        .sara-quality-held-history,
        .sara-quality-held-history.master-grid-card,
        li.sara-quality-held-history {
          background-color: rgba(253, 126, 20, 0.22) !important;
          box-shadow: inset 4px 0 0 #fd7e14 !important;
          opacity: 0.92;
        }
        tr.sara-quality-held-history > td {
          background-color: rgba(253, 126, 20, 0.2) !important;
        }
      `}</style>
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
          {!toolbarInChrome && editToggle}
          <ViewModeToggle mode={mode} onChange={setMode} />
          {!toolbarInChrome && !readOnly && canEditProduction && !isArchiveView && (
            <button
              type="button"
              className="btn btn-sm btn-success"
              onClick={() => {
                setAddForm({ ...emptyAddForm })
                setIsAddModalOpen(true)
              }}
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
              <EmptyPlaceholder
                icon={emptyCopy.icon}
                title={emptyCopy.title}
                hint={emptyCopy.hint}
              />
            ) : (
              <ul className="list-group list-group-flush">
                {orderedForView.map((q, rowIdx) => {
                  const overall = productionByQuality[q.id] || 0
                  return (
                  <li
                    key={q.id}
                    data-quality-row={q.id}
                    className={`list-group-item d-flex flex-column gap-2 px-0 ${rowClassFor(q) || ''}`}
                  >
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                      <div className="d-flex align-items-center gap-2 min-w-0">
                        <span className="badge bg-secondary-subtle text-secondary font-monospace">
                          #{rowIdx + 1}
                        </span>
                        <span className="fw-semibold text-truncate">{qualityDisplayName(q, qualities)}</span>
                        {qualityHeldButVisibleOnPastDay(q, sheetDate) && (
                          <span
                            className="badge text-bg-warning"
                            style={{ fontSize: '0.65rem' }}
                            title="Hold — past history (Resume Hold tab se)"
                          >
                            H
                          </span>
                        )}
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
                    <div className="small text-muted ps-4 d-flex flex-wrap gap-x-3 gap-y-1 align-items-center">
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
                      <span className="d-inline-flex align-items-center gap-1">
                        Start:
                        {canArchiveOps && tableEdit ? (
                          <input
                            type="date"
                            className="form-control form-control-sm"
                            style={{ width: 140 }}
                            value={qualityStartDay(q)}
                            title="Start date — is se pehle quality / Track nahi dikhegi"
                            onChange={(e) => patchQualityStart(q, e.target.value)}
                          />
                        ) : (
                          <span>{qualityStartDay(q) ? formatShortDate(qualityStartDay(q)) : '—'}</span>
                        )}
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
          {orderedForView.length === 0 ? (
            <div className="w-100">
              <EmptyPlaceholder
                icon={emptyCopy.icon}
                title={emptyCopy.title}
                hint={emptyCopy.hint}
              />
            </div>
          ) : (
          orderedForView.map((q, rowIdx) => {
            const overall = productionByQuality[q.id] || 0
            const heldHistory = qualityHeldButVisibleOnPastDay(q, sheetDate)
            const rowMasterEdit = masterEdit && !heldHistory

            return (
              <div
                key={q.id}
                data-quality-row={q.id}
                className={[
                  'master-grid-card',
                  editActive && !heldHistory ? 'sara-edit-card' : '',
                  rowClassFor(q) || '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="d-flex align-items-center justify-content-between">
                  <div className="fw-semibold d-flex align-items-center gap-1.5 min-w-0">
                    <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '0.74rem' }}>
                      #{rowIdx + 1}
                    </span>
                    <span className="text-truncate">{q.name || '—'}</span>
                    {heldHistory && (
                      <span
                        className="badge text-bg-warning"
                        style={{ fontSize: '0.65rem' }}
                        title="Hold — past history (Resume Hold tab se)"
                      >
                        H
                      </span>
                    )}
                  </div>
                  {rowMasterEdit && (
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

                {rowMasterEdit && (
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
                {rowMasterEdit ? (
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

                <label className="small mb-0">Start</label>
                {rowMasterEdit ? (
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    value={qualityStartDay(q)}
                    title="Start date — is se pehle quality / Track nahi dikhegi"
                    onChange={(e) => patchQualityStart(q, e.target.value)}
                  />
                ) : (
                  <div className="small text-secondary">
                    {qualityStartDay(q) ? formatShortDate(qualityStartDay(q)) : '—'}
                  </div>
                )}

                <div className="d-flex gap-2">
                  <div className="flex-fill">
                    <label className="small mb-0">Warp Yarn</label>
                    {rowMasterEdit ? (
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
                    {rowMasterEdit ? (
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
                {rowMasterEdit ? (
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
                    {rowMasterEdit ? (
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
                    {rowMasterEdit ? (
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
                    {rowMasterEdit ? (
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
                {rowMasterEdit ? (
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
          })
          )}
        </div>
        )
      ) : isArchiveView ? (
        <TablePanScroll className="card-body p-0">
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
                <th className="px-2">Start</th>
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
                  <td colSpan={14} className="p-0 border-0">
                    <EmptyPlaceholder
                      icon={emptyCopy.icon}
                      title={emptyCopy.title}
                      hint={emptyCopy.hint}
                      compact
                    />
                  </td>
                </tr>
              ) : (
                orderedForView.map((q, rowIdx) => {
                  const overall = productionByQuality[q.id] || 0
                  return (
                  <tr key={q.id} data-quality-row={q.id} className={rowClassFor(q)}>
                    <td className="px-2 text-center text-muted fw-semibold font-monospace">{rowIdx + 1}</td>
                    <td className="px-2 fw-semibold">
                      {qualityDisplayName(q, qualities)}
                      {qualityHeldButVisibleOnPastDay(q, sheetDate) && (
                        <span
                          className="badge text-bg-warning ms-1"
                          style={{ fontSize: '0.65rem' }}
                          title="Hold — past history (Resume Hold tab se)"
                        >
                          H
                        </span>
                      )}
                    </td>
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
                    <td className="px-2">
                      {canArchiveOps && tableEdit ? (
                        <input
                          type="date"
                          className="form-control form-control-sm"
                          style={{ width: 140 }}
                          value={qualityStartDay(q)}
                          title="Start date — is se pehle quality / Track nahi dikhegi"
                          onChange={(e) => patchQualityStart(q, e.target.value)}
                        />
                      ) : (
                        <span className="small font-monospace">
                          {qualityStartDay(q) ? formatShortDate(qualityStartDay(q)) : '—'}
                        </span>
                      )}
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
        </TablePanScroll>
      ) : (
        <TablePanScroll className="card-body p-0">
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
                <ResizableTh columnKey="start" width={widths.start} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1">
                  Start
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
              {orderedForView.length === 0 ? (
                <tr>
                  <td colSpan={14} className="p-0 border-0">
                    <EmptyPlaceholder
                      icon={emptyCopy.icon}
                      title={emptyCopy.title}
                      hint={emptyCopy.hint}
                      compact
                    />
                  </td>
                </tr>
              ) : (
              orderedForView.map((q, rowIdx) => {
                const overall = productionByQuality[q.id] || 0
                const heldHistory = qualityHeldButVisibleOnPastDay(q, sheetDate)
                const rowOpsEdit = opsEdit && !heldHistory

                return (
                  <tr
                    key={q.id}
                    data-quality-row={q.id}
                    className={[editActive && !heldHistory ? 'sara-edit-row' : '', rowClassFor(q) || '']
                      .filter(Boolean)
                      .join(' ') || undefined}
                  >
                    <td className="px-1 text-center text-muted fw-semibold font-monospace" style={{ fontSize: '0.8rem' }}>
                      {rowIdx + 1}
                    </td>
                    <td className="px-1">
                      <LoomListCell nums={assignedByQuality.get(q.id) || []} />
                    </td>
                    <td className="px-2">
                      <span className="fw-semibold">{qualityDisplayName(q, qualities)}</span>
                      {heldHistory && (
                        <span
                          className="badge text-bg-warning ms-1"
                          style={{ fontSize: '0.65rem' }}
                          title="Hold — past history (Resume Hold tab se)"
                        >
                          H
                        </span>
                      )}
                    </td>
                    <td className="px-2 text-truncate">
                      {rowOpsEdit ? (
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
                      {rowOpsEdit ? (
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
                      {rowOpsEdit ? (
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
                      {rowOpsEdit ? (
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
                      {rowOpsEdit ? (
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
                      {rowOpsEdit ? (
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
                      {rowOpsEdit ? (
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
                      {rowOpsEdit ? (
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
                    <td className="px-1">
                      {rowOpsEdit ? (
                        <input
                          type="date"
                          className="form-control form-control-sm"
                          style={{ width: '100%', minWidth: 0 }}
                          value={qualityStartDay(q)}
                          title="Start date — is se pehle quality / Track nahi dikhegi"
                          onChange={(e) => patchQualityStart(q, e.target.value)}
                        />
                      ) : (
                        <span className="small text-secondary font-monospace">
                          {qualityStartDay(q) ? formatShortDate(qualityStartDay(q)) : '—'}
                        </span>
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
              })
              )}
            </tbody>
          </table>
        </TablePanScroll>
      )}

      {/* Add Quality Modal Dialog */}
      {isAddModalOpen && (
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 1055,
          }}
        >
          <div
            className="modal-dialog modal-dialog-centered modal-dialog-scrollable mx-2 mx-sm-auto my-2"
            style={{
              maxWidth: 560,
              width: '100%',
              maxHeight: 'min(88dvh, 720px)',
              marginTop: 'auto',
              marginBottom: 'auto',
            }}
          >
            <div
              className="modal-content border-0 shadow-lg d-flex flex-column"
              style={{
                borderRadius: '14px',
                overflow: 'hidden',
                maxHeight: 'min(88dvh, 720px)',
              }}
            >
              <div className="modal-header bg-light py-3 px-4 border-bottom flex-shrink-0">
                <div className="d-flex align-items-center gap-2">
                  <span className="badge bg-primary px-2.5 py-1.5 fs-7">
                    <i className="bi bi-tags me-1" /> Quality
                  </span>
                  <h5 className="modal-title fs-6 fw-bold mb-0">Add Quality</h5>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setIsAddModalOpen(false)}
                />
              </div>
              <form
                onSubmit={handleCreateQuality}
                className="sara-add-beam-form d-flex flex-column flex-grow-1"
                style={{ minHeight: 0 }}
              >
                <div
                  className="modal-body p-4"
                  style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: '1 1 auto' }}
                >
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                        Quality Name <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        autoFocus
                        data-add-q-field="name"
                        className="form-control"
                        placeholder="e.g. PARCOPV, EVEREST"
                        value={addForm.name}
                        onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                        onKeyDown={(e) => handleAddFormKeyDown(e, 'name')}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                        Fabric Type
                      </label>
                      <select
                        data-add-q-field="fabricType"
                        className="form-select"
                        value={normalizeFabricType(addForm.fabricType)}
                        onChange={(e) => setAddForm({ ...addForm, fabricType: e.target.value })}
                        onKeyDown={(e) => handleAddFormKeyDown(e, 'fabricType')}
                      >
                        {QUALITY_FABRIC_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                        Width (Inches)
                      </label>
                      <input
                        type="number"
                        data-add-q-field="widthInch"
                        className="form-control"
                        placeholder="e.g. 66"
                        value={addForm.widthInch}
                        onChange={(e) => setAddForm({ ...addForm, widthInch: e.target.value })}
                        onKeyDown={(e) => handleAddFormKeyDown(e, 'widthInch')}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                        Warp Yarn
                      </label>
                      <input
                        type="text"
                        list="quality-warp-stock"
                        data-add-q-field="warpYarn"
                        className="form-control"
                        placeholder="Beam stock se warp likho"
                        value={addForm.warpYarn}
                        onChange={(e) => setAddForm({ ...addForm, warpYarn: e.target.value })}
                        onKeyDown={(e) => handleAddFormKeyDown(e, 'warpYarn')}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                        Weft Yarn
                      </label>
                      <input
                        type="text"
                        list="quality-weft-stock"
                        data-add-q-field="weftYarn"
                        className="form-control"
                        placeholder="Yarn stock se weft likho"
                        value={addForm.weftYarn}
                        onChange={(e) => setAddForm({ ...addForm, weftYarn: e.target.value })}
                        onKeyDown={(e) => handleAddFormKeyDown(e, 'weftYarn')}
                      />
                    </div>

                    <div className="col-md-4">
                      <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                        Weave Plan
                      </label>
                      <input
                        type="text"
                        data-add-q-field="weavePlan"
                        className="form-control"
                        placeholder="e.g. 2/1 Twill"
                        value={addForm.weavePlan}
                        onChange={(e) => setAddForm({ ...addForm, weavePlan: e.target.value })}
                        onKeyDown={(e) => handleAddFormKeyDown(e, 'weavePlan')}
                      />
                    </div>

                    <div className="col-md-4">
                      <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                        Reed
                      </label>
                      <input
                        type="number"
                        data-add-q-field="reed"
                        className="form-control"
                        placeholder="e.g. 120"
                        value={addForm.reed}
                        onChange={(e) => setAddForm({ ...addForm, reed: e.target.value })}
                        onKeyDown={(e) => handleAddFormKeyDown(e, 'reed')}
                      />
                    </div>

                    <div className="col-md-4">
                      <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                        Pick
                      </label>
                      <input
                        type="number"
                        data-add-q-field="pick"
                        className="form-control"
                        placeholder="e.g. 60"
                        value={addForm.pick}
                        onChange={(e) => setAddForm({ ...addForm, pick: e.target.value })}
                        onKeyDown={(e) => handleAddFormKeyDown(e, 'pick')}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                        GSM (2 Decimals)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        data-add-q-field="gsm"
                        className="form-control"
                        placeholder="e.g. 1.77"
                        value={addForm.gsm}
                        onChange={(e) => setAddForm({ ...addForm, gsm: e.target.value })}
                        onKeyDown={(e) => handleAddFormKeyDown(e, 'gsm')}
                      />
                    </div>
                  </div>
                  <div className="form-text small mt-2 mb-0">
                    Enter / → next · Ctrl+Enter save · Esc close
                  </div>
                </div>

                <div className="modal-footer bg-light px-4 py-3 border-top flex-shrink-0">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setIsAddModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-sm btn-primary px-3">
                    <i className="bi bi-plus-lg me-1" /> Add Quality
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



