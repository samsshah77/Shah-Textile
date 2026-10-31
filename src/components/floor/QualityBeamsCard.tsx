'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { TablePanScroll } from '@/components/shared/TablePanScroll'
import { formatNumber } from '@/lib/utils'
import { getProductionToday } from '@/constants/productionCalendar'
import { qualityRunOwnsSheetEntry, type QualityMaster } from '@/services/productionMastersService'
import { listPersistedSheetEntries } from '@/services/production/floorStore'
import { formatSwLotForDailyEntry, normalizeBeamLotKey } from '@/services/beamTrack'
import type { DailyLoomProductionEntry } from '@/types/production'
import { beamMadeMeters, entryMeters as meters, fetchBeamStints, stintLotKeys, type BeamStint as Stint } from '@/lib/floor/beamStints'

/**
 * One line of the card: a Sw/Wp lot on one loom as the Daily Entry recorded it for this
 * quality, plus the beam(s) the beam history knows for that loom + lot at that time.
 */
type BeamRow = {
  key: string
  loom: number
  /** Lot as written on the Daily Entry rows ('' = not written). */
  lot: string
  from: string
  to: string
  /** Days with meters for this quality. */
  days: number
  /** Meters this quality run made on this loom + lot. */
  qualityMeters: number
  /** Beams from the beam history (empty = no beam record for this loom + lot). */
  beams: Stint[]
  /** Beam length (sum when the lot ran on more than one beam); 0 = unknown. */
  length: number
  /** All meters made from those beams while they sat on the loom (any quality). */
  beamMeters: number
  /** Every matched beam came off the loom. */
  ended: boolean
}

function shortDate(d: string | null) {
  if (!d) return ''
  const [y, m, dd] = d.split('-').map(Number)
  if (!y || !m || !dd) return d
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/**
 * Quality tracking — what ran on which beam. The Daily Entry is the record: this quality's
 * production grouped by loom + Sw/Wp lot (so it works for beams that were later re-filled,
 * and for days before the beam table / history existed). Where the beam history knows that
 * loom + lot at that time it adds the Beam #, its length, what the beam made in all, and
 * what was left over: wasted once it came off, still on the beam while it is running.
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
    fetchBeamStints(runFrom, to)
      .then((list) => {
        if (!live) return
        setError('')
        setStints(list)
      })
      .catch((err) => {
        if (live) {
          setError(err instanceof Error ? err.message : 'Beams load nahi ho sake.')
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
    const dayOf = (e: DailyLoomProductionEntry) => String(e.date || '').slice(0, 10)
    const stintKeys = new Map(stints.map((s) => [s, stintLotKeys(s)]))

    // 1) The Daily Entry is the record: this quality's rows grouped by loom + Sw/Wp lot.
    const groups = new Map<string, { loom: number; lot: string; lotKey: string; from: string; to: string; days: Set<string>; meters: number }>()
    for (const e of entries) {
      const d = dayOf(e)
      if (!d) continue
      const m = meters(e)
      if (m <= 0) continue
      if (!qualityRunOwnsSheetEntry(quality, { ...e, date: d }, catalog, d)) continue
      const loom = Number(e.loomNumber)
      const lot = (e.lot || '').trim()
      const lotKey = normalizeBeamLotKey(lot)
      const key = `${loom}|${lotKey}`
      const g = groups.get(key) || { loom, lot, lotKey, from: d, to: d, days: new Set<string>(), meters: 0 }
      if (d < g.from) g.from = d
      if (d > g.to) g.to = d
      g.days.add(d)
      g.meters += m
      if (!g.lot && lot) g.lot = lot
      groups.set(key, g)
    }

    const beamMade = (beams: Stint[]) => beamMadeMeters(entries, beams, today)

    // 2) The beam history adds Beam #, length and waste where it knows this loom + lot.
    const used = new Set<Stint>()
    const out: BeamRow[] = []
    for (const [key, g] of groups) {
      const beams = stints.filter((s) => {
        if (s.loom !== g.loom) return false
        if (s.from > g.to || (s.to != null && s.to < g.from)) return false
        const keys = stintKeys.get(s) || new Set<string>()
        return !g.lotKey || !keys.size || keys.has(g.lotKey)
      })
      beams.forEach((b) => used.add(b))
      out.push({
        key,
        loom: g.loom,
        lot: g.lot,
        from: g.from,
        to: g.to,
        days: g.days.size,
        qualityMeters: g.meters,
        beams,
        length: beams.reduce((sum, b) => sum + (b.length || 0), 0),
        beamMeters: beamMade(beams),
        ended: beams.length > 0 && beams.every((b) => b.to != null),
      })
    }
    // A beam linked to this quality that made nothing for it yet (e.g. just mounted).
    for (const s of stints) {
      if (used.has(s) || s.qualityId !== quality.id) continue
      out.push({
        key: `beam|${s.beamNo}|${s.from}`,
        loom: s.loom,
        lot: s.swLot || '',
        from: s.from,
        to: s.to || today,
        days: 0,
        qualityMeters: 0,
        beams: [s],
        length: s.length || 0,
        beamMeters: beamMade([s]),
        ended: s.to != null,
      })
    }
    return out.sort((a, b) => a.from.localeCompare(b.from) || a.loom - b.loom || a.lot.localeCompare(b.lot))
  }, [stints, quality, catalog, today])

  const totals = useMemo(() => {
    let length = 0
    let made = 0
    let wasted = 0
    let left = 0
    for (const r of rows) {
      length += r.length
      made += r.qualityMeters
      if (r.length > 0 && r.ended) wasted += r.length - r.beamMeters
      if (r.length > 0 && !r.ended) left += r.length - r.beamMeters
    }
    return { length, made, wasted, left }
  }, [rows])

  return (
    <div className="card mb-3">
      <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h3 className="card-title mb-0">Beams — is quality mein</h3>
        {rows.length > 0 && (
          <div className="d-flex flex-wrap gap-2 small">
            <span className="badge text-bg-light border">{rows.length} lot{rows.length === 1 ? '' : 's'}</span>
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
          <div className="p-3 small text-secondary">Is quality ki Daily Entry mein abhi koi production nahi.</div>
        ) : (
          <table className="table table-sm table-bordered align-middle mb-0 text-center" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Loom</th>
                <th>Sw / Wp #</th>
                <th>Kab se – kab tak</th>
                <th>Din</th>
                <th>Is quality mein bana (m)</th>
                <th>Beam #</th>
                <th>Beam lambai (m)</th>
                <th>Beam pe kul bana (m)</th>
                <th>Zaya / Baqi (m)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rest = r.length > 0 ? r.length - r.beamMeters : null
                return (
                  <tr key={r.key}>
                    <td className="fw-semibold">{r.loom}</td>
                    <td>{r.lot ? formatSwLotForDailyEntry(r.lot) : <span className="text-secondary fst-italic">Lot nahi likha</span>}</td>
                    <td>
                      {shortDate(r.from)}
                      {r.to !== r.from ? ` – ${shortDate(r.to)}` : ''}
                    </td>
                    <td>{r.days || '—'}</td>
                    <td className="fw-semibold">{formatNumber(r.qualityMeters, 0)}</td>
                    <td>
                      {r.beams.length === 0 ? (
                        <span className="text-secondary" title="Beam register / history mein is loom + lot ka record nahi">—</span>
                      ) : (
                        r.beams.map((b, i) => (
                          <span key={`${b.beamNo}-${b.from}`}>
                            {i > 0 ? ', ' : ''}
                            <Link href={`/floor/reports/beam?beam=${encodeURIComponent(b.beamNo)}`}>{b.beamNo}</Link>
                            {b.to == null && <span className="badge text-bg-success ms-1">Laga hua</span>}
                          </span>
                        ))
                      )}
                    </td>
                    <td>{r.length > 0 ? formatNumber(r.length, 0) : '—'}</td>
                    <td>{r.beams.length ? formatNumber(r.beamMeters, 0) : '—'}</td>
                    <td>
                      {rest == null ? (
                        '—'
                      ) : r.ended ? (
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
        Har line Daily Entry se: is quality ki production loom aur Sw/Wp lot ke hisaab se. Beam #, lambai aur zaya beam
        history se, jahan us loom + lot ka record mila. Zaya = lambai − beam pe kul bana (beam utarne ke baad).
      </div>
    </div>
  )
}
