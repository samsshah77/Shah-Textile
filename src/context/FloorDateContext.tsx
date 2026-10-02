'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type FloorDateContextValue = {
  /** Formatted floor date for the main header chip (null = show calendar today). */
  dateLabel: string | null
  setDateLabel: (label: string | null) => void
}

const FloorDateContext = createContext<FloorDateContextValue>({
  dateLabel: null,
  setDateLabel: () => {},
})

export function FloorDateProvider({ children }: { children: ReactNode }) {
  const [dateLabel, setDateLabelState] = useState<string | null>(null)
  const setDateLabel = useCallback((label: string | null) => {
    setDateLabelState(label)
  }, [])
  const value = useMemo(() => ({ dateLabel, setDateLabel }), [dateLabel, setDateLabel])
  return <FloorDateContext.Provider value={value}>{children}</FloorDateContext.Provider>
}

export function useFloorDateLabel() {
  return useContext(FloorDateContext)
}
