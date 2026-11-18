'use client'

import {
  formatTrackingPeriod,
  shiftTrackingDate,
  TRACKING_PERIODS,
  type TrackingPeriod,
} from '@/lib/floor/yarnSupply'

export function TrackingPeriodBar({
  period,
  onPeriodChange,
  anchorDate,
  onAnchorDateChange,
  maxDate,
}: {
  period: TrackingPeriod
  onPeriodChange: (p: TrackingPeriod) => void
  anchorDate: string
  onAnchorDateChange: (ymd: string) => void
  maxDate: string
}) {
  const canGoNext = (() => {
    if (period === 'all') return false
    const next = shiftTrackingDate(anchorDate, period, 1)
    if (period === 'monthly') return next.slice(0, 7) <= maxDate.slice(0, 7)
    return next <= maxDate
  })()

  return (
    <div className="d-flex flex-wrap align-items-center gap-2">
      <div className="btn-group btn-group-sm" role="group" aria-label="Tracking period">
        {TRACKING_PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`btn ${period === p.value ? 'btn-primary' : 'btn-outline-secondary bg-white'}`}
            onClick={() => onPeriodChange(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {period !== 'all' && (
        <div className="btn-group btn-group-sm" role="group" aria-label="Date navigation">
          <button
            type="button"
            className="btn btn-outline-secondary bg-white px-2"
            title="Previous"
            aria-label="Previous"
            onClick={() => onAnchorDateChange(shiftTrackingDate(anchorDate, period, -1))}
          >
            <i className="bi bi-chevron-left" />
          </button>
          <span className="btn btn-outline-secondary bg-white disabled text-dark opacity-100 fw-medium px-2">
            {formatTrackingPeriod(anchorDate, period)}
          </span>
          <button
            type="button"
            className="btn btn-outline-secondary bg-white px-2"
            title="Next"
            aria-label="Next"
            disabled={!canGoNext}
            onClick={() => onAnchorDateChange(shiftTrackingDate(anchorDate, period, 1))}
          >
            <i className="bi bi-chevron-right" />
          </button>
        </div>
      )}
    </div>
  )
}

