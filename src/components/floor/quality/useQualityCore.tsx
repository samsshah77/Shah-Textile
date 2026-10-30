'use client'

import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { QualityMaster, mergeSheetEntriesForDate, mergedSheetEntriesForTotals, qualityActiveOnSheetDate, normalizeFabricType, qualityRunThatOwnsSheetEntry, qualityEndedVisibleOnDate, qualityLoomEndsOnDate, loomHasQualityOnDate, qualityHeldButVisibleOnPastDay, qualityEndedButVisibleOnPastDay, qualityHistoryOnActivePastDay, qualityIdOnLoomForDate, normalizeQualityStatus } from '@/services/productionMastersService'
import { PRODUCTION_TODAY, getProductionToday } from '@/constants/productionCalendar'
import { type TableGridMode } from '@/components/shared/ViewModeToggle'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { DailyLoomProductionEntry } from '@/types/production'
import { resolveLoomCondition } from '@/constants/loomConditions'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { peekQualityAssignFlashIds, clearQualityAssignFlashIds } from '@/lib/qualityAssignFlash'
import type { QualityMasterTableProps, FlashTone } from '@/components/floor/quality/qualityMasterParts'
import { qualitiesAsOfDay, DEFAULT_WIDTHS, qualityStatusCounts, QUALITY_FLASH_MS, FLASH_CLASS } from '@/components/floor/quality/qualityMasterParts'

/** Quality table: state and the lists / numbers it shows. */
export function useQualityCore(props: QualityMasterTableProps) {
  const {
  qualities: qualitiesLatest,
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
  } = props
  const qualities = useMemo(
    () => qualitiesAsOfDay(qualitiesLatest, entries, sheetDate),
    [qualitiesLatest, entries, sheetDate]
  )
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
    'sara_quality_col_widths_v13',
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
        // Ended view: the quality that ended first comes first (no end date → last, then by name).
        .sort((a, b) => {
          const ea = String(a.endedOn || '').slice(0, 10) || '9999-99-99'
          const eb = String(b.endedOn || '').slice(0, 10) || '9999-99-99'
          return ea.localeCompare(eb) || (a.name || '').localeCompare(b.name || '')
        })
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
      // ENDED on past Active days: that day's sheet allotment (not end-stamp looms).
      if (!isToday && qualityEndedButVisibleOnPastDay(q, sheetDate)) {
        const fromDay = looms
          .filter((l) => loomHasQualityOnDate(l, q.id, qualities, dayRows, sheetDate))
          .map((l) => l.loomNumber)
        map.set(q.id, [...new Set(fromDay)].sort((a, b) => a - b))
        continue
      }
      // Ended (Ends tab / end day): stamped loom ends, else sheet rows this run owns.
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

  /** Looms on Beam End / Beam Cut for the selected day (day sheet first, else today's loom master). */
  const beamEndLooms = useMemo(() => {
    const dayKey = String(sheetDate || '').slice(0, 10)
    const isToday = !dayKey || dayKey === getProductionToday()
    const set = new Set<number>()
    const rowLooms = new Set<number>()
    for (const e of dayRows) {
      rowLooms.add(e.loomNumber)
      const cond = resolveLoomCondition(e.status, e.remarks)
      if (cond === 'BEAM_END' || cond === 'BEAM_CUT') set.add(e.loomNumber)
    }
    if (isToday) {
      for (const l of looms) {
        if (rowLooms.has(l.loomNumber)) continue
        if (l.status === 'BEAM_END' || l.status === 'BEAM_CUT') set.add(l.loomNumber)
      }
    }
    return set
  }, [dayRows, looms, sheetDate])

  const availableLooms = useMemo(() => {
    const dayKey = String(sheetDate || '').slice(0, 10)
    const isToday = !dayKey || dayKey === getProductionToday()

    const allLoomNumbers =
      looms.length > 0
        ? [...looms].map((l) => l.loomNumber).sort((a, b) => a - b)
        : Array.from({ length: 34 }, (_, i) => i + 1)

    const busyLooms = new Set<number>()

    for (const q of qualities) {
      const status = q.status ?? 'ACTIVE'
      const isActive = isToday
        ? status === 'ACTIVE'
        : qualityActiveOnSheetDate(q, dayKey, dayRows, qualities)
      if (!isActive) continue

      const assigned = assignedByQuality.get(q.id) || []
      for (const num of assigned) {
        busyLooms.add(num)
      }
    }

    for (const l of looms) {
      const qId = qualityIdOnLoomForDate(l, qualities, dayRows, sheetDate)
      if (qId) {
        const q = qualities.find((item) => item.id === qId)
        if (q && normalizeQualityStatus(q.status) === 'ACTIVE') {
          busyLooms.add(l.loomNumber)
        }
      }
    }

    // Beam End / Beam Cut on this day: the loom is free for a new beam / quality even
    // though the quality is still allotted to it — show it as available.
    for (const n of beamEndLooms) busyLooms.delete(n)
    return allLoomNumbers.filter((n) => !busyLooms.has(n))
  }, [looms, qualities, dayRows, sheetDate, assignedByQuality, beamEndLooms])

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
    if (qualityHistoryOnActivePastDay(q, sheetDate)) return
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

  /** HOLD/ENDED on a past Active day (was running then) — muted history bg. */
  const pastHistoryClass = (q: QualityMaster) => {
    if (isHoldView || isEndedView) return undefined
    if (qualityHeldButVisibleOnPastDay(q, sheetDate)) return 'sara-quality-held-history'
    if (qualityEndedButVisibleOnPastDay(q, sheetDate)) return 'sara-quality-ended-history'
    return undefined
  }

  const rowClassFor = (q: QualityMaster) =>
    [flashClassFor(q.id), pastHistoryClass(q)].filter(Boolean).join(' ') || undefined

  const PastHistoryBadge = ({ q }: { q: QualityMaster }) => {
    if (qualityHeldButVisibleOnPastDay(q, sheetDate)) {
      return (
        <span
          className="badge text-bg-warning"
          style={{ fontSize: '0.65rem' }}
          title="Hold — past history (Resume Hold tab se)"
        >
          H
        </span>
      )
    }
    if (qualityEndedButVisibleOnPastDay(q, sheetDate)) {
      return (
        <span
          className="badge text-bg-secondary"
          style={{ fontSize: '0.65rem' }}
          title="Ended — past history (us din active thi; Ends tab pe ab)"
        >
          E
        </span>
      )
    }
    return null
  }

  return {
    qualitiesLatest,
    onUpdate,
    onAdd,
    onDelete,
    onReassignEnded,
    readOnly,
    entries,
    looms,
    beams,
    yarn,
    statusFilter,
    onStatusFilterChange,
    sheetDate,
    toolbarInChrome,
    tableEditProp,
    onTableEditChange,
    viewModeProp,
    onViewModeChange,
    addModalOpenProp,
    onAddModalOpenChange,
    qualities,
    canEditProduction,
    showConfirm,
    showSuccessSoon,
    showInfo,
    showError,
    modeLocal,
    setModeLocal,
    tableEditLocal,
    setTableEditLocal,
    flashIds,
    setFlashIds,
    flashTone,
    setFlashTone,
    flashTimerRef,
    assignFlashShownRef,
    emptyAddForm,
    isAddModalOpenLocal,
    setIsAddModalOpenLocal,
    addForm,
    setAddForm,
    endsFabricFilter,
    setEndsFabricFilter,
    mode,
    setMode,
    tableEdit,
    setTableEdit,
    isAddModalOpen,
    setIsAddModalOpen,
    widths,
    setColumnWidth,
    resetColumnWidth,
    qualityStartDay,
    patchQualityStart,
    isEndedView,
    isHoldView,
    isArchiveView,
    dayRows,
    counts,
    frozenOrderRef,
    displayedQualities,
    orderedForView,
    warpOptions,
    weftOptions,
    meterOf,
    assignedByQuality,
    beamEndLooms,
    availableLooms,
    productionByQuality,
    tableMinWidth,
    canOps,
    canArchiveOps,
    opsEdit,
    masterEdit,
    editActive,
    cardTitle,
    editToggle,
    handleDelete,
    flashRows,
    flashClassFor,
    pastHistoryClass,
    rowClassFor,
    PastHistoryBadge,
  }
}

export type QualityCore = ReturnType<typeof useQualityCore>
