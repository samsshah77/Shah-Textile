'use client'

import { YarnMaster } from '@/services/productionMastersService'

interface YarnStockTableProps {
  yarn: YarnMaster[]
  onUpdate: (id: string, patch: Partial<YarnMaster>) => void
  onAdd: () => void
  readOnly?: boolean
}

export function YarnStockTable({ yarn, onUpdate, onAdd, readOnly }: YarnStockTableProps) {
  return (
    <div className="card">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h3 className="card-title mb-0">Yarn Stock</h3>
        {!readOnly && (
          <button type="button" className="btn btn-sm btn-primary" onClick={onAdd}>
            <i className="bi bi-plus-lg me-1" />
            Add Yarn
          </button>
        )}
      </div>
      <div className="card-body p-0 table-responsive">
        <table className="table table-sm table-hover mb-0 align-middle">
          <thead className="table-light">
            <tr>
              <th>Yarn Type</th>
              <th>Bags</th>
              <th>Received (kg)</th>
              <th>Issued (kg)</th>
              <th>Balance (kg)</th>
            </tr>
          </thead>
          <tbody>
            {yarn.map((y) => (
              <tr key={y.id}>
                <td>
                  <input
                    className="form-control form-control-sm"
                    value={y.yarnType}
                    disabled={readOnly}
                    onChange={(e) => onUpdate(y.id, { yarnType: e.target.value })}
                  />
                </td>
                <td style={{ width: 90 }}>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={y.bags}
                    disabled={readOnly}
                    onChange={(e) => onUpdate(y.id, { bags: Number(e.target.value) || 0 })}
                  />
                </td>
                <td style={{ width: 120 }}>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={y.receivedKg}
                    disabled={readOnly}
                    onChange={(e) => onUpdate(y.id, { receivedKg: Number(e.target.value) || 0 })}
                  />
                </td>
                <td style={{ width: 120 }}>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={y.issuedKg}
                    disabled={readOnly}
                    onChange={(e) => onUpdate(y.id, { issuedKg: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="fw-semibold text-end pe-3">{y.balanceKg.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
