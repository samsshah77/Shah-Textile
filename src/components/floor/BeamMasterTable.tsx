'use client'

import { useState } from 'react'
import { BeamMaster, LoomMaster } from '@/services/productionMastersService'

interface BeamMasterTableProps {
  beams: BeamMaster[]
  looms: LoomMaster[]
  onUpdate: (beamNo: string, patch: Partial<BeamMaster>) => void
  onAdd: (beam: Partial<BeamMaster> & { beamNo: string }) => void
  onMount: (beamNo: string, loomNumber: number) => void
  onUnmount: (beamNo: string) => void
  readOnly?: boolean
}

export function BeamMasterTable({
  beams,
  looms,
  onUpdate,
  onAdd,
  onMount,
  onUnmount,
  readOnly,
}: BeamMasterTableProps) {
  const [newBeamNo, setNewBeamNo] = useState('')

  return (
    <div className="card">
      <div className="card-header d-flex flex-wrap gap-2 justify-content-between align-items-center">
        <h3 className="card-title mb-0">Beams</h3>
        {!readOnly && (
          <div className="d-flex gap-2 align-items-center">
            <input
              className="form-control form-control-sm"
              style={{ width: 120 }}
              placeholder="Beam No"
              value={newBeamNo}
              onChange={(e) => setNewBeamNo(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!newBeamNo.trim()}
              onClick={() => {
                onAdd({ beamNo: newBeamNo.trim(), warp: '', loomType: 'G6200' })
                setNewBeamNo('')
              }}
            >
              <i className="bi bi-plus-lg me-1" />
              Add Beam
            </button>
          </div>
        )}
      </div>
      <div className="card-body p-0 table-responsive">
        <table className="table table-sm table-hover mb-0 align-middle">
          <thead className="table-light">
            <tr>
              <th>Beam No</th>
              <th>Warp</th>
              <th>Reed/Width</th>
              <th>Ends</th>
              <th>Length</th>
              <th>Loom Type</th>
              <th>Status</th>
              <th>Mounted Loom</th>
            </tr>
          </thead>
          <tbody>
            {beams.map((b) => (
              <tr key={b.beamNo}>
                <td className="fw-semibold">{b.beamNo}</td>
                <td>
                  <input
                    className="form-control form-control-sm"
                    value={b.warp}
                    disabled={readOnly}
                    onChange={(e) => onUpdate(b.beamNo, { warp: e.target.value })}
                  />
                </td>
                <td style={{ width: 100 }}>
                  <input
                    className="form-control form-control-sm"
                    value={b.reedWidth}
                    disabled={readOnly}
                    onChange={(e) => onUpdate(b.beamNo, { reedWidth: e.target.value })}
                  />
                </td>
                <td style={{ width: 90 }}>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={b.ends}
                    disabled={readOnly}
                    onChange={(e) => onUpdate(b.beamNo, { ends: Number(e.target.value) || 0 })}
                  />
                </td>
                <td style={{ width: 90 }}>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={b.length}
                    disabled={readOnly}
                    onChange={(e) => onUpdate(b.beamNo, { length: Number(e.target.value) || 0 })}
                  />
                </td>
                <td style={{ width: 110 }}>
                  <select
                    className="form-select form-select-sm"
                    value={b.loomType}
                    disabled={readOnly}
                    onChange={(e) => onUpdate(b.beamNo, { loomType: e.target.value })}
                  >
                    <option value="G6200">G6200</option>
                    <option value="G6300">G6300</option>
                    <option value="PU">PU</option>
                  </select>
                </td>
                <td>
                  <span className="badge text-bg-secondary">{b.status}</span>
                </td>
                <td style={{ minWidth: 140 }}>
                  <select
                    className="form-select form-select-sm"
                    value={b.usedInLoom || ''}
                    disabled={readOnly}
                    onChange={(e) => {
                      const v = e.target.value
                      if (!v) onUnmount(b.beamNo)
                      else onMount(b.beamNo, Number(v))
                    }}
                  >
                    <option value="">— In stock —</option>
                    {looms
                      .filter((l) => l.isActive)
                      .map((l) => (
                        <option key={l.loomNumber} value={l.loomNumber}>
                          Loom {l.loomNumber}
                        </option>
                      ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
