'use client'

import { useEffect, useMemo, useState, type CSSProperties, type FocusEvent } from 'react'
import { DailyLoomProductionEntry } from '@/types/production'
import { ViewModeToggle, type TableGridMode } from '@/components/shared/ViewModeToggle'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { NumericCellInput, TextCellInput } from '@/components/shared/NumericCellInput'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { loomConditionRowStyle } from '@/constants/loomConditions'
import { isQualityEndedSheetRow } from '@/services/productionMastersService'
import {
  FabricFaultShiftDialog,
  fabricFaultPreview,
} from '@/components/floor/FabricFaultShiftDialog'
import { TablePanScroll } from '@/components/shared/TablePanScroll'

interface FloorEntryTableProps {
  entries: DailyLoomProductionEntry[]
  onUpdateEntry: (loomNumber: number, patch: Partial<DailyLoomProductionEntry>, editorName?: string) => void
  onResetDayMeters?: (editorName?: string) => void
  /** Remove same-day Part 2+ row. */
  onRemoveQualitySegment?: (loomNumber: number, segmentIndex: number) => boolean
  canEdit?: boolean
  selectedDate?: string
  onSubmitForApproval?: () => Promise<{ success: boolean; error?: string }>
  onApproveSheet?: () => Promise<{ success: boolean; error?: string }>
  onUnlockSheet?: () => Promise<{ success: boolean; error?: string }>
  toolbarInChrome?: boolean
  tableEdit?: boolean
  onTableEditChange?: (next: boolean) => void
}

const DEFAULT_WIDTHS: Record<string, number> = {
  loom: 72,
  quality: 120,
  type: 100,
  roller: 88,
  shiftA: 88,
  shiftB: 88,
  totalAB: 94,
  weight: 88,
  remarks: 150,
  lot: 130,
  fabricFault: 200,
}

/** Daily floor punch — table-level Edit; Enter moves to next field. */
export function FloorEntryTable({
  entries,
  onUpdateEntry,
  onResetDayMeters,
  onRemoveQualitySegment,
  selectedDate,
  onSubmitForApproval,
  onApproveSheet,
  onUnlockSheet,
  toolbarInChrome = false,
  tableEdit: tableEditProp,
  onTableEditChange,
}: FloorEntryTableProps) {
  const { user, isAdmin, isQualityController } = useAuth()
  const { showConfirm, showSuccessSoon, showError } = useAlertDialog()
  const [mode, setMode] = useState<TableGridMode>('table')
  const [tableEditLocal, setTableEditLocal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'danger'; text: string } | null>(null)
  /** After Finalize, Reset stays off until someone edits Daily Entry again. */
  const [editedSinceFinalize, setEditedSinceFinalize] = useState(false)
  /** Loom# cell highlight while any field in that row is focused. */
  const [activeLoom, setActiveLoom] = useState<number | null>(null)
  const [faultDialogEntry, setFaultDialogEntry] = useState<DailyLoomProductionEntry | null>(null)

  const tableEdit = tableEditProp ?? tableEditLocal
  const setTableEdit = (next: boolean) => {
    onTableEditChange?.(next)
    if (tableEditProp === undefined) setTableEditLocal(next)
  }

  const { widths, setColumnWidth, resetColumnWidth } = useResizableColumns(
    'sara_prod_entry_col_widths_v5',
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

  useEffect(() => {
    setEditedSinceFinalize(false)
  }, [selectedDate, isApproved])

  // Operator (Ahmer) is locked if sheet is APPROVED by Javed Sir
  // Admin (Javed Sir) is NEVER locked — he can edit anytime!
  const isLockedForOperator = isApproved && !isAdmin
  const canUserEdit = isAdmin ? true : (isQualityController && !isLockedForOperator)
  const canEdit = canUserEdit && tableEdit
  const resetDisabled = !canUserEdit || (isApproved && !editedSinceFinalize)

  useEffect(() => {
    if (!canEdit) setActiveLoom(null)
  }, [canEdit])

  // Show notice ONLY when Ahmar has edited/submitted and it is not yet finalized
  const hasPendingAhmarEntry =
    !isApproved &&
    Boolean(
      submittedBy ||
        (lastEditedBy && lastEditedBy.toLowerCase().includes('ahmer'))
    )

  const markRowActive = (loomNumber: number) => {
    if (canEdit) setActiveLoom(loomNumber)
  }
  const clearRowActiveIfLeaving = (
    e: FocusEvent<HTMLElement>,
    loomNumber: number
  ) => {
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    setActiveLoom((cur) => (cur === loomNumber ? null : cur))
  }

  const segOf = (e: DailyLoomProductionEntry) =>
    Math.max(1, Math.floor(Number(e.segmentIndex) || 1))

  const loomHasParts = useMemo(() => {
    const maxByLoom = new Map<number, number>()
    for (const e of entries) {
      const seg = segOf(e)
      const prev = maxByLoom.get(e.loomNumber) || 1
      if (seg > prev) maxByLoom.set(e.loomNumber, seg)
    }
    return maxByLoom
  }, [entries])

  /** Day totals for the bottom row (every loom / part on this sheet). */
  const dayTotals = useMemo(() => {
    let rollerHours = 0
    let shiftA = 0
    let shiftB = 0
    let total = 0
    let weight = 0
    for (const e of entries) {
      rollerHours += Number(e.rollerHours) || 0
      shiftA += Number(e.shiftAMeters) || 0
      shiftB += Number(e.shiftBMeters) || 0
      total += Number(e.totalMeters) || 0
      weight += Number(e.weightKg) || 0
    }
    const looms = new Set(entries.map((e) => e.loomNumber)).size
    return { rollerHours, shiftA, shiftB, total, weight, looms }
  }, [entries])

  const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString()

  const showPartBadge = (e: DailyLoomProductionEntry) =>
    (loomHasParts.get(e.loomNumber) || 1) > 1

  const partBadgeClass = (seg: number) =>
    seg <= 1 ? 'text-bg-primary' : 'text-bg-warning'

  const partRowBg = (seg: number): CSSProperties | undefined => {
    if (seg <= 1) return { backgroundColor: 'rgba(13, 110, 253, 0.06)' }
    return { backgroundColor: 'rgba(255, 193, 7, 0.12)' }
  }

  const rowStyleFor = (e: DailyLoomProductionEntry): CSSProperties | undefined => {
    // Quality Ended: class `sara-sheet-quality-ended` paints cells via CSS (consistent).
    if (isQualityEndedSheetRow(e)) return undefined
    const base = canEdit ? undefined : loomConditionRowStyle(e.status, e.remarks)
    const partBg = showPartBadge(e) ? partRowBg(segOf(e)) : undefined
    if (!base && !partBg) return undefined
    return { ...base, ...partBg }
  }

  const patchEntry = (
    row: DailyLoomProductionEntry,
    patch: Partial<DailyLoomProductionEntry>
  ) => {
    const segmentIndex = segOf(row)
    const current =
      entries.find(
        (e) => e.loomNumber === row.loomNumber && segOf(e) === segmentIndex
      ) || row
    const shiftA = patch.shiftAMeters ?? current?.shiftAMeters ?? 0
    const shiftB = patch.shiftBMeters ?? current?.shiftBMeters ?? 0
    const editor = user?.name || (isAdmin ? 'Javed Sir' : 'Ahmer')
    if (isApproved) setEditedSinceFinalize(true)
    onUpdateEntry(
      row.loomNumber,
      {
        ...patch,
        segmentIndex,
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

  const handleRemovePart = (e: DailyLoomProductionEntry) => {
    if (!onRemoveQualitySegment || !canEdit) return
    const seg = segOf(e)
    if (seg <= 1) return
    const label = (e.qualityName || '').trim() || `Part ${seg}`
    showConfirm({
      title: `Part ${seg} delete?`,
      message: `Loom #${e.loomNumber} se "${label}" (P${seg}) hata denge. Is part ke meters bhi delete ho jayenge.`,
      type: 'confirm',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: () => {
        const ok = onRemoveQualitySegment(e.loomNumber, seg)
        if (ok) {
          setFeedbackMsg({ type: 'success', text: `Loom #${e.loomNumber} Part ${seg} delete ho gaya.` })
          showSuccessSoon({
            title: `Part ${seg} deleted`,
            message: `Loom #${e.loomNumber}: "${label}" hata diya.`,
          })
        } else {
          showError({
            title: 'Delete nahi hua',
            message: 'Dobara try karo.',
          })
        }
      },
    })
  }

  const handleResetDay = () => {
    if (resetDisabled || !onResetDayMeters) return
    showConfirm({
      title: 'Reset Daily Entry?',
      message:
        'Is date ke saare Roller Hours, Shift A aur Shift B zero ho jayenge. Quality / Lot same rahenge.',
      type: 'confirm',
      confirmText: 'Haan, zero karo',
      cancelText: 'Cancel',
      onConfirm: () => {
        const editor = user?.name || (isAdmin ? 'Javed Sir' : 'Ahmer')
        onResetDayMeters(editor)
        setFeedbackMsg({ type: 'success', text: 'Daily Entry meters zero ho gaye.' })
        showSuccessSoon({
          title: 'Reset Done',
          message: 'Daily Entry meters zero ho gaye.',
        })
      },
    })
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
        setEditedSinceFinalize(false)
        showSuccessSoon({
          title: 'Finalized',
          message: 'Production sheet finalize ho gayi.',
        })
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
      onClick={() => {
        if (tableEdit) {
          setTableEdit(false)
          showSuccessSoon({
            title: 'Saved',
            message: 'Daily entry edits save ho gayi hain.',
          })
        } else {
          setTableEdit(true)
        }
      }}
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

          {!toolbarInChrome && editToggle}
          <ViewModeToggle mode={mode} onChange={setMode} />
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            disabled={resetDisabled || isSubmitting}
            title={
              resetDisabled
                ? isApproved
                  ? 'Finalized — pehle Edit karke change karo, phir Reset chalega'
                  : 'Reset locked'
                : 'Zero Roller Hours + Shift A/B (confirmation ke baad)'
            }
            onClick={handleResetDay}
          >
            <i className="bi bi-arrow-counterclockwise me-1" />
            Reset
          </button>
        </div>
      </div>

      {mode === 'grid' ? (
        <div className="master-grid">
          {entries.map((e, rowIdx) => (
            <div
              key={e.id || `${e.loomNumber}-s${segOf(e)}`}
              className={`master-grid-card${canEdit ? ' sara-edit-card' : ''}${
                activeLoom === e.loomNumber ? ' sara-active-entry-card' : ''
              }${isQualityEndedSheetRow(e) ? ' sara-sheet-quality-ended' : ''}`}
              style={rowStyleFor(e)}
              onFocusCapture={() => markRowActive(e.loomNumber)}
              onBlurCapture={(ev) => clearRowActiveIfLeaving(ev, e.loomNumber)}
            >
              <div
                className={`fw-semibold${
                  activeLoom === e.loomNumber ? ' sara-active-loom-num rounded px-1' : ''
                }`}
              >
                Loom Number {e.loomNumber}
                {showPartBadge(e) ? (
                  <span
                    className={`badge ${partBadgeClass(segOf(e))} ms-1`}
                    style={{ fontSize: '0.65rem' }}
                  >
                    P{segOf(e)}
                  </span>
                ) : null}
                {canEdit && onRemoveQualitySegment && segOf(e) > 1 ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger py-0 px-1 ms-1"
                    style={{ fontSize: '0.65rem', lineHeight: 1.2 }}
                    title={`Part ${segOf(e)} delete`}
                    onClick={() => handleRemovePart(e)}
                  >
                    <i className="bi bi-trash" />
                  </button>
                ) : null}
              </div>
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
                  onValueChange={(v) => patchEntry(e, { rollerHours: v })}
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
                      onValueChange={(v) => patchEntry(e, { shiftAMeters: v })}
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
                      onValueChange={(v) => patchEntry(e, { shiftBMeters: v })}
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

              <label className="small mb-0">Weight (kg)</label>
              {canEdit ? (
                <NumericCellInput
                  className="form-control form-control-sm text-end"
                  value={e.weightKg ?? 0}
                  navRow={rowIdx}
                  navCol={3}
                  onValueChange={(v) => patchEntry(e, { weightKg: v })}
                />
              ) : (
                <div className="form-control form-control-sm bg-light text-end">
                  {e.weightKg ? fmt(e.weightKg) : '—'}
                </div>
              )}

              <label className="small mb-0">Remarks</label>
              <div
                className="small text-secondary"
                title="Remarks system se aate hain — Daily Entry pe edit nahi"
              >
                {e.remarks || '—'}
              </div>

              <label className="small mb-0">SW #</label>
              <div className="small text-secondary" title="Beam pe jo Sw# hai — Daily Entry pe edit nahi">
                {e.lot || '—'}
              </div>

              <label className="small mb-0">Fabric Fault</label>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary text-start w-100"
                onClick={() => setFaultDialogEntry(e)}
                title="Shift A / Shift B alag fault"
              >
                <span className="text-truncate d-inline-block w-100" style={{ maxWidth: '100%' }}>
                  {fabricFaultPreview(e) || (canEdit ? 'Shift A / B fault…' : '—')}
                </span>
              </button>
            </div>
          ))}
          {entries.length > 0 && (
            <div className="master-grid-card fw-semibold" style={{ backgroundColor: 'rgba(25, 135, 84, 0.08)' }}>
              <div>Total ({dayTotals.looms} looms)</div>
              <div className="small">Roller Hours: {fmt(dayTotals.rollerHours)}</div>
              <div className="small">Shift A: {fmt(dayTotals.shiftA)}</div>
              <div className="small">Shift B: {fmt(dayTotals.shiftB)}</div>
              <div className="small">Total (A Plus B): {fmt(dayTotals.total)}</div>
              <div className="small">Weight: {fmt(dayTotals.weight)} kg</div>
            </div>
          )}
        </div>
      ) : (
        <TablePanScroll className="card-body p-0">
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
                <ResizableTh columnKey="weight" width={widths.weight} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-1 text-center"
                  style={{ whiteSpace: 'normal', fontSize: '0.75rem' }}>
                  Weight (kg)
                </ResizableTh>
                <ResizableTh columnKey="remarks" width={widths.remarks} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Remarks
                </ResizableTh>
                <ResizableTh columnKey="lot" width={widths.lot} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  SW #
                </ResizableTh>
                <ResizableTh columnKey="fabricFault" width={widths.fabricFault} onResize={setColumnWidth} onReset={resetColumnWidth} className="px-2">
                  Fabric Fault
                </ResizableTh>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, rowIdx) => {
                const qualityEnded = isQualityEndedSheetRow(e)
                return (
                <tr
                  key={e.id || `${e.loomNumber}-s${segOf(e)}`}
                  className={[
                    canEdit ? 'sara-edit-row' : undefined,
                    activeLoom === e.loomNumber ? 'sara-active-entry-row' : undefined,
                    qualityEnded ? 'sara-sheet-quality-ended' : undefined,
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined}
                  style={rowStyleFor(e)}
                  onFocusCapture={() => markRowActive(e.loomNumber)}
                  onBlurCapture={(ev) => clearRowActiveIfLeaving(ev, e.loomNumber)}
                >
                  <td
                    className={`fw-semibold px-2${
                      activeLoom === e.loomNumber ? ' sara-active-loom-num' : ''
                    }`}
                  >
                    {e.loomNumber}
                    {showPartBadge(e) ? (
                      <span
                        className={`badge ${partBadgeClass(segOf(e))} ms-1`}
                        style={{ fontSize: '0.65rem' }}
                      >
                        P{segOf(e)}
                      </span>
                    ) : null}
                    {canEdit && onRemoveQualitySegment && segOf(e) > 1 ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger py-0 px-1 ms-1"
                        style={{ fontSize: '0.65rem', lineHeight: 1.2 }}
                        title={`Part ${segOf(e)} delete`}
                        onClick={() => handleRemovePart(e)}
                      >
                        <i className="bi bi-trash" />
                      </button>
                    ) : null}
                  </td>
                  <td
                    className={`px-2 text-truncate${qualityEnded ? ' text-secondary' : ''}`}
                  >
                    {e.qualityName || '—'}
                  </td>
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
                        onValueChange={(v) => patchEntry(e, { rollerHours: v })}
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
                        onValueChange={(v) => patchEntry(e, { shiftAMeters: v })}
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
                        onValueChange={(v) => patchEntry(e, { shiftBMeters: v })}
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
                      <NumericCellInput
                        className="form-control form-control-sm text-end"
                        style={{ width: '100%', minWidth: 0 }}
                        value={e.weightKg ?? 0}
                        navRow={rowIdx}
                        navCol={3}
                        onValueChange={(v) => patchEntry(e, { weightKg: v })}
                      />
                    ) : (
                      <div className="text-end px-1">{e.weightKg ? fmt(e.weightKg) : '—'}</div>
                    )}
                  </td>
                  <td className="px-1">
                    <div
                      className="px-1 text-truncate text-secondary"
                      title={
                        e.remarks
                          ? `${e.remarks} (system — edit nahi)`
                          : 'Remarks system se aate hain — Daily Entry pe edit nahi'
                      }
                    >
                      {e.remarks || '—'}
                    </div>
                  </td>
                  <td className="px-1">
                    <div
                      className="px-1 text-truncate text-secondary"
                      title={e.lot ? `${e.lot} (from beam Sw#)` : 'Beam pe Sw# set karo'}
                    >
                      {e.lot || '—'}
                    </div>
                  </td>
                  <td className="px-1" style={{ whiteSpace: 'normal' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-link text-decoration-none text-start p-0 w-100"
                      onClick={() => setFaultDialogEntry(e)}
                      title="Shift A / Shift B fabric fault"
                    >
                      <span className="small d-block text-truncate" style={{ maxWidth: '12rem' }}>
                        {fabricFaultPreview(e) || (
                          <span className="text-secondary">
                            {canEdit ? 'Open Shift A / B…' : '—'}
                          </span>
                        )}
                      </span>
                    </button>
                  </td>
                </tr>
              )})}
            </tbody>
            {entries.length > 0 && (
              <tfoot>
                <tr className="table-success fw-bold">
                  <td className="px-2" colSpan={3}>
                    Total <span className="fw-normal small text-secondary">({dayTotals.looms} looms)</span>
                  </td>
                  <td className="text-end px-2">{fmt(dayTotals.rollerHours)}</td>
                  <td className="text-end px-2">{fmt(dayTotals.shiftA)}</td>
                  <td className="text-end px-2">{fmt(dayTotals.shiftB)}</td>
                  <td className="text-end px-2">{fmt(dayTotals.total)}</td>
                  <td className="text-end px-2">{fmt(dayTotals.weight)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </TablePanScroll>
      )}

      <FabricFaultShiftDialog
        entry={faultDialogEntry}
        open={Boolean(faultDialogEntry)}
        canEdit={canEdit}
        onClose={() => setFaultDialogEntry(null)}
        onSave={(patch) => {
          if (!faultDialogEntry) return
          patchEntry(faultDialogEntry, patch)
        }}
      />
    </div>
  )
}
