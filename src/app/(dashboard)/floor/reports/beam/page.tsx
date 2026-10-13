'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { MetricCard } from '@/components/shared/MetricCard'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { SimpleBarChart, SimpleLineChart } from '@/components/shared/MiniCharts'
import { TablePanScroll } from '@/components/shared/TablePanScroll'
import {
  hydrateFloorFromDb,
  preloadAllFloorSheets,
  productionMastersService,
  refreshFloorMastersFromDb,
  type BeamTrackResult,
} from '@/services/productionMastersService'
import { formatNumber } from '@/lib/utils'

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

function BeamTrackContent() {
  const searchParams = useSearchParams()
  const beamNo = (searchParams.get('beam') || '').trim()

  const [loading, setLoading] = useState(true)
  const [track, setTrack] = useState<BeamTrackResult | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setTrack(null)
      try {
        await hydrateFloorFromDb()
        await refreshFloorMastersFromDb()
        await preloadAllFloorSheets()
        if (cancelled || !beamNo) return
        setTrack(productionMastersService.buildBeamTrack(beamNo))
      } catch (err) {
        console.error('[beam track] load failed', err)
        if (!cancelled) setTrack(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [beamNo])

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
          <Link href="/floor/production?tab=beams">Beams tab pe jao</Link> aur Track dabao.
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
          {loading && <span className="ms-2 badge text-bg-light border">Loading…</span>}
        </div>
        <Link href="/floor/production?tab=beams" className="btn btn-sm btn-outline-secondary">
          ← Back to Beams
        </Link>
      </div>

      {loading ? (
        <div className="card">
          <div className="card-body text-center py-5">
            <div className="spinner-border text-primary" role="status" aria-label="Loading" />
            <div className="mt-3 text-secondary">Beam length data load ho raha hai…</div>
          </div>
        </div>
      ) : !track ? (
        <div className="alert alert-warning">
          Beam &quot;{beamNo}&quot; nahi mili.{' '}
          <Link href="/floor/production?tab=beams">Beams list</Link> check karo.
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
                  {daySeries.length === 0 ? (
                    <div className="text-secondary small py-4 text-center">
                      Consumed 0 = Daily Entry pe is beam ka lot/Sw# match nahi, ya meters nahi.
                      <br />
                      Beam pe <strong>Sw #</strong> set karo (ya Beam #), phir Daily Entry SW # column
                      wahi hona chahiye — tab meters yahan Consumed mein aayenge.
                      {track.swLot ? (
                        <>
                          <br />
                          Abhi beam Sw#: <strong>{track.swLot}</strong>
                        </>
                      ) : (
                        <>
                          <br />
                          Abhi beam pe Sw# empty — Track sirf Beam #<strong>{track.beamNo}</strong> se
                          match karega.
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
                    <dt className="col-5 text-secondary">Warp</dt>
                    <dd className="col-7">{track.warp || '—'}</dd>
                    <dt className="col-5 text-secondary">Ends</dt>
                    <dd className="col-7">{track.totalThreads.toLocaleString() || '—'}</dd>
                    <dt className="col-5 text-secondary">Machine</dt>
                    <dd className="col-7">{track.loomType || '—'}</dd>
                    <dt className="col-5 text-secondary">Loom</dt>
                    <dd className="col-7">{track.loomHint ? `#${track.loomHint}` : '—'}</dd>
                    <dt className="col-5 text-secondary">From</dt>
                    <dd className="col-7">{formatShortDate(track.from) || '—'}</dd>
                    <dt className="col-5 text-secondary">To</dt>
                    <dd className="col-7">{formatShortDate(track.to) || '—'}</dd>
                  </dl>
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
        <div className="container-fluid py-5 text-center">
          <div className="spinner-border text-primary" role="status" />
        </div>
      }
    >
      <BeamTrackContent />
    </Suspense>
  )
}
