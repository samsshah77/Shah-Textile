'use client'

import { useMemo, useState } from 'react'
import { YarnMaster, YarnLoomIssuance } from '@/services/productionMastersService'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { AddYarnModal } from '@/components/floor/AddYarnModal'
import { IssueYarnModal } from '@/components/floor/IssueYarnModal'

const DEFAULT_WIDTHS: Record<string, number> = {
  yarn: 140,
  bags: 70,
  rKg: 95,
  rLbs: 95,
  iKg: 95,
  iLbs: 95,
  bKg: 95,
  bLbs: 95,
  recentLooms: 190,
  actions: 90,
}

interface YarnStockTableProps {
  yarn: YarnMaster[]
  onUpdate: (id: string, patch: Partial<YarnMaster>) => void
  onAdd: (yarn: Partial<YarnMaster>) => void
  onIssue?: (yarnId: string, loomNumber: number, issuedKg: number, pick: number, dateStr: string) => void
  issuances?: YarnLoomIssuance[]
  readOnly?: boolean
  selectedDate?: string
}

export function YarnStockTable({
  yarn,
  onUpdate,
  onAdd,
  onIssue,
  issuances = [],
  readOnly,
  selectedDate,
}: YarnStockTableProps) {
  const [mode, setMode] = useState<TableGridMode>('table')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [issuingYarn, setIssuingYarn] = useState<YarnMaster | null>(null)

  const { widths, setColumnWidth, resetColumnWidth } = useResizableColumns(
    'sara_yarn_col_widths_v3',
    DEFAULT_WIDTHS
  )
  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  )

  // Map yarn issuances by yarnId
  const issuancesByYarn = useMemo(() => {
    const map = new Map<string, YarnLoomIssuance[]>()
    for (const iss of issuances) {
      const list = map.get(iss.yarnId) || []
      list.push(iss)
      map.set(iss.yarnId, list)
    }
    return map
  }, [issuances])

  return (
    <div className="card">
      <div className="card-header d-flex flex-row flex-wrap gap-2 justify-content-between align-items-center">
        <div className="min-w-0">
          <h3 className="card-title mb-0">Yarn Stock (Weft)</h3>
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center ms-auto">
          <ViewModeToggle mode={mode} onChange={setMode} />
          {!readOnly && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => setIsAddModalOpen(true)}
            >
              <i className="bi bi-plus-lg me-1" /> Add Yarn
            </button>
          )}
        </div>
      </div>

      {mode === 'grid' ? (
        <div className="master-grid">
          {yarn.map((y) => {
            const yarnIss = issuancesByYarn.get(y.id) || []
            return (
              <div key={y.id} className="master-grid-card">
                <div className="d-flex justify-content-between align-items-start border-bottom pb-2">
                  <div>
                    <div className="fw-bold fs-6">{y.yarnType}</div>
                    <div className="text-secondary small">{y.bags} Bags</div>
                  </div>
                  {onIssue && !readOnly && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-success"
                      onClick={() => setIssuingYarn(y)}
                    >
                      <i className="bi bi-box-arrow-right me-1" /> Issue
                    </button>
                  )}
                </div>

                <div className="d-flex justify-content-between small text-secondary">
                  <span>Recv: <strong className="text-dark">{y.receivedKg.toFixed(1)} kg</strong></span>
                  <span>Issued: <strong className="text-dark">{y.issuedKg.toFixed(1)} kg</strong></span>
                  <span>Balance: <strong className="text-primary">{y.balanceKg.toFixed(1)} kg</strong></span>
                </div>

                {yarnIss.length > 0 && (
                  <div className="pt-2 border-top">
                    <span className="small text-secondary fw-semibold">Recent Outward:</span>
                    <div className="d-flex flex-wrap gap-1 mt-1">
                      {yarnIss.slice(0, 3).map((iss) => (
                        <span key={iss.id} className="badge bg-light text-dark border">
                          Loom {iss.loomNumber}: {iss.issuedKg}kg ({iss.pick} pick)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div
          className="card-body p-0"
          style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
        >
          <table
            className="table table-sm table-hover mb-0 align-middle text-nowrap"
            style={{ tableLayout: 'fixed', width: tableMinWidth, minWidth: tableMinWidth }}
          >
            <colgroup>
              {Object.keys(DEFAULT_WIDTHS).map((key) => (
                <col key={key} style={{ width: widths[key] }} />
              ))}
            </colgroup>
            <thead className="table-light">
              <tr>
                <ResizableTh columnKey="yarn" width={widths.yarn} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Yarn Type
                </ResizableTh>
                <ResizableTh columnKey="bags" width={widths.bags} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Bags
                </ResizableTh>
                <ResizableTh columnKey="rKg" width={widths.rKg} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Received Kg
                </ResizableTh>
                <ResizableTh columnKey="rLbs" width={widths.rLbs} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Received Lbs
                </ResizableTh>
                <ResizableTh columnKey="iKg" width={widths.iKg} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Issued Kg
                </ResizableTh>
                <ResizableTh columnKey="iLbs" width={widths.iLbs} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Issued Lbs
                </ResizableTh>
                <ResizableTh columnKey="bKg" width={widths.bKg} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Balance Kg
                </ResizableTh>
                <ResizableTh columnKey="bLbs" width={widths.bLbs} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Balance Lbs
                </ResizableTh>
                <ResizableTh columnKey="recentLooms" width={widths.recentLooms} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Outward Destination / Looms
                </ResizableTh>
                <ResizableTh columnKey="actions" width={widths.actions} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-center">
                  Actions
                </ResizableTh>
              </tr>
            </thead>
            <tbody>
              {yarn.map((y) => {
                const yarnIss = issuancesByYarn.get(y.id) || []
                return (
                  <tr key={y.id}>
                    <td className="px-1">
                      <input
                        className="form-control form-control-sm fw-medium"
                        style={{ width: '100%', minWidth: 0 }}
                        value={y.yarnType}
                        disabled={readOnly}
                        onChange={(e) => onUpdate(y.id, { yarnType: e.target.value })}
                      />
                    </td>
                    <td className="px-1">
                      <input
                        type="number"
                        className="form-control form-control-sm text-end"
                        style={{ width: '100%', minWidth: 0 }}
                        value={y.bags}
                        disabled={readOnly}
                        onChange={(e) => onUpdate(y.id, { bags: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="px-1">
                      <input
                        type="number"
                        className="form-control form-control-sm text-end"
                        style={{ width: '100%', minWidth: 0 }}
                        value={y.receivedKg}
                        disabled={readOnly}
                        onChange={(e) => onUpdate(y.id, { receivedKg: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="px-1">
                      <input
                        type="number"
                        className="form-control form-control-sm text-end"
                        style={{ width: '100%', minWidth: 0 }}
                        value={y.receivedLbs}
                        disabled={readOnly}
                        onChange={(e) => onUpdate(y.id, { receivedLbs: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="px-1">
                      <input
                        type="number"
                        className="form-control form-control-sm text-end"
                        style={{ width: '100%', minWidth: 0 }}
                        value={y.issuedKg}
                        disabled={readOnly}
                        onChange={(e) => onUpdate(y.id, { issuedKg: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="px-1">
                      <input
                        type="number"
                        className="form-control form-control-sm text-end"
                        style={{ width: '100%', minWidth: 0 }}
                        value={y.issuedLbs}
                        disabled={readOnly}
                        onChange={(e) => onUpdate(y.id, { issuedLbs: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="fw-bold text-end pe-2 text-primary">{y.balanceKg.toFixed(1)}</td>
                    <td className="fw-semibold text-end pe-2 text-secondary">{y.balanceLbs.toFixed(1)}</td>
                    <td className="px-2" style={{ whiteSpace: 'normal', fontSize: '0.78rem' }}>
                      {yarnIss.length > 0 ? (
                        <div className="d-flex flex-wrap gap-1">
                          {yarnIss.slice(0, 3).map((iss) => (
                            <span
                              key={iss.id}
                              className="badge bg-light text-dark border py-1 px-1.5"
                              title={`Issued ${iss.issuedKg} kg to Loom ${iss.loomNumber} (${iss.pick} picks) on ${iss.date}`}
                            >
                              Loom {iss.loomNumber}: <strong>{iss.issuedKg}kg</strong> ({iss.pick}p)
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted small">In stock (no dispatches)</span>
                      )}
                    </td>
                    <td className="px-1 text-center">
                      {onIssue && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success py-0 px-2"
                          title="Issue yarn to loom"
                          disabled={readOnly || y.balanceKg <= 0}
                          onClick={() => setIssuingYarn(y)}
                        >
                          <i className="bi bi-box-arrow-right me-1" /> Issue
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card-footer small text-secondary d-flex justify-content-between align-items-center">
        <span>Conversion: 1 kg = 2.2046 lbs · kg = lbs ÷ 2.2046</span>
        <span>Outward issuance updates target loom weft and pick count on the Production Sheet.</span>
      </div>

      <AddYarnModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={(partial) => onAdd(partial)}
      />

      <IssueYarnModal
        yarn={issuingYarn}
        isOpen={!!issuingYarn}
        onClose={() => setIssuingYarn(null)}
        onIssue={(yarnId, loomNum, kg, pck, date) => onIssue?.(yarnId, loomNum, kg, pck, date)}
        activeDate={selectedDate}
      />
    </div>
  )
}
