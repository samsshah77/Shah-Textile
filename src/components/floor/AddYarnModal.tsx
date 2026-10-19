'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { YarnMaster, kgToLbs } from '@/services/productionMastersService'
import { getCalendarToday } from '@/constants/productionCalendar'

const MAX_BAGS = 50

function sanitizeKg(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot === -1) return cleaned
  return `${cleaned.slice(0, dot + 1)}${cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`
}

function roundToTwo(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

interface AddYarnModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (
    yarn: Partial<YarnMaster>,
    arrival?: { date: string; bags: number; weightKg: number; lotOrSupplier?: string }
  ) => void
  activeDate?: string
  existingYarns?: YarnMaster[]
}

export function AddYarnModal({
  isOpen,
  onClose,
  onAdd,
  activeDate,
  existingYarns = [],
}: AddYarnModalProps) {
  const [yarnType, setYarnType] = useState('')
  const [bagCount, setBagCount] = useState<number>(5)
  /** What is typed in the Bags box — may be empty while typing (e.g. delete "5", type "12"). */
  const [bagCountText, setBagCountText] = useState('5')
  const [bagKg, setBagKg] = useState<string[]>(Array(5).fill(''))
  const [error, setError] = useState<string | null>(null)

  const bagInputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (!isOpen) return
    setYarnType('')
    setBagCount(5)
    setBagCountText('5')
    setBagKg(Array(5).fill(''))
    setError(null)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [isOpen, onClose])

  const setBags = (n: number) => {
    const next = Math.min(MAX_BAGS, Math.max(1, Math.floor(n) || 1))
    setBagCount(next)
    setBagKg((prev) => {
      const copy = prev.slice(0, next)
      while (copy.length < next) copy.push('')
      return copy
    })
  }

  // Weight Calculations
  const numericWeights = useMemo(
    () => bagKg.map((v) => roundToTwo(parseFloat(v) || 0)),
    [bagKg]
  )
  const filledBags = numericWeights.filter((w) => w > 0)
  const totalKg = useMemo(
    () => roundToTwo(filledBags.reduce((sum, w) => sum + w, 0)),
    [filledBags]
  )
  const calculatedLbs = useMemo(() => roundToTwo(kgToLbs(totalKg)), [totalKg])
  const allBagsFilled = bagCount > 0 && filledBags.length === bagCount

  // Quick helper: Copy Bag 1 weight to all bags
  const handleCopyFirstBagToAll = () => {
    const first = bagKg[0]?.trim()
    if (!first || parseFloat(first) <= 0) return
    const formatted = parseFloat(first).toFixed(2)
    setBagKg(Array(bagCount).fill(formatted))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = yarnType.trim()
    if (!trimmed) {
      setError('Please enter or select a yarn quality.')
      return
    }
    if (!allBagsFilled || totalKg <= 0) {
      setError(`Please enter the weight for all ${bagCount} bags.`)
      return
    }

    onAdd(
      {
        yarnType: trimmed,
        bags: bagCount,
        receivedKg: totalKg,
        issuedKg: 0,
      },
      {
        date: activeDate || getCalendarToday(),
        bags: bagCount,
        weightKg: totalKg,
      }
    )
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)' }}
    >
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable" role="document">
        <div
          className="modal-content border-0 shadow-lg"
          style={{ borderRadius: '14px', overflow: 'hidden' }}
        >
          {/* Header */}
          <div className="modal-header bg-light py-3 px-4 border-bottom">
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-primary px-2.5 py-1.5 fs-7">
                <i className="bi bi-box-seam me-1" /> Inward
              </span>
              <h5 className="modal-title fs-6 fw-bold mb-0">Add Yarn</h5>
            </div>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>

          <form onSubmit={handleSubmit} className="sara-add-beam-form">
            <div className="modal-body p-4">
              {error && (
                <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                  <i className="bi bi-exclamation-triangle-fill" />
                  <span>{error}</span>
                </div>
              )}

              <div className="row g-3">
                {/* Yarn / Quality */}
                <div className="col-12">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Yarn / Quality
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 20/1 Pv China"
                    list="sara-existing-yarn-list"
                    value={yarnType}
                    onChange={(e) => {
                      setYarnType(e.target.value)
                      setError(null)
                    }}
                    autoFocus
                    required
                  />
                  {existingYarns.length > 0 && (
                    <datalist id="sara-existing-yarn-list">
                      {existingYarns.map((y) => (
                        <option
                          key={y.id}
                          value={y.yarnType}
                          label={`Stock: ${y.balanceKg.toFixed(2)} kg`}
                        />
                      ))}
                    </datalist>
                  )}
                </div>

                {/* Bags Count */}
                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Bags
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="form-control"
                    value={bagCountText}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      // Allow an empty box while typing; only digits.
                      const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 3)
                      setBagCountText(digits)
                      if (digits !== '') setBags(Number(digits))
                    }}
                    onBlur={() => {
                      const n = Math.min(MAX_BAGS, Math.max(1, Number(bagCountText) || 1))
                      setBags(n)
                      setBagCountText(String(n))
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape' && bagCountText !== '') {
                        // Esc clears the box instead of closing the form.
                        e.preventDefault()
                        e.stopPropagation()
                        e.nativeEvent.stopImmediatePropagation()
                        setBagCountText('')
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        e.currentTarget.blur()
                        bagInputRefs.current[0]?.focus()
                      }
                    }}
                  />
                </div>

                {/* Total Received Summary Box */}
                <div className="col-12">
                  <div className="w-100 rounded border bg-light px-3 py-2 d-flex justify-content-between align-items-center">
                    <div>
                      <div className="small text-secondary">Total received</div>
                      <div className="fw-bold">
                        {totalKg.toFixed(2)} kg
                        <span className="fw-normal text-secondary small ms-2">
                          · {bagCount} bag{bagCount === 1 ? '' : 's'} · ≈ {calculatedLbs.toFixed(2)} lbs
                        </span>
                      </div>
                    </div>
                    {bagKg[0] && parseFloat(bagKg[0]) > 0 && bagCount > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary py-1 px-2 text-decoration-none"
                        style={{ fontSize: '0.78rem' }}
                        onClick={handleCopyFirstBagToAll}
                        title="Copy Bag 1 weight to all bags"
                      >
                        <i className="bi bi-copy me-1" /> Same weight for all ({parseFloat(bagKg[0]).toFixed(2)} kg)
                      </button>
                    )}
                  </div>
                </div>

                {/* Bag Weights (har bag ka alag weight) */}
                <div className="col-12">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <label className="form-label small fw-semibold sara-add-beam-label mb-0">
                      Bag weight (kg)
                    </label>
                    <span className="text-secondary small" style={{ fontSize: '0.75rem' }}>
                      {filledBags.length} of {bagCount} filled
                    </span>
                  </div>

                  <div className="row g-2" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                    {Array.from({ length: bagCount }, (_, i) => (
                      <div key={i} className="col-6">
                        <div className="input-group input-group-sm">
                          <span className="input-group-text" style={{ minWidth: 64 }}>
                            Bag {i + 1}
                          </span>
                          <input
                            ref={(el) => {
                              bagInputRefs.current[i] = el
                            }}
                            type="text"
                            inputMode="decimal"
                            className="form-control text-end"
                            placeholder="0.00"
                            value={bagKg[i] ?? ''}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => {
                              const v = sanitizeKg(e.target.value)
                              setBagKg((prev) => {
                                const next = prev.slice()
                                next[i] = v
                                return next
                              })
                              setError(null)
                            }}
                            onBlur={(e) => {
                              const raw = e.target.value.trim()
                              if (raw !== '' && !isNaN(Number(raw))) {
                                const formatted = parseFloat(raw).toFixed(2)
                                setBagKg((prev) => {
                                  const next = prev.slice()
                                  next[i] = formatted
                                  return next
                                })
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                if (i + 1 < bagCount) {
                                  bagInputRefs.current[i + 1]?.focus()
                                  bagInputRefs.current[i + 1]?.select()
                                } else {
                                  document.getElementById('sara-add-yarn-submit-btn')?.focus()
                                }
                              }
                            }}
                            required
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="modal-footer bg-light px-4 py-3 border-top">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                id="sara-add-yarn-submit-btn"
                type="submit"
                className="btn btn-sm btn-primary px-3"
                disabled={!yarnType.trim() || !allBagsFilled || totalKg <= 0}
              >
                <i className="bi bi-plus-lg me-1" /> Add Yarn
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
