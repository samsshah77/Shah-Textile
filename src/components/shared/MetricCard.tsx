'use client'

import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  value: string | number
  subValue?: string
  badge?: string
  icon: LucideIcon
  trend?: {
    value: string
    isPositive: boolean
    label?: string
  }
  colorVariant?: 'emerald' | 'blue' | 'amber' | 'purple' | 'rose'
  progress?: {
    value: number
    max: number
    label?: string
  }
}

const colorStyles = {
  emerald: {
    bg: 'bg-emerald-500/5 dark:bg-emerald-950/20',
    border: 'border-emerald-500/30 dark:border-emerald-500/40',
    iconBg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
    glow: 'hover:border-emerald-500/50 hover:shadow-emerald-500/10',
    bar: 'bg-emerald-600 dark:bg-emerald-500',
  },
  blue: {
    bg: 'bg-blue-500/5 dark:bg-blue-950/20',
    border: 'border-blue-500/30 dark:border-blue-500/40',
    iconBg: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30',
    glow: 'hover:border-blue-500/50 hover:shadow-blue-500/10',
    bar: 'bg-blue-600 dark:bg-blue-500',
  },
  amber: {
    bg: 'bg-amber-500/5 dark:bg-amber-950/20',
    border: 'border-amber-500/30 dark:border-amber-500/40',
    iconBg: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30',
    glow: 'hover:border-amber-500/50 hover:shadow-amber-500/10',
    bar: 'bg-amber-500',
  },
  purple: {
    bg: 'bg-purple-500/5 dark:bg-purple-950/20',
    border: 'border-purple-500/30 dark:border-purple-500/40',
    iconBg: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30',
    glow: 'hover:border-purple-500/50 hover:shadow-purple-500/10',
    bar: 'bg-purple-600 dark:bg-purple-500',
  },
  rose: {
    bg: 'bg-rose-500/5 dark:bg-rose-950/20',
    border: 'border-rose-500/30 dark:border-rose-500/40',
    iconBg: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30',
    glow: 'hover:border-rose-500/50 hover:shadow-rose-500/10',
    bar: 'bg-rose-600 dark:bg-rose-500',
  },
}

export function MetricCard({
  title,
  value,
  subValue,
  badge,
  icon: Icon,
  trend,
  colorVariant = 'blue',
  progress,
}: MetricCardProps) {
  const styles = colorStyles[colorVariant]

  return (
    <div
      className={cn(
        'group relative flex flex-col justify-between rounded-xl border bg-card p-4 transition-all duration-200 hover:shadow-md min-h-[140px]',
        styles.border,
        styles.glow
      )}
    >
      {/* Top Header: Title & Icon */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {title}
            </p>
          </div>
          <div className="space-y-1 pt-0.5">
            <h3 className="font-mono text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {value}
            </h3>
          </div>
        </div>

        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl shadow-xs transition-transform group-hover:scale-105',
            styles.iconBg
          )}
        >
          <Icon className="size-5" />
        </div>
      </div>

      {/* SubValue (e.g. PKR in Words): Never truncate, full display */}
      {subValue && (
        <div className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300 leading-snug break-words">
          {subValue}
        </div>
      )}

      {/* Badge / Chip: Dedicated row */}
      {badge && (
        <div className="mt-2">
          <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300 font-mono border border-slate-200 dark:border-slate-700">
            {badge}
          </span>
        </div>
      )}

      {/* Footer: Trend or Progress */}
      {trend && (
        <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <span
            className={cn(
              'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold font-mono',
              trend.isPositive
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
            )}
          >
            {trend.value}
          </span>
          {trend.label && (
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {trend.label}
            </span>
          )}
        </div>
      )}

      {progress && (
        <div className="mt-3 space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex justify-between text-[11px] font-medium text-slate-600 dark:text-slate-300">
            <span>{progress.label || 'Progress'}</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {Math.round((progress.value / progress.max) * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={cn('h-full transition-all duration-500', styles.bar)}
              style={{ width: `${Math.min(100, Math.max(0, (progress.value / progress.max) * 100))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
