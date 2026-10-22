'use client'

import { qualityDisplayName } from '@/services/productionMastersService'
import { TablePanScroll } from '@/components/shared/TablePanScroll'
import { EmptyPlaceholder } from '@/components/shared/EmptyPlaceholder'
import { formatShortDate } from '@/components/floor/quality/qualityMasterParts'
import type { QualityMasterTableState } from './useQualityMasterTable'

/** Archive (Hold / Ends) table. */
export function QualityArchiveTable({ t }: { t: QualityMasterTableState }) {
  const { sheetDate, qualities, tableEdit, qualityStartDay, patchQualityStart, isHoldView, orderedForView, productionByQuality, canArchiveOps, rowClassFor, PastHistoryBadge, archiveAction, openTrack, emptyCopy } = t
  return (
    <TablePanScroll className="card-body p-0">
      <table className="table table-sm table-hover mb-0 align-middle">
        <thead className="table-light">
          <tr>
            <th className="px-2 text-center" style={{ width: 46 }}>
              #
            </th>
            <th className="px-2">Quality Name</th>
            <th className="px-2">Type</th>
            <th className="px-2">Warp Yarn</th>
            <th className="px-2">Weft Yarn</th>
            <th className="px-2">Weave Plan</th>
            <th className="px-2 text-end">Reed</th>
            <th className="px-2 text-end">Pick</th>
            <th className="px-2 text-end">Width</th>
            <th className="px-2 text-end">GSM</th>
            <th className="px-2">Start</th>
            <th className="px-2 text-end">Overall</th>
            <th className="px-2" style={{ width: 110 }}>
              {isHoldView ? 'Held On' : 'Ended On'}
            </th>
            <th className="px-2 text-center" style={{ width: 140 }}>
              Action
            </th>
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
              return (
              <tr key={q.id} data-quality-row={q.id} className={rowClassFor(q)}>
                <td className="px-2 text-center text-muted fw-semibold font-monospace">{rowIdx + 1}</td>
                <td className="px-2 fw-semibold">
                  {qualityDisplayName(q, qualities)}{' '}
                  <PastHistoryBadge q={q} />
                </td>
                <td className="px-2 text-secondary">{q.fabricType || '—'}</td>
                <td className="px-2 small">{q.warpYarn || '—'}</td>
                <td className="px-2 small">{q.weftYarn || '—'}</td>
                <td className="px-2 small">{q.weavePlan || '—'}</td>
                <td className="px-2 text-end font-monospace">{q.reed || '—'}</td>
                <td className="px-2 text-end font-monospace">{q.pick || '—'}</td>
                <td className="px-2 text-end font-monospace">{q.widthInch ? `${q.widthInch}"` : '—'}</td>
                <td className="px-2 text-end font-monospace">
                  {q.gsm != null && q.gsm !== 0 ? Number(q.gsm).toFixed(2) : '—'}
                </td>
                <td className="px-2">
                  {canArchiveOps && tableEdit ? (
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      style={{ width: 140 }}
                      value={qualityStartDay(q)}
                      title="Start date — is se pehle quality / Track nahi dikhegi"
                      onChange={(e) => patchQualityStart(q, e.target.value)}
                    />
                  ) : (
                    <span className="small font-monospace">
                      {qualityStartDay(q) ? formatShortDate(qualityStartDay(q)) : '—'}
                    </span>
                  )}
                </td>
                <td className="px-2 text-end">
                  <span className="fw-bold text-success font-monospace">
                    {overall > 0 ? `${overall.toLocaleString()} m` : '0 m'}
                  </span>
                </td>
                <td className="px-2 font-monospace small">{formatShortDate(q.endedOn || sheetDate)}</td>
                <td className="px-2 text-center">
                  <div className="d-inline-flex align-items-center gap-1">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary py-0"
                      style={{ fontSize: '0.72rem' }}
                      onClick={() => openTrack(q)}
                    >
                      Track
                    </button>
                    {archiveAction(q, true)}
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
