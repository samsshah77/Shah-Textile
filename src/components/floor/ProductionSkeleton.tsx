'use client'

import type { CSSProperties } from 'react'

function Bone({
  className = '',
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return <div className={`sara-skel ${className}`.trim()} style={style} aria-hidden />
}

/** Metric / KPI card row skeleton */
export function ProductionMetricsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="row g-3 mb-3" aria-busy="true" aria-label="Loading metrics">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="col-6 col-lg-3">
          <div className="card h-100">
            <div className="card-body">
              <Bone className="mb-2" style={{ height: 12, width: '45%' }} />
              <Bone style={{ height: 28, width: '70%' }} />
              <Bone className="mt-2" style={{ height: 10, width: '55%' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Table card skeleton (Daily Entry, Looms, Beams, Quality, Yarn, Fabric Fault) */
export function ProductionTableSkeleton({
  rows = 10,
  cols = 7,
  title,
}: {
  rows?: number
  cols?: number
  title?: string
}) {
  return (
    <div className="card" aria-busy="true" aria-label={title || 'Loading table'}>
      <div className="card-header d-flex justify-content-between align-items-center gap-2">
        <Bone style={{ height: 18, width: 140 }} />
        <div className="d-flex gap-2">
          <Bone style={{ height: 28, width: 72, borderRadius: 6 }} />
          <Bone style={{ height: 28, width: 88, borderRadius: 6 }} />
        </div>
      </div>
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-sm mb-0 align-middle">
            <thead className="table-light">
              <tr>
                {Array.from({ length: cols }, (_, c) => (
                  <th key={c} className="px-2 py-2">
                    <Bone style={{ height: 10, width: `${55 + (c % 3) * 12}%` }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, r) => (
                <tr key={r}>
                  {Array.from({ length: cols }, (_, c) => (
                    <td key={c} className="px-2 py-2">
                      <Bone
                        style={{
                          height: 12,
                          width: c === 0 ? '40%' : `${50 + ((r + c) % 4) * 10}%`,
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
    </div>
  )
}

/** Production Sheet — wider denser grid */
export function ProductionSheetSkeleton({ rows = 12 }: { rows?: number }) {
  return <ProductionTableSkeleton rows={rows} cols={10} title="Loading production sheet" />
}

/** Grid cards skeleton (loom/quality grid mode) */
export function ProductionCardsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="card" aria-busy="true" aria-label="Loading cards">
      <div className="card-header">
        <Bone style={{ height: 18, width: 120 }} />
      </div>
      <div className="master-grid">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="master-grid-card">
            <Bone style={{ height: 16, width: '55%' }} />
            <Bone className="mt-2" style={{ height: 12, width: '80%' }} />
            <Bone className="mt-2" style={{ height: 32, width: '100%', borderRadius: 6 }} />
            <Bone className="mt-2" style={{ height: 32, width: '100%', borderRadius: 6 }} />
            <Bone className="mt-2" style={{ height: 12, width: '40%' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Full workspace body by tab */
export function ProductionWorkspaceSkeleton({
  tab = 'sheet',
}: {
  tab?: string
}) {
  if (tab === 'looms' || tab === 'quality' || tab === 'beams') {
    return <ProductionTableSkeleton rows={12} cols={tab === 'beams' ? 6 : 8} />
  }
  if (tab === 'entry' || tab === 'fabric-fault' || tab === 'yarn') {
    return <ProductionTableSkeleton rows={12} cols={7} />
  }
  return <ProductionSheetSkeleton />
}

/** Report pages: metrics + chart block + table */
export function ProductionReportSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading report">
      <ProductionMetricsSkeleton count={4} />
      <div className="card mb-3">
        <div className="card-body">
          <Bone className="mb-3" style={{ height: 16, width: 160 }} />
          <Bone style={{ height: 220, width: '100%', borderRadius: 8 }} />
        </div>
      </div>
      <ProductionTableSkeleton rows={8} cols={6} />
    </div>
  )
}
