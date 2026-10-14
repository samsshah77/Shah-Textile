'use client'

import { useEffect, useState } from 'react'
import type { DailyLoomProductionEntry } from '@/types/production'
import {
  FabricFaultMultiInput,
  joinFabricFaults,
  parseFabricFaults,
} from '@/components/floor/FabricFaultMultiInput'

/** Build searchable `fabricFault` summary from per-shift lines (keeps old field alive). */
export function buildFabricFaultSummary(
  shiftA?: string | null,
  shiftB?: string | null,
  legacyFallback?: string | null
): string {
  const parts: string[] = []
  for (const line of parseFabricFaults(shiftA).filter((s) => s.trim())) {
    parts.push(`A: ${line}`)
  }
  for (const line of parseFabricFaults(shiftB).filter((s) => s.trim())) {
    parts.push(`B: ${line}`)
  }
  if (parts.length > 0) return parts.join('\n')
  return String(legacyFallback || '').trim()
}

/** Split stored fields / legacy `fabricFault` into Shift A & B without dropping text. */
export function resolveShiftFaults(entry: {
  fabricFault?: string | null
  fabricFaultA?: string | null
  fabricFaultB?: string | null
}): { shiftA: string; shiftB: string } {
  const hasSplit =
    (entry.fabricFaultA != null && String(entry.fabricFaultA).trim() !== '') ||
    (entry.fabricFaultB != null && String(entry.fabricFaultB).trim() !== '')
  if (hasSplit) {
    return {
      shiftA: String(entry.fabricFaultA || ''),
      shiftB: String(entry.fabricFaultB || ''),
    }
  }

  const a: string[] = []
  const b: string[] = []
  const other: string[] = []
  for (const line of parseFabricFaults(entry.fabricFault).filter((s) => s.trim())) {
    const m = line.match(/^\s*([ABab])\s*[:.\-]\s*(.*)$/)
    if (m) {
      if (m[1].toUpperCase() === 'A') a.push(m[2])
      else b.push(m[2])
    } else {
      other.push(line)
    }
  }
  // Unprefixed legacy text stays under Shift A so nothing is lost.
  return {
    shiftA: joinFabricFaults([...a, ...other]),
    shiftB: joinFabricFaults(b),
  }
}

export function fabricFaultPreview(entry: {
  fabricFault?: string | null
  fabricFaultA?: string | null
  fabricFaultB?: string | null
}): string {
  const { shiftA, shiftB } = resolveShiftFaults(entry)
  return buildFabricFaultSummary(shiftA, shiftB, entry.fabricFault)
}

interface FabricFaultShiftDialogProps {
  entry: DailyLoomProductionEntry | null
  open: boolean
  canEdit?: boolean
  onClose: () => void
  onSave: (patch: Partial<DailyLoomProductionEntry>) => void
}

/**
 * Dialog: Shift A and Shift B fabric faults as separate entries.
 * Persists fabricFaultA / fabricFaultB and keeps fabricFault summary for filters.
 */
export function FabricFaultShiftDialog({
  entry,
  open,
  canEdit = false,
  onClose,
  onSave,
}: FabricFaultShiftDialogProps) {
  const [shiftA, setShiftA] = useState('')
  const [shiftB, setShiftB] = useState('')

  useEffect(() => {
    if (!open || !entry) return
    const resolved = resolveShiftFaults(entry)
    setShiftA(resolved.shiftA)
    setShiftB(resolved.shiftB)
  }, [open, entry])

  if (!open || !entry) return null

  const seg =
    entry.segmentIndex && entry.segmentIndex > 1 ? ` · Part ${entry.segmentIndex}` : ''

  const handleSave = () => {
    if (!canEdit) {
      onClose()
      return
    }
    const a = joinFabricFaults(parseFabricFaults(shiftA))
    const b = joinFabricFaults(parseFabricFaults(shiftB))
    onSave({
      fabricFaultA: a,
      fabricFaultB: b,
      fabricFault: buildFabricFaultSummary(a, b, ''),
      segmentIndex: entry.segmentIndex,
    })
    onClose()
  }

  return (
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fabric-fault-shift-title"
      style={{ background: 'rgba(15, 23, 42, 0.45)' }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content border-0 shadow">
          <div className="modal-header py-2 px-3">
            <div>
              <h5 id="fabric-fault-shift-title" className="modal-title fs-6 fw-bold mb-0">
                Fabric Fault — Loom #{entry.loomNumber}
                {seg}
              </h5>
              <div className="small text-secondary">
                {entry.qualityName || '—'} · Shift A / Shift B alag entry
              </div>
            </div>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>
          <div className="modal-body px-3 py-3">
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label small fw-semibold mb-1">
                  <span className="badge text-bg-primary me-1">A</span>
                  Shift A fault
                </label>
                <FabricFaultMultiInput
                  value={shiftA}
                  canEdit={canEdit}
                  placeholder="Shift A fabric fault…"
                  onChange={setShiftA}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold mb-1">
                  <span className="badge text-bg-secondary me-1">B</span>
                  Shift B fault
                </label>
                <FabricFaultMultiInput
                  value={shiftB}
                  canEdit={canEdit}
                  placeholder="Shift B fabric fault…"
                  onChange={setShiftB}
                />
              </div>
            </div>
            <p className="form-text small mb-0 mt-2">
              Purani single fault entries Shift A me dikhengi — data wipe nahi hota.
            </p>
          </div>
          <div className="modal-footer py-2 px-3">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
              {canEdit ? 'Cancel' : 'Close'}
            </button>
            {canEdit ? (
              <button type="button" className="btn btn-sm btn-primary" onClick={handleSave}>
                Save faults
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
