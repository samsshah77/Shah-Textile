'use client'

import { useMemo, useState } from 'react'
import { DailyLoomProductionEntry } from '@/types/production'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { NumericCellInput, TextCellInput } from '@/components/shared/NumericCellInput'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { loomConditionRowStyle } from '@/constants/loomConditions'

interface FloorEntryTableProps {
  entries: DailyLoomProductionEntry[]
  onUpdateEntry: (loomNumber: number, patch: Partial<DailyLoomProductionEntry>, editorName?: string) => void
  canEdit?: boolean
  selectedDate?: string
  onSubmitForApproval?: () => Promise<{ success: boolean; error?: string }>
  onApproveSheet?: () => Promise<{ success: boolean; error?: string }>
  onUnlockSheet?: () => Promise<{ success: boolean; error?: string }>
}

const DEFAULT_WIDTHS: Record<string, number> = {
  loom: 72,
  quality: 120,
  type: 100,
  roller: 88,
  shiftA: 88,
  shiftB: 88,
  totalAB: 94,
  remarks: 150,
  lot: 130,
}

/** Daily floor punch — table-level Edit; Enter moves to next field. */
export function FloorEntryTable({
  entries,
  onUpdateEntry,
  onSubmitForApproval,
  onApproveSheet,
  onUnlockSheet,
}: FloorEntryTableProps) {
  const { user, isAdmin, isQualityController } = useAuth()
  const [mode, setMode] = useState<TableGridMode>('table')
  const [tableEdit, setTableEdit] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'danger'; text: string } | null>(null)

  const { widths, setColumnWidth, resetAllWidths, resetColumnWidth } = useResizableColumns(
    'sara_prod_entry_col_widths_v3',
    DEFAULT_WIDTHS
  )

  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  )

  // Status & multi-user checks
  const isApproved = useMemo(
    () => entries.length > 0 && entries.some((e) => e.approvalStatus === 'APPROVED'),
    [entries]
  )
  const submittedBy = useMemo(() => entries.find((e) => e.submittedBy)?.submittedBy, [entries])
  const approvedBy = useMemo(() => entries.find((e) => e.approvedBy)?.approvedBy, [entries])
  const approvedAt = useMemo(() => entries.find((e) => e.approvedAt)?.approvedAt, [entries])
  const lastEditedBy = useMemo(() => entries.find((e) => e.lastEditedBy)?.lastEditedBy, [entries])

  // Operator (Ahmer) is locked if sheet is APPROVED by Javed Sir
  // Admin (Javed Sir) is NEVER locked — he can edit anytime!
  const isLockedForOperator = isApproved && !isAdmin
  const canUserEdit = isAdmin ? true : (isQualityController && !isLockedForOperator)
  const canEdit = canUserEdit && tableEdit

  // Show notice ONLY when Ahmar has edited/submitted and it is not yet finalized
  const hasPendingAhmarEntry =
    !isApproved &&
    Boolean(
      submittedBy ||
        (lastEditedBy && lastEditedBy.toLowerCase().includes('ahmer'))
    )

  const patchEntry = (loomNumber: number, patch: Partial<DailyLoomProductionEntry>) => {
    const current = entries.find((e) => e.loomNumber === loomNumber)
    const shiftA = patch.shiftAMeters ?? current?.shiftAMeters ?? 0
    const shiftB = patch.shiftBMeters ?? current?.shiftBMeters ?? 0
    const editor = user?.name || (isAdmin ? 'Javed Sir' : 'Ahmer')
    onUpdateEntry(
      loomNumber,
      {
        ...patch,
        approvalStatus: isApproved ? 'APPROVED' : 'DRAFT',
        lastEditedBy: editor,
        totalMeters:
          patch.totalMeters ??
          (patch.shiftAMeters !== undefined || patch.shiftBMeters !== undefined
            ? shiftA + shiftB
            : current?.totalMeters),
      },
      editor
    )
  }

  const handleApprove = async () => {
    if (!onApproveSheet) return
    setIsSubmitting(true)
    setFeedbackMsg(null)
    try {
      const res = await onApproveSheet()
      if (res.success) {
        setFeedbackMsg({ type: 'success', text: 'Production sheet finalized.' })
        setTableEdit(false)
      } else {
        setFeedbackMsg({ type: 'danger', text: res.error || 'Finalize failed' })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitForApproval = async () => {
    if (!onSubmitForApproval) return
    setIsSubmitting(true)
    setFeedbackMsg(null)
    try {
      const res = await onSubmitForApproval()
      if (res.success) {
        setFeedbackMsg({ type: 'success', text: 'Entries successfully submitted to Javed Sir.' })
        setTableEdit(false)
      } else {
        setFeedbackMsg({ type: 'danger', text: res.error || 'Submission failed' })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const editToggle = (
    <button
      type="button"
      className={`btn btn-sm ${tableEdit ? 'btn-warning' : 'btn-outline-secondary'}`}
      disabled={!canUserEdit}
      title={
        isLockedForOperator
          ? 'Finalized by Javed Sir (Locked)'
          : tableEdit
            ? 'Lock table (view only)'
            : 'Enable editing'
      }
      onClick={() => setTableEdit((v) => !v)}
    >
      <i className={`bi ${tableEdit ? 'bi-lock' : 'bi-pencil-square'} me-1`} />
      {tableEdit ? 'Done' : 'Edit'}
    </button>
  )

  return (
    <div className="card">
      {/* Notice ONLY when Ahmar has pending entries waiting for Javed Sir */}
      {isAdmin && hasPendingAhmarEntry && (
        <div className="alert alert-info py-2 px-3 mx-3 mt-3 mb-0 d-flex flex-wrap align-items-center justify-content-between gap-2 small">
          <div>
            <i className="bi bi-info-circle-fill me-1 text-primary" />
            <strong>Ahmer ne entries punch ki hain:</strong> Review kar ke Finalize karein.
          </div>
          <button
            type="button"
            className="btn btn-sm btn-success fw-semibold shadow-xs"
            disabled={isSubmitting}
            onClick={handleApprove}
          >
            <i className="bi bi-check2-circle me-1" />
            Finalize Sheet
          </button>
        </div>
      )}

      {feedbackMsg && (
        <div className={`alert alert-${feedbackMsg.type} alert-dismissible py-2 px-3 mx-3 mt-3 mb-0 small`} role="alert">
          {feedbackMsg.text}
          <button type="button" className="btn-close py-2" onClick={() => setFeedbackMsg(null)} aria-label="Close" />
        </div>
      )}

      <div className="card-header d-flex flex-row flex-wrap gap-2 justify-content-between align-items-center">
        <div className="min-w-0">
          <h3 className="card-title mb-0">Daily Entry</h3>
          {tableEdit && (
            <div className="small text-warning mt-1 mb-0">
              Edit on — Enter / Tab next field · arrows move cells
            </div>
          )}
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center ms-auto">
          {/* Javed Sir direct Finalize button if not yet finalized */}
          {isAdmin && !isApproved && !hasPendingAhmarEntry && (
            <button
              type="button"
              className="btn btn-sm btn-outline-success fw-semibold"
              disabled={isSubmitting}
              onClick={handleApprove}
              title="Finalize & save production to database"
            >
              <i className="bi bi-check2 me-1" />
              Finalize
            </button>
          )}

          {/* Ahmar Submit button if not yet finalized */}
          {!isAdmin && isQualityController && !isApproved && (
            <button
              type="button"
              className="btn btn-sm btn-primary fw-semibold"
              disabled={isSubmitting}
              onClick={handleSubmitForApproval}
            >
              <i className="bi bi-send me-1" />
              Submit to Admin
            </button>
          )}

          {editToggle}
          <ViewModeToggle mode={mode} onChange={setMode} />
          {mode === 'table' && (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={resetAllWidths}>
              Reset columns
            </button>
          )}
        </div>
      </div>

      {mode === 'grid' ? (
        <div className="master-grid">
          {entries.map((e, rowIdx) => (
            <div
              key={e.loomNumber}
              className={`master-grid-card${canEdit ? ' sara-edit-card' : ''}`}
              style={canEdit ? undefined : loomConditionRowStyle(e.status, e.remarks)}
            >
              <div className="fw-semibold">Loom Number {e.loomNumber}</div>
              <div className="small text-secondary text-truncate">
                {e.qualityName || '—'} · {e.fabricType || '—'}
              </div>

              <label className="small mb-0">Roller Hours</label>
              {canEdit ? (
                <NumericCellInput
                  className="form-control form-control-sm text-end"
                  value={e.rollerHours ?? 0}
                  navRow={rowIdx}
                  navCol={0}
                  onValueChange={(v) => patchEntry(e.loomNumber, { rollerHours: v })}
                />
              ) : (
                <div className="form-control form-control-sm bg-light text-end">
                  {e.rollerHours ?? 0}
                </div>
              )}

              <div className="d-flex gap-2">
                <div className="flex-fill">
                  <label className="small mb-0">Actual Shift A</label>
                  {canEdit ? (
                    <NumericCellInput
                      className="form-control form-control-sm text-end"
                      value={e.shiftAMeters ?? 0}
                      navRow={rowIdx}
                      navCol={1}
                      onValueChange={(v) => patchEntry(e.loomNumber, { shiftAMeters: v })}
                    />
                  ) : (
                    <div className="form-control form-control-sm bg-light text-end">
                      {(e.shiftAMeters ?? 0).toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="flex-fill">
                  <label className="small mb-0">Actual Shift B</label>
                  {canEdit ? (
                    <NumericCellInput
                      className="form-control form-control-sm text-end"
                      value={e.shiftBMeters ?? 0}
                      navRow={rowIdx}
                      navCol={2}
                      onValueChange={(v) => patchEntry(e.loomNumber, { shiftBMeters: v })}
                    />
                  ) : (
                    <div className="form-control form-control-sm bg-light text-end">
                      {(e.shiftBMeters ?? 0).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>

              <div className="small">
                Actual Total (A Plus B):{' '}
                <strong>{(e.totalMeters ?? 0).toLocaleString()}</strong>
              </div>

              <label className="small mb-0">Remarks</label>
              {canEdit ? (
                <TextCellInput
                  className="form-control form-control-sm"
                  value={e.remarks || ''}
                  placeholder="Remarks"
                  navRow={rowIdx}
                  navCol={3}
                  onValueChange={(v) => patchEntry(e.loomNumber, { remarks: v })}
                />
              ) : (
                <div className="small text-secondary">{e.remarks || '—'}</div>
              )}

              <label className="small mb-0">Lot Number</label>
              {canEdit ? (
                <TextCellInput
                  className="form-control form-control-sm"
                  value={e.lot || ''}
                  placeholder="Lot Number"
                  navRow={rowIdx}
                  navCol={4}
                  onValueChange={(v) => patchEntry(e.loomNumber, { lot: v })}
                />
              ) : (
                <div className="small text-secondary">{e.lot || '—'}</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div
          className="card-body p-0"
          style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
        >
          <table
            className="table table-sm table-bordered table-hover mb-0 align-middle text-nowrap"
            style={{ tableLayout: 'fixed', width: tableMinWidth, minWidth: tableMinWidth }}
          >
            <colgroup>
              {Object.keys(DEFAULT_WIDTHS).map((key) => (
                <col key={key} style={{ width: widths[key] }} />
              ))}
            </colgroup>
            <thead className="table-light">
              <tr>
                <ResizableTh columnKey="loom" width={widths.loom} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Loom Number
                </ResizableTh>
                <ResizableTh columnKey="quality" width={widths.quality} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Quality Name
                </ResizableTh>
                <ResizableTh columnKey="type" width={widths.type} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Fabric Type
                </ResizableTh>
                <ResizableTh columnKey="roller" width={widths.roller} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
                  style={{ whiteSpace: 'normal', fontSize: '0.75rem' }}>
                  Roller Hours
                </ResizableTh>
                <ResizableTh columnKey="shiftA" width={widths.shiftA} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
                  style={{ whiteSpace: 'normal', fontSize: '0.75rem' }}>
                  Actual Shift A
                </ResizableTh>
                <ResizableTh columnKey="shiftB" width={widths.shiftB} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
                  style={{ whiteSpace: 'normal', fontSize: '0.75rem' }}>
                  Actual Shift B
                </ResizableTh>
                <ResizableTh columnKey="totalAB" width={widths.totalAB} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
                  style={{ whiteSpace: 'normal', fontSize: '0.75rem' }}>
                  Actual Total (A Plus B)
                </ResizableTh>
                <ResizableTh columnKey="remarks" width={widths.remarks} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Remarks
                </ResizableTh>
                <ResizableTh columnKey="lot" width={widths.lot} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Lot Number
                </ResizableTh>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, rowIdx) => (
                <tr
                  key={e.loomNumber}
                  className={canEdit ? 'sara-edit-row' : undefined}
                  style={canEdit ? undefined : loomConditionRowStyle(e.status, e.remarks)}
                >
                  <td className="fw-semibold px-2">{e.loomNumber}</td>
                  <td className="px-2 text-truncate">{e.qualityName || '—'}</td>
                  <td className="small text-secondary px-2 text-truncate">
                    {e.fabricType || '—'}
                  </td>
                  <td className="px-1">
                    {canEdit ? (
                      <NumericCellInput
                        className="form-control form-control-sm text-end"
                        style={{ width: '100%', minWidth: 0 }}
                        value={e.rollerHours ?? 0}
                        navRow={rowIdx}
                        navCol={0}
                        onValueChange={(v) => patchEntry(e.loomNumber, { rollerHours: v })}
                      />
                    ) : (
                      <div className="text-end px-1">{e.rollerHours ?? 0}</div>
                    )}
                  </td>
                  <td className="px-1">
                    {canEdit ? (
                      <NumericCellInput
                        className="form-control form-control-sm text-end"
                        style={{ width: '100%', minWidth: 0 }}
                        value={e.shiftAMeters ?? 0}
                        navRow={rowIdx}
                        navCol={1}
                        onValueChange={(v) => patchEntry(e.loomNumber, { shiftAMeters: v })}
                      />
                    ) : (
                      <div className="text-end px-1">{(e.shiftAMeters ?? 0).toLocaleString()}</div>
                    )}
                  </td>
                  <td className="px-1">
                    {canEdit ? (
                      <NumericCellInput
                        className="form-control form-control-sm text-end"
                        style={{ width: '100%', minWidth: 0 }}
                        value={e.shiftBMeters ?? 0}
                        navRow={rowIdx}
                        navCol={2}
                        onValueChange={(v) => patchEntry(e.loomNumber, { shiftBMeters: v })}
                      />
                    ) : (
                      <div className="text-end px-1">{(e.shiftBMeters ?? 0).toLocaleString()}</div>
                    )}
                  </td>
                  <td className="text-end fw-semibold px-2">
                    {(e.totalMeters ?? 0).toLocaleString()}
                  </td>
                  <td className="px-1">
                    {canEdit ? (
                      <TextCellInput
                        className="form-control form-control-sm"
                        style={{ width: '100%', minWidth: 0 }}
                        value={e.remarks || ''}
                        placeholder="Beam End, Fault…"
                        navRow={rowIdx}
                        navCol={3}
                        onValueChange={(v) => patchEntry(e.loomNumber, { remarks: v })}
                      />
                    ) : (
                      <div className="px-1 text-truncate" title={e.remarks || ''}>
                        {e.remarks || '—'}
                      </div>
                    )}
                  </td>
                  <td className="px-1">
                    {canEdit ? (
                      <TextCellInput
                        className="form-control form-control-sm"
                        style={{ width: '100%', minWidth: 0 }}
                        value={e.lot || ''}
                        placeholder="Lot Number…"
                        navRow={rowIdx}
                        navCol={4}
                        onValueChange={(v) => patchEntry(e.loomNumber, { lot: v })}
                      />
                    ) : (
                      <div className="px-1 text-truncate" title={e.lot || ''}>
                        {e.lot || '—'}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
