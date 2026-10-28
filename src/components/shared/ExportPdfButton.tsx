'use client'

import { FileDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { applyPrintOrientation, type PrintOrientation } from '@/lib/printOrientation'

/**
 * Opens print / Save as PDF.
 * Document title stays "Sara Textiles" so browser header chrome (if enabled)
 * does not show the ugly filename. Sheet name goes on the in-page print header.
 */
export function exportSheetPdf(filename: string, sheetLabel?: string, orientation?: PrintOrientation) {
  if (typeof window === 'undefined') return

  const prevTitle = document.title
  const prevSheet = document.body.dataset.printSheet

  const label =
    sheetLabel ||
    filename
      .replace(/[-_]+/g, ' ')
      .replace(/\b\d{4}-\d{2}(-\d{2})?\b/g, '')
      .replace(/\s+/g, ' ')
      .trim() ||
    'Statement'

  document.title = 'Sara Textiles'
  document.body.dataset.printSheet = label
  const removeOrientation = applyPrintOrientation(orientation)

  const restore = () => {
    removeOrientation()
    document.title = prevTitle
    if (prevSheet === undefined) delete document.body.dataset.printSheet
    else document.body.dataset.printSheet = prevSheet
    window.removeEventListener('afterprint', restore)
  }

  window.addEventListener('afterprint', restore)
  window.print()
  window.setTimeout(restore, 2500)
}

type ExportPdfButtonProps = {
  /** Internal label / suggested name (used for sheet subtitle, not browser chrome) */
  filename: string
  /** Optional clean sheet title for the print header */
  sheetLabel?: string
  className?: string
  label?: string
  /** Paper direction; unset = the app default (A4 landscape). */
  orientation?: PrintOrientation
}

export function ExportPdfButton({
  filename,
  sheetLabel,
  className,
  label = 'PDF',
  orientation,
}: ExportPdfButtonProps) {
  return (
    <button
      type="button"
      onClick={() => exportSheetPdf(filename, sheetLabel, orientation)}
      title="Generate PDF"
      className={cn('erp-btn-secondary sara-allow-readonly text-xs flex items-center gap-1.5', className)}
    >
      <FileDown className="size-3.5 text-rose-600 shrink-0" />
      <span>{label}</span>
    </button>
  )
}
