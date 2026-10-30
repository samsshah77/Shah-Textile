'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { TablePanScroll } from '@/components/shared/TablePanScroll'
import { formatNumber } from '@/lib/utils'
import { getProductionToday } from '@/constants/productionCalendar'
import { qualityRunOwnsSheetEntry, type QualityMaster } from '@/services/productionMastersService'
import { listPersistedSheetEntries } from '@/services/production/floorStore'
import { beamTrackLotKeys, formatSwLotForDailyEntry, normalizeBeamLotKey } from '@/services/beamTrack'
import type { DailyLoomProductionEntry } from '@/types/production'

/** One time a beam sat on one loom (from /api/floor/beam-history?stints=1). */
type Stint = {
  beamNo: string
  loom: number
  from: string
  to: string | null
  length: number
  swLot: string | null
  warp: string
  qualityId: string | null
}

type BeamRow = Stint & {
  /** Meters this quality run made from the beam. */
  qualityMeters: number
  /** All meters made from the beam while it sat on the loom (any quality). */
  beamMeters: number
}

const meters = (e: DailyLoomProductionEntry) =>
  e.totalMeters != null ? Number(e.totalMeters) || 0 : (Number(e.shiftAMeters) || 0) + (Number(e.shiftBMeters) || 0)

function shortDate(d: string | null) {
  if (!d) return ''
  const [y, m, dd] = d.split('-').map(Number)
  if (!y || !m || !dd) return d
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/**
 * Quality tracking: every beam that ran on this quality's looms during the run, read from
 * the beam history (so beams that were later re-filled and re-used still show), with the
 * beam length, what this quality made from it, what the beam made in all, and what was
 * left over: wasted once the beam came off, still on the beam while it is running.
 * Read-only — nothing is saved.
 */
export function QualityBeamsCard({
  quality,
  catalog,
  runFrom,
  runTo,
}: {
  quality: QualityMaster
  catalog: QualityMaster[]
  runFrom: string
  runTo: string | null
}) {
  const [stints, setStints] = useState<Stint[] | null>(null)
  const [error, setError] = useState('')
  const today = getProductionToday()
  const to = runTo || today

  useEffect(() => {
    let live = true
    fetch(`/api/floor/beam-history?stints=1&from=${runFrom}&to=${to}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!live) return
        if (!r.ok) {
          setError(d?.error || 'Beams load nahi ho sake.')
          setStints([])
          return
        }
        setError('')
        setStints(Array.isArray(d.stints) ? d.stints : [])
      })
      .catch(() => {
        if (live) {
          setError('Beams load nahi ho sake.')
          setStints([])
        }
      })
    return () => {
      live = false
    }
  }, [runFrom, to])

  const rows = useMemo<BeamRow[]>(() => {
    if (!stints) return []
    const entries = listPersistedSheetEntries()
    const out: BeamRow[] = []
    for (const s of stints) {
      const end = s.to || today
      const keys = new Set(beamTrackLotKeys({ beamNo: s.beamNo, swLot: s.swLot }))
      let beamMeters = 0
      let qualityMeters = 0
      for (const e of entries) {
        if (Number(e.loomNumber) !== s.loom) continue
        const d = String(e.date || '').slice(0, 10)
        if (!d || d < s.from || d > end) continue
        // Two beams on one loom: a row's lot (Sw#) says which beam it came from.
        const lot = normalizeBeamLotKey(e.lot || '')
        if (keys.size && lot && !keys.has(lot)) continue
        const m = meters(e)
        if (m <= 0) continue
        beamMeters += m
        if (qualityRunOwnsSheetEntry(quality, { ...e, date: d }, catalog, d)) qualityMeters += m
      }
      if (qualityMeters > 0 || s.qualityId === quality.id) out.push({ ...s, qualityMeters, beamMeters })
    }
    return out.sort((a, b) => a.from.localeCompare(b.from) || a.loom - b.loom || a.beamNo.localeCompare(b.beamNo))
  }, [stints, quality, catalog, today])

  const totals = useMemo(() => {
    let length = 0
    let made = 0
    let wasted = 0
    let left = 0
    for (const r of rows) {
      length += r.length
      made += r.qualityMeters
      if (r.length > 0 && r.to) wasted += r.length - r.beamMeters
      if (r.length > 0 && !r.to) left += r.length - r.beamMeters
    }
    return { length, made, wasted, left }
  }, [rows])

  return (
    <div className="card mb-3">
      <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h3 className="card-title mb-0">Beams — is quality mein</h3>
        {rows.length > 0 && (
          <div className="d-flex flex-wrap gap-2 small">
            <span className="badge text-bg-light border">{rows.length} beam{rows.length === 1 ? '' : 's'}</span>
            <span className="badge text-bg-light border">Lambai {formatNumber(totals.length, 0)} m</span>
            <span className="badge text-bg-success">Bana {formatNumber(totals.made, 0)} m</span>
            {totals.wasted !== 0 && <span className="badge text-bg-danger">Zaya {formatNumber(totals.wasted, 0)} m</span>}
            {totals.left !== 0 && <span className="badge text-bg-warning">Beam pe baqi {formatNumber(totals.left, 0)} m</span>}
          </div>
        )}
      </div>
      <TablePanScroll className="card-body p-0">
        {stints == null ? (
          <div className="p-3 small text-secondary">Beams load ho rahe hain…</div>
        ) : error ? (
          <div className="p-3 small text-danger">{error}</div>
        ) : rows.length === 0 ? (
          <div className="p-3 small text-secondary">Is quality ke run mein kisi beam ka record nahi mila.</div>
        ) : (
          <table className="table table-sm table-bordered align-middle mb-0 text-center" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Beam #</th>
                <th>Sw / Wp #</th>
                <th>Loom</th>
                <th>Laga</th>
                <th>Utra</th>
                <th>Lambai (m)</th>
                <th>Is quality mein bana (m)</th>
                <th>Beam pe kul bana (m)</th>
                <th>Zaya / Baqi (m)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rest = r.length > 0 ? r.length - r.beamMeters : null
                return (
                  <tr key={`${r.beamNo}-${r.loom}-${r.from}`}>
                    <td className="fw-semibold">
                      <Link href={`/floor/reports/beam?beam=${encodeURIComponent(r.beamNo)}`}>{r.beamNo}</Link>
                    </td>
                    <td>{r.swLot ? formatSwLotForDailyEntry(r.swLot) : '—'}</td>
                    <td>{r.loom}</td>
                    <td>{shortDate(r.from)}</td>
                    <td>{r.to ? shortDate(r.to) : <span className="badge text-bg-success">Laga hua</span>}</td>
                    <td>{r.length > 0 ? formatNumber(r.length, 0) : '—'}</td>
                    <td className="fw-semibold">{formatNumber(r.qualityMeters, 0)}</td>
                    <td>{formatNumber(r.beamMeters, 0)}</td>
                    <td>
                      {rest == null ? (
                        '—'
                      ) : r.to ? (
                        <span className={rest > 0 ? 'text-danger fw-semibold' : 'text-success fw-semibold'}>
                          {rest > 0 ? `${formatNumber(rest, 0)} zaya` : `${formatNumber(-rest, 0)} zyada bana`}
                        </span>
                      ) : (
                        <span className="text-secondary">{formatNumber(rest, 0)} baqi</span>
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
        Lambai beam register se. Zaya = lambai − beam pe kul bana (beam utarne ke baad). Laga hua beam pe baqi abhi chal raha hai.
      </div>
    </div>
  )
}
