'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { TablePanScroll } from '@/components/shared/TablePanScroll'
import { formatNumber } from '@/lib/utils'
import { getProductionToday, productionMonthBounds } from '@/constants/productionCalendar'
import { preloadAllFloorSheets } from '@/services/productionMastersService'
import { listPersistedSheetEntries } from '@/services/production/floorStore'
import { formatSwLotForDailyEntry } from '@/services/beamTrack'
import { longDateFromYmd } from '@/lib/longDate'
import type { BeamMaster, MountBeamResult } from '@/services/productionMastersService'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { BeamHistoryDialog } from '@/components/floor/BeamHistoryDialog'
import { beamMadeMeters, editBeamStint, entryMeters, fetchBeamStints, rowsFromBeams, type BeamStint } from '@/lib/floor/beamStints'
import { SectionLoader } from '@/components/shared/Loaders'

type EndedRow = BeamStint & {
  to: string
  made: number
  days: number
  qualities: string[]
}

/** Production month: the 2nd → the 1st of the next month. */
function monthRange(month: string): { from: string; to: string; label: string } {
  const [y, m] = month.split('-').map(Number)
  const label = new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  return { ...productionMonthBounds(month), label }
}

/**
 * Beams tab → Ended: every time a beam came off a loom in the month, read from the beam
 * history. A beam that was later re-filled and mounted again keeps this record as it was
 * (its old Sw/Wp #, length, what it made and what was wasted), so past months stay right.
 * Edit → "Wapis loom pe" puts a beam ended by mistake back on its loom (same mount day).
 */
export function BeamEndedHistory({
  month,
  beams = [],
  canEdit = false,
  onRestore,
}: {
  month: string
  beams?: BeamMaster[]
  canEdit?: boolean
  onRestore?: (beamNo: string, loomNumber: number, mountedOn: string, endedOn: string | null) => MountBeamResult
}) {
  const range = useMemo(() => monthRange(month), [month])
  const { showConfirm, showError, showSuccessSoon } = useAlertDialog()
  const [editing, setEditing] = useState(false)
  // Bumped after a restore so the history is read again.
  const [reload, setReload] = useState(0)
  const [historyBeam, setHistoryBeam] = useState<string | null>(null)
  // Rows put back on their loom here — hidden at once, before the history is read again.
  const [restored, setRestored] = useState<string[]>([])
  // What was loaded, and for which month (a different month = still loading).
  const [loaded, setLoaded] = useState<{ month: string; stints: BeamStint[]; error: string } | null>(null)
  const today = getProductionToday()

  useEffect(() => {
    let live = true
    Promise.all([fetchBeamStints(range.from, range.to), preloadAllFloorSheets().catch(() => undefined)])
      .then(([list]) => {
        if (live) setLoaded({ month, stints: list, error: '' })
      })
      .catch((err) => {
        if (live) setLoaded({ month, stints: [], error: err instanceof Error ? err.message : 'Could not load beams.' })
      })
    return () => {
      live = false
    }
  }, [month, range.from, range.to, reload])

  const stints = loaded && loaded.month === month ? loaded.stints : null
  const error = loaded && loaded.month === month ? loaded.error : ''

  const rows = useMemo<EndedRow[]>(() => {
    if (!stints) return []
    const entries = listPersistedSheetEntries()
    return stints
      .filter((s): s is BeamStint & { to: string } => s.to != null && s.to >= range.from && s.to <= range.to)
      .filter((s) => !restored.includes(`${s.beamNo}|${s.loom}|${s.from}`))
      .map((s) => {
        const made = rowsFromBeams(entries, [s], today)
        const days = new Set(made.filter((e) => entryMeters(e) > 0).map((e) => String(e.date).slice(0, 10)))
        const qualities = [...new Set(made.map((e) => (e.qualityName || '').trim()).filter((n) => n && n !== '—' && n !== '-'))]
        return { ...s, made: beamMadeMeters(entries, [s], today), days: days.size, qualities }
      })
      .sort((a, b) => a.to.localeCompare(b.to) || a.loom - b.loom || a.beamNo.localeCompare(b.beamNo))
  }, [stints, range.from, range.to, today, restored])

  /** Rows that can go back: the beam is off every loom now and this is its last run (same Sw/Wp #). */
  const restorable = useMemo(() => {
    const out = new Set<EndedRow>()
    for (const r of rows) {
      const beam = beams.find((b) => b.beamNo === r.beamNo)
      if (!beam || beam.usedInLoom) continue
      const later = rows.some((o) => o !== r && o.beamNo === r.beamNo && o.from > r.from)
      if (later) continue
      if ((beam.swLot || '').trim() !== (r.swLot || '').trim()) continue
      out.add(r)
    }
    return out
  }, [rows, beams])

  const restore = (r: EndedRow) => {
    if (!onRestore) return
    showConfirm({
      title: `Put beam ${r.beamNo} back on Loom ${r.loom}?`,
      message: `Beam ${r.beamNo}${r.swLot ? ` (${formatSwLotForDailyEntry(r.swLot)})` : ''} was ended by mistake? It goes back on Loom ${r.loom} from ${longDateFromYmd(r.from)} (as before) and leaves the Ended list.`,
      type: 'confirm',
      confirmText: 'Yes, put it back',
      cancelText: 'Cancel',
      onConfirm: () => {
        const res = onRestore(r.beamNo, r.loom, r.from, r.to)
        if (!res.ok) {
          showError({ title: 'Not put back', message: res.message || 'Could not put the beam back.' })
          return
        }
        setRestored((list) => [...list, `${r.beamNo}|${r.loom}|${r.from}`])
        // The save goes to the server in the background; read the history again after it.
        window.setTimeout(() => setReload((n) => n + 1), 2500)
        showSuccessSoon({
          title: 'Beam back on the loom',
          message: `Beam ${r.beamNo} is on Loom ${r.loom} again. If Loom ${r.loom} shows B/End / B/Cut in the Looms table, set it back to Running.`,
        })
      },
    })
  }
  const showActions = editing && canEdit && Boolean(onRestore)
  /** Utra date can be changed / record removed: an ended run that went off every loom. */
  const editable = (r: EndedRow) => Boolean(r.firstId && r.closeOffLoom)

  const runEdit = async (body: Parameters<typeof editBeamStint>[0], done: string) => {
    try {
      await editBeamStint(body)
      setReload((n) => n + 1)
      showSuccessSoon({ title: 'Saved', message: done })
    } catch (err) {
      showError({ title: 'Not saved', message: err instanceof Error ? err.message : 'Could not save.' })
    }
  }

  const changeEnd = (r: EndedRow, to: string) => {
    if (!r.firstId || !to || to === r.to) return
    showConfirm({
      title: `Beam ${r.beamNo} — change the Removed date?`,
      message: `The date it came off Loom ${r.loom} changes from ${longDateFromYmd(r.to)} to ${longDateFromYmd(to)}. This beam's Days, Woven and Wastage are worked out again. Daily Entry production does not change.`,
      type: 'confirm',
      confirmText: 'Yes, change',
      cancelText: 'Cancel',
      onConfirm: () =>
        runEdit(
          { action: 'setEnd', beamNo: r.beamNo, firstId: r.firstId!, to, oldTo: r.to },
          `Beam ${r.beamNo} Removed date set to ${longDateFromYmd(to)}.`
        ),
    })
  }

  const removeRecord = (r: EndedRow) => {
    if (!r.firstId) return
    showConfirm({
      title: `Remove this record of beam ${r.beamNo}?`,
      message: `Loom ${r.loom} · Mounted ${longDateFromYmd(r.from)} · Removed ${longDateFromYmd(r.to)}. Only remove it if it was created twice by mistake (the beam came off once). It leaves the Ended list and the beam figures; Daily Entry production does not change.`,
      type: 'confirm',
      confirmText: 'Yes, remove',
      cancelText: 'Cancel',
      onConfirm: () =>
        runEdit({ action: 'remove', beamNo: r.beamNo, firstId: r.firstId!, oldTo: r.to }, `Record of beam ${r.beamNo} removed.`),
    })
  }

  const totals = useMemo(() => {
    let length = 0
    let made = 0
    let wasted = 0
    for (const r of rows) {
      made += r.made
      if (r.length > 0) {
        length += r.length
        wasted += r.length - r.made
      }
    }
    return { length, made, wasted }
  }, [rows])

  return (
    <div className="card">
      <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h3 className="card-title mb-0">Ended beams — {range.label}</h3>
        {rows.length > 0 && (
          <div className="d-flex flex-wrap gap-2 small">
            <span className="badge text-bg-light border">{rows.length} beam{rows.length === 1 ? '' : 's'}</span>
            <span className="badge text-bg-light border">Length {formatNumber(totals.length, 0)} m</span>
            <span className="badge text-bg-success">Woven {formatNumber(totals.made, 0)} m</span>
            <span className={`badge ${totals.wasted > 0 ? 'text-bg-danger' : 'text-bg-light border'}`}>Wastage {formatNumber(totals.wasted, 0)} m</span>
          </div>
        )}
        {canEdit && onRestore && rows.length > 0 && (
          <button
            type="button"
            className={`btn btn-sm ${editing ? 'btn-success' : 'btn-outline-secondary'}`}
            onClick={() => setEditing((v) => !v)}
          >
            <i className={`bi ${editing ? 'bi-check-lg' : 'bi-pencil'} me-1`} />
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
      <TablePanScroll className="card-body p-0">
        {stints == null ? (
          <SectionLoader minHeight={160} />
        ) : error ? (
          <div className="p-3 small text-danger">{error}</div>
        ) : rows.length === 0 ? (
          <div className="p-3 small text-secondary">No beams came off a loom in {range.label}.</div>
        ) : (
          <table className="table table-sm table-bordered align-middle mb-0 text-center sara-quality-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Beam #</th>
                <th>Loom</th>
                <th>Sw / Wp #</th>
                <th>Warp</th>
                <th>Mounted</th>
                <th>Removed</th>
                <th>Days</th>
                <th>Quality</th>
                <th>Length (m)</th>
                <th>Woven (m)</th>
                <th>Wastage (m)</th>
                {showActions && <th className="d-print-none">Edit</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const rest = r.length > 0 ? r.length - r.made : null
                return (
                  <tr key={`${r.beamNo}-${r.loom}-${r.from}-${r.firstId || ''}`}>
                    <td>{i + 1}</td>
                    <td className="fw-semibold">
                      <Link href={`/floor/reports/beam?beam=${encodeURIComponent(r.beamNo)}`}>{r.beamNo}</Link>
                    </td>
                    <td>{r.loom}</td>
                    <td>{r.swLot ? formatSwLotForDailyEntry(r.swLot) : '—'}</td>
                    <td className="text-start">{r.warp || '—'}</td>
                    <td>{longDateFromYmd(r.from)}</td>
                    <td>
                      {showActions && editable(r) ? (
                        <input
                          type="date"
                          className="form-control form-control-sm d-print-none"
                          style={{ width: 'auto', minWidth: 140 }}
                          key={r.to}
                          defaultValue={r.to}
                          min={r.from}
                          max={today}
                          onBlur={(e) => {
                            const v = e.currentTarget.value
                            if (v && v !== r.to) changeEnd(r, v)
                            else e.currentTarget.value = r.to
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                          }}
                          aria-label={`Beam ${r.beamNo} end date`}
                          title="Change the Removed date"
                        />
                      ) : (
                        longDateFromYmd(r.to)
                      )}
                    </td>
                    <td>{r.days || '—'}</td>
                    <td className="text-start">{r.qualities.length ? r.qualities.join(', ') : '—'}</td>
                    <td>{r.length > 0 ? formatNumber(r.length, 0) : '—'}</td>
                    <td className="fw-semibold">{formatNumber(r.made, 0)}</td>
                    <td>
                      {rest == null ? (
                        '—'
                      ) : (
                        <span className={rest > 0 ? 'text-danger fw-semibold' : 'text-success fw-semibold'}>
                          {rest > 0 ? formatNumber(rest, 0) : `${formatNumber(-rest, 0)} extra made`}
                        </span>
                      )}
                    </td>
                    {showActions && (
                      <td className="d-print-none">
                        <div className="d-flex flex-wrap gap-1 justify-content-center">
                          {restorable.has(r) && (
                            <button type="button" className="btn btn-sm btn-outline-primary py-0 text-nowrap" onClick={() => restore(r)}>
                              <i className="bi bi-arrow-counterclockwise me-1" />
                              Back on loom
                            </button>
                          )}
                          {r.firstId && (
                            <button type="button" className="btn btn-sm btn-outline-danger py-0 text-nowrap" onClick={() => removeRecord(r)}>
                              <i className="bi bi-trash me-1" />
                              Remove
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary py-0 text-nowrap"
                            onClick={() => setHistoryBeam(r.beamNo)}
                            title="All runs of this beam — correct the Mounted / Removed dates"
                          >
                            <i className="bi bi-clock-history me-1" />
                            History
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </TablePanScroll>
      {historyBeam && (
        <BeamHistoryDialog
          beamNo={historyBeam}
          canEdit={canEdit}
          onClose={() => setHistoryBeam(null)}
          onChanged={() => setReload((n) => n + 1)}
        />
      )}
      <div className="card-footer small text-secondary">
        From the beam history: each line is one time a beam came off a loom. The record stays the same even after the beam is refilled and mounted again.
        Woven = that loom’s Daily Entry on the days with this beam’s Sw/Wp lot. Wastage = length − woven. Change the month with the date above.
        In Edit: change the Removed date, &quot;Remove&quot; a record created twice by mistake, or put a beam ended by mistake &quot;Back on loom&quot;.
      </div>
    </div>
  )
}
