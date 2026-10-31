'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { TablePanScroll } from '@/components/shared/TablePanScroll'
import { formatNumber } from '@/lib/utils'
import { getProductionToday } from '@/constants/productionCalendar'
import { preloadAllFloorSheets } from '@/services/productionMastersService'
import { listPersistedSheetEntries } from '@/services/production/floorStore'
import { formatSwLotForDailyEntry } from '@/services/beamTrack'
import { longDateFromYmd } from '@/lib/longDate'
import { beamMadeMeters, entryMeters, fetchBeamStints, rowsFromBeams, type BeamStint } from '@/lib/floor/beamStints'

type EndedRow = BeamStint & {
  to: string
  made: number
  days: number
  qualities: string[]
}

function monthRange(month: string): { from: string; to: string; label: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  const label = new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`, label }
}

/**
 * Beams tab → Ended: every time a beam came off a loom in the month, read from the beam
 * history. A beam that was later re-filled and mounted again keeps this record as it was
 * (its old Sw/Wp #, length, what it made and what was wasted), so past months stay right.
 * Read-only — nothing is saved.
 */
export function BeamEndedHistory({ month }: { month: string }) {
  const range = useMemo(() => monthRange(month), [month])
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
        if (live) setLoaded({ month, stints: [], error: err instanceof Error ? err.message : 'Beams load nahi ho sake.' })
      })
    return () => {
      live = false
    }
  }, [month, range.from, range.to])

  const stints = loaded && loaded.month === month ? loaded.stints : null
  const error = loaded && loaded.month === month ? loaded.error : ''

  const rows = useMemo<EndedRow[]>(() => {
    if (!stints) return []
    const entries = listPersistedSheetEntries()
    return stints
      .filter((s): s is BeamStint & { to: string } => s.to != null && s.to >= range.from && s.to <= range.to)
      .map((s) => {
        const made = rowsFromBeams(entries, [s], today)
        const days = new Set(made.filter((e) => entryMeters(e) > 0).map((e) => String(e.date).slice(0, 10)))
        const qualities = [...new Set(made.map((e) => (e.qualityName || '').trim()).filter((n) => n && n !== '—' && n !== '-'))]
        return { ...s, made: beamMadeMeters(entries, [s], today), days: days.size, qualities }
      })
      .sort((a, b) => a.to.localeCompare(b.to) || a.loom - b.loom || a.beamNo.localeCompare(b.beamNo))
  }, [stints, range.from, range.to, today])

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
            <span className="badge text-bg-light border">Lambai {formatNumber(totals.length, 0)} m</span>
            <span className="badge text-bg-success">Bana {formatNumber(totals.made, 0)} m</span>
            <span className={`badge ${totals.wasted > 0 ? 'text-bg-danger' : 'text-bg-light border'}`}>Zaya {formatNumber(totals.wasted, 0)} m</span>
          </div>
        )}
      </div>
      <TablePanScroll className="card-body p-0">
        {stints == null ? (
          <div className="p-3 small text-secondary">Load ho raha hai…</div>
        ) : error ? (
          <div className="p-3 small text-danger">{error}</div>
        ) : rows.length === 0 ? (
          <div className="p-3 small text-secondary">{range.label} mein koi beam loom se nahi utra.</div>
        ) : (
          <table className="table table-sm table-bordered align-middle mb-0 text-center sara-quality-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Beam #</th>
                <th>Loom</th>
                <th>Sw / Wp #</th>
                <th>Warp</th>
                <th>Laga</th>
                <th>Utra</th>
                <th>Din</th>
                <th>Quality</th>
                <th>Lambai (m)</th>
                <th>Bana (m)</th>
                <th>Zaya (m)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const rest = r.length > 0 ? r.length - r.made : null
                return (
                  <tr key={`${r.beamNo}-${r.loom}-${r.from}`}>
                    <td>{i + 1}</td>
                    <td className="fw-semibold">
                      <Link href={`/floor/reports/beam?beam=${encodeURIComponent(r.beamNo)}`}>{r.beamNo}</Link>
                    </td>
                    <td>{r.loom}</td>
                    <td>{r.swLot ? formatSwLotForDailyEntry(r.swLot) : '—'}</td>
                    <td className="text-start">{r.warp || '—'}</td>
                    <td>{longDateFromYmd(r.from)}</td>
                    <td>{longDateFromYmd(r.to)}</td>
                    <td>{r.days || '—'}</td>
                    <td className="text-start">{r.qualities.length ? r.qualities.join(', ') : '—'}</td>
                    <td>{r.length > 0 ? formatNumber(r.length, 0) : '—'}</td>
                    <td className="fw-semibold">{formatNumber(r.made, 0)}</td>
                    <td>
                      {rest == null ? (
                        '—'
                      ) : (
                        <span className={rest > 0 ? 'text-danger fw-semibold' : 'text-success fw-semibold'}>
                          {rest > 0 ? formatNumber(rest, 0) : `${formatNumber(-rest, 0)} zyada bana`}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </TablePanScroll>
      <div className="card-footer small text-secondary">
        Beam history se: har line ek dafa loom se utarna. Beam dobara bhar ke lage tab bhi ye record waisa hi rehta hai.
        Bana = us loom ki Daily Entry, us beam ke Sw/Wp lot ke din. Zaya = lambai − bana. Mahina upar date se badlein.
      </div>
    </div>
  )
}
