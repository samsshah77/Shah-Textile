'use client'

import React, { useState } from 'react'
import { Calendar, PlusCircle, CheckCircle2, Clock, Factory, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NewDayProductionModalProps {
  isOpen: boolean
  onClose: () => void
  onStartNewDay: (targetDate: string) => Promise<void>
  currentSelectedDate: string
}

export function NewDayProductionModal({
  isOpen,
  onClose,
  onStartNewDay,
  currentSelectedDate,
}: NewDayProductionModalProps) {
  // Default new date is tomorrow of currentSelectedDate or 2026-09-20
  const getDefaultTargetDate = () => {
    try {
      const d = new Date(currentSelectedDate || '2026-09-19')
      d.setDate(d.getDate() + 1)
      return d.toISOString().split('T')[0]
    } catch {
      return '2026-09-20'
    }
  }

  const [targetDate, setTargetDate] = useState(getDefaultTargetDate())
  const [carryForwardBeams, setCarryForwardBeams] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetDate) {
      setError('Please select a valid date.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      await onStartNewDay(targetDate)
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize production sheet for the selected day.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
              <PlusCircle className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Start New Day Production Report
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Initialize the 34-loom production register for a new operating day.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* Date Picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Select Production Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                min="2026-08-01"
                max="2026-10-31"
                required
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Target date for Shift A (Day Shift) and Shift B (Night Shift) meter logging.
            </p>
          </div>

          {/* Options & Carryover */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-3.5 space-y-2.5">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Automated Mill Floor Configuration:
            </span>

            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300 select-none">
              <input
                type="checkbox"
                checked={carryForwardBeams}
                onChange={(e) => setCarryForwardBeams(e.target.checked)}
                className="size-4 mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <div>
                <span className="font-semibold block">Carry Forward Active Qualities &amp; Mounted Beams</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Preserves mounted beam numbers, running fabric recipes, pick counts, and RPMs across all 34 looms so operators only need to log meters.
                </span>
              </div>
            </label>

            <div className="flex items-center gap-2 pt-1 border-t border-slate-200/80 dark:border-slate-700/80 text-[11px] text-slate-500 dark:text-slate-400">
              <Factory className="size-3.5 text-blue-600" />
              <span>Initializes 20 G6200, 6 PU, and 8 G6300 Rapier Looms (Shift meters reset to 0)</span>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-[#0066cc] hover:bg-blue-700 px-5 py-2 text-xs font-bold text-white transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="size-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Initializing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  <span>Initialize &amp; Open Sheet</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
