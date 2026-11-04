'use client'

import type { CSSProperties } from 'react'

function Bone({
  className = '',
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return <div className={`sara-skel ${className}`.trim()} style={style} aria-hidden="true" />
}

/** Rich Skeleton for Payroll / Salary Module during hydration */
export function PayrollSkeleton() {
  return (
    <div className="space-y-6 print:space-y-2 p-3 sm:p-6" aria-busy="true" aria-label="Loading payroll data">
      {/* Top Header Placeholder */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border/60">
        <div className="space-y-1.5">
          <Bone style={{ height: 24, width: 220, borderRadius: 6 }} />
          <Bone style={{ height: 12, width: 140 }} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Bone style={{ height: 34, width: 140, borderRadius: 8 }} />
          <Bone style={{ height: 34, width: 120, borderRadius: 8 }} />
          <Bone style={{ height: 34, width: 85, borderRadius: 8 }} />
        </div>
      </div>

      {/* 4 KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card p-3.5 border border-border rounded-xl bg-white dark:bg-slate-900 shadow-xs">
            <Bone className="mb-2" style={{ height: 11, width: '50%' }} />
            <Bone className="mb-1.5" style={{ height: 24, width: '70%' }} />
            <Bone style={{ height: 10, width: '40%' }} />
          </div>
        ))}
      </div>

      {/* Tab Navigation Placeholder */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <Bone style={{ height: 32, width: 110, borderRadius: 8 }} />
        <Bone style={{ height: 32, width: 110, borderRadius: 8 }} />
        <Bone style={{ height: 32, width: 120, borderRadius: 8 }} />
      </div>

      {/* Main Payroll Table Skeleton */}
      <div className="card border border-border rounded-xl bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="p-3 border-b border-border bg-slate-50/50 dark:bg-slate-800/30 flex justify-between items-center">
          <Bone style={{ height: 16, width: 180 }} />
          <div className="flex gap-2">
            <Bone style={{ height: 28, width: 75, borderRadius: 6 }} />
            <Bone style={{ height: 28, width: 85, borderRadius: 6 }} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide">
                {['#', 'Name', 'Category', 'Designation', 'Days / Hrs', 'Gross', 'Deductions', 'Net Payout'].map(
                  (col, idx) => (
                    <th key={idx} className="px-3 py-2.5">
                      <Bone style={{ height: 11, width: `${50 + (idx % 3) * 15}%` }} />
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 9 }, (_, r) => (
                <tr key={r} className="border-b border-border/50">
                  <td className="px-3 py-2.5">
                    <Bone style={{ height: 12, width: 20 }} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Bone style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
                      <div className="space-y-1 flex-1">
                        <Bone style={{ height: 13, width: `${60 + (r % 3) * 15}%` }} />
                        <Bone style={{ height: 9, width: '40%' }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Bone style={{ height: 18, width: 65, borderRadius: 12 }} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Bone style={{ height: 12, width: '60%' }} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Bone style={{ height: 12, width: '45%' }} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Bone style={{ height: 12, width: '55%' }} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Bone style={{ height: 12, width: '45%' }} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Bone style={{ height: 14, width: '70%', borderRadius: 4 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/** Rich Skeleton for HR Profiles (/payroll/profiles) */
export function PayrollProfilesSkeleton() {
  return (
    <div className="w-full max-w-6xl space-y-4 px-1 pb-16 pt-6 sm:pt-8" aria-busy="true" aria-label="Loading profiles">
      {/* Toolbar Placeholder */}
      <div className="flex flex-nowrap items-center justify-between gap-2 overflow-x-auto pb-1">
        <div className="inline-flex shrink-0 items-center gap-2">
          <Bone style={{ height: 36, width: 256, borderRadius: 6 }} />
          <Bone style={{ height: 36, width: 140, borderRadius: 6 }} />
        </div>
        <div className="inline-flex shrink-0 items-center gap-2">
          <Bone style={{ height: 36, width: 110, borderRadius: 6 }} />
          <Bone style={{ height: 36, width: 80, borderRadius: 6 }} />
          <Bone style={{ height: 36, width: 70, borderRadius: 6 }} />
        </div>
      </div>

      {/* Categories Bar Placeholder */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {['All', 'Staff', 'Company Contract', 'Weaver', 'Helper', 'Contractor', 'Resigned'].map((cat, i) => (
            <Bone key={i} style={{ height: 26, width: 70 + (i % 3) * 20, borderRadius: 6 }} />
          ))}
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5">
          <Bone style={{ height: 26, width: 56, borderRadius: 4 }} />
        </div>
      </div>

      {/* Grid of Profile Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="rounded-lg border border-border bg-white dark:bg-slate-900 p-3.5 shadow-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3 min-w-0">
                <Bone style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />
                <div className="min-w-0 pt-0.5 space-y-1.5">
                  <Bone style={{ height: 10, width: 35 }} />
                  <Bone style={{ height: 16, width: 120 + (i % 3) * 25 }} />
                  <Bone style={{ height: 11, width: 85 }} />
                </div>
              </div>
              <Bone style={{ height: 20, width: 55, borderRadius: 4 }} />
            </div>
            <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between">
              <Bone style={{ height: 12, width: 85 }} />
              <Bone style={{ height: 14, width: 65, borderRadius: 4 }} />
            </div>
            <div className="mt-2">
              <Bone style={{ height: 10, width: 110 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
