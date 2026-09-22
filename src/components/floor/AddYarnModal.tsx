'use client'

import { useState } from 'react'
import { YarnMaster, kgToLbs } from '@/services/productionMastersService'

interface AddYarnModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (yarn: Partial<YarnMaster>) => void
}

export function AddYarnModal({ isOpen, onClose, onAdd }: AddYarnModalProps) {
  const [yarnType, setYarnType] = useState('')
  const [bags, setBags] = useState<number | ''>(10)
  const [receivedKg, setReceivedKg] = useState<number | ''>(500)

  if (!isOpen) return null

  const numKg = Number(receivedKg) || 0
  const calculatedLbs = kgToLbs(numKg)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!yarnType.trim()) return
    onAdd({
      yarnType: yarnType.trim(),
      bags: Number(bags) || 0,
      receivedKg: numKg,
      issuedKg: 0,
    })
    setYarnType('')
    setBags(10)
    setReceivedKg(500)
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
              <span className="badge bg-primary px-2.5 py-1.5 fs-7">
                <i className="bi bi-box-seam me-1" /> Inward
              </span>
              <h5 className="modal-title fs-6 fw-bold mb-0">Add Inward Yarn Stock</h5>
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
              <div className="mb-3">
                <label className="form-label small fw-semibold text-secondary mb-1">
                  Yarn Description / Type
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. 20/1 Pv China or 20 Single"
                  value={yarnType}
                  onChange={(e) => setYarnType(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="row g-3">
                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Number of Bags
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="Bags"
                    min={0}
                    value={bags}
                    onChange={(e) => setBags(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Received Weight (Kg)
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="Kilograms"
                    min={0}
                    step="0.1"
                    value={receivedKg}
                    onChange={(e) => setReceivedKg(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div className="mt-3 p-2.5 rounded bg-light border text-secondary small d-flex justify-content-between align-items-center">
                <span>Calculated Pounds (lbs):</span>
                <strong className="text-dark fs-7">{calculatedLbs.toLocaleString()} lbs</strong>
              </div>
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
                className="btn btn-sm btn-primary px-3"
                disabled={!yarnType.trim() || numKg <= 0}
              >
                <i className="bi bi-plus-lg me-1" /> Add Yarn to Stock
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
