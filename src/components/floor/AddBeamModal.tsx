'use client'

import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import {
  BeamMaster,
  LoomMaster,
  calcTotalThreads,
  composeLot,
  getMountedBeamsOnLoom,
  loomBeamCapacity,
  loomHasFreeBeamSlot,
  type LotKind,
} from '@/services/productionMastersService'
import { LOOM_STATUS_LABEL } from '@/components/floor/LoomStatusSelect'
import type { LoomStatus } from '@/types/loom'
import { DateStepper } from '@/components/floor/DateStepper'

interface AddBeamModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (beam: Partial<BeamMaster> & { beamNo: string }) => void | Promise<void>
  existingBeamNos: string[]
  activeLooms: LoomMaster[]
  beams?: BeamMaster[]
  /** Unused — kept for API compat with BeamMasterTable. */
  qualities?: unknown[]
}

type BeamField =
  | 'beamNo'
  | 'swLot'
  | 'beamRepeat'
  | 'placement'
  | 'mountedDate'
  | 'warp'
  | 'reed'
  | 'width'
  | 'threads'
  | 'length'
  | 'loomType'

export function AddBeamModal({
  isOpen,
  onClose,
  onAdd,
  existingBeamNos,
  activeLooms,
  beams = [],
}: AddBeamModalProps) {
  const [beamNo, setBeamNo] = useState('')
  const [swLot, setSwLot] = useState('')
  const [lotKind, setLotKind] = useState<LotKind>('Sw')
  const [beamRepeat, setBeamRepeat] = useState('')
  const [warp, setWarp] = useState('')
  const [reed, setReed] = useState<number | ''>('')
  const [width, setWidth] = useState<number | ''>('')
  const [threads, setThreads] = useState<number | ''>('')
  const [threadsTouched, setThreadsTouched] = useState(false)
  const [length, setLength] = useState<number | ''>('')
  const [loomType, setLoomType] = useState('G6200')
  const [placement, setPlacement] = useState('STORE')
  const [mountedDate, setMountedDate] = useState('2026-09-24')
  const [error, setError] = useState<string | null>(null)

  const numReed = Number(reed) || 0
  const numWidth = Number(width) || 0
  const autoThreads = calcTotalThreads(numReed, numWidth)
  const showMountDate = placement !== 'STORE' && placement !== 'SIZING'

  const fieldOrder: BeamField[] = showMountDate
    ? [
        'beamNo',
        'swLot',
        'beamRepeat',
        'placement',
        'mountedDate',
        'warp',
        'reed',
        'width',
        'threads',
        'length',
        'loomType',
      ]
    : [
        'beamNo',
        'swLot',
        'beamRepeat',
        'placement',
        'warp',
        'reed',
        'width',
        'threads',
        'length',
        'loomType',
      ]

  // Reed/width change → refresh auto threads unless user already edited threads.
  useEffect(() => {
    if (!isOpen || threadsTouched) return
    setThreads(autoThreads > 0 ? autoThreads : '')
  }, [autoThreads, isOpen, threadsTouched])

  useEffect(() => {
    if (!isOpen) return
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [isOpen, onClose])

  const focusField = useCallback((name: BeamField) => {
    const el = document.querySelector<HTMLElement>(`[data-add-beam-field="${name}"]`)
    if (!el) return
    el.focus()
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.select?.()
    }
  }, [])

  const handleFieldKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>, field: BeamField) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      // Ctrl/Cmd+Enter → submit from any field
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        e.currentTarget.closest('form')?.requestSubmit()
        return
      }

      const idx = fieldOrder.indexOf(field)
      if (idx < 0) return

      const goNext = () => {
        if (idx < fieldOrder.length - 1) {
          focusField(fieldOrder[idx + 1])
          return
        }
        e.currentTarget.closest('form')?.requestSubmit()
      }
      const goPrev = () => {
        if (idx > 0) focusField(fieldOrder[idx - 1])
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        goNext()
        return
      }

      // Left / Right arrows — skip while caret is mid-text
      const isTextLike =
        e.currentTarget instanceof HTMLInputElement &&
        e.currentTarget.type !== 'date' &&
        e.currentTarget.tagName === 'INPUT'
      if (!isTextLike) return

      if (e.key === 'ArrowRight') {
        const el = e.currentTarget as HTMLInputElement
        const end = el.selectionEnd ?? 0
        const len = el.value.length
        const allSelected = (el.selectionStart ?? 0) === 0 && end === len && len > 0
        if (end < len && !allSelected) return
        e.preventDefault()
        goNext()
        return
      }
      if (e.key === 'ArrowLeft') {
        const el = e.currentTarget as HTMLInputElement
        const start = el.selectionStart ?? 0
        const len = el.value.length
        const allSelected = start === 0 && (el.selectionEnd ?? 0) === len && len > 0
        if (start > 0 && !allSelected) return
        e.preventDefault()
        goPrev()
      }
    },
    [fieldOrder, focusField, onClose]
  )

  if (!isOpen) return null

  const numLength = Number(length) || 0
  const numThreads = threads === '' ? autoThreads : Number(threads) || 0

  const resetForm = () => {
    setBeamNo('')
    setSwLot('')
    setLotKind('Sw')
    setBeamRepeat('')
    setWarp('')
    setReed('')
    setWidth('')
    setThreads('')
    setThreadsTouched(false)
    setLength('')
    setLoomType('G6200')
    setPlacement('STORE')
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedNo = beamNo.trim()
    if (!trimmedNo) {
      setError('Beam ID likho.')
      focusField('beamNo')
      return
    }

    if (!swLot.trim()) {
      setError('Sw # zaroori hai.')
      focusField('swLot')
      return
    }

    if (existingBeamNos.some((no) => no.toLowerCase() === trimmedNo.toLowerCase())) {
      setError(`Beam "${trimmedNo}" pehle se maujood hai.`)
      focusField('beamNo')
      return
    }

    const isLoom = placement !== 'STORE' && placement !== 'SIZING'
    try {
      await Promise.resolve(
        onAdd({
          beamNo: trimmedNo,
          swLot: composeLot(lotKind, swLot) || null,
          beamRepeat: beamRepeat.trim() || null,
          warp: warp.trim() || '20/1',
          reed: numReed || 60,
          width: numWidth || 66,
          totalThreads: numThreads || calcTotalThreads(numReed || 60, numWidth || 66),
          length: numLength || 1500,
          loomType,
          fillStatus: 'FULL',
          location: placement,
          usedInLoom: isLoom ? placement : null,
          mountedOn: isLoom ? mountedDate : null,
          qualityId: null,
        })
      )
    } catch {
      return
    }

    resetForm()
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
              <h5 className="modal-title fs-6 fw-bold mb-0">Add Beam</h5>
            </div>
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              onClick={onClose}
            />
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
                <div className="col-4">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Beam ID
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    data-add-beam-field="beamNo"
                    placeholder="e.g. B#G 174"
                    value={beamNo}
                    onChange={(e) => {
                      setBeamNo(e.target.value)
                      setError(null)
                    }}
                    onKeyDown={(e) => handleFieldKeyDown(e, 'beamNo')}
                    autoFocus
                    required
                  />
                </div>

                <div className="col-4">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    {lotKind} #
                  </label>
                  <div className="input-group">
                    <button
                      type="button"
                      className="btn btn-outline-secondary sara-lot-kind-btn"
                      aria-label="Lot kind — click to switch Sw / Wp"
                      title="Click: Sw # ↔ Wp #"
                      onClick={() => setLotKind((k) => (k === 'Sw' ? 'Wp' : 'Sw'))}
                    >
                      {lotKind} #
                    </button>
                    <input
                      type="text"
                      className="form-control"
                      data-add-beam-field="swLot"
                      placeholder="e.g. 331"
                      value={swLot}
                      onChange={(e) => setSwLot(e.target.value)}
                      onKeyDown={(e) => handleFieldKeyDown(e, 'swLot')}
                      required
                    />
                  </div>
                </div>

                <div className="col-4">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Beam Repeat
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    data-add-beam-field="beamRepeat"
                    placeholder="optional"
                    value={beamRepeat}
                    onChange={(e) => setBeamRepeat(e.target.value)}
                    onKeyDown={(e) => handleFieldKeyDown(e, 'beamRepeat')}
                  />
                </div>

                <div className="col-12">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Location
                  </label>
                  <select
                    className="form-select"
                    data-add-beam-field="placement"
                    value={placement}
                    onChange={(e) => setPlacement(e.target.value)}
                    onKeyDown={(e) => handleFieldKeyDown(e, 'placement')}
                  >
                    <optgroup label="Storage / Pre-Weaving">
                      <option value="STORE">In Stock (Store)</option>
                      <option value="SIZING">Sizing Section</option>
                    </optgroup>
                    <optgroup label="Mount on Loom">
                      {activeLooms
                        .filter((l) => loomHasFreeBeamSlot(l, beams))
                        .map((l) => {
                          const count = getMountedBeamsOnLoom(beams, l.loomNumber).length
                          const max = loomBeamCapacity(l)
                          return (
                            <option key={l.loomNumber} value={String(l.loomNumber)}>
                              Loom {l.loomNumber}
                              {l.isTwinBeam
                                ? ` [Twin Beam${count > 0 ? `: ${count}/${max}` : ''}]`
                                : ''}{' '}
                              — {LOOM_STATUS_LABEL[l.status as LoomStatus]}
                            </option>
                          )
                        })}
                    </optgroup>
                  </select>
                </div>

                {showMountDate && (
                  <div className="col-6">
                    <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                      Mount Date
                    </label>
                    <DateStepper
                      value={mountedDate}
                      onChange={setMountedDate}
                      ariaLabel="Mount date"
                    />
                  </div>
                )}

                <div className="col-12">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Yarn Warp
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    data-add-beam-field="warp"
                    placeholder="e.g. 45/1 Pv White+46/1 Pv Silver"
                    value={warp}
                    onChange={(e) => setWarp(e.target.value)}
                    onKeyDown={(e) => handleFieldKeyDown(e, 'warp')}
                  />
                </div>

                <div className="col-4">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Reed
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    data-add-beam-field="reed"
                    placeholder="e.g. 60"
                    min={1}
                    value={reed}
                    onChange={(e) => {
                      setReed(e.target.value === '' ? '' : Number(e.target.value))
                      setThreadsTouched(false)
                    }}
                    onKeyDown={(e) => handleFieldKeyDown(e, 'reed')}
                  />
                </div>

                <div className="col-4">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Width (in)
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    data-add-beam-field="width"
                    placeholder="e.g. 66"
                    min={1}
                    value={width}
                    onChange={(e) => {
                      setWidth(e.target.value === '' ? '' : Number(e.target.value))
                      setThreadsTouched(false)
                    }}
                    onKeyDown={(e) => handleFieldKeyDown(e, 'width')}
                  />
                </div>

                <div className="col-4">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Total Thread
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    data-add-beam-field="threads"
                    placeholder="auto / edit"
                    min={0}
                    value={threads}
                    onChange={(e) => {
                      setThreadsTouched(true)
                      setThreads(e.target.value === '' ? '' : Number(e.target.value))
                    }}
                    onKeyDown={(e) => handleFieldKeyDown(e, 'threads')}
                  />
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Length (m)
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    data-add-beam-field="length"
                    placeholder="e.g. 1500"
                    min={0}
                    value={length}
                    onChange={(e) => setLength(e.target.value === '' ? '' : Number(e.target.value))}
                    onKeyDown={(e) => handleFieldKeyDown(e, 'length')}
                  />
                </div>

                <div className="col-6">
                  <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                    Machine
                  </label>
                  <select
                    className="form-select"
                    data-add-beam-field="loomType"
                    value={loomType}
                    onChange={(e) => setLoomType(e.target.value)}
                    onKeyDown={(e) => handleFieldKeyDown(e, 'loomType')}
                  >
                    <option value="G6200">G6200</option>
                    <option value="G6300">G6300</option>
                    <option value="PU">PU</option>
                  </select>
                </div>
              </div>
              <div className="form-text small mt-2 mb-0">
                Enter / → next · ← previous · Ctrl+Enter save · Esc close
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
                disabled={!beamNo.trim() || !swLot.trim()}
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
