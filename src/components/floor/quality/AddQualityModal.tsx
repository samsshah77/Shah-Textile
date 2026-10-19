'use client'

import type { Dispatch, KeyboardEvent, FormEvent, SetStateAction } from 'react'
import { QUALITY_FABRIC_TYPES, normalizeFabricType } from '@/services/productionMastersService'

/** Field order used by Enter / Tab to move through the Add Quality form. */
export const ADD_QUALITY_FIELD_ORDER = [
  'name',
  'fabricType',
  'widthInch',
  'warpYarn',
  'weftYarn',
  'weavePlan',
  'reed',
  'pick',
  'gsm',
] as const
export type AddQualityField = (typeof ADD_QUALITY_FIELD_ORDER)[number]

export type AddQualityForm = {
  name: string
  fabricType: string
  weavePlan: string
  warpYarn: string
  weftYarn: string
  reed: string
  pick: string
  widthInch: string
  gsm: string
}

/** The "Add Quality" dialog of the Quality Master. State and saving stay in the table. */
export function AddQualityModal({
  addForm,
  setAddForm,
  handleAddFormKeyDown,
  handleCreateQuality,
  setIsAddModalOpen,
}: {
  addForm: AddQualityForm
  setAddForm: Dispatch<SetStateAction<AddQualityForm>>
  handleAddFormKeyDown: (e: KeyboardEvent<HTMLElement>, field: AddQualityField) => void
  handleCreateQuality: (e: FormEvent) => void
  setIsAddModalOpen: (open: boolean) => void
}) {
  return (
      <div
        className="modal fade show d-block"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          zIndex: 1055,
        }}
      >
        <div
          className="modal-dialog modal-dialog-centered modal-dialog-scrollable mx-2 mx-sm-auto my-2"
          style={{
            maxWidth: 560,
            width: '100%',
            maxHeight: 'min(88dvh, 720px)',
            marginTop: 'auto',
            marginBottom: 'auto',
          }}
        >
          <div
            className="modal-content border-0 shadow-lg d-flex flex-column"
            style={{
              borderRadius: '14px',
              overflow: 'hidden',
              maxHeight: 'min(88dvh, 720px)',
            }}
          >
            <div className="modal-header bg-light py-3 px-4 border-bottom flex-shrink-0">
              <div className="d-flex align-items-center gap-2">
                <span className="badge bg-primary px-2.5 py-1.5 fs-7">
                  <i className="bi bi-tags me-1" /> Quality
                </span>
                <h5 className="modal-title fs-6 fw-bold mb-0">Add Quality</h5>
              </div>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                onClick={() => setIsAddModalOpen(false)}
              />
            </div>
            <form
              onSubmit={handleCreateQuality}
              className="sara-add-beam-form d-flex flex-column flex-grow-1"
              style={{ minHeight: 0 }}
            >
              <div
                className="modal-body p-4"
                style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: '1 1 auto' }}
              >
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                      Quality Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      data-add-q-field="name"
                      className="form-control"
                      placeholder="e.g. PARCOPV, EVEREST"
                      value={addForm.name}
                      onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                      onKeyDown={(e) => handleAddFormKeyDown(e, 'name')}
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                      Fabric Type
                    </label>
                    <select
                      data-add-q-field="fabricType"
                      className="form-select"
                      value={normalizeFabricType(addForm.fabricType)}
                      onChange={(e) => setAddForm({ ...addForm, fabricType: e.target.value })}
                      onKeyDown={(e) => handleAddFormKeyDown(e, 'fabricType')}
                    >
                      {QUALITY_FABRIC_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                      Width (Inches)
                    </label>
                    <input
                      type="number"
                      data-add-q-field="widthInch"
                      className="form-control"
                      placeholder="e.g. 66"
                      value={addForm.widthInch}
                      onChange={(e) => setAddForm({ ...addForm, widthInch: e.target.value })}
                      onKeyDown={(e) => handleAddFormKeyDown(e, 'widthInch')}
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                      Warp Yarn
                    </label>
                    <input
                      type="text"
                      list="quality-warp-stock"
                      data-add-q-field="warpYarn"
                      className="form-control"
                      placeholder="Beam stock se warp likho"
                      value={addForm.warpYarn}
                      onChange={(e) => setAddForm({ ...addForm, warpYarn: e.target.value })}
                      onKeyDown={(e) => handleAddFormKeyDown(e, 'warpYarn')}
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                      Weft Yarn
                    </label>
                    <input
                      type="text"
                      list="quality-weft-stock"
                      data-add-q-field="weftYarn"
                      className="form-control"
                      placeholder="Yarn stock se weft likho"
                      value={addForm.weftYarn}
                      onChange={(e) => setAddForm({ ...addForm, weftYarn: e.target.value })}
                      onKeyDown={(e) => handleAddFormKeyDown(e, 'weftYarn')}
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                      Weave Plan
                    </label>
                    <input
                      type="text"
                      data-add-q-field="weavePlan"
                      className="form-control"
                      placeholder="e.g. 2/1 Twill"
                      value={addForm.weavePlan}
                      onChange={(e) => setAddForm({ ...addForm, weavePlan: e.target.value })}
                      onKeyDown={(e) => handleAddFormKeyDown(e, 'weavePlan')}
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                      Reed
                    </label>
                    <input
                      type="number"
                      data-add-q-field="reed"
                      className="form-control"
                      placeholder="e.g. 120"
                      value={addForm.reed}
                      onChange={(e) => setAddForm({ ...addForm, reed: e.target.value })}
                      onKeyDown={(e) => handleAddFormKeyDown(e, 'reed')}
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                      Pick
                    </label>
                    <input
                      type="number"
                      data-add-q-field="pick"
                      className="form-control"
                      placeholder="e.g. 60"
                      value={addForm.pick}
                      onChange={(e) => setAddForm({ ...addForm, pick: e.target.value })}
                      onKeyDown={(e) => handleAddFormKeyDown(e, 'pick')}
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label small fw-semibold sara-add-beam-label mb-1">
                      GSM (2 Decimals)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      data-add-q-field="gsm"
                      className="form-control"
                      placeholder="e.g. 1.77"
                      value={addForm.gsm}
                      onChange={(e) => setAddForm({ ...addForm, gsm: e.target.value })}
                      onKeyDown={(e) => handleAddFormKeyDown(e, 'gsm')}
                    />
                  </div>
                </div>
                <div className="form-text small mt-2 mb-0">
                  Enter / → next · Ctrl+Enter save · Esc close
                </div>
              </div>

              <div className="modal-footer bg-light px-4 py-3 border-top flex-shrink-0">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-sm btn-primary px-3">
                  <i className="bi bi-plus-lg me-1" /> Add Quality
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
  )
}
