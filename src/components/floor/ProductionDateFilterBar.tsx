'use client'

import React from 'react'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  Clock,
  Sparkles,
  History,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProductionDateFilterBarProps {
  selectedDate: string
  setSelectedDate: (date: string) => void
  selectedMonth: string
  setSelectedMonth: (month: string) => void
  onOpenNewDayModal: () => void
  canEdit: boolean
}

export function ProductionDateFilterBar({
  selectedDate,
  setSelectedDate,
  selectedMonth,
  setSelectedMonth,
  onOpenNewDayModal,
  canEdit,
}: ProductionDateFilterBarProps) {
  const TODAY_STR = '2026-09-19'
  const isToday = selectedDate === TODAY_STR

  // Helpers to shift days
  const handleShiftDay = (delta: number) => {
    try {
      const d = new Date(selectedDate)
      d.setDate(d.getDate() + delta)
      const newStr = d.toISOString().split('T')[0]
      setSelectedDate(newStr)
    } catch {
      setSelectedDate(TODAY_STR)
    }
  }

  // Format date display label: e.g. "Saturday, 19-Sept-2026"
  const getFormattedDateLabel = (dateStr: string) => {
    try {
      const d = new Date(`${dateStr}T12:00:00Z`)
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
      {/* Left: Date Display & Shift Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Previous Day */}
        <button
          onClick={() => handleShiftDay(-1)}
          title="Previous Day"
          className="flex size-9 items-center justify-center rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-colors cursor-pointer"
        >
          <ChevronLeft className="size-4" />
        </button>

        {/* Date Picker Input */}
        <div className="relative flex items-center">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            min="2026-08-01"
            max="2026-10-31"
            className="h-9 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground focus:border-blue-500 focus:outline-none cursor-pointer"
          />
        </div>

        {/* Next Day */}
        <button
          onClick={() => handleShiftDay(1)}
          title="Next Day"
          className="flex size-9 items-center justify-center rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-colors cursor-pointer"
        >
          <ChevronRight className="size-4" />
        </button>

        {/* Quick Date Presets */}
        <div className="flex items-center gap-1.5 ml-1">
          <button
            onClick={() => setSelectedDate(TODAY_STR)}
            className={cn(
              'h-9 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer border',
              isToday
                ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                : 'border-border bg-background hover:bg-muted text-muted-foreground'
            )}
          >
            Today (19-Sept)
          </button>

          <button
            onClick={() => setSelectedDate('2026-09-18')}
            className={cn(
              'h-9 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer border',
              selectedDate === '2026-09-18'
                ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                : 'border-border bg-background hover:bg-muted text-muted-foreground'
            )}
          >
            Yesterday (18-Sept)
          </button>
        </div>

        {/* Month Switcher Quick Tabs */}
        <div className="flex items-center rounded-xl border border-border bg-muted/40 p-1 ml-0 sm:ml-2">
          <button
            onClick={() => {
              setSelectedMonth('2026-09')
              if (!selectedDate.startsWith('2026-09')) setSelectedDate('2026-09-19')
            }}
            className={cn(
              'px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer',
              selectedMonth === '2026-09'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Sept 2026
          </button>

          <button
            onClick={() => {
              setSelectedMonth('2026-08')
              if (!selectedDate.startsWith('2026-08')) setSelectedDate('2026-08-15')
            }}
            className={cn(
              'px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer',
              selectedMonth === '2026-08'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Aug 2026
          </button>
        </div>
      </div>

      {/* Right: Date Status Badge & "Start New Day" Action Button */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Status Indicator */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-muted/30 text-xs font-semibold text-foreground">
          {isToday ? (
            <>
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
              </span>
              <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                Today&apos;s Active Shift
              </span>
            </>
          ) : (
            <>
              <History className="size-3.5 text-blue-600" />
              <span>Historical: {getFormattedDateLabel(selectedDate)}</span>
            </>
          )}
        </div>

        {/* Start New Day Production Action Button */}
        {canEdit && (
          <button
            onClick={onOpenNewDayModal}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-[#0066cc] hover:bg-blue-700 px-3.5 text-xs font-bold text-white transition-all shadow-xs hover:shadow-md cursor-pointer"
          >
            <PlusCircle className="size-4" />
            <span>+ Start New Day Report</span>
          </button>
        )}
      </div>
    </div>
  )
}
