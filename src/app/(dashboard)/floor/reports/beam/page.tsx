'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { MetricCard } from '@/components/shared/MetricCard'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { SimpleBarChart, SimpleLineChart } from '@/components/shared/MiniCharts'
import { TablePanScroll } from '@/components/shared/TablePanScroll'
import { ProductionReportSkeleton } from '@/components/floor/ProductionSkeleton'
import {
  hydrateFloorFromDb,
  preloadAllFloorSheets,
  productionMastersService,
  refreshFloorMastersFromDb,
  type BeamTrackResult,
} from '@/services/productionMastersService'
import { formatNumber } from '@/lib/utils'
import { entryMeters, fetchBeamRuns, rowsFromBeams, type BeamStint } from '@/lib/floor/beamStints'
import { listPersistedSheetEntries } from '@/services/production/floorStore'
import { getProductionToday } from '@/constants/productionCalendar'
import { formatSwLotForDailyEntry } from '@/services/beamTrack'
import type { DailyLoomProductionEntry } from '@/types/production'
import { LoadingChip } from '@/components/shared/Loaders'

function formatShortDate(dateStr?: string | null) {
  if (!dateStr) return ''
  try {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

/**
 * One run from the beam history (loom, Laga → Utra), as a Track: the Daily Entry rows of that
 * loom in those days whose Sw # is this run's (or empty) — same rows the Ended tab counts.
 */
function trackFromRun(
  run: BeamStint,
  base: BeamTrackResult | null,
  entries: DailyLoomProductionEntry[],
  today: string
): BeamTrackResult {
  const rows = rowsFromBeams(entries, [run], today)
  const byDate = new Map<string, number>()
  for (const e of rows) {
    const m = Math.max(0, entryMeters(e))
    if (m <= 0) continue
    const d = String(e.date).slice(0, 10)
    byDate.set(d, (byDate.get(d) || 0) + m)
  }
  const days = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, meters]) => ({ date, meters, loomNumbers: [run.loom] }))
  const consumed = days.reduce((sum, d) => sum + d.meters, 0)
  const length = Number(run.length) || base?.length || 0
  const qualities = [...new Set(rows.map((e) => String(e.qualityName || '').trim()).filter((n) => n && n !== '—' && n !== '-'))]
  return {
    beamNo: run.beamNo,
    swLot: run.swLot ? formatSwLotForDailyEntry(run.swLot) : null,
    warp: run.warp || base?.warp || '',
    qualityId: run.qualityId,
    qualityName: qualities.join(', ') || null,
    length,
    consumed,
    balance: length - consumed,
    from: run.from,
    to: run.to || today,
    loomHint: String(run.loom),
    days,
    // This run's own details (changed in Beams → Edit on a past date, or in History).
    totalThreads: Number(run.totalThreads) || base?.totalThreads || 0,
    loomType: run.loomType || base?.loomType || '',
    reed: Number(run.reed) || base?.reed || 0,
    width: Number(run.width) || base?.width || 0,
    beamRepeat: run.reed != null ? run.beamRepeat ?? null : base?.beamRepeat ?? null,
  }
}

const runLabel = (r: BeamStint) =>
  `Loom ${r.loom} · ${formatShortDate(r.from)} → ${r.to ? formatShortDate(r.to) : 'now'}${r.swLot ? ` · ${formatSwLotForDailyEntry(r.swLot)}` : ''}`

function BeamTrackContent() {
  const searchParams = useSearchParams()
  const beamNo = (searchParams.get('beam') || '').trim()

  const [loading, setLoading] = useState(true)
  const [liveTrack, setLiveTrack] = useState<BeamTrackResult | null>(null)
  // Runs of this beam from the beam history (Beam History dialog); '' = the beam as it is now.
  const [runs, setRuns] = useState<BeamStint[]>([])
  const [runId, setRunId] = useState('')
  const [entries, setEntries] = useState<DailyLoomProductionEntry[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLiveTrack(null)
      setRuns([])
      setRunId('')
      try {
        await hydrateFloorFromDb()
        await refreshFloorMastersFromDb()
        await preloadAllFloorSheets()
        if (cancelled || !beamNo) return
        const live = productionMastersService.buildBeamTrack(beamNo)
        const list = await fetchBeamRuns(beamNo).catch(() => [] as BeamStint[])
        if (cancelled) return
        setLiveTrack(live)
        setEntries(listPersistedSheetEntries())
        setRuns(list)
        // Beam off the loom now (its last run ended), or nothing for it as it is now: open its
        // latest run (that loom, those days). On a loom now: the current run as before.
        const latest = list[list.length - 1]
        if (latest?.firstId && (latest.to != null || !live || live.days.length === 0)) setRunId(latest.firstId)
      } catch (err) {
        console.error('[beam track] load failed', err)
        if (!cancelled) setLiveTrack(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [beamNo])

  const selectedRun = runId ? runs.find((r) => r.firstId === runId) || null : null
  const track = useMemo(
    () => (selectedRun ? trackFromRun(selectedRun, liveTrack, entries, getProductionToday()) : liveTrack),
    [selectedRun, liveTrack, entries]
  )

  const daySeries = useMemo(
    () =>
      (track?.days || []).map((d) => ({
        label: String(Number(d.date.slice(8, 10)) || d.date.slice(5)),
        value: d.meters,
      })),
    [track]
  )

  const avgPerDay =
    track && track.days.length > 0 ? track.consumed / track.days.length : 0

  if (!beamNo) {
    return (
      <div className="container-fluid py-3">
        <PageHeader title="Beam Length Track" showBreadcrumbs={false} />
        <div className="alert alert-warning">
          Beam number missing.{' '}
          Go to the <Link href="/floor/production?tab=beams">Beams tab</Link> and press Track.
        </div>
      </div>
    )
  }

  return (
    <div className="container-fluid py-3">
      <PageHeader
        title="Beam Length Track"
        subtitle={
          track
            ? `Beam #${track.beamNo}${track.qualityName ? ` · ${track.qualityName}` : ''}${track.warp ? ` · ${track.warp}` : ''}`
            : `Beam #${beamNo}`
        }
        showBreadcrumbs={false}
        actions={<ExportPdfButton filename={`Beam-${beamNo}-Length-Track`} />}
      />

      <div className="alert alert-info d-flex flex-wrap align-items-center justify-content-between gap-2 py-2 mb-3">
        <div>
          <strong>Beam run:</strong> #{beamNo}
          {!loading && track?.swLot && (
            <span className="ms-2 badge text-bg-info-subtle text-info-emphasis border">
              {track.swLot}
            </span>
          )}
          {!loading && track?.qualityName && (
            <span className="ms-2 badge text-bg-primary-subtle text-primary-emphasis border">
              {track.qualityName}
            </span>
          )}
          {!loading && track?.from && (
            <span className="ms-2 text-secondary">
              ({formatShortDate(track.from)}
              {track.to ? ` → ${formatShortDate(track.to)}` : ''})
            </span>
          )}
          {!loading && track?.loomHint && (
            <span className="ms-2 badge text-bg-light border">Loom {track.loomHint}</span>
          )}
          {loading && <LoadingChip />}
          {!loading && runs.length > 0 && (
            <div className="mt-2 d-flex flex-wrap align-items-center gap-2 d-print-none">
              <label htmlFor="beam-run" className="small fw-semibold mb-0">
                Show run:
              </label>
              <select
                id="beam-run"
                className="form-select form-select-sm"
                style={{ width: 'auto', maxWidth: '100%' }}
                value={runId}
                onChange={(e) => setRunId(e.target.value)}
              >
                <option value="">Beam now (current)</option>
                {[...runs].reverse().map((r) => (
                  <option key={r.firstId} value={r.firstId}>
                    {runLabel(r)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <Link href="/floor/production?tab=beams" className="btn btn-sm btn-outline-secondary">
          ← Back to Beams
        </Link>
      </div>

      {loading ? (
        <ProductionReportSkeleton />
      ) : !track ? (
        <div className="alert alert-warning">
          Beam &quot;{beamNo}&quot; not found.{' '}
          Check the <Link href="/floor/production?tab=beams">Beams list</Link>.
        </div>
      ) : (
        <>
          <div className="row g-3 mb-3 align-items-stretch">
            <div className="col-6 col-lg-4">
              <MetricCard
                title="Beam Length"
                value={`${formatNumber(track.length, 0)} m`}
                biIcon="bi-rulers"
                colorVariant="primary"
              />
            </div>
            <div className="col-6 col-lg-4">
              <MetricCard
                title="Balance Length"
                value={`${formatNumber(track.balance, 0)} m`}
                biIcon="bi-pie-chart"
                colorVariant={track.balance < 0 ? 'danger' : 'success'}
              />
            </div>
            <div className="col-6 col-lg-4">
              <MetricCard
                title="Avg / producing day"
                value={`${formatNumber(avgPerDay, 0)} m`}
                biIcon="bi-calendar3"
                colorVariant="warning"
              />
            </div>
          </div>

          <div className="row g-3 mb-3">
            <div className="col-lg-8">
              <div className="card h-100">
                <div className="card-header">
                  <h3 className="card-title mb-0">Daily meters — Beam #{track.beamNo}</h3>
                </div>
                <div className="card-body">
                  {daySeries.length === 0 && selectedRun ? (
                    <div className="text-secondary small py-4 text-center">
                      No Sw # / meters for this beam in Loom {selectedRun.loom}’s Daily Entry during this run.
                      <br />
                      Go to Beams → History and press <strong>Daily Entry Sw #</strong> next to this run.
                    </div>
                  ) : daySeries.length === 0 ? (
                    <div className="text-secondary small py-4 text-center">
                      Consumed 0 = no Daily Entry rows match this beam’s lot / Sw#, or there are no meters.
                      <br />
                      Set the <strong>Sw #</strong> (or Beam #) on the beam, and use the same value in the Daily Entry SW # column —
                      then the meters show here under Consumed.
                      {track.swLot ? (
                        <>
                          <br />
                          Current beam Sw#: <strong>{track.swLot}</strong>
                        </>
                      ) : (
                        <>
                          <br />
                          The beam has no Sw# yet — Track matches by Beam #<strong>{track.beamNo}</strong>
                          only.
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      <SimpleBarChart data={daySeries} height={180} />
                      <div className="mt-3">
                        <SimpleLineChart data={daySeries} height={120} stroke="#0d6efd" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="col-lg-4">
              <div className="card h-100">
                <div className="card-header">
                  <h3 className="card-title mb-0">Beam details</h3>
                </div>
                <div className="card-body small">
                  <dl className="row mb-0">
                    <dt className="col-5 text-secondary">Beam #</dt>
                    <dd className="col-7 fw-semibold">{track.beamNo}</dd>
                    <dt className="col-5 text-secondary">Sw / Wp #</dt>
                    <dd className="col-7">{track.swLot || '—'}</dd>
                    <dt className="col-5 text-secondary">Warp</dt>
                    <dd className="col-7">{track.warp || '—'}</dd>
                    <dt className="col-5 text-secondary">Reed</dt>
                    <dd className="col-7">{track.reed || '—'}</dd>
                    <dt className="col-5 text-secondary">Width</dt>
                    <dd className="col-7">{track.width || '—'}</dd>
                    <dt className="col-5 text-secondary">Ends</dt>
                    <dd className="col-7">{track.totalThreads ? track.totalThreads.toLocaleString() : '—'}</dd>
                    <dt className="col-5 text-secondary">Length</dt>
                    <dd className="col-7">{track.length ? `${track.length.toLocaleString()} m` : '—'}</dd>
                    {track.beamRepeat ? (
                      <>
                        <dt className="col-5 text-secondary">Beam Repeat</dt>
                        <dd className="col-7">{track.beamRepeat}</dd>
                      </>
                    ) : null}
                    <dt className="col-5 text-secondary">Machine</dt>
                    <dd className="col-7">{track.loomType || '—'}</dd>
                    <dt className="col-5 text-secondary">Loom</dt>
                    <dd className="col-7">{track.loomHint ? `#${track.loomHint}` : '—'}</dd>
                    <dt className="col-5 text-secondary">From</dt>
                    <dd className="col-7">{formatShortDate(track.from) || '—'}</dd>
                    <dt className="col-5 text-secondary">To</dt>
                    <dd className="col-7">{formatShortDate(track.to) || '—'}</dd>
                  </dl>
                  {selectedRun?.to != null && (
                    <div className="text-secondary mt-2" style={{ fontSize: '0.75rem' }}>
                      These are this old run’s own details. To correct them (Ends, Sw #, Warp, Length), open Beams → this beam’s{' '}
                      <strong>History</strong>.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
              <h3 className="card-title mb-0">Day × meters (this beam run)</h3>
              <Link href="/floor/production?tab=entry" className="btn btn-sm btn-outline-primary">
                Open Daily Entry
              </Link>
            </div>
            <TablePanScroll className="card-body p-0">
              <table className="table table-sm table-bordered mb-0 align-middle text-nowrap">
                <thead className="table-light">
                  <tr>
                    <th className="px-2">Date</th>
                    <th className="px-2">Loom(s)</th>
                    <th className="px-2 text-end">Meters</th>
                  </tr>
                </thead>
                <tbody>
                  {track.days.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center text-secondary py-4">
                        No producing days yet for this beam lot.
                      </td>
                    </tr>
                  ) : (
                    track.days.map((d) => (
                      <tr key={d.date}>
                        <td className="px-2 font-monospace small">{formatShortDate(d.date)}</td>
                        <td className="px-2 small">
                          {d.loomNumbers.map((n) => `L#${n}`).join(', ') || '—'}
                        </td>
                        <td className="px-2 text-end fw-semibold">
                          {formatNumber(d.meters, 0)} m
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {track.days.length > 0 && (
                  <tfoot className="table-light">
                    <tr>
                      <td className="px-2 fw-semibold" colSpan={2}>
                        Consumed
                      </td>
                      <td className="px-2 text-end fw-semibold">
                        {formatNumber(track.consumed, 0)} m
                      </td>
                    </tr>
                    <tr>
                      <td className="px-2" colSpan={2}>
                        Balance
                      </td>
                      <td
                        className={`px-2 text-end fw-semibold ${
                          track.balance < 0 ? 'text-danger' : 'text-success'
                        }`}
                      >
                        {formatNumber(track.balance, 0)} m
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </TablePanScroll>
          </div>
        </>
      )}
    </div>
  )
}

export default function BeamLengthTrackPage() {
  return (
    <Suspense
      fallback={
        <div className="container-fluid py-3">
          <ProductionReportSkeleton />
        </div>
      }
    >
      <BeamTrackContent />
    </Suspense>
  )
}
