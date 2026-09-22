'use client'

import { useMemo, useState } from 'react'
import { BeamMaster, LoomMaster } from '@/services/productionMastersService'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'

const DEFAULT_WIDTHS: Record<string, number> = {
  beam: 100,
  warp: 110,
  reed: 64,
  width: 64,
  threads: 84,
  length: 84,
  machine: 100,
  fill: 110,
  mounted: 120,
  beamEnd: 150,
}

interface BeamMasterTableProps {
  beams: BeamMaster[]
  looms: LoomMaster[]
  selectedDate: string
  onUpdate: (beamNo: string, patch: Partial<BeamMaster>) => void
  onAdd: (beam: Partial<BeamMaster> & { beamNo: string }) => void
  onMount: (beamNo: string, loomNumber: number) => void
  onUnmount: (beamNo: string) => void
  readOnly?: boolean
}

function BeamEndNote({ beam, selectedDate }: { beam: BeamMaster; selectedDate: string }) {
  if (beam.beamEndedOn !== selectedDate) return <span className="text-secondary">—</span>
  const from =
    beam.endedFromLoom != null && beam.endedFromLoom !== ''
      ? ` · Loom ${beam.endedFromLoom}`
      : ''
  return <span className="small">Beam Ended{from}</span>
}

export function BeamMasterTable({
  beams,
  looms,
  selectedDate,
  onUpdate,
  onAdd,
  onMount,
  onUnmount,
  readOnly,
}: BeamMasterTableProps) {
  const [newBeamNo, setNewBeamNo] = useState('')
  const [mode, setMode] = useState<TableGridMode>('table')
  const { widths, setColumnWidth, resetAllWidths, resetColumnWidth } = useResizableColumns(
    'sara_beam_col_widths_v2',
    DEFAULT_WIDTHS
  )
  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  )
  const activeLooms = looms.filter((l) => l.isActive)
  const endedTodayCount = beams.filter((b) => b.beamEndedOn === selectedDate).length

  const addBeam = () => {
    if (!newBeamNo.trim()) return
    onAdd({
      beamNo: newBeamNo.trim(),
      warp: '20/1',
      reed: 60,
      width: 66,
      loomType: 'G6200',
      fillStatus: 'FULL',
    })
    setNewBeamNo('')
  }

  const renderMountSelect = (b: BeamMaster) => (
    <select
      className="form-select form-select-sm"
      style={{ width: '100%', minWidth: 0 }}
      value={b.usedInLoom || ''}
      disabled={readOnly || b.fillStatus === 'EMPTY'}
      title={
        b.fillStatus === 'EMPTY'
          ? 'Empty beam cannot mount — mark Full first'
          : 'Mount / remount on a loom (Status still changes only on Looms tab)'
      }
      onChange={(e) => {
        const v = e.target.value
        if (!v) onUnmount(b.beamNo)
        else onMount(b.beamNo, Number(v))
      }}
    >
      <option value="">— Not mounted —</option>
      {activeLooms.map((l) => (
        <option key={l.loomNumber} value={l.loomNumber}>
          Loom {l.loomNumber}
        </option>
      ))}
    </select>
  )

  return (
    <div className="card">
      <div className="card-header d-flex flex-wrap gap-2 justify-content-between align-items-center">
        <div className="d-flex align-items-center gap-2 min-w-0">
          <h3 className="card-title mb-0">Beam Inventory</h3>
          {endedTodayCount > 0 && (
            <span className="badge text-bg-secondary">{endedTodayCount} ended</span>
          )}
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center ms-auto">
          <ViewModeToggle mode={mode} onChange={setMode} />
          {mode === 'table' && (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={resetAllWidths}>
              Reset columns
            </button>
          )}
          {!readOnly && (
            <>
              <input
                className="form-control form-control-sm"
                style={{ minWidth: 110, width: 120, maxWidth: '100%' }}
                placeholder="Beam ID"
                value={newBeamNo}
                onChange={(e) => setNewBeamNo(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!newBeamNo.trim()}
                onClick={addBeam}
              >
                Add
              </button>
            </>
          )}
        </div>
      </div>

      {mode === 'grid' ? (
        <div className="master-grid">
          {beams.map((b) => (
            <div key={b.beamNo} className="master-grid-card">
              <div className="d-flex justify-content-between align-items-start gap-2">
                <div className="fw-semibold">Beam Identity {b.beamNo}</div>
                <BeamEndNote beam={b} selectedDate={selectedDate} />
              </div>
              <input
                className="form-control form-control-sm"
                value={b.warp}
                disabled={readOnly}
                placeholder="Yarn Warp"
                onChange={(e) => onUpdate(b.beamNo, { warp: e.target.value })}
              />
              <div className="d-flex gap-2">
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={b.reed}
                  disabled={readOnly}
                  title="Reed"
                  onChange={(e) => onUpdate(b.beamNo, { reed: Number(e.target.value) || 0 })}
                />
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={b.width}
                  disabled={readOnly}
                  title="Width"
                  onChange={(e) => onUpdate(b.beamNo, { width: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="small text-secondary">
                Total Thread: <strong>{b.totalThreads.toLocaleString()}</strong>
              </div>
              <input
                type="number"
                className="form-control form-control-sm"
                value={b.length}
                disabled={readOnly}
                title="Length (meters)"
                onChange={(e) => onUpdate(b.beamNo, { length: Number(e.target.value) || 0 })}
              />
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
              <select
                className="form-select form-select-sm"
                value={b.fillStatus}
                disabled={readOnly || !!b.usedInLoom}
                onChange={(e) =>
                  onUpdate(b.beamNo, { fillStatus: e.target.value as 'EMPTY' | 'FULL' })
                }
              >
                <option value="EMPTY">Empty beam</option>
                <option value="FULL">Full beam</option>
              </select>
              {renderMountSelect(b)}
              {!b.usedInLoom && b.beamEndedOn === selectedDate && b.fillStatus !== 'EMPTY' && (
                <span className="small text-secondary">Ready to remount</span>
              )}
            </div>
          ))}
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
                <ResizableTh columnKey="beam" width={widths.beam} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Beam Identity
                </ResizableTh>
                <ResizableTh columnKey="warp" width={widths.warp} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Yarn Warp
                </ResizableTh>
                <ResizableTh columnKey="reed" width={widths.reed} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Reed
                </ResizableTh>
                <ResizableTh columnKey="width" width={widths.width} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Width
                </ResizableTh>
                <ResizableTh columnKey="threads" width={widths.threads} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Total Thread
                </ResizableTh>
                <ResizableTh columnKey="length" width={widths.length} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Length (meters)
                </ResizableTh>
                <ResizableTh columnKey="machine" width={widths.machine} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Machine Type
                </ResizableTh>
                <ResizableTh columnKey="fill" width={widths.fill} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Empty / Full
                </ResizableTh>
                <ResizableTh columnKey="mounted" width={widths.mounted} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Mounted Loom
                </ResizableTh>
                <ResizableTh columnKey="beamEnd" width={widths.beamEnd} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Beam End
                </ResizableTh>
              </tr>
            </thead>
            <tbody>
              {beams.map((b) => (
                <tr key={b.beamNo}>
                  <td className="fw-semibold px-2">{b.beamNo}</td>
                  <td className="px-1">
                    <input
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={b.warp}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(b.beamNo, { warp: e.target.value })}
                    />
                  </td>
                  <td className="px-1">
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={b.reed}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(b.beamNo, { reed: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="px-1">
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={b.width}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(b.beamNo, { width: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="fw-semibold text-end pe-3">{b.totalThreads.toLocaleString()}</td>
                  <td className="px-1">
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={b.length}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(b.beamNo, { length: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="px-1">
                    <select
                      className="form-select form-select-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={b.loomType}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(b.beamNo, { loomType: e.target.value })}
                    >
                      <option value="G6200">G6200</option>
                      <option value="G6300">G6300</option>
                      <option value="PU">PU</option>
                    </select>
                  </td>
                  <td className="px-1">
                    <select
                      className="form-select form-select-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={b.fillStatus}
                      disabled={readOnly || !!b.usedInLoom}
                      onChange={(e) =>
                        onUpdate(b.beamNo, { fillStatus: e.target.value as 'EMPTY' | 'FULL' })
                      }
                    >
                      <option value="EMPTY">Empty beam</option>
                      <option value="FULL">Full beam</option>
                    </select>
                  </td>
                  <td className="px-1">{renderMountSelect(b)}</td>
                  <td className="px-1">
                    <BeamEndNote beam={b} selectedDate={selectedDate} />
                    {!b.usedInLoom &&
                      b.beamEndedOn === selectedDate &&
                      b.fillStatus !== 'EMPTY' && (
                        <div className="small text-secondary">Ready to remount</div>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card-footer small text-secondary">
        Set Status → Beam End on Looms tab · this table shows “Beam Ended” as plain text · remount
        same beam on another loom while Full · note clears next day
      </div>
    </div>
  )
}
