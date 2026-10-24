'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DailyLoomProductionEntry } from '@/types/production'
import {
  FabricFaultShiftDialog,
  fabricFaultPreview,
  resolveShiftFaults,
} from '@/components/floor/FabricFaultShiftDialog'
import { TablePanScroll } from '@/components/shared/TablePanScroll'
import { EmptyPlaceholder } from '@/components/shared/EmptyPlaceholder'
import { cn } from '@/lib/utils'

interface FabricFaultTableProps {
  entries: DailyLoomProductionEntry[]
  selectedDate: string
  onUpdateEntry: (
    loomNumber: number,
    patch: Partial<DailyLoomProductionEntry>,
    editorName?: string
  ) => void
  canEdit?: boolean
}

/** A floor fault report (Kamran Fault page) — shown here read-only, never written into the sheet. */
type FloorReport = { id: string; loomNumber: number; shift?: 'A' | 'B'; text: string; media: unknown[]; createdBy: string }

function ReportLines({ list }: { list: FloorReport[] }) {
  if (list.length === 0) return null
  return (
    <div className="mt-1">
      {list.map((r) => (
        <div key={r.id} className="small text-primary-emphasis">
          <i className="bi bi-camera-video me-1" />
          <span className="fw-semibold">{r.createdBy || 'Floor'}:</span> {r.text || '(sirf photo / video)'}
          {r.media?.length ? <span className="text-secondary"> · {r.media.length} file</span> : null}
        </div>
      ))}
    </div>
  )
}

/**
 * Per-loom fabric faults for the selected day — Shift A / B via dialog, plus the day's
 * Kamran Fault reports (photo / video / note) beside them.
 */
export function FabricFaultTable({
  entries,
  selectedDate,
  onUpdateEntry,
  canEdit = false,
}: FabricFaultTableProps) {
  /** Default: only looms with a fault (overall view). */
  const [onlyWithFault, setOnlyWithFault] = useState(true)
  const [search, setSearch] = useState('')
  const [faultDialogEntry, setFaultDialogEntry] = useState<DailyLoomProductionEntry | null>(null)
  const [reports, setReports] = useState<FloorReport[]>([])

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate || '')) return
    let live = true
    fetch(`/api/floor/fault-reports?date=${selectedDate}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { reports: [] }))
      .then((d) => live && setReports(Array.isArray(d.reports) ? d.reports : []))
      .catch(() => live && setReports([]))
    return () => {
      live = false
    }
  }, [selectedDate])

  /** Reports of one loom + shift (shown on the loom's first row only). */
  const reportsFor = (e: DailyLoomProductionEntry, shift: 'A' | 'B') =>
    (e.segmentIndex || 1) > 1 ? [] : reports.filter((r) => r.loomNumber === e.loomNumber && (r.shift || 'A') === shift)
  const loomsWithReports = useMemo(() => new Set(reports.map((r) => r.loomNumber)), [reports])
  /** Looms with a floor report but no row on the day sheet (e.g. the day is not started yet). */
  const reportOnlyLooms = useMemo(() => {
    const onSheet = new Set(entries.map((e) => e.loomNumber))
    return [...loomsWithReports].filter((n) => !onSheet.has(n)).sort((a, b) => a - b)
  }, [entries, loomsWithReports])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...entries]
      .filter((e) => {
        const fault = fabricFaultPreview(e).trim()
        if (onlyWithFault && !fault && !((e.segmentIndex || 1) <= 1 && loomsWithReports.has(e.loomNumber))) return false
        if (!q) return true
        return (
          String(e.loomNumber).includes(q) ||
          (e.qualityName || '').toLowerCase().includes(q) ||
          fault.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => a.loomNumber - b.loomNumber || (a.segmentIndex || 1) - (b.segmentIndex || 1))
  }, [entries, onlyWithFault, search, loomsWithReports])

  const faultCount = useMemo(
    () => entries.filter((e) => fabricFaultPreview(e).trim() || ((e.segmentIndex || 1) <= 1 && loomsWithReports.has(e.loomNumber))).length,
    [entries, loomsWithReports]
  )

  return (
    <div className="space-y-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 print:hidden">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <input
            type="search"
            className="form-control form-control-sm"
            style={{ width: 200 }}
            placeholder="Search loom / quality / fault…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search fabric faults"
          />
          <div className="btn-group btn-group-sm" role="group" aria-label="Fault filter">
            <button
              type="button"
              className={cn('btn', !onlyWithFault ? 'btn-primary' : 'btn-outline-secondary')}
              onClick={() => setOnlyWithFault(false)}
            >
              All looms ({entries.length})
            </button>
            <button
              type="button"
              className={cn('btn', onlyWithFault ? 'btn-primary' : 'btn-outline-secondary')}
              onClick={() => setOnlyWithFault(true)}
            >
              With fault ({faultCount})
            </button>
          </div>
        </div>
        <div className="small text-secondary">
          Date: <strong>{selectedDate}</strong> — Shift A / B alag dialog se.
          {reports.length > 0 && (
            <>
              {' '}
              <i className="bi bi-camera-video text-primary" /> {reports.length} floor report —{' '}
              <Link href="/floor/fault-reports">photo / video dekhein</Link>
            </>
          )}
        </div>
      </div>

      {rows.length === 0 && reportOnlyLooms.length === 0 ? (
        <EmptyPlaceholder
          icon="bi-exclamation-diamond"
          title={onlyWithFault ? 'Is din koi fabric fault nahi' : 'Koi loom row nahi'}
          hint={
            onlyWithFault
              ? 'Daily Entry ya yahan dialog se Shift A / B fault likho.'
              : 'Pehle Daily Entry / Production day load karo.'
          }
        />
      ) : (
        <TablePanScroll className="card border">
          <table className="table table-sm table-bordered table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th className="px-2" style={{ width: 72 }}>
                  Loom #
                </th>
                <th className="px-2" style={{ minWidth: 140 }}>
                  Quality
                </th>
                <th className="px-2" style={{ width: 110 }}>
                  Fabric Type
                </th>
                <th className="px-2" style={{ width: 100 }}>
                  Status
                </th>
                <th className="px-2" style={{ minWidth: 140 }}>
                  Shift A
                </th>
                <th className="px-2" style={{ minWidth: 140 }}>
                  Shift B
                </th>
                <th className="px-2 text-center" style={{ width: 88 }}>
                  Edit
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const seg = e.segmentIndex && e.segmentIndex > 1 ? ` · P${e.segmentIndex}` : ''
                const { shiftA, shiftB } = resolveShiftFaults(e)
                return (
                  <tr key={e.id || `${e.loomNumber}-${e.segmentIndex || 1}`}>
                    <td className="fw-semibold px-2">
                      {e.loomNumber}
                      {seg}
                    </td>
                    <td className="px-2 text-truncate">{e.qualityName || '—'}</td>
                    <td className="small text-secondary px-2 text-truncate">
                      {e.fabricType || '—'}
                    </td>
                    <td className="small px-2">{e.status || '—'}</td>
                    <td className="small px-2" style={{ whiteSpace: 'pre-wrap' }}>
                      {shiftA.trim() || (reportsFor(e, 'A').length ? '' : '—')}
                      <ReportLines list={reportsFor(e, 'A')} />
                    </td>
                    <td className="small px-2" style={{ whiteSpace: 'pre-wrap' }}>
                      {shiftB.trim() || (reportsFor(e, 'B').length ? '' : '—')}
                      <ReportLines list={reportsFor(e, 'B')} />
                    </td>
                    <td className="px-1 text-center">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary py-0"
                        onClick={() => setFaultDialogEntry(e)}
                      >
                        {canEdit ? 'Edit' : 'View'}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {reportOnlyLooms.map((n) => (
                <tr key={`report-${n}`} className="table-info">
                  <td className="fw-semibold px-2">{n}</td>
                  <td className="px-2 small text-secondary" colSpan={3}>
                    Sheet par row nahi — sirf floor report
                  </td>
                  <td className="small px-2">
                    <ReportLines list={reports.filter((r) => r.loomNumber === n && (r.shift || 'A') === 'A')} />
                  </td>
                  <td className="small px-2">
                    <ReportLines list={reports.filter((r) => r.loomNumber === n && r.shift === 'B')} />
                  </td>
                  <td className="px-1 text-center">
                    <Link href="/floor/fault-reports" className="btn btn-sm btn-outline-secondary py-0">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablePanScroll>
      )}

      <FabricFaultShiftDialog
        entry={faultDialogEntry}
        open={Boolean(faultDialogEntry)}
        canEdit={canEdit}
        onClose={() => setFaultDialogEntry(null)}
        onSave={(patch) => {
          if (!faultDialogEntry) return
          onUpdateEntry(faultDialogEntry.loomNumber, {
            ...patch,
            segmentIndex: faultDialogEntry.segmentIndex,
          })
        }}
      />
    </div>
  )
}
