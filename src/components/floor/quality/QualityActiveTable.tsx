'use client'

import { qualityDisplayName, QUALITY_FABRIC_TYPES, normalizeFabricType, qualityHistoryOnActivePastDay } from '@/services/productionMastersService'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { NumericCellInput, TextCellInput } from '@/components/shared/NumericCellInput'
import { TablePanScroll } from '@/components/shared/TablePanScroll'
import { EmptyPlaceholder } from '@/components/shared/EmptyPlaceholder'
import { DEFAULT_WIDTHS, formatShortDate, LoomListCell } from '@/components/floor/quality/qualityMasterParts'
import type { QualityMasterTableState } from './useQualityMasterTable'

/** Active quality table. */
export function QualityActiveTable({ t }: { t: QualityMasterTableState }) {
  const { onUpdate, sheetDate, qualities, widths, setColumnWidth, resetColumnWidth, qualityStartDay, patchQualityStart, orderedForView, assignedByQuality, productionByQuality, tableMinWidth, opsEdit, editActive, rowClassFor, PastHistoryBadge, rowMenu, openTrack, emptyCopy } = t
  return (
    <TablePanScroll className="card-body p-0">
      <table
        className="table table-sm table-hover mb-0 align-middle text-nowrap"
        style={{ tableLayout: 'fixed', width: tableMinWidth, minWidth: tableMinWidth }}
      >
        <colgroup>
          {Object.keys(DEFAULT_WIDTHS)
            .filter((key) => key !== 'endedOn')
            .map((key) => (
              <col key={key} style={{ width: widths[key] }} />
            ))}
        </colgroup>
        <thead className="table-light">
          <tr>
            <ResizableTh columnKey="sr" width={widths.sr} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center">
              #
            </ResizableTh>
            <ResizableTh columnKey="loom" width={widths.loom} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
              L#
            </ResizableTh>
            <ResizableTh columnKey="name" width={widths.name} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
              Quality Name
            </ResizableTh>
            <ResizableTh columnKey="type" width={widths.type} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
              Fabric Type
            </ResizableTh>
            <ResizableTh columnKey="warp" width={widths.warp} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
              Warp Yarn
            </ResizableTh>
            <ResizableTh columnKey="weft" width={widths.weft} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
              Weft Yarn
            </ResizableTh>
            <ResizableTh columnKey="weavePlan" width={widths.weavePlan} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
              Weave Plan
            </ResizableTh>
            <ResizableTh columnKey="reed" width={widths.reed} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-end">
              Reed
            </ResizableTh>
            <ResizableTh columnKey="pick" width={widths.pick} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-end">
              Pick
            </ResizableTh>
            <ResizableTh columnKey="width" width={widths.width} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-end">
              Width
            </ResizableTh>
            <ResizableTh columnKey="gsm" width={widths.gsm} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-end">
              GSM
            </ResizableTh>
            <ResizableTh columnKey="start" width={widths.start} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1">
              Start
            </ResizableTh>
            <ResizableTh columnKey="production" width={widths.production} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2 text-end">
              Overall
            </ResizableTh>
            <ResizableTh columnKey="actions" width={widths.actions} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
              style={{ fontSize: '0.75rem' }}>
              Action
            </ResizableTh>
          </tr>
        </thead>
        <tbody>
          {orderedForView.length === 0 ? (
            <tr>
              <td colSpan={14} className="p-0 border-0">
                <EmptyPlaceholder
                  icon={emptyCopy.icon}
                  title={emptyCopy.title}
                  hint={emptyCopy.hint}
                  compact
                />
              </td>
            </tr>
          ) : (
          orderedForView.map((q, rowIdx) => {
            const overall = productionByQuality[q.id] || 0
            const pastHistory = qualityHistoryOnActivePastDay(q, sheetDate)
            const rowOpsEdit = opsEdit && !pastHistory

            return (
              <tr
                key={q.id}
                data-quality-row={q.id}
                className={[editActive && !pastHistory ? 'sara-edit-row' : '', rowClassFor(q) || '']
                  .filter(Boolean)
                  .join(' ') || undefined}
              >
                <td className="px-1 text-center text-muted fw-semibold font-monospace" style={{ fontSize: '0.8rem' }}>
                  {rowIdx + 1}
                </td>
                <td className="px-1">
                  <LoomListCell nums={assignedByQuality.get(q.id) || []} />
                </td>
                <td className="px-2">
                  <span className="fw-semibold">{qualityDisplayName(q, qualities)}</span>{' '}
                  <PastHistoryBadge q={q} />
                </td>
                <td className="px-2 text-truncate">
                  {rowOpsEdit ? (
                    <select
                      className="form-select form-select-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={normalizeFabricType(q.fabricType)}
                      onChange={(e) => onUpdate(q.id, { fabricType: e.target.value })}
                    >
                      {QUALITY_FABRIC_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-secondary">{q.fabricType || '—'}</span>
                  )}
                </td>
                <td className="px-1">
                  {rowOpsEdit ? (
                    <TextCellInput
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      list="quality-warp-stock"
                      value={q.warpYarn || ''}
                      navRow={rowIdx}
                      navCol={2}
                      onValueChange={(v) => onUpdate(q.id, { warpYarn: v })}
                    />
                  ) : (
                    <span className="text-secondary text-truncate d-inline-block" style={{ maxWidth: '100%' }}>
                      {q.warpYarn || '—'}
                    </span>
                  )}
                </td>
                <td className="px-1">
                  {rowOpsEdit ? (
                    <TextCellInput
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      list="quality-weft-stock"
                      value={q.weftYarn || ''}
                      navRow={rowIdx}
                      navCol={3}
                      onValueChange={(v) => onUpdate(q.id, { weftYarn: v })}
                    />
                  ) : (
                    <span className="text-secondary text-truncate d-inline-block" style={{ maxWidth: '100%' }}>
                      {q.weftYarn || '—'}
                    </span>
                  )}
                </td>
                <td className="px-1">
                  {rowOpsEdit ? (
                    <TextCellInput
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={q.weavePlan || ''}
                      navRow={rowIdx}
                      navCol={4}
                      onValueChange={(v) => onUpdate(q.id, { weavePlan: v })}
                    />
                  ) : (
                    <span className="text-secondary text-truncate d-inline-block" style={{ maxWidth: '100%' }}>
                      {q.weavePlan || '—'}
                    </span>
                  )}
                </td>
                <td className="px-1">
                  {rowOpsEdit ? (
                    <NumericCellInput
                      className="form-control form-control-sm text-end"
                      style={{ width: '100%', minWidth: 0 }}
                      value={q.reed}
                      navRow={rowIdx}
                      navCol={6}
                      onValueChange={(v) => onUpdate(q.id, { reed: v })}
                    />
                  ) : (
                    <div className="text-end px-1">{q.reed}</div>
                  )}
                </td>
                <td className="px-1">
                  {rowOpsEdit ? (
                    <NumericCellInput
                      className="form-control form-control-sm text-end"
                      style={{ width: '100%', minWidth: 0 }}
                      value={q.pick}
                      navRow={rowIdx}
                      navCol={6}
                      onValueChange={(v) => onUpdate(q.id, { pick: v })}
                    />
                  ) : (
                    <div className="text-end px-1">{q.pick}</div>
                  )}
                </td>
                <td className="px-1">
                  {rowOpsEdit ? (
                    <NumericCellInput
                      className="form-control form-control-sm text-end"
                      style={{ width: '100%', minWidth: 0 }}
                      value={q.widthInch}
                      navRow={rowIdx}
                      navCol={7}
                      onValueChange={(v) => onUpdate(q.id, { widthInch: v })}
                    />
                  ) : (
                    <div className="text-end px-1">{q.widthInch}&quot;</div>
                  )}
                </td>
                <td className="px-1">
                  {rowOpsEdit ? (
                    <NumericCellInput
                      className="form-control form-control-sm text-end"
                      style={{ width: '100%', minWidth: 0 }}
                      value={q.gsm ?? 0}
                      navRow={rowIdx}
                      navCol={8}
                      onValueChange={(v) => onUpdate(q.id, { gsm: Number(Number(v).toFixed(2)) })}
                    />
                  ) : (
                    <div className="text-end px-1 fw-semibold font-monospace">
                      {q.gsm != null && q.gsm !== 0 ? Number(q.gsm).toFixed(2) : '—'}
                    </div>
                  )}
                </td>
                <td className="px-1">
                  {rowOpsEdit ? (
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      style={{ width: '100%', minWidth: 0 }}
                      value={qualityStartDay(q)}
                      title="Start date — is se pehle quality / Track nahi dikhegi"
                      onChange={(e) => patchQualityStart(q, e.target.value)}
                    />
                  ) : (
                    <span className="small text-secondary font-monospace">
                      {qualityStartDay(q) ? formatShortDate(qualityStartDay(q)) : '—'}
                    </span>
                  )}
                </td>
                <td className="px-2 text-end">
                  <span className="fw-bold text-success font-monospace">
                    {overall > 0 ? `${overall.toLocaleString()} m` : '0 m'}
                  </span>
                </td>
                <td className="px-1 text-center">
                  <div className="d-inline-flex align-items-center gap-1">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary py-0"
                      style={{ fontSize: '0.72rem' }}
                      onClick={() => openTrack(q)}
                    >
                      Track
                    </button>
                    {rowMenu(q, true)}
                  </div>
                </td>
              </tr>
            )
          })
          )}
        </tbody>
      </table>
    </TablePanScroll>
  )
}
