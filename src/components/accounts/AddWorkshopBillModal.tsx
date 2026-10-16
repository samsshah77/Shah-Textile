'use client'

import { useState, useEffect, useRef } from 'react'
import {
  expenseService,
  WorkshopSummary,
  RecordWorkshopJobInput,
} from '@/services/expenseService'
import { formatCurrency } from '@/lib/utils'

interface AddWorkshopBillModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  defaultWorkshopSlug?: string
}

export function AddWorkshopBillModal({
  isOpen,
  onClose,
  onSuccess,
  defaultWorkshopSlug,
}: AddWorkshopBillModalProps) {
  const [workshops, setWorkshops] = useState<WorkshopSummary[]>([])
  const [selectedWorkshop, setSelectedWorkshop] = useState('')
  const [isCustomWorkshop, setIsCustomWorkshop] = useState(false)
  const [customWorkshopName, setCustomWorkshopName] = useState('')

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [billNo, setBillNo] = useState('')
  const [inwardNo, setInwardNo] = useState('')
  const [machineName, setMachineName] = useState('PU Looms')
  const [jobDescription, setJobDescription] = useState('')
  const [quantity, setQuantity] = useState<string>('1')
  const [rate, setRate] = useState<string>('')
  const [remarks, setRemarks] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const list = expenseService.getWorkshopsList()
    setWorkshops(list)

    if (defaultWorkshopSlug) {
      const match = list.find((w) => w.slug === defaultWorkshopSlug)
      if (match) {
        setSelectedWorkshop(match.workshopName)
        setIsCustomWorkshop(false)
      }
    } else if (list.length > 0 && !selectedWorkshop) {
      setSelectedWorkshop(list[0].workshopName)
    }

    setError(null)
    setIsSuccess(false)
  }, [isOpen, defaultWorkshopSlug])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => firstInputRef.current?.focus(), 150)
    }
  }, [isOpen])

  // ESC key to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Live auto-calculation of Total Amount
  const numQty = parseFloat(quantity) || 0
  const numRate = parseFloat(rate) || 0
  const totalAmount = Math.round(numQty * numRate)

  const effectiveWorkshopName = isCustomWorkshop ? customWorkshopName.trim() : selectedWorkshop.trim()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!effectiveWorkshopName) {
      setError('Please select or enter a Workshop / Engineering Name.')
      return
    }
    if (!jobDescription.trim()) {
      setError('Please enter the Job / Repair Description.')
      return
    }
    if (numQty <= 0) {
      setError('Quantity must be greater than zero.')
      return
    }
    if (numRate <= 0) {
      setError('Rate must be greater than zero.')
      return
    }

    try {
      setIsSubmitting(true)

      const input: RecordWorkshopJobInput = {
        date,
        workshopName: effectiveWorkshopName,
        billNo: billNo.trim() || `JOB-${Math.floor(100 + Math.random() * 900)}`,
        inwardNo: inwardNo.trim(),
        machineName: machineName.trim(),
        jobDescription: jobDescription.trim(),
        quantity: numQty,
        rate: numRate,
        totalAmount,
        saraPayable: totalAmount,
        foiPaid: 0,
        remarks: remarks.trim(),
      }

      expenseService.recordWorkshopBill(input)

      setIsSuccess(true)
      setTimeout(() => {
        setIsSubmitting(false)
        setIsSuccess(false)
        onClose()
        if (onSuccess) onSuccess()
      }, 700)
    } catch (err: any) {
      setIsSubmitting(false)
      setError(err?.message || 'Failed to record workshop job.')
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(2px)', zIndex: 1055 }}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg" role="document">
        <div className="modal-content border-0 shadow-lg rounded-3 overflow-hidden">
          {/* Header */}
          <div className="modal-header bg-white border-bottom py-3 px-4 d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center gap-2">
              <div
                className="d-flex align-items-center justify-content-center rounded-2 bg-warning-subtle text-warning-emphasis"
                style={{ width: 36, height: 36 }}
              >
                <i className="bi bi-tools fs-5" />
              </div>
              <div>
                <h5 className="modal-title fs-6 fw-bold text-dark mb-0">Record Workshop Job & Repair</h5>
                <span className="text-secondary small" style={{ fontSize: '0.78rem' }}>
                  Auto-updates workshop ledger, daily inward register & cost statement (repair expense)
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              onClick={onClose}
              disabled={isSubmitting}
            />
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body p-4 bg-light-subtle">
              {error && (
                <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                  <i className="bi bi-exclamation-triangle-fill" />
                  <span>{error}</span>
                </div>
              )}

              {isSuccess && (
                <div className="alert alert-success py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                  <i className="bi bi-check-circle-fill" />
                  <span>Workshop job recorded and synced with Cost Statement & Daily Inward successfully!</span>
                </div>
              )}

              <div className="row g-3">
                {/* Date & Job/Bill No */}
                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Date <span className="text-danger">*</span>
                  </label>
                  <input
                    ref={firstInputRef}
                    type="date"
                    className="form-control form-control-sm"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>

                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Job / Bill # <span className="text-muted fw-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm font-monospace"
                    placeholder="e.g. 242"
                    value={billNo}
                    onChange={(e) => setBillNo(e.target.value)}
                  />
                </div>

                {/* Workshop Name */}
                <div className="col-12">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <label className="form-label small fw-semibold text-secondary mb-0">
                      Workshop / Engineering Firm <span className="text-danger">*</span>
                    </label>
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 text-decoration-none text-primary"
                      style={{ fontSize: '0.78rem' }}
                      onClick={() => setIsCustomWorkshop(!isCustomWorkshop)}
                    >
                      {isCustomWorkshop ? '← Select existing workshop' : '+ Type new workshop name'}
                    </button>
                  </div>

                  {isCustomWorkshop ? (
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Enter new workshop or lathe name"
                      value={customWorkshopName}
                      onChange={(e) => setCustomWorkshopName(e.target.value)}
                      required
                    />
                  ) : (
                    <select
                      className="form-select form-select-sm"
                      value={selectedWorkshop}
                      onChange={(e) => setSelectedWorkshop(e.target.value)}
                      required
                    >
                      <option value="" disabled>
                        -- Select Workshop --
                      </option>
                      {workshops.map((w) => (
                        <option key={w.slug} value={w.workshopName}>
                          {w.workshopName} ({w.type}) — Jobs: {w.totalBills}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Gate Pass & Machine Name */}
                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Gate Pass / Inward # <span className="text-muted fw-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm font-monospace"
                    placeholder="e.g. 7633"
                    value={inwardNo}
                    onChange={(e) => setInwardNo(e.target.value)}
                  />
                </div>

                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Machine / Loom / Section
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="e.g. Loom #14, PU Looms, G-6200, Boiler"
                    value={machineName}
                    onChange={(e) => setMachineName(e.target.value)}
                  />
                </div>

                {/* Job Description */}
                <div className="col-12">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Job / Repair Description <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="e.g. Scissor Repaired 9pcs, Shaft Lathe Turning, Bush Repair"
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    required
                  />
                </div>

                {/* Quantity & Rate */}
                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Job Quantity / Units <span className="text-danger">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    className="form-control form-control-sm text-end font-monospace"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                  />
                </div>

                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Rate / Cost per Job (PKR) <span className="text-danger">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    className="form-control form-control-sm text-end font-monospace"
                    placeholder="0.00"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    required
                  />
                </div>

                {/* Auto Calculated Summary Card */}
                <div className="col-12">
                  <div className="card bg-white border shadow-xs p-3 rounded-2 text-center">
                    <span className="text-muted d-block small" style={{ fontSize: '0.72rem' }}>
                      Total Job Amount (Qty × Rate)
                    </span>
                    <span className="fs-5 fw-bold text-dark font-monospace">
                      {formatCurrency(totalAmount)}
                    </span>
                  </div>
                </div>

                {/* Remarks */}
                <div className="col-12">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Job Remarks / Status <span className="text-muted fw-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="e.g. Job completed on lathe, tested on Loom 14"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="modal-footer bg-white border-top py-2.5 px-4 d-flex justify-content-between">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary px-3"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-warning px-4 fw-semibold text-dark d-inline-flex align-items-center gap-1.5"
                disabled={isSubmitting || totalAmount <= 0}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" />
                    <span>Saving Job...</span>
                  </>
                ) : (
                  <>
                    <i className="bi bi-tools fs-6" />
                    <span>Save & Record Workshop Job</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
