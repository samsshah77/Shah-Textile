'use client'

import type { ReactNode } from 'react'

type EmptyPlaceholderProps = {
  icon?: string
  title: string
  hint?: string
  /** Compact for table cell / list; full for card body */
  compact?: boolean
  className?: string
  action?: ReactNode
}

/** Professional empty state — icon + title + short hint. */
export function EmptyPlaceholder({
  icon = 'bi-inbox',
  title,
  hint,
  compact = false,
  className = '',
  action,
}: EmptyPlaceholderProps) {
  return (
    <div
      className={`sara-empty-placeholder d-flex flex-column align-items-center justify-content-center text-center ${
        compact ? 'py-4 px-3' : 'py-5 px-4'
      } ${className}`}
      role="status"
    >
      <div
        className="sara-empty-placeholder__icon d-flex align-items-center justify-content-center mb-3"
        aria-hidden
      >
        <i className={`bi ${icon}`} />
      </div>
      <div className="fw-semibold text-secondary mb-1" style={{ fontSize: compact ? '0.9rem' : '1rem' }}>
        {title}
      </div>
      {hint ? (
        <p className="text-muted small mb-0" style={{ maxWidth: 340, lineHeight: 1.45 }}>
          {hint}
        </p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
