'use client'

import { useState, useEffect, useCallback } from 'react'
import { DailyLoomProductionEntry } from '@/types/production'
import {
  productionMastersService,
  LoomMaster,
  BeamMaster,
  YarnMaster,
  QualityMaster,
} from '@/services/productionMastersService'
import { PRODUCTION_TODAY, PRODUCTION_TODAY_MONTH } from '@/constants/productionCalendar'

export function useProductionGrid() {
  const [looms, setLooms] = useState<LoomMaster[]>([])
  const [beams, setBeams] = useState<BeamMaster[]>([])
  const [yarn, setYarn] = useState<YarnMaster[]>([])
  const [yarnIssuances, setYarnIssuances] = useState<any[]>([])
  const [qualities, setQualities] = useState<QualityMaster[]>([])
  const [entries, setEntries] = useState<DailyLoomProductionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDateState] = useState<string>(PRODUCTION_TODAY)
  const [selectedMonth, setSelectedMonth] = useState<string>(PRODUCTION_TODAY_MONTH)

  const refresh = useCallback(
    (dateStr?: string) => {
      const d = dateStr || selectedDate
      productionMastersService.clearExpiredBeamEnds(d)
      productionMastersService.reconcileBeamEndsWithLooms(d)
      setLooms(productionMastersService.getLooms())
      setBeams(productionMastersService.getBeams())
      setYarn(productionMastersService.getYarn())
      setYarnIssuances(productionMastersService.getYarnIssuances())
      setQualities(productionMastersService.getQualities())
      setEntries(productionMastersService.buildSheetForDate(d))
    },
    [selectedDate]
  )

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
    (loomNumber: number, patch: Partial<DailyLoomProductionEntry>) => {
      setEntries(productionMastersService.updateSheetEntry(selectedDate, loomNumber, patch))
    },
    [selectedDate]
  )

  const updateLoom = useCallback(
    (loomNumber: number, patch: Partial<LoomMaster>) => {
      const nextLooms = productionMastersService.updateLoom(loomNumber, patch, selectedDate)
      setLooms(nextLooms)
      // Always re-read beams so Loom Status → Beam End appears without page refresh
      setBeams(productionMastersService.getBeams().map((b) => ({ ...b })))
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

  const addYarn = useCallback((partial?: Partial<YarnMaster>) => {
    setYarn(productionMastersService.addYarn(partial))
  }, [])

  const issueYarnToLoom = useCallback(
    (yarnId: string, loomNumber: number, issuedKg: number, pick: number, dateStr: string) => {
      const res = productionMastersService.issueYarnToLoom({
        yarnId,
        loomNumber,
        issuedKg,
        pick,
        dateStr,
      })
      setYarn(res.yarn)
      setYarnIssuances(res.issuances)
      setLooms(productionMastersService.getLooms())
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
    },
    [selectedDate]
  )

  const updateQuality = useCallback(
    (id: string, patch: Partial<QualityMaster>) => {
      setQualities(productionMastersService.updateQuality(id, patch))
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
    },
    [selectedDate]
  )

  const addQuality = useCallback(() => {
    setQualities(productionMastersService.addQuality())
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
    yarnIssuances,
    qualities,
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
    issueYarnToLoom,
    updateQuality,
    addQuality,
    startNewDay,
  }
}
