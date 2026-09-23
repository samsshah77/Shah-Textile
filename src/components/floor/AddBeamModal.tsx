'use client'

import { useState } from 'react'
import { BeamMaster, LoomMaster, calcTotalThreads } from '@/services/productionMastersService'
import { LOOM_STATUS_LABEL } from '@/components/floor/LoomStatusSelect'
import type { LoomStatus } from '@/types/loom'

interface AddBeamModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (beam: Partial<BeamMaster> & { beamNo: string }) => void
  existingBeamNos: string[]
  activeLooms: LoomMaster[]
}

export function AddBeamModal({
  isOpen,
  onClose,
  onAdd,
  existingBeamNos,
  activeLooms,
}: AddBeamModalProps) {
  const [beamNo, setBeamNo] = useState('')
  const [warp, setWarp] = useState('20/1')
  const [reed, setReed] = useState<number | ''>(60)
  const [width, setWidth] = useState<number | ''>(66)
  const [length, setLength] = useState<number | ''>(1500)
  const [loomType, setLoomType] = useState('G6200')
  const [placement, setPlacement] = useState('STORE')
  const [mountedDate, setMountedDate] = useState('2026-09-24')
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const numReed = Number(reed) || 0
  const numWidth = Number(width) || 0
  const numLength = Number(length) || 0
  const totalThreads = calcTotalThreads(numReed, numWidth)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedNo = beamNo.trim()
    if (!trimmedNo) {
      setError('Please enter a valid Beam ID.')
      return
    }

    if (existingBeamNos.some((no) => no.toLowerCase() === trimmedNo.toLowerCase())) {
      setError(`Beam "${trimmedNo}" already exists in inventory.`)
      return
    }

    const isLoom = placement !== 'STORE' && placement !== 'SIZING'
    try {
      onAdd({
        beamNo: trimmedNo,
        warp: warp.trim() || '20/1',
        reed: numReed,
        width: numWidth,
        length: numLength,
        loomType,
        fillStatus: 'FULL',
        location: placement,
        usedInLoom: isLoom ? placement : null,
        mountedOn: isLoom ? mountedDate : null,
      })
    } catch {
      return
    }

    // Reset form
    setBeamNo('')
    setWarp('20/1')
    setReed(60)
    setWidth(66)
    setLength(1500)
    setLoomType('G6200')
    setPlacement('STORE')
    setError(null)
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
                <i className="bi bi-layers me-1" /> Beam
              </span>
              <h5 className="modal-title fs-6 fw-bold mb-0">Add New Beam to Inventory</h5>
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
              {error && (
                <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                  <i className="bi bi-exclamation-triangle-fill" />
                  <span>{error}</span>
                </div>
              )}

              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Beam ID / Identity
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. B-101 or 402"
                    value={beamNo}
                    onChange={(e) => {
                      setBeamNo(e.target.value)
                      setError(null)
                    }}
                    autoFocus
                    required
                  />
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Initial Location
                  </label>
                  <select
                    className="form-select"
                    value={placement}
                    onChange={(e) => setPlacement(e.target.value)}
                  >
                    <optgroup label="Storage / Pre-Weaving">
                      <option value="STORE">In Stock (Store)</option>
                      <option value="SIZING">Sizing Section</option>
                    </optgroup>
                    <optgroup label="Mount on Loom">
                      {activeLooms.map((l) => (
                        <option key={l.loomNumber} value={String(l.loomNumber)}>
                          Loom {l.loomNumber} — {LOOM_STATUS_LABEL[l.status as LoomStatus]}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {placement !== 'STORE' && placement !== 'SIZING' && (
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary mb-1">
                      Mounting Date on Loom
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={mountedDate}
                      onChange={(e) => setMountedDate(e.target.value)}
                    />
                  </div>
                )}

                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Yarn Warp
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 20/1 or 40/1"
                    value={warp}
                    onChange={(e) => setWarp(e.target.value)}
                  />
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Reed
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 60 or 120"
                    min={1}
                    value={reed}
                    onChange={(e) => setReed(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Width (inches)
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 66"
                    min={1}
                    value={width}
                    onChange={(e) => setWidth(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Beam Length (meters)
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 1500"
                    min={0}
                    value={length}
                    onChange={(e) => setLength(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Machine Type
                  </label>
                  <select
                    className="form-select"
                    value={loomType}
                    onChange={(e) => setLoomType(e.target.value)}
                  >
                    <option value="G6200">G6200</option>
                    <option value="G6300">G6300</option>
                    <option value="PU">PU</option>
                  </select>
                </div>
              </div>

              <div className="mt-3 p-2.5 rounded bg-light border text-secondary small d-flex justify-content-between align-items-center">
                <span>Calculated Total Threads:</span>
                <strong className="text-dark fs-7">{totalThreads.toLocaleString()} threads</strong>
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
                disabled={!beamNo.trim()}
              >
                <i className="bi bi-plus-lg me-1" /> Add Beam
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
