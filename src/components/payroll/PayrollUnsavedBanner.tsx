'use client'

import React from 'react'
import { AlertCircle, RotateCcw, Save } from 'lucide-react'

export interface PayrollUnsavedBannerProps {
  dirtyCount: number
  onSave?: () => void
  onDiscard?: () => void
  isSaving?: boolean
}

/**
 * Notice banner displayed when the accountant has unsaved changes in a payroll sheet.
 */
export function PayrollUnsavedBanner({
  dirtyCount,
  onSave,
  onDiscard,
  isSaving = false,
}: PayrollUnsavedBannerProps) {
  if (dirtyCount <= 0) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2 rounded-lg border border-amber-300 dark:border-amber-700/80 bg-amber-50/95 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 text-xs font-medium print:hidden shadow-sm animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="flex items-center gap-2">
        <span className="flex size-2 rounded-full bg-amber-500 animate-ping" />
        <AlertCircle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span>
          <strong>
            {dirtyCount} unsaved change{dirtyCount > 1 ? 's' : ''}
          </strong>{' '}
          in this sheet (amber highlighted cells). Save dabayein taake database me update ho.
        </span>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {onDiscard && (
          <button
            type="button"
            onClick={onDiscard}
            disabled={isSaving}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <RotateCcw className="size-3 text-slate-500" />
            <span>Discard</span>
          </button>
        )}
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors shadow-xs"
          >
            <Save className="size-3" />
            <span>Save Now</span>
          </button>
        )}
      </div>
    </div>
  )
}
