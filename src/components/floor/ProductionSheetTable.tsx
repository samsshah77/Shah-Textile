'use client'

import { DailyLoomProductionEntry } from '@/types/production'
import { LoomStatus } from '@/types/loom'
import { YarnMaster } from '@/services/productionMastersService'

const STATUSES: LoomStatus[] = ['RUNNING', 'STOPPED', 'KNOTTING', 'BREAKDOWN', 'BEAM_END']

interface ProductionSheetTableProps {
  entries: DailyLoomProductionEntry[]
  yarnOptions: YarnMaster[]
  onUpdateEntry: (loomNumber: number, patch: Partial<DailyLoomProductionEntry>) => void
  readOnly?: boolean
}

export function ProductionSheetTable({
  entries,
  yarnOptions,
  onUpdateEntry,
  readOnly,
}: ProductionSheetTableProps) {
  const totalA = entries.reduce((s, e) => s + (e.shiftAMeters || 0), 0)
  const totalB = entries.reduce((s, e) => s + (e.shiftBMeters || 0), 0)
  const grand = entries.reduce((s, e) => s + (e.totalMeters || 0), 0)
  const avgEff =
    entries.length > 0
      ? entries.reduce((s, e) => s + (e.efficiencyPercentage || 0), 0) / entries.length
      : 0

  return (
    <div className="card">
      <div className="card-header d-flex flex-wrap gap-2 justify-content-between align-items-center">
        <h3 className="card-title mb-0">Production Sheet</h3>
        <div className="d-flex flex-wrap gap-2 small">
          <span className="badge text-bg-primary">Shift A: {totalA.toLocaleString()} m</span>
          <span className="badge text-bg-info">Shift B: {totalB.toLocaleString()} m</span>
          <span className="badge text-bg-dark">Total: {grand.toLocaleString()} m</span>
          <span className="badge text-bg-secondary">Avg Eff: {avgEff.toFixed(1)}%</span>
        </div>
      </div>
      <div className="card-body p-0 table-responsive">
        <table className="table table-sm table-hover mb-0 align-middle text-nowrap">
          <thead className="table-light">
            <tr>
              <th>Loom</th>
              <th>Model</th>
              <th>RPM</th>
              <th>Beam</th>
              <th>Warp</th>
              <th>Weft / Yarn</th>
              <th>Pick</th>
              <th>Shift A</th>
              <th>Shift B</th>
              <th>Total</th>
              <th>Theo</th>
              <th>Eff %</th>
              <th>Loss</th>
              <th>Status</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.loomNumber}>
                <td className="fw-semibold">{e.loomNumber}</td>
                <td>{e.model || e.category}</td>
                <td>{e.rpm}</td>
                <td>{e.lot || '—'}</td>
                <td className="small">{e.warpYarn || '—'}</td>
                <td style={{ minWidth: 140 }}>
                  <select
                    className="form-select form-select-sm"
                    value={e.weftYarn || ''}
                    disabled={readOnly}
                    onChange={(ev) => onUpdateEntry(e.loomNumber, { weftYarn: ev.target.value })}
                  >
                    <option value="">—</option>
                    {yarnOptions.map((y) => (
                      <option key={y.id} value={y.yarnType}>
                        {y.yarnType}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{e.pick}</td>
                <td style={{ width: 90 }}>
                  <input
                    type="number"
                    className="form-control form-control-sm text-end"
                    value={e.shiftAMeters}
                    disabled={readOnly}
                    onChange={(ev) =>
                      onUpdateEntry(e.loomNumber, {
                        shiftAMeters: Number(ev.target.value) || 0,
                      })
                    }
                  />
                </td>
                <td style={{ width: 90 }}>
                  <input
                    type="number"
                    className="form-control form-control-sm text-end"
                    value={e.shiftBMeters}
                    disabled={readOnly}
                    onChange={(ev) =>
                      onUpdateEntry(e.loomNumber, {
                        shiftBMeters: Number(ev.target.value) || 0,
                      })
                    }
                  />
                </td>
                <td className="fw-semibold text-end">{e.totalMeters.toFixed(0)}</td>
                <td className="text-end text-secondary">
                  {(e.runningTheoretical || 0).toFixed(0)}
                </td>
                <td className="text-end">{e.efficiencyPercentage.toFixed(1)}</td>
                <td className="text-end text-secondary">{e.stopLossMeters.toFixed(0)}</td>
                <td style={{ minWidth: 120 }}>
                  <select
                    className="form-select form-select-sm"
                    value={e.status}
                    disabled={readOnly}
                    onChange={(ev) =>
                      onUpdateEntry(e.loomNumber, { status: ev.target.value as LoomStatus })
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ minWidth: 120 }}>
                  <input
                    className="form-control form-control-sm"
                    value={e.remarks || ''}
                    disabled={readOnly}
                    onChange={(ev) => onUpdateEntry(e.loomNumber, { remarks: ev.target.value })}
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
