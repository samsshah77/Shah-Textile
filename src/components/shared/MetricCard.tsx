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

/**
 * Card colour per variant — the site's own colours (buttons, sidebar, chart bars), so the
 * cards match the rest of the app. All dark enough for the white text.
 */
const VARIANT_COLOR: Record<string, string> = {
  primary: '#0d6efd', // site blue (buttons, links, chart bars)
  success: '#198754', // site green (Add / Today buttons, G6300 bars)
  warning: '#c2410c', // site orange (Hold, PU)
  danger: '#dc3545', // site red
  info: '#343a40', // sidebar charcoal
  secondary: '#495057',
  blue: '#0d6efd',
  emerald: '#198754',
  amber: '#c2410c',
  purple: '#343a40',
  rose: '#dc3545',
}

/**
 * KPI card — dark solid colour, big white number and white text, so it
 * reads easily (no white text on coloured / yellow boxes).
 */
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
  const color = VARIANT_COLOR[colorVariant] || VARIANT_COLOR.primary
  // Solid dark card colour with white text (strong contrast, no light / yellow backgrounds).
  const style = { backgroundColor: color, borderColor: color }
  const footer = href && footerLabel.trim() ? footerLabel : ''
  const body = (
    <>
      <div className="sara-metric__body">
        <div className="min-w-0">
          <div className="sara-metric__title">{title}</div>
          <div className="sara-metric__value">{value}</div>
          {subValue && <div className="sara-metric__sub">{subValue}</div>}
          {badge && <span className="badge text-bg-light border text-dark mt-1">{badge}</span>}
        </div>
        <span className="sara-metric__icon" aria-hidden>
          {Icon ? <Icon size={26} style={{ pointerEvents: 'none' }} /> : <i className={cn('bi', biIcon)} />}
        </span>
      </div>
      {footer && (
        <span className="sara-metric__footer">
          <span className="sara-metric__footer-text">{footer}</span> <i className="bi bi-arrow-right" aria-hidden />
        </span>
      )}
    </>
  )

  if (href) {
    return (
      <Link href={href} className="sara-metric sara-metric--link h-100 text-decoration-none" style={style}>
        {body}
      </Link>
    )
  }
  return (
    <div className="sara-metric h-100" style={style}>
      {body}
    </div>
  )
}
