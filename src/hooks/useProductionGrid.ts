'use client'

import { useState, useEffect, useCallback } from 'react'
import { DailyLoomProductionEntry } from '@/types/production'
import {
  productionMastersService,
  hydrateFloorFromDb,
  preloadFloorSheet,
  LoomMaster,
  BeamMaster,
  YarnMaster,
  QualityMaster,
} from '@/services/productionMastersService'
import { PRODUCTION_TODAY, PRODUCTION_YESTERDAY, PRODUCTION_TODAY_MONTH } from '@/constants/productionCalendar'
import { useAlertDialog } from '@/context/AlertDialogContext'

export function useProductionGrid() {
  const { showError } = useAlertDialog()
  const [looms, setLooms] = useState<LoomMaster[]>([])
  const [beams, setBeams] = useState<BeamMaster[]>([])
  const [yarn, setYarn] = useState<YarnMaster[]>([])
  const [yarnIssuances, setYarnIssuances] = useState<any[]>([])
  const [yarnMovements, setYarnMovements] = useState<any[]>([])
  const [qualities, setQualities] = useState<QualityMaster[]>([])
  const [entries, setEntries] = useState<DailyLoomProductionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDateState] = useState<string>(PRODUCTION_YESTERDAY)
  const [selectedMonth, setSelectedMonth] = useState<string>(PRODUCTION_TODAY_MONTH)
  const [todaySheetReady, setTodaySheetReady] = useState(false)

  const refresh = useCallback(
    (dateStr?: string) => {
      const d = dateStr || selectedDate
      productionMastersService.clearExpiredBeamEnds(d)
      productionMastersService.reconcileBeamEndsWithLooms(d)
      setLooms(productionMastersService.getLooms())
      setBeams(productionMastersService.getBeams())
      setYarn(productionMastersService.getYarn())
      setYarnIssuances(productionMastersService.getYarnIssuances())
      setYarnMovements(productionMastersService.getYarnMovements())
      setQualities(productionMastersService.getQualities())
      setEntries(productionMastersService.buildSheetForDate(d))
    },
    [selectedDate]
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        await hydrateFloorFromDb()
        await preloadFloorSheet(selectedDate)
        await preloadFloorSheet(PRODUCTION_TODAY)
        if (cancelled) return
        refresh(selectedDate)
        setTodaySheetReady(productionMastersService.hasPersistedSheet(PRODUCTION_TODAY))
      } catch (err) {
        console.error('[useProductionGrid] hydrate', err)
        if (!cancelled) {
          refresh(selectedDate)
          setTodaySheetReady(productionMastersService.hasPersistedSheet(PRODUCTION_TODAY))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refresh, selectedDate])

  const setSelectedDate = useCallback((newDate: string) => {
    setSelectedDateState(newDate)
    setSelectedMonth('2026-09')
  }, [])

  const updateEntry = useCallback(
    (loomNumber: number, patch: Partial<DailyLoomProductionEntry>, editorName?: string) => {
      setEntries(productionMastersService.updateSheetEntry(selectedDate, loomNumber, patch, editorName))
    },
    [selectedDate]
  )

  const submitForApproval = useCallback(async () => {
    try {
      const updated = await productionMastersService.submitSheetForApproval(selectedDate)
      setEntries([...updated])
      return { success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit sheet for approval'
      showError(msg)
      return { success: false, error: msg }
    }
  }, [selectedDate, showError])

  const approveSheet = useCallback(async () => {
    try {
      const updated = await productionMastersService.approveSheet(selectedDate)
      setEntries([...updated])
      return { success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to approve sheet'
      showError(msg)
      return { success: false, error: msg }
    }
  }, [selectedDate, showError])

  const unlockSheet = useCallback(async () => {
    try {
      const updated = await productionMastersService.unlockSheet(selectedDate)
      setEntries([...updated])
      return { success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to unlock sheet'
      showError(msg)
      return { success: false, error: msg }
    }
  }, [selectedDate, showError])

  // Periodic background sync (every 15s or on window focus) so Ahmer/Javed stay updated without manual reload
  useEffect(() => {
    let active = true
    const syncLatest = async () => {
      if (typeof window === 'undefined') return
      try {
        const res = await fetch('/api/floor/store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'getSheet', date: selectedDate }),
        })
        const data = await res.json()
        if (active && data.ok && Array.isArray(data.entries) && data.entries.length > 0) {
          setEntries(data.entries)
        }
      } catch {
        // silent
      }
    }

    const interval = setInterval(syncLatest, 15000)
    const handleFocus = () => { void syncLatest() }
    window.addEventListener('focus', handleFocus)

    return () => {
      active = false
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [selectedDate])

  const updateLoom = useCallback(
    (loomNumber: number, patch: Partial<LoomMaster>) => {
      const nextLooms = productionMastersService.updateLoom(loomNumber, patch, selectedDate)
      setLooms(nextLooms)
      // Always re-read beams so Loom Status → Beam End appears without page refresh
      setBeams(productionMastersService.getBeams().map((b) => ({ ...b })))
      if (patch.qualityId !== undefined) {
        setQualities(productionMastersService.getQualities())
      }
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
    },
    [selectedDate]
  )

  const addLoom = useCallback(
    (partial?: Partial<LoomMaster>) => {
      setLooms(productionMastersService.addLoom(partial))
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
    },
    [selectedDate]
  )

  const deleteLoom = useCallback(
    (loomNumber: number) => {
      setLooms(productionMastersService.deleteLoom(loomNumber))
      setBeams(productionMastersService.getBeams().map((b) => ({ ...b })))
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
    },
    [selectedDate]
  )

  const deleteBeam = useCallback(
    (beamNo: string) => {
      setBeams(productionMastersService.deleteBeam(beamNo))
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
    },
    [selectedDate]
  )

  const deleteYarn = useCallback((id: string) => {
    setYarn(productionMastersService.deleteYarn(id))
  }, [])

  const updateBeam = useCallback(
    (beamNo: string, patch: Partial<BeamMaster>) => {
      setBeams(productionMastersService.updateBeam(beamNo, patch))
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
    },
    [selectedDate]
  )

  const addBeam = useCallback(
    (partial: Partial<BeamMaster> & { beamNo: string }) => {
      try {
        setBeams(productionMastersService.addBeam(partial))
        setEntries(productionMastersService.buildSheetForDate(selectedDate))
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Beam add failed'
        showError({
          title: 'Beam add nahi hua',
          message: msg,
          confirmText: 'Theek hai',
          type: 'error',
        })
        throw err
      }
    },
    [selectedDate, showError]
  )

  const mountBeam = useCallback(
    (beamNo: string, loomNumber: number, dateStr?: string) => {
      const res = productionMastersService.mountBeam(beamNo, loomNumber, dateStr || selectedDate)
      setBeams(res.beams)
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
      return res
    },
    [selectedDate]
  )

  const unmountBeam = useCallback(
    (beamNo: string, location: 'STORE' | 'SIZING' = 'STORE', dateStr?: string) => {
      setBeams(productionMastersService.unmountBeam(beamNo, location, dateStr || selectedDate))
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
    },
    [selectedDate]
  )

  const receiveBeamFromSizing = useCallback((beamNo: string) => {
    setBeams(productionMastersService.receiveBeamFromSizing(beamNo))
  }, [])

  const sendBeamToSizing = useCallback(
    (beamNo: string, dateStr?: string) => {
      setBeams(productionMastersService.sendBeamToSizing(beamNo, dateStr || selectedDate))
    },
    [selectedDate]
  )

  const updateYarn = useCallback((id: string, patch: Partial<YarnMaster>) => {
    setYarn(productionMastersService.updateYarn(id, patch))
  }, [])

  const addYarn = useCallback((partial?: Partial<YarnMaster>) => {
    setYarn(productionMastersService.addYarn(partial))
  }, [])

  const addYarnInward = useCallback(
    (params: {
      yarnId?: string
      yarnType: string
      bags: number
      weightKg: number
      dateStr?: string
      lotOrSupplier?: string
    }) => {
      const res = productionMastersService.recordYarnInward({
        ...params,
        dateStr: params.dateStr || selectedDate,
      })
      setYarn(res.yarn)
      setYarnMovements(res.movements)
    },
    [selectedDate]
  )

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
      setYarnMovements(productionMastersService.getYarnMovements())
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

  const addQuality = useCallback((partial?: Partial<QualityMaster>) => {
    setQualities(productionMastersService.addQuality(partial))
  }, [])

  const deleteQuality = useCallback((id: string) => {
    setQualities(productionMastersService.deleteQuality(id))
  }, [])

  const startNewDay = useCallback(
    async (targetDate: string) => {
      setLoading(true)
      try {
        productionMastersService.startNewDay(targetDate)
        setSelectedDateState(targetDate)
        setSelectedMonth('2026-09')
        refresh(targetDate)
        setTodaySheetReady(productionMastersService.hasPersistedSheet(PRODUCTION_TODAY))
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
    yarnMovements,
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
    deleteLoom,
    updateBeam,
    addBeam,
    deleteBeam,
    mountBeam,
    unmountBeam,
    receiveBeamFromSizing,
    sendBeamToSizing,
    updateYarn,
    addYarn,
    deleteYarn,
    addYarnInward,
    issueYarnToLoom,
    updateQuality,
    addQuality,
    deleteQuality,
    startNewDay,
    todaySheetReady,
    submitForApproval,
    approveSheet,
    unlockSheet,
  }
}
