'use client'

import { LoomMaster } from '@/services/productionMastersService'
import { LoomCategory, LoomStatus } from '@/types/loom'

const MODELS: LoomCategory[] = ['G6200', 'G6300', 'PU']
const STATUSES: LoomStatus[] = ['RUNNING', 'STOPPED', 'KNOTTING', 'BREAKDOWN', 'BEAM_END']

interface LoomMasterTableProps {
  looms: LoomMaster[]
  onUpdate: (loomNumber: number, patch: Partial<LoomMaster>) => void
  onAdd: () => void
  readOnly?: boolean
}

export function LoomMasterTable({ looms, onUpdate, onAdd, readOnly }: LoomMasterTableProps) {
  return (
    <div className="card">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h3 className="card-title mb-0">Looms</h3>
        {!readOnly && (
          <button type="button" className="btn btn-sm btn-primary" onClick={onAdd}>
            <i className="bi bi-plus-lg me-1" />
            Add Loom
          </button>
        )}
      </div>
      <div className="card-body p-0 table-responsive">
        <table className="table table-sm table-hover mb-0 align-middle">
          <thead className="table-light">
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Model</th>
              <th>RPM</th>
              <th>Pick</th>
              <th>Shed</th>
              <th>Status</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {looms.map((l) => (
              <tr key={l.loomNumber}>
                <td className="fw-semibold">{l.loomNumber}</td>
                <td>
                  <input
                    className="form-control form-control-sm"
                    value={l.name}
                    disabled={readOnly}
                    onChange={(e) => onUpdate(l.loomNumber, { name: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    className="form-select form-select-sm"
                    value={l.model}
                    disabled={readOnly}
                    onChange={(e) =>
                      onUpdate(l.loomNumber, { model: e.target.value as LoomCategory })
                    }
                  >
                    {MODELS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ width: 90 }}>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={l.defaultRpm}
                    disabled={readOnly}
                    onChange={(e) =>
                      onUpdate(l.loomNumber, { defaultRpm: Number(e.target.value) || 0 })
                    }
                  />
                </td>
                <td style={{ width: 80 }}>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={l.defaultPick}
                    disabled={readOnly}
                    onChange={(e) =>
                      onUpdate(l.loomNumber, { defaultPick: Number(e.target.value) || 60 })
                    }
                  />
                </td>
                <td>
                  <input
                    className="form-control form-control-sm"
                    value={l.shed}
                    disabled={readOnly}
                    onChange={(e) => onUpdate(l.loomNumber, { shed: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    className="form-select form-select-sm"
                    value={l.status}
                    disabled={readOnly}
                    onChange={(e) =>
                      onUpdate(l.loomNumber, { status: e.target.value as LoomStatus })
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="text-center">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={l.isActive}
                    disabled={readOnly}
                    onChange={(e) => onUpdate(l.loomNumber, { isActive: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
