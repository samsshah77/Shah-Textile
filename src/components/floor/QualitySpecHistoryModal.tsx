'use client'

import React from 'react'
import type { QualityMaster, QualitySpecChange } from '@/services/productionMastersService'
import { PRODUCTION_START } from '@/constants/productionCalendar'

interface QualitySpecHistoryModalProps {
  quality: QualityMaster | null
  onClose: () => void
}

function formatDate(d?: string | null) {
  if (!d) return '—'
  try {
    const parsed = new Date(`${d.slice(0, 10)}T12:00:00`)
    return parsed.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return d
  }
}

export function QualitySpecHistoryModal({ quality, onClose }: QualitySpecHistoryModalProps) {
  if (!quality) return null

  // Collect history records in chronological order
  const rawHistory: QualitySpecChange[] = Array.isArray(quality.specHistory) && quality.specHistory.length > 0
    ? [...quality.specHistory]
    : [
        {
          from: quality.createdOn ? String(quality.createdOn).slice(0, 10) : PRODUCTION_START,
          pick: Number(quality.pick) || 60,
          reed: Number(quality.reed) || 60,
          widthInch: Number(quality.widthInch) || 66,
          gsm: Number(quality.gsm) || 0,
          warpYarn: quality.warpYarn || '',
          weftYarn: quality.weftYarn || '',
          weavePlan: quality.weavePlan || '',
        },
      ]

  rawHistory.sort((a, b) => a.from.localeCompare(b.from))

  return (
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 1060,
      }}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-dialog-scrollable mx-2 mx-sm-auto my-3"
        style={{ maxWidth: 760, width: '100%' }}
      >
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '14px', overflow: 'hidden' }}>
          {/* Header */}
          <div className="modal-header bg-light border-bottom py-3 px-4 d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-2">
              <div
                className="d-flex align-items-center justify-content-center rounded-circle bg-primary-subtle text-primary"
                style={{ width: 38, height: 38 }}
              >
                <i className="bi bi-clock-history fs-5" />
              </div>
              <div>
                <h5 className="modal-title mb-0 fw-bold">{quality.name}</h5>
                <span className="small text-secondary">
                  {quality.fabricType || 'Suiting'} · Specification &amp; Pick History
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              onClick={onClose}
            />
          </div>

          {/* Body */}
          <div className="modal-body p-4 space-y-4">
            {/* Informative Note */}
            <div className="alert alert-info py-2 px-3 small d-flex align-items-start gap-2 mb-3">
              <i className="bi bi-shield-check text-info fs-6 mt-0.5" />
              <div>
                <strong>Date-Wise Specification Lock:</strong> Jab bhi pick ya width change hoti hai, system effective date ke sath naya version banata hai. Pichli tareekhon ka theoretical meters aur efficiency pichli pick ke mutabiq calculate rehta hai aur overwrite nahi hota.
              </div>
            </div>

            {/* Current Summary KPIs */}
            <div className="row g-2 mb-3">
              <div className="col-3">
                <div className="p-2 border rounded bg-light text-center">
                  <div className="text-secondary small">Latest Pick</div>
                  <div className="fs-5 fw-bold text-primary font-monospace">{quality.pick}</div>
                </div>
              </div>
              <div className="col-3">
                <div className="p-2 border rounded bg-light text-center">
                  <div className="text-secondary small">Reed</div>
                  <div className="fs-5 fw-bold text-dark font-monospace">{quality.reed}</div>
                </div>
              </div>
              <div className="col-3">
                <div className="p-2 border rounded bg-light text-center">
                  <div className="text-secondary small">Width</div>
                  <div className="fs-5 fw-bold text-dark font-monospace">{quality.widthInch}&quot;</div>
                </div>
              </div>
              <div className="col-3">
                <div className="p-2 border rounded bg-light text-center">
                  <div className="text-secondary small">GSM</div>
                  <div className="fs-5 fw-bold text-dark font-monospace">
                    {quality.gsm ? Number(quality.gsm).toFixed(2) : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Versions Timeline Table */}
            <div className="border rounded overflow-hidden">
              <table className="table table-sm table-hover mb-0 align-middle">
                <thead className="table-light small">
                  <tr>
                    <th className="px-3 py-2 text-center" style={{ width: 60 }}>Ver</th>
                    <th className="px-3 py-2">Effective From</th>
                    <th className="px-3 py-2">Active Range</th>
                    <th className="px-3 py-2 text-end">Pick</th>
                    <th className="px-3 py-2 text-end">Reed</th>
                    <th className="px-3 py-2 text-end">Width</th>
                    <th className="px-3 py-2 text-end">GSM</th>
                    <th className="px-3 py-2">Warp / Weft</th>
                  </tr>
                </thead>
                <tbody className="small">
                  {rawHistory.map((item, idx) => {
                    const isLatest = idx === rawHistory.length - 1
                    const nextItem = rawHistory[idx + 1]
                    const rangeText = nextItem
                      ? `${formatDate(item.from)} → ${formatDate(nextItem.from)}`
                      : `${formatDate(item.from)} → Present (Active)`

                    const pickChanged = idx > 0 && rawHistory[idx - 1].pick !== item.pick

                    return (
                      <tr key={idx} className={isLatest ? 'table-success bg-opacity-25' : undefined}>
                        <td className="px-3 py-2 text-center font-monospace fw-bold text-muted">
                          v{idx + 1}
                        </td>
                        <td className="px-3 py-2 font-monospace fw-semibold">
                          {formatDate(item.from)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`badge ${isLatest ? 'text-bg-success' : 'text-bg-secondary'}`}>
                            {rangeText}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-end font-monospace fw-bold">
                          <span className={pickChanged ? 'text-danger fw-bold' : ''}>
                            {item.pick}
                          </span>
                          {pickChanged && (
                            <i className="bi bi-arrow-up-right ms-1 text-danger small" title="Pick changed" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-end font-monospace">{item.reed}</td>
                        <td className="px-3 py-2 text-end font-monospace">{item.widthInch}&quot;</td>
                        <td className="px-3 py-2 text-end font-monospace">
                          {item.gsm ? Number(item.gsm).toFixed(2) : '—'}
                        </td>
                        <td className="px-3 py-2 text-truncate" style={{ maxWidth: 160 }}>
                          {(item.warpYarn || item.weftYarn) ? (
                            <span>
                              {item.warpYarn || '—'} / {item.weftYarn || '—'}
                            </span>
                          ) : (
                            <span className="text-secondary">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer bg-light border-top py-2 px-4 d-flex justify-content-between align-items-center">
            <span className="small text-secondary">
              Total {rawHistory.length} specification version{rawHistory.length === 1 ? '' : 's'} recorded.
            </span>
            <button type="button" className="btn btn-sm btn-primary px-4" onClick={onClose}>
              Theek Hai / Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
