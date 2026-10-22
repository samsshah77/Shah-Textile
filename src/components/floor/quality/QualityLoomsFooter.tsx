'use client'


import type { QualityMasterTableState } from './useQualityMasterTable'

/** Available looms bar under the table. */
export function QualityLoomsFooter({ t }: { t: QualityMasterTableState }) {
  const { looms, beamEndLooms, availableLooms } = t
  return (
    <div className="card-footer bg-light-subtle border-top py-2 px-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span
            className="small fw-semibold text-secondary text-uppercase d-inline-flex align-items-center gap-1.5"
            style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}
          >
            <i className="bi bi-grid-3x3-gap-fill text-success" />
            Available Looms ({availableLooms.length}):
          </span>
          {availableLooms.length === 0 ? (
            <span className="small text-muted fst-italic">None (All looms assigned)</span>
          ) : (
            <div className="d-flex flex-wrap align-items-center gap-1">
              {availableLooms.map((loomNum) => {
                const loomObj = looms.find((l) => l.loomNumber === loomNum)
                const modelLabel = loomObj?.model || loomObj?.category
                const beamEnd = beamEndLooms.has(loomNum)
                const state = beamEnd ? 'Beam End — available' : 'Available'
                const tooltipText = modelLabel
                  ? `Loom #${loomNum} (${modelLabel}) • ${state}`
                  : `Loom #${loomNum} • ${state}`

                return (
                  <span
                    key={loomNum}
                    className="sara-available-loom-chip d-inline-flex align-items-center justify-content-center text-center font-monospace"
                    title={tooltipText}
                    style={beamEnd ? { background: '#e2d9f3', color: '#4c2a85', borderColor: '#6f42c1' } : undefined}
                  >
                    {loomNum}
                    {beamEnd && <span style={{ fontSize: 9, marginLeft: 2 }}>B/E</span>}
                  </span>
                )
              })}
            </div>
          )}
        </div>
        {availableLooms.length > 0 && (
          <span className="small text-muted font-monospace" style={{ fontSize: '0.7rem' }}>
            {availableLooms.length} of {looms.length || 34} Free
          </span>
        )}
      </div>
    </div>
  )
}
