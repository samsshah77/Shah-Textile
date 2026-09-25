'use client'

import { Fragment, useMemo, type CSSProperties } from 'react'
import { DailyLoomProductionEntry } from '@/types/production'
import type { LoomCategory } from '@/types/loom'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { loomConditionRowStyle, LOOM_STATUS_LABEL, resolveLoomCondition } from '@/constants/loomConditions'
import { formatProductionDayLabel, productionDayName } from '@/constants/productionCalendar'

interface ProductionSheetTableProps {
  entries: DailyLoomProductionEntry[]
  sheetDate?: string
}

function num(n: number | undefined, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatSheetDate(dateStr: string) {
  try {
    const d = new Date(`${dateStr}T12:00:00`)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  } catch {
    return dateStr
  }
}

/** Excel Production sheet order: G6200 (1–20) → G6300 (27–34) → PU (21–26) */
const MODEL_ORDER: LoomCategory[] = ['G6200', 'G6300', 'PU']

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
  lMid: 40,
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
  lEnd: 40,
  lot: 90,
}

const COL_COUNT = Object.keys(DEFAULT_WIDTHS).length

/** Left block through mid L# separator (Loom…Gsm + L#) */
const LEFT_COLS = 11
/** Metric block: Roller → Loss 24h */
const METRIC_COLS = 10

const headerWrap: CSSProperties = {
  whiteSpace: 'normal',
  lineHeight: 1.15,
  fontSize: '0.7rem',
}

const gapCellStyle: CSSProperties = {
  background: 'rgba(13, 110, 253, 0.08)',
  borderColor: 'var(--bs-border-color)',
}

const modelBandStyle: CSSProperties = {
  background: 'var(--bs-secondary-bg, #e9ecef)',
}

const lSepStyle: CSSProperties = {
  background: 'rgba(13, 110, 253, 0.12)',
  fontSize: '0.75rem',
}

type SectionTotals = {
  rpm: number
  pick: number
  roller: number
  runningTheo: number
  a: number
  b: number
  ab: number
  lossRun: number
  theo24: number
  loss24: number
  effRun: number
  eff24: number
  count: number
}

function sumSection(rows: DailyLoomProductionEntry[]): SectionTotals {
  return rows.reduce(
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
      acc.count += 1
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
      count: 0,
    }
  )
}

function modelOf(e: DailyLoomProductionEntry): LoomCategory {
  const c = (e.category || e.model || 'G6200') as LoomCategory
  return MODEL_ORDER.includes(c) ? c : 'G6200'
}

/** Excel-style model banner: G6200 | gap | Roller · 100% · Actual… */
function ModelSectionHeader({ model }: { model: LoomCategory }) {
  const metricLabels = [
    'Roller',
    '100%',
    'Actual',
    'Actual',
    'A+B',
    'Efficiency',
    'Loss',
    '100%',
    'Efficiency',
    'Loss',
  ]
  return (
    <tr className="prod-sheet-model-head">
      <td
        colSpan={2}
        className="fw-semibold px-2 py-1 text-uppercase align-middle text-center"
        style={{ ...modelBandStyle, fontSize: '0.75rem', letterSpacing: '0.04em' }}
      >
        {model}
      </td>
      {Array.from({ length: LEFT_COLS - 2 }).map((_, i) => (
        <td key={`gap-${i}`} className="p-0" style={gapCellStyle} />
      ))}
      {metricLabels.map((label, i) => (
        <td
          key={`m-${i}`}
          className="text-center fw-semibold px-1 py-1 align-middle"
          style={{ ...modelBandStyle, fontSize: '0.7rem', lineHeight: 1.1 }}
        >
          {label}
        </td>
      ))}
      <td colSpan={COL_COUNT - LEFT_COLS - METRIC_COLS} style={modelBandStyle} />
    </tr>
  )
}

/** Excel section total row at end of each model block */
function ModelSectionTotal({ totals }: { totals: SectionTotals }) {
  const n = totals.count || 1
  return (
    <tr className="prod-sheet-section-total" style={{ fontWeight: 600 }}>
      <td colSpan={5} className="px-2 small text-secondary">
        {/* blank like Excel — numbers start at RPM */}
      </td>
      <td className="text-end px-1">{num(totals.rpm)}</td>
      <td className="px-1" />
      <td className="text-end px-1">{num(totals.pick)}</td>
      <td className="px-1" />
      <td className="px-1" />
      <td className="text-center px-1" style={lSepStyle} />
      <td className="text-end px-1">{num(totals.roller)}</td>
      <td className="text-end px-1">{num(totals.runningTheo)}</td>
      <td className="text-end px-1">{num(totals.a)}</td>
      <td className="text-end px-1">{num(totals.b)}</td>
      <td className="text-end px-1">{num(totals.ab)}</td>
      <td className="text-end px-1">{Math.round(totals.effRun / n)}</td>
      <td className="text-end px-1">{num(totals.lossRun)}</td>
      <td className="text-end px-1">{num(totals.theo24)}</td>
      <td className="text-end px-1">{Math.round(totals.eff24 / n)}</td>
      <td className="text-end px-1">{num(totals.loss24)}</td>
      <td className="px-1" />
      <td className="text-center px-1" style={lSepStyle} />
      <td className="px-1" />
    </tr>
  )
}

/** Read-only Excel Production sheet — all values auto from masters + Daily Entry. */
export function ProductionSheetTable({ entries, sheetDate }: ProductionSheetTableProps) {
  const { widths, setColumnWidth, resetAllWidths, resetColumnWidth } = useResizableColumns(
    'sara_prod_sheet_col_widths_v1',
    DEFAULT_WIDTHS
  )

  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  )

  const activeDate = sheetDate || entries[0]?.date || ''

  const modelGroups = useMemo(() => {
    const buckets = new Map<LoomCategory, DailyLoomProductionEntry[]>()
    for (const m of MODEL_ORDER) buckets.set(m, [])
    for (const e of entries) {
      buckets.get(modelOf(e))!.push(e)
    }
    for (const list of buckets.values()) {
      list.sort((a, b) => a.loomNumber - b.loomNumber)
    }
    return MODEL_ORDER.map((model) => ({
      model,
      rows: buckets.get(model) || [],
    })).filter((g) => g.rows.length > 0)
  }, [entries])

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
    <div className="card sara-prod-sheet-print">
      <div className="card-header d-flex flex-row flex-wrap gap-2 justify-content-between align-items-center print:hidden">
        <div className="min-w-0">
          <h3 className="card-title mb-0">Production Sheet</h3>
          {activeDate ? (
            <div className="small text-secondary">{formatProductionDayLabel(activeDate)}</div>
          ) : null}
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center ms-auto">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={resetAllWidths}>
            Reset columns
          </button>
        </div>
      </div>
      <div
        className="card-body p-0 sara-prod-sheet-print__body"
        style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
      >
        <table
          className="table table-sm table-bordered table-hover mb-0 align-middle sara-prod-sheet-print__table"
          style={{ tableLayout: 'fixed', width: tableMinWidth, minWidth: tableMinWidth }}
        >
          <colgroup>
            {Object.keys(DEFAULT_WIDTHS).map((key) => (
              <col key={key} style={{ width: widths[key] }} />
            ))}
          </colgroup>
          <thead>
            {/* Excel row 1: mill title (hidden in PDF — PrintBrandHeader already shows brand) */}
            <tr className="print:hidden d-print-none">
              <th
                colSpan={COL_COUNT}
                className="text-center fw-bold py-2 border-bottom-0"
                style={{
                  fontSize: '0.95rem',
                  letterSpacing: '0.08em',
                  background: '#fff',
                }}
              >
                SARA TEXTILE
              </th>
            </tr>
            {/* Excel row 2: date + weekday */}
            <tr className="table-light">
              <th colSpan={2} className="px-3 py-1 fw-semibold text-nowrap" style={{ fontSize: '0.75rem' }}>
                {activeDate ? formatSheetDate(activeDate) : '—'}
              </th>
              <th colSpan={2} className="px-2 py-1 fw-semibold" style={{ fontSize: '0.75rem' }}>
                {activeDate ? productionDayName(activeDate) : '—'}
              </th>
              <th colSpan={COL_COUNT - 4} className="border-start-0" />
            </tr>
            {/* Column titles (Excel detail headers) */}
            <tr className="table-light">
              <ResizableTh
                columnKey="loom"
                width={widths.loom}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="text-nowrap px-2"
              >
                L#
              </ResizableTh>
              <ResizableTh
                columnKey="quality"
                width={widths.quality}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-2"
              >
                Quality Name
              </ResizableTh>
              <ResizableTh
                columnKey="type"
                width={widths.type}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-2"
              >
                Type
              </ResizableTh>
              <ResizableTh
                columnKey="warp"
                width={widths.warp}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-2"
              >
                Warp
              </ResizableTh>
              <ResizableTh
                columnKey="weft"
                width={widths.weft}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-2"
              >
                Weft
              </ResizableTh>
              <ResizableTh
                columnKey="rpm"
                width={widths.rpm}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-1 text-center"
              >
                Rpm
              </ResizableTh>
              <ResizableTh
                columnKey="reed"
                width={widths.reed}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-1 text-center"
              >
                Reed
              </ResizableTh>
              <ResizableTh
                columnKey="pick"
                width={widths.pick}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-1 text-center"
              >
                Pick
              </ResizableTh>
              <ResizableTh
                columnKey="width"
                width={widths.width}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-1 text-center"
              >
                Width
              </ResizableTh>
              <ResizableTh
                columnKey="gsm"
                width={widths.gsm}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-1 text-center"
              >
                Gsm
              </ResizableTh>
              <ResizableTh
                columnKey="lMid"
                width={widths.lMid}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-1 text-center"
                style={lSepStyle}
              >
                L#
              </ResizableTh>
              <ResizableTh
                columnKey="roller"
                width={widths.roller}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-1 text-center"
                style={headerWrap}
              >
                Hours
              </ResizableTh>
              <ResizableTh
                columnKey="run100"
                width={widths.run100}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-1 text-center"
                style={headerWrap}
              >
                Running
              </ResizableTh>
              <th colSpan={2} className="text-center px-1" style={{ fontSize: '0.75rem' }}>
                Actual
              </th>
              <ResizableTh
                columnKey="totalAB"
                width={widths.totalAB}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-1 text-center"
              >
                Total
              </ResizableTh>
              <ResizableTh
                columnKey="effRun"
                width={widths.effRun}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-1 text-center"
                style={headerWrap}
              >
                Running H
              </ResizableTh>
              <ResizableTh
                columnKey="lossRun"
                width={widths.lossRun}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-1 text-center"
              >
                Running
              </ResizableTh>
              <ResizableTh
                columnKey="h24"
                width={widths.h24}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-1 text-center"
                style={headerWrap}
              >
                24 Hours
              </ResizableTh>
              <ResizableTh
                columnKey="eff24"
                width={widths.eff24}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-1 text-center"
                style={headerWrap}
              >
                24 Hours
              </ResizableTh>
              <ResizableTh
                columnKey="loss24"
                width={widths.loss24}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-1 text-center"
                style={headerWrap}
              >
                24 Hours
              </ResizableTh>
              <ResizableTh
                columnKey="remarks"
                width={widths.remarks}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-2"
              >
                Remarks
              </ResizableTh>
              <ResizableTh
                columnKey="lEnd"
                width={widths.lEnd}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-1 text-center"
                style={lSepStyle}
              >
                L#
              </ResizableTh>
              <ResizableTh
                columnKey="lot"
                width={widths.lot}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                rowSpan={2}
                className="px-2"
              >
                SW #
              </ResizableTh>
            </tr>
            <tr className="table-light">
              <ResizableTh
                columnKey="shiftA"
                width={widths.shiftA}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                className="px-1 text-center"
                style={{ fontSize: '0.7rem' }}
              >
                A
              </ResizableTh>
              <ResizableTh
                columnKey="shiftB"
                width={widths.shiftB}
                onResize={setColumnWidth}
                onReset={resetColumnWidth}
                className="px-1 text-center"
                style={{ fontSize: '0.7rem' }}
              >
                B
              </ResizableTh>
            </tr>
          </thead>
          <tbody>
            {modelGroups.map(({ model, rows }, groupIndex) => (
              <Fragment key={model}>
                {groupIndex > 0 && (
                  <>
                    <tr className="prod-sheet-gap" aria-hidden>
                      <td
                        colSpan={COL_COUNT}
                        className="border-0 bg-body p-0"
                        style={{ height: 16 }}
                      />
                    </tr>
                    <tr className="prod-sheet-gap" aria-hidden>
                      <td
                        colSpan={COL_COUNT}
                        className="border-0 bg-body p-0"
                        style={{ height: 10 }}
                      />
                    </tr>
                  </>
                )}
                <ModelSectionHeader model={model} />
                {rows.map((e) => {
                  const condition = resolveLoomCondition(e.status, e.remarks)
                  const rowStyle = loomConditionRowStyle(e.status, e.remarks)
                  const remarkText =
                    e.remarks?.trim() ||
                    (condition !== 'RUNNING' ? LOOM_STATUS_LABEL[condition] : '—')
                  return (
                    <tr
                      key={e.loomNumber}
                      className={condition !== 'RUNNING' ? 'prod-sheet-row--issue' : undefined}
                      style={rowStyle}
                      title={
                        condition !== 'RUNNING'
                          ? `Condition: ${LOOM_STATUS_LABEL[condition]}`
                          : undefined
                      }
                    >
                      <td className="fw-semibold text-nowrap px-2 text-truncate">{e.loomNumber}</td>
                      <td className="px-2 small text-truncate">{e.qualityName}</td>
                      <td className="px-2 small text-truncate">{e.fabricType || '—'}</td>
                      <td className="px-2 small text-truncate">{e.warpYarn || '—'}</td>
                      <td className="px-2 small text-truncate">{e.weftYarn || '—'}</td>
                      <td className="text-end px-1">{e.rpm}</td>
                      <td className="text-end px-1">{e.reed}</td>
                      <td className="text-end px-1">{e.pick}</td>
                      <td className="text-end px-1">{e.widthInch}</td>
                      <td className="text-end px-1">
                        {typeof e.gsm === 'number' && e.gsm > 0 ? e.gsm.toFixed(2) : e.gsm || '—'}
                      </td>
                      <td className="text-center px-1 fw-semibold" style={lSepStyle}>
                        {e.loomNumber}
                      </td>
                      <td className="text-end px-1">{num(e.rollerHours, 2)}</td>
                      <td className="text-end fw-semibold px-1">{num(e.runningTheoretical)}</td>
                      <td className="text-end px-1">{num(e.shiftAMeters)}</td>
                      <td className="text-end px-1">{num(e.shiftBMeters)}</td>
                      <td className="text-end fw-semibold px-1">{num(e.totalMeters)}</td>
                      <td className="text-end px-1">{num(e.efficiencyPercentage, 0)}</td>
                      <td className="text-end text-secondary px-1">{num(e.stopLossMeters)}</td>
                      <td className="text-end px-1">{num(e.theoretical24h)}</td>
                      <td className="text-end px-1">{num(e.efficiency24h, 0)}</td>
                      <td className="text-end text-secondary px-1">{num(e.loss24h)}</td>
                      <td className="px-2 small text-truncate fw-semibold">{remarkText}</td>
                      <td className="text-center px-1 fw-semibold" style={lSepStyle}>
                        {e.loomNumber}
                      </td>
                      <td className="px-2 small text-truncate">{e.lot || '—'}</td>
                    </tr>
                  )
                })}
                <ModelSectionTotal totals={sumSection(rows)} />
              </Fragment>
            ))}
          </tbody>
          <tfoot className="table-light" style={{ fontWeight: 600 }}>
            <tr>
              <td colSpan={5} className="px-2">
                Total / Average
              </td>
              <td className="text-end px-1">{num(totals.rpm)}</td>
              <td className="px-1" />
              <td className="text-end px-1">{num(totals.pick)}</td>
              <td colSpan={2} className="px-1" />
              <td className="text-center px-1" style={lSepStyle} />
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
              <td className="px-1" />
              <td className="text-center px-1" style={lSepStyle} />
              <td className="px-1" />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="card-footer small text-secondary print:hidden">
        Formulas: 100% Running = RPM ÷ Pick × 60 ÷ 39.38 × Roller Hours · A+B = A + B · Efficiency % =
        A+B ÷ 100% × 100 · Loss = 100% − A+B (same for 24 Hours with Hours = 24)
      </div>
    </div>
  )
}
