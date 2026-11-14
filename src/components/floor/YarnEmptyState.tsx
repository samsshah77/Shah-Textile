'use client'

import type { ReactNode } from 'react'

export function YarnEmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: string
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="text-center py-5 px-3">
      <div
        className="d-inline-flex align-items-center justify-content-center rounded-circle bg-light border text-secondary mb-3"
        style={{ width: 56, height: 56 }}
      >
        <i className={`bi ${icon} fs-4`} />
      </div>
      <div className="fw-semibold text-dark">{title}</div>
      {subtitle && <div className="small text-secondary mt-1">{subtitle}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

