'use client'

import { useState, useEffect, useCallback } from 'react'
import { DailyLoomProductionEntry } from '@/types/production'
import {
  productionMastersService,
  LoomMaster,
  BeamMaster,
  YarnMaster,
} from '@/services/productionMastersService'
import { PRODUCTION_TODAY, PRODUCTION_TODAY_MONTH } from '@/constants/productionCalendar'

export function useProductionGrid() {
  const [looms, setLooms] = useState<LoomMaster[]>([])
  const [beams, setBeams] = useState<BeamMaster[]>([])
  const [yarn, setYarn] = useState<YarnMaster[]>([])
  const [entries, setEntries] = useState<DailyLoomProductionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDateState] = useState<string>(PRODUCTION_TODAY)
  const [selectedMonth, setSelectedMonth] = useState<string>(PRODUCTION_TODAY_MONTH)

  const refresh = useCallback((dateStr?: string) => {
    const d = dateStr || selectedDate
    setLooms(productionMastersService.getLooms())
    setBeams(productionMastersService.getBeams())
    setYarn(productionMastersService.getYarn())
    setEntries(productionMastersService.buildSheetForDate(d))
  }, [selectedDate])

  useEffect(() => {
    setLoading(true)
    try {
      refresh(selectedDate)
    } finally {
      setLoading(false)
    }
  }, [refresh, selectedDate])

  const setSelectedDate = useCallback(
    (newDate: string) => {
      setSelectedDateState(newDate)
      setSelectedMonth(newDate.startsWith('2026-08') ? '2026-08' : '2026-09')
      refresh(newDate)
    },
    [refresh]
  )

  const updateEntry = useCallback(
    async (loomNumber: number, patch: Partial<DailyLoomProductionEntry>) => {
      const next = productionMastersService.updateSheetEntry(selectedDate, loomNumber, patch)
      setEntries(next)
    },
    [selectedDate]
  )

  const updateLoom = useCallback(
    (loomNumber: number, patch: Partial<LoomMaster>) => {
      setLooms(productionMastersService.updateLoom(loomNumber, patch))
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
    },
    [selectedDate]
  )

  const addLoom = useCallback(() => {
    setLooms(productionMastersService.addLoom())
    setEntries(productionMastersService.buildSheetForDate(selectedDate))
  }, [selectedDate])

  const updateBeam = useCallback(
    (beamNo: string, patch: Partial<BeamMaster>) => {
      setBeams(productionMastersService.updateBeam(beamNo, patch))
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
    },
    [selectedDate]
  )

  const addBeam = useCallback(
    (partial: Partial<BeamMaster> & { beamNo: string }) => {
      setBeams(productionMastersService.addBeam(partial))
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
    },
    [selectedDate]
  )

  const mountBeam = useCallback(
    (beamNo: string, loomNumber: number) => {
      setBeams(productionMastersService.mountBeam(beamNo, loomNumber))
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
    },
    [selectedDate]
  )

  const unmountBeam = useCallback(
    (beamNo: string) => {
      setBeams(productionMastersService.unmountBeam(beamNo))
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
    },
    [selectedDate]
  )

  const updateYarn = useCallback((id: string, patch: Partial<YarnMaster>) => {
    setYarn(productionMastersService.updateYarn(id, patch))
  }, [])

  const addYarn = useCallback(() => {
    setYarn(productionMastersService.addYarn())
  }, [])

  const startNewDay = useCallback(
    async (targetDate: string) => {
      setLoading(true)
      try {
        productionMastersService.startNewDay(targetDate)
        setSelectedDateState(targetDate)
        setSelectedMonth(targetDate.startsWith('2026-08') ? '2026-08' : '2026-09')
        refresh(targetDate)
      } finally {
        setLoading(false)
      }
    },
    [refresh]
  )

  return {
    looms,
    beams,
    yarn,
    entries,
    loading,
    selectedDate,
    setSelectedDate,
    selectedMonth,
    setSelectedMonth,
    updateEntry,
    updateLoom,
    addLoom,
    updateBeam,
    addBeam,
    mountBeam,
    unmountBeam,
    updateYarn,
    addYarn,
    startNewDay,
  }
}
