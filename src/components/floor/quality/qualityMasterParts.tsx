'use client'

/** Small pieces of the Quality Master: status filter bar, loom list cell, date/flash helpers. */
import {
  QualityMaster,
  LoomMaster,
  BeamMaster,
  YarnMaster,
  qualityRunThatOwnsSheetEntry,
  qualityEndedVisibleOnDate,
  qualityNameKey,
  qualityLoomEndsOnDate,
} from '@/services/productionMastersService'
import { getProductionToday } from '@/constants/productionCalendar'
import { type TableGridMode } from '@/components/shared/ViewModeToggle'
import { DailyLoomProductionEntry } from '@/types/production'

/** Today only: looms from Hold that already carry another live quality. */
export function loomsBusyOnResumeToday(
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

export const DEFAULT_WIDTHS: Record<string, number> = {
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

export function LoomListCell({ nums }: { nums: number[] }) {
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

export function formatShortDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  try {
    const d = new Date(`${dateStr}T12:00:00`)
    return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

export interface QualityMasterTableProps {
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

export type FlashTone = 'ended' | 'hold' | 'active' | 'reuse'

/** Row stays highlighted this long after assign / End / Hold / etc. */
export const QUALITY_FLASH_MS = 8500

export const FLASH_CLASS: Record<FlashTone, string> = {
  ended: 'sara-quality-flash-ended',
  hold: 'sara-quality-flash-hold',
  active: 'sara-quality-flash-active',
  reuse: 'sara-quality-flash-reuse',
}

/**
 * Spec (pick, reed, width …) as it was on `sheetDate`.
 * The master row holds only the latest spec; every saved sheet row keeps the spec of its
 * own day. On a past day, show what that day's rows recorded, so a change made on the 19th
 * does not appear on the 15th.
 */
export function qualitiesAsOfDay(
  qualities: QualityMaster[],
  dayRows: DailyLoomProductionEntry[],
  sheetDate: string
): QualityMaster[] {
  const day = String(sheetDate || '').slice(0, 10)
  if (!day || day >= getProductionToday() || dayRows.length === 0) return qualities
  return qualities.map((q) => {
    const key = qualityNameKey(q.name)
    if (!key) return q
    const sameName = qualities.filter((x) => qualityNameKey(x.name) === key).length
    const row = dayRows.find(
      (r) =>
        qualityNameKey(r.qualityName || '') === key &&
        Number(r.pick) > 0 &&
        (sameName === 1 || qualityRunThatOwnsSheetEntry({ ...r, date: day }, qualities, day)?.id === q.id)
    )
    if (!row) return q
    return {
      ...q,
      pick: Number(row.pick) || q.pick,
      reed: Number(row.reed) || q.reed,
      widthInch: Number(row.widthInch) || q.widthInch,
      gsm: row.gsm != null && Number(row.gsm) > 0 ? Number(row.gsm) : q.gsm,
      fabricType: row.fabricType || q.fabricType,
      warpYarn: row.warpYarn || q.warpYarn,
      weftYarn: row.weftYarn || q.weftYarn,
    }
  })
}
