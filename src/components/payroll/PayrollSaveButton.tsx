'use client'

import React from 'react'
import { Save, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PayrollSaveButtonProps {
  onClick: () => void
  disabled?: boolean
  dirtyCount?: number
  isSaving?: boolean
  className?: string
  label?: string
}

/**
 * Standard Save Button for Payroll sheets.
 * When dirtyCount > 0, shifts to an alert amber style with a pill showing the unsaved count.
 * When clean (dirtyCount === 0), shows a standard ERP primary button.
 */
export function PayrollSaveButton({
  onClick,
  disabled = false,
  dirtyCount = 0,
  isSaving = false,
  className,
  label = 'Save',
}: PayrollSaveButtonProps) {
  const isDirty = dirtyCount > 0

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isSaving}
      title={
        isDirty
          ? `${dirtyCount} unsaved edit${dirtyCount > 1 ? 's' : ''} — click to save`
          : 'All changes saved'
      }
      className={cn(
        'relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-sm transition-all duration-150 !min-h-9 !h-9 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 select-none',
        isDirty
          ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white ring-2 ring-amber-400/50 shadow-amber-500/20 shadow-md font-bold'
          : 'erp-btn-primary',
        className
      )}
    >
      <Save className={cn('size-3.5', isDirty && 'animate-pulse')} />
      <span>{label}</span>

      {isDirty ? (
        <span
          className="ml-1 inline-flex items-center justify-center rounded-full bg-white text-amber-800 dark:bg-amber-950 dark:text-amber-200 px-1.5 py-0.2 text-[10px] font-extrabold shadow-sm"
          title={`${dirtyCount} unsaved field${dirtyCount > 1 ? 's' : ''}`}
        >
          {dirtyCount}
        </span>
      ) : (
        <Check className="size-3 text-emerald-300 ml-0.5 opacity-80" />
      )}
    </button>
  )
}
