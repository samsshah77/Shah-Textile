'use client'

import { History, PlusCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PRODUCTION_START,
  PRODUCTION_TODAY,
  PRODUCTION_YESTERDAY,
  shiftProductionDate,
} from '@/constants/productionCalendar'

interface ProductionDateFilterBarProps {
  selectedDate: string
  setSelectedDate: (date: string) => void
  selectedMonth: string
  setSelectedMonth: (month: string) => void
  onOpenNewDayModal: () => void
  canEdit: boolean
  /** When today's sheet already exists, hide Start New Day (no blank re-generate). */
  showStartNewDay?: boolean
}

function shortDayLabel(dateStr: string) {
  try {
    const d = new Date(`${dateStr}T12:00:00`)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  } catch {
    return dateStr
  }
}

function longDayLabel(dateStr: string) {
  try {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

/** Same height as Yarn / Quality `btn btn-sm` */
const smBtn = 'btn btn-sm'

const MAX_ALLOWED_DATE = '2026-09-30'

export function ProductionDateFilterBar({
  selectedDate,
  setSelectedDate,
  selectedMonth,
  setSelectedMonth,
  onOpenNewDayModal,
  canEdit,
  showStartNewDay = true,
}: ProductionDateFilterBarProps) {
  const isToday = selectedDate === PRODUCTION_TODAY
  const isYesterday = selectedDate === PRODUCTION_YESTERDAY

  const handleShiftDay = (delta: number) => {
    try {
      const nextDate = shiftProductionDate(selectedDate, delta)
      if (nextDate >= PRODUCTION_START && nextDate <= MAX_ALLOWED_DATE) {
        setSelectedDate(nextDate)
      }
    } catch {
      setSelectedDate(PRODUCTION_TODAY)
    }
  }

  return (
    <div className="card mb-3 print:hidden d-print-none">
      <div className="card-body py-2">
        <div className="d-flex flex-column flex-lg-row gap-2 align-items-lg-center justify-content-lg-between">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <div className="d-flex align-items-center gap-1">
              <button
                type="button"
                onClick={() => handleShiftDay(-1)}
                title="Previous Day"
                disabled={selectedDate <= PRODUCTION_START}
                className={`${smBtn} btn-outline-secondary px-2`}
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={PRODUCTION_START}
                max={MAX_ALLOWED_DATE}
                className="form-control form-control-sm fw-semibold"
                style={{ width: 'auto', minWidth: 140 }}
              />
              <button
                type="button"
                onClick={() => handleShiftDay(1)}
                title="Next Day"
                disabled={selectedDate >= MAX_ALLOWED_DATE}
                className={`${smBtn} btn-outline-secondary px-2`}
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>

            <div className="btn-group btn-group-sm" role="group" aria-label="Quick day">
              <button
                type="button"
                onClick={() => setSelectedDate(PRODUCTION_YESTERDAY)}
                className={cn(smBtn, isYesterday ? 'btn-primary' : 'btn-outline-secondary')}
                title="Yesterday's complete 24h production (cloth off roller)"
              >
                Yesterday
                <span className="d-none d-md-inline"> ({shortDayLabel(PRODUCTION_YESTERDAY)})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(PRODUCTION_TODAY)}
                className={cn(smBtn, isToday ? 'btn-primary' : 'btn-outline-secondary')}
                title="Today's live running shift"
              >
                Today
                <span className="d-none d-md-inline"> ({shortDayLabel(PRODUCTION_TODAY)})</span>
              </button>
            </div>

            <div className="btn-group btn-group-sm" role="group" aria-label="Month">
              <button
                type="button"
                className={cn(smBtn, 'btn-dark')}
                onClick={() => {
                  setSelectedMonth('2026-09')
                  if (!selectedDate.startsWith('2026-09')) setSelectedDate(PRODUCTION_YESTERDAY)
                }}
              >
                Sept 2026
              </button>
            </div>
          </div>

          <div className="d-flex flex-wrap align-items-center gap-2">
            <div className="d-inline-flex align-items-center gap-1.5 px-2 py-1 rounded border bg-light small">
              {isYesterday ? (
                <>
                  <span
                    className="rounded-circle bg-primary flex-shrink-0"
                    style={{ width: 8, height: 8 }}
                  />
                  <span className="fw-semibold text-primary">
                    Yesterday&apos;s Roller Report (Completed 24h Cycle)
                  </span>
                </>
              ) : isToday ? (
                <>
                  <span
                    className="rounded-circle bg-success flex-shrink-0"
                    style={{ width: 8, height: 8 }}
                  />
                  <span className="fw-semibold text-success">
                    Today&apos;s Active Shift (Live Floor Entry)
                  </span>
                </>
              ) : (
                <>
                  <History className="size-3.5 text-secondary flex-shrink-0" />
                  <span className="fw-semibold text-truncate">
                    {longDayLabel(selectedDate)} (Roller Record)
                  </span>
                </>
              )}
            </div>

            {canEdit && showStartNewDay && (
              <button
                type="button"
                onClick={onOpenNewDayModal}
                className={`${smBtn} btn-primary d-inline-flex align-items-center gap-1`}
              >
                <PlusCircle className="size-3.5" />
                Start New Day
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
