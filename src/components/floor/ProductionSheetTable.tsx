'use client'

import { useMemo, type CSSProperties } from 'react'
import { DailyLoomProductionEntry } from '@/types/production'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'

interface ProductionSheetTableProps {
  entries: DailyLoomProductionEntry[]
}

function num(n: number | undefined, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

const DEFAULT_WIDTHS: Record<string, number> = {
  loom: 72,
  quality: 110,
  type: 90,
  warp: 100,
  weft: 100,
  rpm: 64,
  reed: 48,
  pick: 48,
  width: 48,
  gsm: 64,
  roller: 60,
  run100: 64,
  shiftA: 52,
  shiftB: 52,
  totalAB: 64,
  effRun: 64,
  lossRun: 56,
  h24: 64,
  eff24: 64,
  loss24: 56,
  remarks: 110,
  lot: 90,
}

const headerWrap: CSSProperties = {
  whiteSpace: 'normal',
  lineHeight: 1.15,
  fontSize: '0.7rem',
}

/** Read-only Excel Production sheet — all values auto from masters + Daily Entry. */
export function ProductionSheetTable({ entries }: ProductionSheetTableProps) {
  const { widths, setColumnWidth, resetAllWidths, resetColumnWidth } = useResizableColumns(
    'sara_prod_sheet_col_widths_v1',
    DEFAULT_WIDTHS
  )

  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  )

  const totals = entries.reduce(
    (acc, e) => {
      acc.rpm += e.rpm || 0
      acc.pick += e.pick || 0
      acc.roller += e.rollerHours || 0
      acc.runningTheo += e.runningTheoretical || 0
      acc.a += e.shiftAMeters || 0
      acc.b += e.shiftBMeters || 0
      acc.ab += e.totalMeters || 0
      acc.lossRun += e.stopLossMeters || 0
      acc.theo24 += e.theoretical24h || 0
      acc.loss24 += e.loss24h || 0
      acc.effRun += e.efficiencyPercentage || 0
      acc.eff24 += e.efficiency24h || 0
      return acc
    },
    {
      rpm: 0,
      pick: 0,
      roller: 0,
      runningTheo: 0,
      a: 0,
      b: 0,
      ab: 0,
      lossRun: 0,
      theo24: 0,
      loss24: 0,
      effRun: 0,
      eff24: 0,
    }
  )
  const n = entries.length || 1

    return (
    <div className="card">
      <div className="card-header d-flex flex-row flex-wrap gap-2 justify-content-between align-items-center">
        <div className="min-w-0">
          <h3 className="card-title mb-0">Production Sheet</h3>
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center ms-auto">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={resetAllWidths}>
            Reset columns
          </button>
        </div>
      </div>
      <div
        className="card-body p-0"
        style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
      >
        <table
          className="table table-sm table-bordered table-hover mb-0 align-middle"
          style={{ tableLayout: 'fixed', width: tableMinWidth, minWidth: tableMinWidth }}
        >
          <colgroup>
            {Object.keys(DEFAULT_WIDTHS).map((key) => (
              <col key={key} style={{ width: widths[key] }} />
            ))}
          </colgroup>
          <thead className="table-light">
            <tr>
              <ResizableTh columnKey="loom" width={widths.loom} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2} className="text-nowrap px-2">
                Loom Number
              </ResizableTh>
              <ResizableTh columnKey="quality" width={widths.quality} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2} className="px-2">
                Quality Name
              </ResizableTh>
              <ResizableTh columnKey="type" width={widths.type} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2} className="px-2">
                Fabric Type
              </ResizableTh>
              <ResizableTh columnKey="warp" width={widths.warp} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2} className="px-2">
                Warp
              </ResizableTh>
              <ResizableTh columnKey="weft" width={widths.weft} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2} className="px-2">
                Weft
              </ResizableTh>
              <ResizableTh columnKey="rpm" width={widths.rpm} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2}
                className="px-1 text-center">
                RPM
              </ResizableTh>
              <ResizableTh columnKey="reed" width={widths.reed} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2} className="px-1 text-center">
                Reed
              </ResizableTh>
              <ResizableTh columnKey="pick" width={widths.pick} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2} className="px-1 text-center">
                Pick
              </ResizableTh>
              <ResizableTh columnKey="width" width={widths.width} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2} className="px-1 text-center">
                Width
              </ResizableTh>
              <ResizableTh columnKey="gsm" width={widths.gsm} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2}
                className="px-1 text-center"
                style={headerWrap}>
                Grams Per Square Meter
              </ResizableTh>
              <ResizableTh columnKey="roller" width={widths.roller} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2}
                className="px-1 text-center"
                style={headerWrap}>
                Roller Hours
              </ResizableTh>
              <ResizableTh columnKey="run100" width={widths.run100} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2}
                className="px-1 text-center"
                style={headerWrap}>
                100 Percent Running
              </ResizableTh>
              <th colSpan={2} className="text-center px-1" style={{ fontSize: '0.75rem' }}>
                Actual Production
              </th>
              <ResizableTh columnKey="totalAB" width={widths.totalAB} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2}
                className="px-1 text-center"
                style={headerWrap}>
                Actual Total (A Plus B)
              </ResizableTh>
              <ResizableTh columnKey="effRun" width={widths.effRun} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2}
                className="px-1 text-center"
                style={headerWrap}>
                Efficiency Running Percent
              </ResizableTh>
              <ResizableTh columnKey="lossRun" width={widths.lossRun} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2}
                className="px-1 text-center"
                style={headerWrap}>
                Loss Running
              </ResizableTh>
              <ResizableTh columnKey="h24" width={widths.h24} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2}
                className="px-1 text-center"
                style={headerWrap}>
                100 Percent 24 Hours
              </ResizableTh>
              <ResizableTh columnKey="eff24" width={widths.eff24} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2}
                className="px-1 text-center"
                style={headerWrap}>
                Efficiency 24 Hours Percent
              </ResizableTh>
              <ResizableTh columnKey="loss24" width={widths.loss24} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2}
                className="px-1 text-center"
                style={headerWrap}>
                Loss 24 Hours
              </ResizableTh>
              <ResizableTh columnKey="remarks" width={widths.remarks} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2} className="px-2">
                Remarks
              </ResizableTh>
              <ResizableTh columnKey="lot" width={widths.lot} onResize={setColumnWidth} onReset={resetColumnWidth} rowSpan={2} className="px-2">
                Lot Number
              </ResizableTh>
            </tr>
            <tr>
              <ResizableTh columnKey="shiftA" width={widths.shiftA} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
                style={{ fontSize: '0.7rem' }}>
                Shift A
              </ResizableTh>
              <ResizableTh columnKey="shiftB" width={widths.shiftB} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
                style={{ fontSize: '0.7rem' }}>
                Shift B
              </ResizableTh>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.loomNumber}>
                <td className="fw-semibold text-nowrap px-2 text-truncate">{e.loomNumber}</td>
                <td className="px-2 small text-truncate">{e.qualityName}</td>
                <td className="px-2 small text-truncate">{e.fabricType || '—'}</td>
                <td className="px-2 small text-truncate">{e.warpYarn || '—'}</td>
                <td className="px-2 small text-truncate">{e.weftYarn || '—'}</td>
                <td className="text-end px-1">{e.rpm}</td>
                <td className="text-end px-1">{e.reed}</td>
                <td className="text-end px-1">{e.pick}</td>
                <td className="text-end px-1">{e.widthInch}</td>
                <td className="text-end px-1">{e.gsm || '—'}</td>
                <td className="text-end px-1">{num(e.rollerHours, 2)}</td>
                <td className="text-end fw-semibold px-1">{num(e.runningTheoretical)}</td>
                <td className="text-end px-1">{num(e.shiftAMeters)}</td>
                <td className="text-end px-1">{num(e.shiftBMeters)}</td>
                <td className="text-end fw-semibold px-1">{num(e.totalMeters)}</td>
                <td className="text-end px-1">{num(e.efficiencyPercentage, 1)}</td>
                <td className="text-end text-secondary px-1">{num(e.stopLossMeters)}</td>
                <td className="text-end px-1">{num(e.theoretical24h)}</td>
                <td className="text-end px-1">{num(e.efficiency24h, 1)}</td>
                <td className="text-end text-secondary px-1">{num(e.loss24h)}</td>
                <td className="px-2 small text-truncate">{e.remarks || '—'}</td>
                <td className="px-2 small text-truncate">{e.lot || '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="table-light fw-semibold">
            <tr>
              <td colSpan={5} className="px-2">
                Total / Average
              </td>
              <td className="text-end px-1">{num(totals.rpm)}</td>
              <td className="px-1" />
              <td className="text-end px-1">{num(totals.pick)}</td>
              <td colSpan={2} className="px-1" />
              <td className="text-end px-1">{num(totals.roller)}</td>
              <td className="text-end px-1">{num(totals.runningTheo)}</td>
              <td className="text-end px-1">{num(totals.a)}</td>
              <td className="text-end px-1">{num(totals.b)}</td>
              <td className="text-end px-1">{num(totals.ab)}</td>
              <td className="text-end px-1">{(totals.effRun / n).toFixed(0)}</td>
              <td className="text-end px-1">{num(totals.lossRun)}</td>
              <td className="text-end px-1">{num(totals.theo24)}</td>
              <td className="text-end px-1">{(totals.eff24 / n).toFixed(0)}</td>
              <td className="text-end px-1">{num(totals.loss24)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="card-footer small text-secondary">
        Formulas (from production.xlsx): 100% Running = RPM ÷ Pick × 60 ÷
        39.38 × Roller Hours · Actual Total = Actual Shift A + Actual Shift B · Efficiency % =
        Actual Total ÷ 100 Percent × 100 · Loss = 100 Percent − Actual Total · same for 24 Hours
        with Hours = 24
      </div>
    </div>
  )
}
