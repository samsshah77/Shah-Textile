'use client'

import { useState, useEffect, useCallback } from 'react'
import { DailyLoomProductionEntry } from '@/types/production'
import {
  productionMastersService,
  hydrateFloorFromDb,
  preloadFloorSheet,
  preloadAllFloorSheets,
  LoomMaster,
  BeamMaster,
  YarnMaster,
  QualityMaster,
} from '@/services/productionMastersService'
import {
  getCalendarToday,
  getProductionTodayMonth,
  PRODUCTION_START,
} from '@/constants/productionCalendar'
import { useAlertDialog } from '@/context/AlertDialogContext'

const FLOOR_DATE_KEY = 'sara_floor_selected_date'

function readStoredFloorDate(): string {
  const today = getCalendarToday()
  if (typeof window === 'undefined') return today
  try {
    const raw = sessionStorage.getItem(FLOOR_DATE_KEY)
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw >= PRODUCTION_START && raw <= today) {
      return raw
    }
  } catch {
    // ignore
  }
  return today
}

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
  const [selectedDate, setSelectedDateState] = useState<string>(() => getCalendarToday())
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getCalendarToday().slice(0, 7))
  const [todaySheetReady, setTodaySheetReady] = useState(false)
  const [dateReady, setDateReady] = useState(false)

  useEffect(() => {
    const stored = readStoredFloorDate()
    setSelectedDateState(stored)
    setSelectedMonth(stored.slice(0, 7) || getProductionTodayMonth())
    setDateReady(true)
  }, [])

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
    if (!dateReady) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const today = getCalendarToday()
      try {
        await hydrateFloorFromDb()
        await preloadAllFloorSheets()
        await preloadFloorSheet(selectedDate)
        await preloadFloorSheet(today)
        if (cancelled) return
        refresh(selectedDate)
        setTodaySheetReady(productionMastersService.hasPersistedSheet(today))
      } catch (err) {
        console.error('[useProductionGrid] hydrate', err)
        if (!cancelled) {
          refresh(selectedDate)
          setTodaySheetReady(productionMastersService.hasPersistedSheet(today))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refresh, selectedDate, dateReady])

  const setSelectedDate = useCallback((newDate: string) => {
    setSelectedDateState(newDate)
    setSelectedMonth(newDate.slice(0, 7) || getProductionTodayMonth())
    try {
      sessionStorage.setItem(FLOOR_DATE_KEY, newDate)
    } catch {
      // ignore
    }
  }, [])

  const updateEntry = useCallback(
    (loomNumber: number, patch: Partial<DailyLoomProductionEntry>, editorName?: string) => {
      setEntries(productionMastersService.updateSheetEntry(selectedDate, loomNumber, patch, editorName))
    },
    [selectedDate]
  )

  const resetDayMeters = useCallback(
    (editorName?: string) => {
      setEntries(productionMastersService.resetDayMeters(selectedDate, editorName))
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
      const prevQualityId =
        productionMastersService.getLooms().find((l) => l.loomNumber === loomNumber)?.qualityId ??
        null
      const nextLooms = productionMastersService.updateLoom(loomNumber, patch, selectedDate)
      setLooms(nextLooms)
      // Always re-read beams so Loom Status → Beam End appears without page refresh
      setBeams(productionMastersService.getBeams().map((b) => ({ ...b })))
      if (patch.qualityId !== undefined) {
        setQualities(productionMastersService.getQualities())
        // Auto-end (last loom cleared) or revive — persist status to DB.
        if (prevQualityId && prevQualityId !== patch.qualityId) {
          const prevQ = productionMastersService.getQualities().find((q) => q.id === prevQualityId)
          if (prevQ?.status === 'ENDED' || prevQ?.status === 'HOLD') {
            void productionMastersService.flushQualityStatus(prevQualityId)
          }
        }
        if (patch.qualityId) {
          void productionMastersService.flushQualityStatus(patch.qualityId)
        }
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
      const next = productionMastersService.updateQuality(id, patch, selectedDate)
      setQualities(next)
      setLooms(productionMastersService.getLooms())
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
      if (
        patch.status === 'ENDED' ||
        patch.status === 'HOLD' ||
        patch.endedOn !== undefined ||
        patch.status === 'ACTIVE' ||
        patch.createdOn !== undefined
      ) {
        void productionMastersService.flushQualityStatus(id)
      }
    },
    [selectedDate]
  )

  const addQuality = useCallback(
    (partial?: Partial<QualityMaster>) => {
      setQualities(
        productionMastersService.addQuality({
          ...partial,
          createdOn: partial?.createdOn || selectedDate,
        })
      )
    },
    [selectedDate]
  )

  const deleteQuality = useCallback((id: string) => {
    setQualities(productionMastersService.deleteQuality(id))
  }, [])

  const reassignEndedQuality = useCallback(
    (id: string, createdOn: string) => {
      const { qualities: next, newQuality } = productionMastersService.reassignEndedQuality(
        id,
        createdOn || selectedDate
      )
      setQualities(next)
      if (newQuality) {
        void productionMastersService.flushQualitiesToDb()
      }
    },
    [selectedDate]
  )

  const startNewDay = useCallback(
    async (targetDate: string) => {
      setLoading(true)
      try {
        productionMastersService.startNewDay(targetDate)
        setSelectedDateState(targetDate)
        setSelectedMonth(targetDate.slice(0, 7) || getProductionTodayMonth())
        refresh(targetDate)
        setTodaySheetReady(productionMastersService.hasPersistedSheet(getCalendarToday()))
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
    resetDayMeters,
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
    reassignEndedQuality,
    startNewDay,
    todaySheetReady,
    submitForApproval,
    approveSheet,
    unlockSheet,
  }
}
