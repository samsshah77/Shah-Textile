'use client'

import { useSyncExternalStore } from 'react'
import { getNavLoading, subscribeNavLoading } from '@/lib/navLoading'

/** Round spinner (plain CSS, works on every module's styles). */
export function Spinner({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return <span className={`sara-spinner sara-spinner--${size} ${className}`.trim()} role="status" aria-label="Loading" />
}

/**
 * A part of the page (a table, a card, a tab's content) still loading: spinner and text in
 * the middle of the space the content will take — not a bare line of text in a corner.
 */
export function SectionLoader({
  label = 'Loading…',
  minHeight = 220,
  compact = false,
}: {
  label?: string
  minHeight?: number
  compact?: boolean
}) {
  return (
    <div
      className={`sara-section-loader${compact ? ' sara-section-loader--compact' : ''}`}
      style={compact ? undefined : { minHeight }}
      aria-busy="true"
    >
      <Spinner size={compact ? 'sm' : 'md'} />
      <span>{label}</span>
    </div>
  )
}

/** Small "still updating" chip next to a heading, while data that is already shown reloads. */
export function LoadingChip({ label = 'Loading…' }: { label?: string }) {
  return (
    <span className="sara-loading-chip" aria-busy="true">
      <Spinner size="sm" />
      {label}
    </span>
  )
}

/**
 * In the page area (between header and footer), while the address changes:
 * - another page opening → the page area dims and a big spinner card "Opening page…";
 * - same page, other tab / filter → a small "Loading tab…" pill at the top, page stays usable to read.
 * The thin blue bar at the very top shows for both.
 */
export function RouteLoader() {
  const kind = useSyncExternalStore(subscribeNavLoading, getNavLoading, () => null)
  if (!kind) return null
  if (kind === 'tab') {
    return (
      <div className="sara-route-loader sara-route-loader--tab" aria-live="polite">
        <div className="sara-route-loader__pill">
          <Spinner size="sm" />
          Loading tab…
        </div>
      </div>
    )
  }
  return (
    <div className="sara-route-loader sara-route-loader--page" aria-live="polite">
      <div className="sara-route-loader__card">
        <Spinner size="lg" />
        <div className="sara-route-loader__title">Opening page…</div>
      </div>
    </div>
  )
}
