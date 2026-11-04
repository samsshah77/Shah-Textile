'use client'

import type { CSSProperties } from 'react'

export function Bone({
  className = '',
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return <div className={`sara-skel ${className}`.trim()} style={style} aria-hidden="true" />
}

/** Accounts Table Skeleton (Daily Inward, Payables, Petty Cash, etc.) */
export function AccountsTableSkeleton({
  rows = 8,
  cols = 8,
  title = 'Accounts Book',
}: {
  rows?: number
  cols?: number
  title?: string
}) {
  return (
    <div className="erp-card overflow-hidden" aria-busy="true" aria-label={`Loading ${title}`}>
      {/* Top Header Placeholder */}
      <div className="p-3 border-b border-border flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
        <div className="flex flex-wrap items-center gap-2.5">
          <Bone style={{ height: 32, width: 220, borderRadius: 8 }} />
          <Bone style={{ height: 32, width: 140, borderRadius: 8 }} />
          <Bone style={{ height: 32, width: 130, borderRadius: 8 }} />
        </div>
        <div className="flex items-center gap-2">
          <Bone style={{ height: 32, width: 90, borderRadius: 8 }} />
          <Bone style={{ height: 32, width: 90, borderRadius: 8 }} />
        </div>
      </div>

      {/* Table Placeholder */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide">
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className="px-3 py-2.5">
                  <Bone style={{ height: 11, width: `${50 + (c % 4) * 12}%` }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r} className="border-b border-border/60">
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c} className="px-3 py-2.5">
                    <Bone
                      style={{
                        height: 13,
                        width: c === 0 ? '45%' : c === cols - 1 ? '70%' : `${55 + ((r * 3 + c * 7) % 35)}%`,
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Summary Placeholder */}
      <div className="p-3 border-t border-border bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
        <Bone style={{ height: 12, width: 120 }} />
        <Bone style={{ height: 16, width: 160 }} />
      </div>
    </div>
  )
}

/** Directory Cards Skeleton (Traders & Workshops Grid) */
export function AccountsCardsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading directory">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 border border-border rounded-xl">
        <Bone style={{ height: 34, width: 240, borderRadius: 8 }} />
        <div className="flex items-center gap-2">
          <Bone style={{ height: 34, width: 120, borderRadius: 8 }} />
          <Bone style={{ height: 34, width: 110, borderRadius: 8 }} />
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="card p-3.5 border border-border rounded-xl bg-white dark:bg-slate-900 shadow-xs">
            <div className="flex items-start gap-3 mb-3">
              <Bone style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <Bone className="mb-1.5" style={{ height: 15, width: '80%' }} />
                <Bone style={{ height: 10, width: '45%' }} />
              </div>
            </div>
            <div className="space-y-2 pt-2 border-t border-border/60">
              <div className="flex justify-between items-center">
                <Bone style={{ height: 11, width: '35%' }} />
                <Bone style={{ height: 12, width: '40%' }} />
              </div>
              <div className="flex justify-between items-center">
                <Bone style={{ height: 11, width: '30%' }} />
                <Bone style={{ height: 14, width: '45%', borderRadius: 4 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Party Ledger Skeleton (Trader / Workshop Account Statement) */
export function AccountsLedgerSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading party ledger">
      {/* Top Party Summary Card */}
      <div className="card p-4 border border-border rounded-xl bg-white dark:bg-slate-900 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <Bone style={{ width: 52, height: 52, borderRadius: 12 }} />
            <div>
              <Bone className="mb-2" style={{ height: 20, width: 180 }} />
              <div className="flex items-center gap-2">
                <Bone style={{ height: 12, width: 80, borderRadius: 4 }} />
                <Bone style={{ height: 12, width: 110 }} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <Bone className="mb-1" style={{ height: 11, width: 70 }} />
              <Bone style={{ height: 22, width: 120 }} />
            </div>
            <div className="text-right">
              <Bone className="mb-1" style={{ height: 11, width: 70 }} />
              <Bone style={{ height: 22, width: 120 }} />
            </div>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <AccountsTableSkeleton rows={7} cols={7} title="Party ledger transactions" />
    </div>
  )
}

/** Cost Statement Skeleton */
export function AccountsCostStatementSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading cost statement">
      {/* Top 3 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="card p-4 border border-border rounded-xl bg-white dark:bg-slate-900 shadow-xs">
            <Bone className="mb-2" style={{ height: 12, width: '50%' }} />
            <Bone className="mb-1" style={{ height: 26, width: '75%' }} />
            <Bone style={{ height: 10, width: '40%' }} />
          </div>
        ))}
      </div>

      {/* Section Tables */}
      <div className="card border border-border rounded-xl bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="p-3.5 border-b border-border bg-slate-50/50 dark:bg-slate-800/30 flex justify-between items-center">
          <Bone style={{ height: 16, width: 180 }} />
          <Bone style={{ height: 16, width: 100 }} />
        </div>
        <div className="p-3 space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
              <Bone style={{ height: 13, width: `${30 + (i % 3) * 15}%` }} />
              <Bone style={{ height: 13, width: 90 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
