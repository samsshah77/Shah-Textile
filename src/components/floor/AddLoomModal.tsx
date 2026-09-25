'use client'

import { useState } from 'react'
import { LoomMaster, QualityMaster } from '@/services/productionMastersService'
import { LoomCategory, LoomStatus } from '@/types/loom'
import { LoomStatusSelect } from '@/components/floor/LoomStatusSelect'

const MODELS: LoomCategory[] = ['G6200', 'G6300', 'PU']

interface AddLoomModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (partial: Partial<LoomMaster>) => void
  qualities?: QualityMaster[]
  suggestedLoomNumber?: number
}

export function AddLoomModal({
  isOpen,
  onClose,
  onAdd,
  qualities = [],
  suggestedLoomNumber,
}: AddLoomModalProps) {
  const [name, setName] = useState('')
  const [model, setModel] = useState<LoomCategory>('G6200')
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [shed, setShed] = useState('Main Floor')
  const [defaultRpm, setDefaultRpm] = useState<number>(340)
  const [status, setStatus] = useState<LoomStatus>('RUNNING')
  const [qualityId, setQualityId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const resetForm = () => {
    setName('')
    setModel('G6200')
    setYear(new Date().getFullYear())
    setShed('Main Floor')
    setDefaultRpm(340)
    setStatus('RUNNING')
    setQualityId('')
    setError(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please enter a machine name.')
      return
    }

    onAdd({
      name: trimmed,
      model,
      year: Number(year) || new Date().getFullYear(),
      shed: shed.trim() || 'Main Floor',
      defaultRpm: Number(defaultRpm) || 340,
      status,
      qualityId: qualityId || null,
    })
    resetForm()
    onClose()
  }

  const defaultName =
    suggestedLoomNumber != null ? `Loom ${suggestedLoomNumber}` : 'New Loom'

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
                <i className="bi bi-gear-wide-connected me-1" /> Loom
              </span>
              <h5 className="modal-title fs-6 fw-bold mb-0">Add New Loom</h5>
            </div>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body p-4">
              {error && (
                <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                  <i className="bi bi-exclamation-triangle-fill" />
                  <span>{error}</span>
                </div>
              )}

              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Machine Name
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder={defaultName}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      setError(null)
                    }}
                    autoFocus
                    required
                  />
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">Model</label>
                  <select
                    className="form-select"
                    value={model}
                    onChange={(e) => setModel(e.target.value as LoomCategory)}
                  >
                    {MODELS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Manufacturing Year
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    min={1980}
                    max={2040}
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value) || 0)}
                  />
                </div>

                <div className="col-12">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Shed / Department
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={shed}
                    placeholder="e.g. Main Floor"
                    onChange={(e) => setShed(e.target.value)}
                  />
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Default RPM
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    min={1}
                    max={2000}
                    value={defaultRpm}
                    onChange={(e) => setDefaultRpm(Number(e.target.value) || 0)}
                  />
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Quality
                  </label>
                  <select
                    className="form-select"
                    value={qualityId}
                    onChange={(e) => setQualityId(e.target.value)}
                  >
                    <option value="">—</option>
                    {qualities.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-12">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Operational Status
                  </label>
                  <LoomStatusSelect value={status} onChange={setStatus} />
                </div>
              </div>
            </div>

            <div className="modal-footer bg-light px-4 py-3 border-top">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-sm btn-primary px-3">
                <i className="bi bi-plus-lg me-1" /> Add Loom
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
