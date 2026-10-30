'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/** A page that lets the header pick its day (Production): the day shown and how to change it. */
export type FloorDatePicker = { date: string; onChange: (date: string) => void }

type FloorDateContextValue = {
  /** Formatted floor date for the main header chip (null = show calendar today). */
  dateLabel: string | null
  setDateLabel: (label: string | null) => void
  /** When set, the header chip becomes the day picker (‹ date › + Today). */
  picker: FloorDatePicker | null
  setPicker: (picker: FloorDatePicker | null) => void
}

const FloorDateContext = createContext<FloorDateContextValue>({
  dateLabel: null,
  setDateLabel: () => {},
  picker: null,
  setPicker: () => {},
})

export function FloorDateProvider({ children }: { children: ReactNode }) {
  const [dateLabel, setDateLabelState] = useState<string | null>(null)
  const [picker, setPickerState] = useState<FloorDatePicker | null>(null)
  const setDateLabel = useCallback((label: string | null) => {
    setDateLabelState(label)
  }, [])
  const setPicker = useCallback((next: FloorDatePicker | null) => {
    setPickerState(next)
  }, [])
  const value = useMemo(() => ({ dateLabel, setDateLabel, picker, setPicker }), [dateLabel, setDateLabel, picker, setPicker])
  return <FloorDateContext.Provider value={value}>{children}</FloorDateContext.Provider>
}

export function useFloorDateLabel() {
  return useContext(FloorDateContext)
}
