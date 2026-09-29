'use client'

import { useEffect, useState } from 'react'
import {
  LoomMaster,
  QualityMaster,
  getLoomPictures,
  normalizeLoomPictures,
} from '@/services/productionMastersService'
import { LoomCategory, LoomStatus } from '@/types/loom'
import { LoomStatusSelect } from '@/components/floor/LoomStatusSelect'
import { LoomPicturesEditor } from '@/components/floor/LoomPicturesEditor'

const MODELS: LoomCategory[] = ['G6200', 'G6300', 'PU']

interface EditLoomModalProps {
  loom: LoomMaster | null
  qualities?: QualityMaster[]
  isOpen: boolean
  onClose: () => void
  onSave: (loomNumber: number, patch: Partial<LoomMaster>) => void
}

export function EditLoomModal({
  loom,
  qualities = [],
  isOpen,
  onClose,
  onSave,
}: EditLoomModalProps) {
  const [name, setName] = useState('')
  const [model, setModel] = useState<LoomCategory>('G6200')
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [shed, setShed] = useState('')
  const [defaultRpm, setDefaultRpm] = useState<number>(340)
  const [status, setStatus] = useState<LoomStatus>('RUNNING')
  const [qualityId, setQualityId] = useState<string>('')
  const [pictureDataUrls, setPictureDataUrls] = useState<string[]>([])

  useEffect(() => {
    if (loom) {
      setName(loom.name || `Loom ${loom.loomNumber}`)
      setModel(loom.model || 'G6200')
      setYear(loom.year || new Date().getFullYear())
      setShed(loom.shed || 'Main Floor')
      setDefaultRpm(loom.defaultRpm || 340)
      setStatus(loom.status || 'RUNNING')
      setQualityId(loom.qualityId || '')
      setPictureDataUrls(getLoomPictures(loom))
    }
  }, [loom])

  if (!isOpen || !loom) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const pictures = normalizeLoomPictures({
      loomNumber: loom.loomNumber,
      pictureDataUrls,
    })
    onSave(loom.loomNumber, {
      name: name.trim() || `Loom ${loom.loomNumber}`,
      model,
      year: Number(year) || 0,
      shed: shed.trim() || 'Main Floor',
      defaultRpm: Number(defaultRpm) || 0,
      status,
      qualityId: qualityId || null,
      ...pictures,
    })
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
                Loom #{loom.loomNumber}
              </span>
              <h5 className="modal-title fs-6 fw-bold mb-0">Edit Loom Configuration</h5>
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
              <div className="alert alert-info py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                <i className="bi bi-shield-lock-fill text-primary fs-5" />
                <div>
                  <strong>Admin Configuration:</strong> Update machine identification, quality, picture, and floor assignments.
                </div>
              </div>

              <div className="row g-3">
                <div className="col-12">
                  <LoomPicturesEditor
                    images={pictureDataUrls}
                    onChange={setPictureDataUrls}
                    loomLabel={name || `Loom ${loom.loomNumber}`}
                  />
                </div>

                <div className="col-12">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Machine Name
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={name}
                    placeholder={`e.g. Loom ${loom.loomNumber}`}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Model
                  </label>
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
                    value={year}
                    min={1980}
                    max={2040}
                    onChange={(e) => setYear(Number(e.target.value) || 0)}
                  />
                </div>

                <div className="col-12">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Quality Name
                  </label>
                  <select
                    className="form-select"
                    value={qualityId}
                    onChange={(e) => setQualityId(e.target.value)}
                  >
                    <option value="">—</option>
                    {qualities
                      .filter((q) => (q.status ?? 'ACTIVE') !== 'ENDED' || q.id === loom.qualityId)
                      .map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="col-6">
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
                    value={defaultRpm}
                    min={1}
                    max={2000}
                    onChange={(e) => setDefaultRpm(Number(e.target.value) || 0)}
                  />
                </div>

                <div className="col-12">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Loom Operational Status
                  </label>
                  <LoomStatusSelect
                    value={status}
                    onChange={(newStatus) => setStatus(newStatus)}
                  />
                </div>
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
              <button type="submit" className="btn btn-sm btn-primary px-3">
                <i className="bi bi-check-lg me-1" /> Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
