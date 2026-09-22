'use client'

import { useState, useEffect } from 'react'
import { YarnMaster } from '@/services/productionMastersService'
import { PRODUCTION_TODAY } from '@/constants/productionCalendar'

interface IssueYarnModalProps {
  yarn: YarnMaster | null
  isOpen: boolean
  onClose: () => void
  onIssue: (yarnId: string, loomNumber: number, issuedKg: number, pick: number, dateStr: string) => void
  activeDate?: string
}

export function IssueYarnModal({
  yarn,
  isOpen,
  onClose,
  onIssue,
  activeDate = PRODUCTION_TODAY,
}: IssueYarnModalProps) {
  const [loomNumber, setLoomNumber] = useState<number>(1)
  const [issuedKg, setIssuedKg] = useState<number | ''>(50)
  const [pick, setPick] = useState<number | ''>(60)
  const [issueDate, setIssueDate] = useState<string>(activeDate)

  useEffect(() => {
    if (activeDate) setIssueDate(activeDate)
  }, [activeDate])

  if (!isOpen || !yarn) return null

  const numIssued = Number(issuedKg) || 0
  const numPick = Number(pick) || 60

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (numIssued <= 0 || numPick <= 0) return
    onIssue(yarn.id, Number(loomNumber), numIssued, numPick, issueDate)
    onClose()
  }

  return (
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)' }}
    >
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '14px', overflow: 'hidden' }}>
          <div className="modal-header bg-light py-3 px-4 border-bottom">
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-success px-2.5 py-1.5 fs-7">
                <i className="bi bi-box-arrow-right me-1" /> Outward / Issue
              </span>
              <h5 className="modal-title fs-6 fw-bold mb-0">Issue Yarn to Loom</h5>
            </div>
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              onClick={onClose}
            />
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body p-4">
              {/* Yarn info banner */}
              <div className="p-3 mb-3 rounded bg-light border d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-secondary small">Selected Weft Yarn</div>
                  <div className="fw-bold fs-6 text-dark">{yarn.yarnType}</div>
                </div>
                <div className="text-end">
                  <div className="text-secondary small">Current Balance</div>
                  <div className="fw-bold text-primary">{yarn.balanceKg.toLocaleString()} kg</div>
                </div>
              </div>

              <div className="alert alert-info py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                <i className="bi bi-info-circle-fill text-primary fs-5" />
                <div>
                  <strong>Floor Integration:</strong> Dispatching yarn sets the active weft yarn and <strong>Pick count</strong> on the target loom for automatic production calculations.
                </div>
              </div>

              <div className="row g-3">
                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Target Loom
                  </label>
                  <select
                    className="form-select"
                    value={loomNumber}
                    onChange={(e) => setLoomNumber(Number(e.target.value))}
                    required
                  >
                    {Array.from({ length: 34 }, (_, i) => i + 1).map((num) => (
                      <option key={num} value={num}>
                        Loom {num}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    className="form-control"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    required
                  />
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Issued Weight (Kg)
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 50"
                    min={1}
                    step="0.5"
                    value={issuedKg}
                    onChange={(e) => setIssuedKg(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  />
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Fabric Pick Count (Picks/in)
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 60 or 68"
                    min={1}
                    max={200}
                    value={pick}
                    onChange={(e) => setPick(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              {numIssued > yarn.balanceKg && (
                <div className="alert alert-warning py-1 px-2 mt-3 small mb-0">
                  <i className="bi bi-exclamation-triangle-fill me-1" />
                  Warning: Issued quantity ({numIssued} kg) exceeds current available stock ({yarn.balanceKg} kg).
                </div>
              )}
            </div>

            <div className="modal-footer bg-light px-4 py-3 border-top">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-success px-3"
                disabled={numIssued <= 0 || numPick <= 0}
              >
                <i className="bi bi-send-check me-1" /> Dispatch to Loom {loomNumber}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
