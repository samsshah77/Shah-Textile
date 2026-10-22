'use client'

import { QUALITY_FABRIC_TYPES, normalizeFabricType, qualityHistoryOnActivePastDay } from '@/services/productionMastersService'
import { NumericCellInput, TextCellInput } from '@/components/shared/NumericCellInput'
import { EmptyPlaceholder } from '@/components/shared/EmptyPlaceholder'
import { formatShortDate, LoomListCell } from '@/components/floor/quality/qualityMasterParts'
import type { QualityMasterTableState } from './useQualityMasterTable'

/** Active quality cards. */
export function QualityActiveGrid({ t }: { t: QualityMasterTableState }) {
  const { onUpdate, sheetDate, qualityStartDay, patchQualityStart, orderedForView, assignedByQuality, productionByQuality, masterEdit, editActive, handleDelete, rowClassFor, PastHistoryBadge, rowMenu, openTrack, emptyCopy } = t
  return (
    <div className="master-grid">
      {orderedForView.length === 0 ? (
        <div className="w-100">
          <EmptyPlaceholder
            icon={emptyCopy.icon}
            title={emptyCopy.title}
            hint={emptyCopy.hint}
          />
        </div>
      ) : (
      orderedForView.map((q, rowIdx) => {
        const overall = productionByQuality[q.id] || 0
        const pastHistory = qualityHistoryOnActivePastDay(q, sheetDate)
        const rowMasterEdit = masterEdit && !pastHistory

        return (
          <div
            key={q.id}
            data-quality-row={q.id}
            className={[
              'master-grid-card',
              editActive && !pastHistory ? 'sara-edit-card' : '',
              rowClassFor(q) || '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="d-flex align-items-center justify-content-between">
              <div className="fw-semibold d-flex align-items-center gap-1.5 min-w-0">
                <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '0.74rem' }}>
                  #{rowIdx + 1}
                </span>
                <span className="text-truncate">{q.name || '—'}</span>
                <PastHistoryBadge q={q} />
              </div>
              {rowMasterEdit && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger p-0"
                  style={{
                    width: 24,
                    height: 24,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 4,
                  }}
                  title={`Delete ${q.name}`}
                  onClick={() => handleDelete(q)}
                >
                  <i className="bi bi-trash" style={{ fontSize: '0.70rem' }} />
                </button>
              )}
            </div>

            <label className="small mb-0">Looms</label>
            <LoomListCell nums={assignedByQuality.get(q.id) || []} />

            {rowMasterEdit && (
              <>
                <label className="small mb-0">Quality Name</label>
                <TextCellInput
                  className="form-control form-control-sm"
                  value={q.name}
                  navRow={rowIdx}
                  navCol={0}
                  onValueChange={(v) => onUpdate(q.id, { name: v })}
                />
              </>
            )}

            <label className="small mb-0">Fabric Type</label>
            {rowMasterEdit ? (
              <select
                className="form-select form-select-sm"
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
              <div className="small text-secondary">{q.fabricType || '—'}</div>
            )}

            <label className="small mb-0">Start</label>
            {rowMasterEdit ? (
              <input
                type="date"
                className="form-control form-control-sm"
                value={qualityStartDay(q)}
                title="Start date — is se pehle quality / Track nahi dikhegi"
                onChange={(e) => patchQualityStart(q, e.target.value)}
              />
            ) : (
              <div className="small text-secondary">
                {qualityStartDay(q) ? formatShortDate(qualityStartDay(q)) : '—'}
              </div>
            )}

            <div className="d-flex gap-2">
              <div className="flex-fill">
                <label className="small mb-0">Warp Yarn</label>
                {rowMasterEdit ? (
                  <TextCellInput
                    className="form-control form-control-sm"
                    list="quality-warp-stock"
                    value={q.warpYarn || ''}
                    navRow={rowIdx}
                    navCol={2}
                    onValueChange={(v) => onUpdate(q.id, { warpYarn: v })}
                  />
                ) : (
                  <div className="small text-secondary">{q.warpYarn || '—'}</div>
                )}
              </div>
              <div className="flex-fill">
                <label className="small mb-0">Weft Yarn</label>
                {rowMasterEdit ? (
                  <TextCellInput
                    className="form-control form-control-sm"
                    list="quality-weft-stock"
                    value={q.weftYarn || ''}
                    navRow={rowIdx}
                    navCol={3}
                    onValueChange={(v) => onUpdate(q.id, { weftYarn: v })}
                  />
                ) : (
                  <div className="small text-secondary">{q.weftYarn || '—'}</div>
                )}
              </div>
            </div>

            <label className="small mb-0">Weave Plan</label>
            {rowMasterEdit ? (
              <TextCellInput
                className="form-control form-control-sm"
                value={q.weavePlan || ''}
                navRow={rowIdx}
                navCol={4}
                onValueChange={(v) => onUpdate(q.id, { weavePlan: v })}
              />
            ) : (
              <div className="small">{q.weavePlan || '—'}</div>
            )}

            <div className="d-flex gap-2">
              <div className="flex-fill">
                <label className="small mb-0">Reed</label>
                {rowMasterEdit ? (
                  <NumericCellInput
                    className="form-control form-control-sm text-end"
                    value={q.reed}
                    navRow={rowIdx}
                    navCol={6}
                    onValueChange={(v) => onUpdate(q.id, { reed: v })}
                  />
                ) : (
                  <div className="small">{q.reed}</div>
                )}
              </div>
              <div className="flex-fill">
                <label className="small mb-0">Pick</label>
                {rowMasterEdit ? (
                  <NumericCellInput
                    className="form-control form-control-sm text-end"
                    value={q.pick}
                    navRow={rowIdx}
                    navCol={6}
                    onValueChange={(v) => onUpdate(q.id, { pick: v })}
                  />
                ) : (
                  <div className="small">{q.pick}</div>
                )}
              </div>
              <div className="flex-fill">
                <label className="small mb-0">Width</label>
                {rowMasterEdit ? (
                  <NumericCellInput
                    className="form-control form-control-sm text-end"
                    value={q.widthInch}
                    navRow={rowIdx}
                    navCol={7}
                    onValueChange={(v) => onUpdate(q.id, { widthInch: v })}
                  />
                ) : (
                  <div className="small">{q.widthInch}&quot;</div>
                )}
              </div>
            </div>

            <label className="small mb-0">GSM</label>
            {rowMasterEdit ? (
              <NumericCellInput
                className="form-control form-control-sm text-end"
                value={q.gsm ?? 0}
                navRow={rowIdx}
                navCol={8}
                onValueChange={(v) => onUpdate(q.id, { gsm: Number(Number(v).toFixed(2)) })}
              />
            ) : (
              <div className="small fw-semibold font-monospace">
                {q.gsm != null && q.gsm !== 0 ? Number(q.gsm).toFixed(2) : '—'}
              </div>
            )}

            <div className="d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
              <span className="small text-muted">Overall:</span>
              <span className="small fw-bold text-success font-monospace">
                {overall > 0 ? `${overall.toLocaleString()} m` : '0 m'}
              </span>
            </div>

            <div className="d-flex gap-1 mt-2 align-items-center">
              <button
                type="button"
                className="btn btn-sm btn-outline-primary flex-fill"
                onClick={() => openTrack(q)}
              >
                Track
              </button>
              {rowMenu(q)}
            </div>

          </div>
        )
      })
      )}
    </div>
  )
}
