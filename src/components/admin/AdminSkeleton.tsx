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

/** Admin Users & Roles table skeleton */
export function AdminTableSkeleton({
  rows = 6,
  cols = 5,
  title = 'Sab users',
}: {
  rows?: number
  cols?: number
  title?: string
}) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading admin table">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <Bone style={{ height: 20, width: 140 }} />
        <Bone style={{ height: 32, width: 220, borderRadius: 6 }} />
      </div>
      <div className="table-responsive card shadow-sm">
        <table className="table table-sm align-middle mb-0 small">
          <thead className="table-light">
            <tr>
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className="px-3 py-2">
                  <Bone style={{ height: 12, width: `${50 + (c % 3) * 15}%` }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c} className="px-3 py-2.5">
                    <Bone
                      style={{
                        height: 12,
                        width: c === cols - 1 ? 70 : `${45 + ((r + c) % 4) * 12}%`,
                        borderRadius: c === cols - 1 ? 4 : 2,
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Admin Role Permissions Matrix Skeleton */
export function AdminPermissionsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading permissions">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 pb-3 border-b">
        <div className="space-y-1">
          <Bone style={{ height: 12, width: 90 }} />
          <Bone style={{ height: 24, width: 180 }} />
        </div>
        <div className="d-flex gap-2">
          <Bone style={{ height: 34, width: 95, borderRadius: 6 }} />
          <Bone style={{ height: 34, width: 75, borderRadius: 6 }} />
          <Bone style={{ height: 34, width: 150, borderRadius: 6 }} />
        </div>
      </div>

      <div className="card shadow-sm border overflow-hidden">
        <div className="card-header bg-slate-50 dark:bg-slate-800 p-3 d-flex justify-content-between align-items-center">
          <Bone style={{ height: 16, width: 200 }} />
          <Bone style={{ height: 24, width: 100, borderRadius: 4 }} />
        </div>
        <div className="table-responsive">
          <table className="table table-sm mb-0">
            <thead className="table-light">
              <tr>
                {['Section / Feature', 'View', 'Create / Edit', 'Delete', 'Special Access'].map((h, i) => (
                  <th key={i} className="px-3 py-2.5">
                    <Bone style={{ height: 12, width: `${55 + (i % 3) * 15}%` }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }, (_, r) => (
                <tr key={r}>
                  <td className="px-3 py-3">
                    <div className="space-y-1">
                      <Bone style={{ height: 14, width: `${60 + (r % 3) * 15}%` }} />
                      <Bone style={{ height: 10, width: '40%' }} />
                    </div>
                  </td>
                  {Array.from({ length: 4 }, (_, c) => (
                    <td key={c} className="px-3 py-3 text-center">
                      <Bone style={{ height: 20, width: 20, borderRadius: 4, display: 'inline-block' }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/** Admin System Status & Audit Skeleton */
export function AdminSystemSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading system info">
      <div className="card shadow-sm">
        <div className="card-header py-2 small fw-bold">
          <Bone style={{ height: 14, width: 150 }} />
        </div>
        <div className="card-body p-3">
          <div className="space-y-2 mb-3">
            <Bone style={{ height: 14, width: '60%' }} />
            <Bone style={{ height: 14, width: '45%' }} />
            <Bone style={{ height: 14, width: '70%' }} />
          </div>
          <Bone style={{ height: 32, width: 140, borderRadius: 6 }} />
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-header py-2 small fw-bold">
          <Bone style={{ height: 14, width: 120 }} />
        </div>
        <div className="card-body p-3">
          <div className="row g-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="col-6 col-md-4">
                <div className="border rounded p-2.5 bg-slate-50 dark:bg-slate-800">
                  <Bone style={{ height: 11, width: '50%', marginBottom: 6 }} />
                  <Bone style={{ height: 20, width: '75%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
