'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  expenseService,
  TraderSummary,
  RecordTraderBillInput,
} from '@/services/expenseService'
import { MachineExpenseCategory } from '@/types/expense'
import { formatCurrency } from '@/lib/utils'

interface AddTraderBillModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  defaultTraderSlug?: string
}

export function AddTraderBillModal({
  isOpen,
  onClose,
  onSuccess,
  defaultTraderSlug,
}: AddTraderBillModalProps) {
  const [traders, setTraders] = useState<TraderSummary[]>([])
  const [selectedParty, setSelectedParty] = useState('')
  const [isCustomParty, setIsCustomParty] = useState(false)
  const [customPartyName, setCustomPartyName] = useState('')

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [billNo, setBillNo] = useState('')
  const [inwardNo, setInwardNo] = useState('')
  const [itemName, setItemName] = useState('')
  const [machineCategory, setMachineCategory] = useState<MachineExpenseCategory>('All')
  const [quantity, setQuantity] = useState<string>('1')
  const [rate, setRate] = useState<string>('')
  const [remarks, setRemarks] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const list = expenseService.getTradersList()
    setTraders(list)

    if (defaultTraderSlug) {
      const match = list.find((t) => t.slug === defaultTraderSlug)
      if (match) {
        setSelectedParty(match.partyName)
        setIsCustomParty(false)
      }
    } else if (list.length > 0 && !selectedParty) {
      setSelectedParty(list[0].partyName)
    }

    setError(null)
    setIsSuccess(false)
  }, [isOpen, defaultTraderSlug])

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

  const effectivePartyName = isCustomParty ? customPartyName.trim() : selectedParty.trim()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!effectivePartyName) {
      setError('Please select or enter a Trader / Party Name.')
      return
    }
    if (!itemName.trim()) {
      setError('Please specify the Item Description / Name.')
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

      const input: RecordTraderBillInput = {
        date,
        partyName: effectivePartyName,
        billNo: billNo.trim() || `BILL-${Math.floor(1000 + Math.random() * 9000)}`,
        inwardNo: inwardNo.trim(),
        itemName: itemName.trim(),
        machineCategory,
        quantity: numQty,
        rate: numRate,
        totalAmount,
        saraPayable: totalAmount,
        foiPaid: 0,
        remarks: remarks.trim(),
      }

      expenseService.recordTraderBill(input)

      setIsSuccess(true)
      setTimeout(() => {
        setIsSubmitting(false)
        setIsSuccess(false)
        onClose()
        if (onSuccess) onSuccess()
      }, 700)
    } catch (err: any) {
      setIsSubmitting(false)
      setError(err?.message || 'Failed to record trader bill.')
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
                className="d-flex align-items-center justify-content-center rounded-2 bg-primary-subtle text-primary"
                style={{ width: 36, height: 36 }}
              >
                <i className="bi bi-receipt-cutoff fs-5" />
              </div>
              <div>
                <h5 className="modal-title fs-6 fw-bold text-dark mb-0">Record Trader Bill & Inward</h5>
                <span className="text-secondary small" style={{ fontSize: '0.78rem' }}>
                  Auto-updates party ledger, daily inward register & cost statement
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
                  <span>Trader bill recorded and synced across all registers successfully!</span>
                </div>
              )}

              <div className="row g-3">
                {/* Date & Bill No */}
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
                    Bill / Invoice # <span className="text-muted fw-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm font-monospace"
                    placeholder="e.g. 5871"
                    value={billNo}
                    onChange={(e) => setBillNo(e.target.value)}
                  />
                </div>

                {/* Party / Trader Selection */}
                <div className="col-12">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <label className="form-label small fw-semibold text-secondary mb-0">
                      Trader / Vendor Name <span className="text-danger">*</span>
                    </label>
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 text-decoration-none text-primary"
                      style={{ fontSize: '0.78rem' }}
                      onClick={() => setIsCustomParty(!isCustomParty)}
                    >
                      {isCustomParty ? '← Select existing trader' : '+ Type new trader name'}
                    </button>
                  </div>

                  {isCustomParty ? (
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Enter new party or trader name"
                      value={customPartyName}
                      onChange={(e) => setCustomPartyName(e.target.value)}
                      required
                    />
                  ) : (
                    <select
                      className="form-select form-select-sm"
                      value={selectedParty}
                      onChange={(e) => setSelectedParty(e.target.value)}
                      required
                    >
                      <option value="" disabled>
                        -- Select Trader --
                      </option>
                      {traders.map((t) => (
                        <option key={t.slug} value={t.partyName}>
                          {t.partyName} ({t.type}) — Bills: {t.totalBills}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Inward No & Machine Category */}
                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Inward # / Gate Pass <span className="text-muted fw-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm font-monospace"
                    placeholder="e.g. 7626"
                    value={inwardNo}
                    onChange={(e) => setInwardNo(e.target.value)}
                  />
                </div>

                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Machine Category
                  </label>
                  <select
                    className="form-select form-select-sm"
                    value={machineCategory}
                    onChange={(e) => setMachineCategory(e.target.value as MachineExpenseCategory)}
                  >
                    <option value="All">All Machinery</option>
                    <option value="PU">PU Looms</option>
                    <option value="G6200">G6200 Looms</option>
                    <option value="G6300">G6300 Looms</option>
                    <option value="Electronic">Electronics & Cards</option>
                  </select>
                </div>

                {/* Item Description */}
                <div className="col-12">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Item Description / Goods Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="e.g. Refilling DCP 6kg, Rapier Tape G-6200, IC Card Relay"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    required
                  />
                </div>

                {/* Quantity & Rate */}
                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Quantity <span className="text-danger">*</span>
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
                    Rate per Unit (PKR) <span className="text-danger">*</span>
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
                      Total Bill Amount (Qty × Rate)
                    </span>
                    <span className="fs-5 fw-bold text-primary font-monospace">
                      {formatCurrency(totalAmount)}
                    </span>
                  </div>
                </div>

                {/* Remarks */}
                <div className="col-12">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Remarks / Invoice Details <span className="text-muted fw-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="e.g. Urgent loom maintenance parts, delivered via Daewoo"
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
                className="btn btn-sm btn-primary px-4 fw-semibold d-inline-flex align-items-center gap-1.5"
                disabled={isSubmitting || totalAmount <= 0}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" />
                    <span>Saving Bill...</span>
                  </>
                ) : (
                  <>
                    <i className="bi bi-check2-circle fs-6" />
                    <span>Save & Record Bill</span>
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
