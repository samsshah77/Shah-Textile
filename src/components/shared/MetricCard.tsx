'use client'

import Link from 'next/link'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  value: string | number
  subValue?: string
  badge?: string
  icon?: LucideIcon
  /** Bootstrap icon class e.g. bi-graph-up */
  biIcon?: string
  href?: string
  footerLabel?: string
  colorVariant?:
    | 'primary'
    | 'success'
    | 'warning'
    | 'danger'
    | 'info'
    | 'secondary'
    | 'blue'
    | 'emerald'
    | 'amber'
    | 'purple'
    | 'rose'
  trend?: {
    value: string
    isPositive: boolean
    label?: string
  }
  progress?: {
    value: number
    max: number
    label?: string
  }
}

const VARIANT_CLASS: Record<string, string> = {
  primary: 'text-bg-primary',
  success: 'text-bg-success',
  warning: 'text-bg-warning',
  danger: 'text-bg-danger',
  info: 'text-bg-info',
  secondary: 'text-bg-secondary',
  blue: 'text-bg-primary',
  emerald: 'text-bg-success',
  amber: 'text-bg-warning',
  purple: 'text-bg-info',
  rose: 'text-bg-danger',
}

/** AdminLTE small-box KPI card. */
export function MetricCard({
  title,
  value,
  subValue,
  badge,
  icon: Icon,
  biIcon = 'bi-bar-chart-fill',
  href,
  footerLabel = 'More info',
  colorVariant = 'primary',
}: MetricCardProps) {
  const body = (
    <>
      <div className="inner">
        <h3>{value}</h3>
        <p className="mb-0">{title}</p>
        {subValue && <p className="small opacity-75 mb-0">{subValue}</p>}
        {badge && <span className="badge text-bg-light text-dark mt-1">{badge}</span>}
      </div>
      {Icon ? (
        <Icon className="small-box-icon" aria-hidden style={{ pointerEvents: 'none' }} />
      ) : (
        <i
          className={cn('small-box-icon bi', biIcon)}
          aria-hidden
          style={{ pointerEvents: 'none' }}
        />
      )}
      <span className="small-box-footer">
        {footerLabel} {href ? <i className="bi bi-link-45deg" aria-hidden /> : null}
      </span>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          'small-box text-decoration-none d-block link-light',
          VARIANT_CLASS[colorVariant] || 'text-bg-primary'
        )}
      >
        {body}
      </Link>
    )
  }

  return (
    <div className={cn('small-box', VARIANT_CLASS[colorVariant] || 'text-bg-primary')}>{body}</div>
  )
}
