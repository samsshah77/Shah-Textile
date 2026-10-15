'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  LoomMaster,
  QualityMaster,
  YarnMaster,
  qualityDisplayName,
} from '@/services/productionMastersService'
import { PRODUCTION_TODAY } from '@/constants/productionCalendar'
import { DateStepper } from '@/components/floor/DateStepper'

interface IssueYarnModalProps {
  yarn: YarnMaster | null
  isOpen: boolean
  onClose: () => void
  onIssue: (yarnId: string, loomNumber: number, issuedKg: number, pick: number, dateStr: string) => void
  activeDate?: string
  looms?: LoomMaster[]
  qualities?: QualityMaster[]
}

export function IssueYarnModal({
  yarn,
  isOpen,
  onClose,
  onIssue,
  activeDate = PRODUCTION_TODAY,
  looms = [],
  qualities = [],
}: IssueYarnModalProps) {
  const sortedLooms = useMemo(
    () => [...looms].sort((a, b) => a.loomNumber - b.loomNumber),
    [looms]
  )
  const [loomNumber, setLoomNumber] = useState<number>(sortedLooms[0]?.loomNumber ?? 1)
  const [issuedKg, setIssuedKg] = useState<number | ''>(50)
  const [pick, setPick] = useState<number | ''>(60)
  const [issueDate, setIssueDate] = useState<string>(activeDate)

  useEffect(() => {
    if (activeDate) setIssueDate(activeDate)
  }, [activeDate])

  useEffect(() => {
    if (!isOpen) return
    if (sortedLooms.length === 0) return
    if (!sortedLooms.some((l) => l.loomNumber === loomNumber)) {
      setLoomNumber(sortedLooms[0].loomNumber)
    }
  }, [isOpen, sortedLooms, loomNumber])

  useEffect(() => {
    if (!isOpen) return
    const loom = sortedLooms.find((l) => l.loomNumber === loomNumber)
    if (!loom?.qualityId) return
    const q = qualities.find((item) => item.id === loom.qualityId)
    if (q && Number(q.pick) > 0) setPick(Number(q.pick))
  }, [isOpen, loomNumber, sortedLooms, qualities])

  useEffect(() => {
    if (!isOpen) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [isOpen, onClose])

  if (!isOpen || !yarn) return null

  const numIssued = Number(issuedKg) || 0
  const numPick = Number(pick) || 60
  const selectedLoom = sortedLooms.find((l) => l.loomNumber === loomNumber) || null
  const loomQuality = selectedLoom?.qualityId
    ? qualities.find((q) => q.id === selectedLoom.qualityId) || null
    : null
  const qualityLabel = loomQuality
    ? qualityDisplayName(loomQuality, qualities)
    : '—'

  const loomOptionLabel = (l: LoomMaster) => {
    const name = (l.name || '').trim()
    const defaultName = `Loom ${l.loomNumber}`
    // Avoid "Loom 1 — Loom 1"
    if (!name || name.toLowerCase() === defaultName.toLowerCase()) {
      return defaultName
    }
    return `${defaultName} — ${name}`
  }

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
        <div
          className="modal-content border-0 shadow-lg"
          style={{ borderRadius: '14px', overflow: 'hidden' }}
        >
          <div className="modal-header bg-light py-3 px-4 border-bottom">
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-success px-2.5 py-1.5 fs-7">
                <i className="bi bi-box-arrow-right me-1" /> Outward
              </span>
              <h5 className="modal-title fs-6 fw-bold mb-0">Issue Yarn to Loom</h5>
            </div>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>

          <form onSubmit={handleSubmit} className="sara-add-beam-form">
            <div className="modal-body p-4">
              <div className="row g-3">
                <div className="col-8">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Weft Yarn
                  </label>
                  <div className="form-control bg-light">{yarn.yarnType}</div>
                </div>
                <div className="col-4">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Balance
                  </label>
                  <div className="form-control bg-light text-end">
                    {yarn.balanceKg.toLocaleString()} kg
                  </div>
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Target Loom
                  </label>
                  <select
                    className="form-select"
                    value={loomNumber}
                    onChange={(e) => setLoomNumber(Number(e.target.value))}
                    required
                  >
                    {sortedLooms.length > 0
                      ? sortedLooms.map((l) => (
                          <option key={l.loomNumber} value={l.loomNumber}>
                            {loomOptionLabel(l)}
                          </option>
                        ))
                      : Array.from({ length: 34 }, (_, i) => i + 1).map((num) => (
                          <option key={num} value={num}>
                            Loom {num}
                          </option>
                        ))}
                  </select>
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Quality on loom
                  </label>
                  <div className="form-control bg-light text-truncate" title={qualityLabel}>
                    {qualityLabel}
                  </div>
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Issue Date
                  </label>
                  <DateStepper value={issueDate} onChange={setIssueDate} required ariaLabel="Issue date" />
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Issued Weight (Kg)
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 50"
                    min={0.01}
                    step="0.01"
                    value={issuedKg}
                    onChange={(e) => setIssuedKg(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  />
                </div>

                <div className="col-12">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Pick (picks/in)
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 60"
                    min={1}
                    max={200}
                    value={pick}
                    onChange={(e) => setPick(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              {numIssued > yarn.balanceKg && (
                <div className="alert alert-warning py-2 px-3 mt-3 small mb-0">
                  <i className="bi bi-exclamation-triangle-fill me-1" />
                  Issued ({numIssued} kg) balance ({yarn.balanceKg} kg) se zyada hai.
                </div>
              )}
            </div>

            <div className="modal-footer bg-light px-4 py-3 border-top">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-primary px-3"
                disabled={numIssued <= 0 || numPick <= 0}
              >
                <i className="bi bi-send-check me-1" /> Issue to Loom {loomNumber}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
