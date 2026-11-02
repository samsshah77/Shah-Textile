'use client'

import { useRef } from 'react'
import { PRODUCTION_START, getCalendarToday, shiftProductionDate } from '@/constants/productionCalendar'
import type { FloorDatePicker } from '@/context/FloorDateContext'

/** "2026-10-29" → "29 Oct 2026" */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * The header's date chip on Production pages.
 *  Today:                          ‹ Today · 30 Oct 2026 ›
 *  Past:   [← Back to 30 Oct 2026]  ‹ 29 Oct 2026 ›          (grey; the green button sits
 *          outside the chip so the chip itself never moves)
 * Clicking the date opens the calendar.
 */
export function HeaderDatePicker({ picker, time }: { picker: FloorDatePicker; time: React.ReactNode }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const today = getCalendarToday()
  const { date, onChange } = picker
  const isToday = date === today
  const shift = (delta: number) => {
    try {
      const next = shiftProductionDate(date, delta)
      if (next >= PRODUCTION_START && next <= today) onChange(next)
    } catch {
      onChange(today)
    }
  }
  const openCalendar = () => {
    const el = inputRef.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
      el.click()
    }
  }
  return (
    <>
      {!isToday && (
        <button
          type="button"
          className="sara-back-today me-2"
          onClick={() => onChange(today)}
          title={`Aaj (${shortDate(today)}) pe wapis`}
        >
          <span aria-hidden="true">←</span>
          <span className="d-none d-sm-inline">Back to {shortDate(today)}</span>
          <span className="d-sm-none">{shortDate(today).replace(/ \d{4}$/, '')}</span>
        </button>
      )}
      <span className={`sara-clock sara-clock--picker ${isToday ? 'sara-clock--today' : 'sara-clock--past'}`}>
        <button
          type="button"
          className="sara-clock__nav"
          onClick={() => shift(-1)}
          disabled={date <= PRODUCTION_START}
          aria-label="Pichhla din"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <span className="sara-clock__day">
          <button type="button" className="sara-clock__label" onClick={openCalendar} title="Calendar kholein">
            <i className="bi bi-calendar3" aria-hidden="true" />
            {isToday ? (
              <>
                <span className="sara-clock__today-word">Today</span>
                <span className="sara-clock__dim">· {shortDate(date)}</span>
              </>
            ) : (
              shortDate(date)
            )}
          </button>
          <input
            ref={inputRef}
            type="date"
            className="sara-clock__input"
            value={date}
            min={PRODUCTION_START}
            max={today}
            onChange={(e) => e.target.value && onChange(e.target.value)}
            tabIndex={-1}
            aria-label="Tareekh"
          />
        </span>
        <button
          type="button"
          className="sara-clock__nav"
          onClick={() => shift(1)}
          disabled={date >= today}
          aria-label="Agla din"
        >
          <span aria-hidden="true">›</span>
        </button>
        <span className="sara-clock__sep d-none d-md-inline-block" aria-hidden="true" />
        <span className="sara-clock__time d-none d-md-inline-flex">{time}</span>
      </span>
    </>
  )
}
