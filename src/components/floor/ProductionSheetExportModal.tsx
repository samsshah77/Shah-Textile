'use client'

import { exportSheetPdf } from '@/components/shared/ExportPdfButton'
import { longDayDateFromYmd } from '@/lib/longDate'
import { FileDown, Printer, X, Info } from 'lucide-react'

import type { DailyLoomProductionEntry } from '@/types/production'

export type SheetTextSize = 'normal' | 'large' | 'xlarge'

interface ProductionSheetExportModalProps {
  isOpen: boolean
  onClose: () => void
  sheetDate: string
  textSize?: SheetTextSize
  onChangeTextSize?: (size: SheetTextSize) => void
  entries?: DailyLoomProductionEntry[]
}

export function ProductionSheetExportModal({
  isOpen,
  onClose,
  sheetDate,
  entries,
}: ProductionSheetExportModalProps) {
  if (!isOpen) return null

  const formattedDate = longDayDateFromYmd(sheetDate)

  const handleSavePdf = () => {
    onClose()
    if (entries && entries.length > 0) {
      void import('@/lib/floor/generateProductionPdf').then((m) => m.downloadProductionPdf(entries, sheetDate))
    } else {
      exportSheetPdf(`Production-Sheet-${sheetDate}`, `Production Sheet - ${formattedDate}`)
    }
  }

  const handlePrint = () => {
    onClose()
    exportSheetPdf(`Production-Sheet-${sheetDate}`, `Production Sheet - ${formattedDate}`)
  }

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center print:hidden d-print-none"
      style={{ zIndex: 1060, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="card shadow-lg border-0 rounded-4 overflow-hidden"
        style={{ maxWidth: 440, width: '92%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="card-header bg-primary text-white d-flex align-items-center justify-content-between py-3 px-4">
          <div>
            <h5 className="mb-0 fw-bold d-flex align-items-center gap-2">
              <FileDown className="size-5" />
              <span>Production Sheet — Export</span>
            </h5>
            <small className="text-white-50">{formattedDate} ({sheetDate})</small>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-link text-white p-0 text-decoration-none"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body */}
        <div className="card-body p-4 space-y-3">
          {/* Quick Notice */}
          <div className="p-2.5 bg-light rounded-3 border d-flex align-items-center gap-2 mb-3">
            <Info className="size-4 text-primary shrink-0" />
            <div className="small text-secondary" style={{ fontSize: '0.8rem', lineHeight: 1.4 }}>
              <strong>By Default Landscape:</strong> Sheet auto-landscape orientation me print aur save hogi.
            </div>
          </div>

          {/* Action Grid: Save PDF & Print Sheet */}
          <div className="row g-3 mb-2">
            {/* Save PDF */}
            <div className="col-6">
              <button
                type="button"
                onClick={handleSavePdf}
                className="btn btn-outline-danger w-100 p-3.5 d-flex flex-column align-items-center justify-content-center text-center rounded-3 h-100 shadow-sm"
              >
                <FileDown className="size-6 mb-2 text-danger" />
                <span className="fw-bold fs-6">Save as PDF</span>
                <span className="text-secondary mt-0.5" style={{ fontSize: '0.74rem' }}>
                  Landscape PDF file
                </span>
              </button>
            </div>

            {/* Direct Print */}
            <div className="col-6">
              <button
                type="button"
                onClick={handlePrint}
                className="btn btn-outline-primary w-100 p-3.5 d-flex flex-column align-items-center justify-content-center text-center rounded-3 h-100 shadow-sm"
              >
                <Printer className="size-6 mb-2 text-primary" />
                <span className="fw-bold fs-6">Print Sheet</span>
                <span className="text-secondary mt-0.5" style={{ fontSize: '0.74rem' }}>
                  Printer se hard copy
                </span>
              </button>
            </div>
          </div>

          {/* Footer Bar */}
          <div className="d-flex align-items-center justify-content-end pt-3 border-top">
            <button
              type="button"
              className="btn btn-sm btn-secondary px-3"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
