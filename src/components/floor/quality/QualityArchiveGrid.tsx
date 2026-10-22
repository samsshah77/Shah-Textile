'use client'

import { qualityDisplayName } from '@/services/productionMastersService'
import { EmptyPlaceholder } from '@/components/shared/EmptyPlaceholder'
import { formatShortDate } from '@/components/floor/quality/qualityMasterParts'
import type { QualityMasterTableState } from './useQualityMasterTable'

/** Archive (Hold / Ends) cards. */
export function QualityArchiveGrid({ t }: { t: QualityMasterTableState }) {
  const { sheetDate, qualities, tableEdit, qualityStartDay, patchQualityStart, isHoldView, orderedForView, productionByQuality, canArchiveOps, rowClassFor, PastHistoryBadge, archiveAction, openTrack, emptyCopy } = t
  return (
    <div className="card-body p-3">
      {orderedForView.length === 0 ? (
        <EmptyPlaceholder
          icon={emptyCopy.icon}
          title={emptyCopy.title}
          hint={emptyCopy.hint}
        />
      ) : (
        <ul className="list-group list-group-flush">
          {orderedForView.map((q, rowIdx) => {
            const overall = productionByQuality[q.id] || 0
            return (
            <li
              key={q.id}
              data-quality-row={q.id}
              className={`list-group-item d-flex flex-column gap-2 px-0 ${rowClassFor(q) || ''}`}
            >
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                <div className="d-flex align-items-center gap-2 min-w-0">
                  <span className="badge bg-secondary-subtle text-secondary font-monospace">
                    #{rowIdx + 1}
                  </span>
                  <span className="fw-semibold text-truncate">{qualityDisplayName(q, qualities)}</span>
                  <PastHistoryBadge q={q} />
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className="small fw-bold text-success font-monospace">
                    {overall > 0 ? `${overall.toLocaleString()} m` : '0 m'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary py-0"
                    style={{ fontSize: '0.72rem' }}
                    onClick={() => openTrack(q)}
                  >
                    Track
                  </button>
                  {archiveAction(q)}
                </div>
              </div>
              <div className="small text-muted ps-4 d-flex flex-wrap gap-x-3 gap-y-1 align-items-center">
                <span>{q.fabricType || '—'}</span>
                <span>Warp: {q.warpYarn || '—'}</span>
                <span>Weft: {q.weftYarn || '—'}</span>
                <span>Weave: {q.weavePlan || '—'}</span>
                <span>Reed: {q.reed || '—'}</span>
                <span>Pick: {q.pick || '—'}</span>
                <span>Width: {q.widthInch ? `${q.widthInch}"` : '—'}</span>
                <span>
                  GSM:{' '}
                  {q.gsm != null && q.gsm !== 0 ? Number(q.gsm).toFixed(2) : '—'}
                </span>
                <span className="d-inline-flex align-items-center gap-1">
                  Start:
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
                    <span>{qualityStartDay(q) ? formatShortDate(qualityStartDay(q)) : '—'}</span>
                  )}
                </span>
                <span>
                  {isHoldView ? 'Held' : 'Ended'}: {formatShortDate(q.endedOn || sheetDate)}
                </span>
              </div>
            </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
