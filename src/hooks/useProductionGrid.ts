'use client'

import { useState, useEffect, useCallback } from 'react'
import { DailyLoomProductionEntry } from '@/types/production'
import {
  productionMastersService,
  hydrateFloorFromDb,
  preloadFloorSheet,
  preloadAllFloorSheets,
  refreshFloorMastersFromDb,
  LoomMaster,
  BeamMaster,
  YarnMaster,
  QualityMaster,
} from '@/services/productionMastersService'
import {
  getCalendarToday,
  getProductionToday,
  getProductionTodayMonth,
} from '@/constants/productionCalendar'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { rememberQualityAssignFlash } from '@/lib/qualityAssignFlash'
import { handleSessionExpired, isSessionExpired } from '@/lib/authGuard'

const FLOOR_DATE_KEY = 'sara_floor_selected_date'

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
  /** Full page load / refresh always opens on production Today (wall-clock aaj). */
  const [selectedDate, setSelectedDateState] = useState<string>(() => getProductionToday())
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getProductionToday().slice(0, 7))
  const [todaySheetReady, setTodaySheetReady] = useState(false)
  const [dateReady, setDateReady] = useState(false)

  useEffect(() => {
    let initialDate = getProductionToday()
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      const qDate = sp.get('date')
      if (qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)) {
        initialDate = qDate
      }
    }
    setSelectedDateState(initialDate)
    setSelectedMonth(initialDate.slice(0, 7) || getProductionTodayMonth())
    try {
      sessionStorage.setItem(FLOOR_DATE_KEY, initialDate)
    } catch {
      // ignore
    }
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
        await refreshFloorMastersFromDb()
        await preloadAllFloorSheets()
        // Force DB refresh for the selected day so dual-quality seed / edits win over stale memory.
        await preloadFloorSheet(selectedDate, { force: true })
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
      const segmentIndex = Number(patch.segmentIndex)
      setEntries(
        productionMastersService.updateSheetEntry(
          selectedDate,
          loomNumber,
          patch,
          editorName,
          Number.isFinite(segmentIndex) && segmentIndex >= 1 ? Math.floor(segmentIndex) : undefined
        )
      )
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

  // A save was refused or yarn came back from the server: show what is really stored.
  useEffect(() => {
    const onReload = () => refresh(selectedDate)
    window.addEventListener('floor:data-reloaded', onReload)
    return () => window.removeEventListener('floor:data-reloaded', onReload)
  }, [refresh, selectedDate])

  // Periodic background sync (every 15s or on window focus) so Ahmer/Javed stay updated without manual reload.
  // The day is reloaded into memory too (not only the screen), so the next edit starts from
  // what is really saved; a day with edits still on their way to the server is left alone.
  useEffect(() => {
    let active = true
    let interval: NodeJS.Timeout | null = null

    const stop = () => {
      active = false
      if (interval) clearInterval(interval)
    }

    const onExpired = () => stop()
    window.addEventListener('auth:session-expired', onExpired)

    const syncLatest = async () => {
      if (typeof window === 'undefined' || !active || isSessionExpired()) {
        stop()
        return
      }
      try {
        await preloadFloorSheet(selectedDate, { force: true })
        if (active && !isSessionExpired() && productionMastersService.hasPersistedSheet(selectedDate)) {
          setEntries(productionMastersService.buildSheetForDate(selectedDate, { skipPersist: true }))
        }
      } catch {
        // silent
      }
    }

    interval = setInterval(syncLatest, 15000)
    const handleFocus = () => { void syncLatest() }
    window.addEventListener('focus', handleFocus)

    return () => {
      stop()
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('auth:session-expired', onExpired)
    }
  }, [selectedDate])

  /** Same-day dual quality: add part 2 on selected date, then set live master to that quality. */
  const addQualitySegment = useCallback(
    (loomNumber: number, qualityId: string): boolean => {
      const before = productionMastersService.buildSheetForDate(selectedDate, { skipPersist: true })
      const beforeSegs = before.filter((e) => e.loomNumber === loomNumber).length
      productionMastersService.addQualitySegmentOnDay(selectedDate, loomNumber, qualityId)
      // Point live loom master at the new part (no second forward-fill — segment already written).
      const nextLooms = productionMastersService.getLooms().map((l) =>
        l.loomNumber === loomNumber ? { ...l, qualityId } : l
      )
      productionMastersService.saveLooms(nextLooms)
      const after = productionMastersService.buildSheetForDate(selectedDate)
      const afterSegs = after.filter((e) => e.loomNumber === loomNumber).length
      setLooms(nextLooms)
      setQualities(productionMastersService.getQualities())
      setEntries(after)
      void productionMastersService.flushQualityStatus(qualityId)
      return afterSegs > beforeSegs || afterSegs >= 2
    },
    [selectedDate]
  )

  /** Remove same-day Part 2+ row on selected date. */
  const removeQualitySegment = useCallback(
    (loomNumber: number, segmentIndex: number): boolean => {
      const before = productionMastersService.buildSheetForDate(selectedDate, { skipPersist: true })
      const beforeSegs = before.filter((e) => e.loomNumber === loomNumber).length
      const after = productionMastersService.removeQualitySegmentOnDay(
        selectedDate,
        loomNumber,
        segmentIndex
      )
      const afterSegs = after.filter((e) => e.loomNumber === loomNumber).length
      setLooms(productionMastersService.getLooms())
      setQualities(productionMastersService.getQualities())
      setEntries(after)
      return afterSegs < beforeSegs
    },
    [selectedDate]
  )

  const updateLoom = useCallback(
    (
      loomNumber: number,
      patch: Partial<LoomMaster>
    ): { forwardFillSkipped: { date: string; qualityName: string; loomNumber: number }[] } => {
      const prevQualityId =
        productionMastersService.getLooms().find((l) => l.loomNumber === loomNumber)?.qualityId ??
        null
      const selectedBefore =
        patch.qualityId
          ? productionMastersService.getQualities().find((q) => q.id === patch.qualityId)
          : null
      const selectedWasEnded = (selectedBefore?.status ?? 'ACTIVE') === 'ENDED'

      const nextLooms = productionMastersService.updateLoom(loomNumber, patch, selectedDate)
      const forwardFillSkipped = productionMastersService.consumeLastForwardFillSkips()
      setLooms(nextLooms)
      // Always re-read beams so Loom Status → Beam End appears without page refresh
      setBeams(productionMastersService.getBeams().map((b) => ({ ...b })))
      if (patch.qualityId !== undefined) {
        setQualities(productionMastersService.getQualities())
        // Auto-end (last loom cleared) — persist status to DB.
        if (prevQualityId && prevQualityId !== patch.qualityId) {
          const prevQ = productionMastersService.getQualities().find((q) => q.id === prevQualityId)
          if (prevQ?.status === 'ENDED' || prevQ?.status === 'HOLD') {
            void productionMastersService.flushQualityStatus(prevQualityId)
          }
        }
        // Past-day assign writes the sheet only; master may still hold today's quality.
        // Always prefer the id the user just chose (patch), not stale master.
        const assignedId = patch.qualityId
        if (assignedId && assignedId !== prevQualityId) {
          rememberQualityAssignFlash(assignedId)
        }
        if (assignedId) {
          const assigned = productionMastersService.getQualities().find((q) => q.id === assignedId)
          if (assigned && selectedWasEnded) {
            // Original ENDED row (user selected this id) must stay on Ends.
            const endedOriginal =
              productionMastersService
                .getQualities()
                .find(
                  (q) =>
                    q.id === patch.qualityId &&
                    (q.status ?? '') === 'ENDED'
                ) || selectedBefore || null
            void productionMastersService.flushReassign(assigned, endedOriginal)
          } else if (assignedId) {
            void productionMastersService.flushQualityStatus(assignedId)
          }
        }
      }
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
      return { forwardFillSkipped }
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
      setBeams(productionMastersService.updateBeam(beamNo, patch, { sheetDate: selectedDate }))
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
    },
    [selectedDate]
  )

  const addBeam = useCallback(
    async (partial: Partial<BeamMaster> & { beamNo: string }) => {
      try {
        setBeams(productionMastersService.addBeam(partial))
        setEntries(productionMastersService.buildSheetForDate(selectedDate))
        const ok = await productionMastersService.flushPendingBeam(partial.beamNo)
        if (!ok) {
          showError({
            title: 'Beam DB save pending',
            message:
              'Beam list mein aa gaya, lekin server confirm slow hai. Refresh ke baad bhi dikhna chahiye — warna dubara Add try karo.',
            confirmText: 'Theek hai',
            type: 'warning',
          })
        }
        setBeams(productionMastersService.getBeams())
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
    (id: string, patch: Partial<QualityMaster>): boolean => {
      const next = productionMastersService.updateQuality(id, patch, selectedDate)
      setQualities(next)
      setLooms(productionMastersService.getLooms())
      setEntries(productionMastersService.buildSheetForDate(selectedDate))
      const after = next.find((q) => q.id === id)
      const statusOk =
        patch.status === undefined ||
        (after != null &&
          (after.status ?? 'ACTIVE') === patch.status &&
          (patch.status !== 'ACTIVE' || !after.endedOn))
      if (
        patch.status === 'ENDED' ||
        patch.status === 'HOLD' ||
        patch.endedOn !== undefined ||
        patch.status === 'ACTIVE' ||
        patch.createdOn !== undefined
      ) {
        void productionMastersService.flushQualityStatus(id).then(() => {
          setQualities(productionMastersService.getQualities())
          setLooms(productionMastersService.getLooms())
          setEntries(productionMastersService.buildSheetForDate(selectedDate))
        })
      }
      return statusOk
    },
    [selectedDate]
  )

  const addQuality = useCallback(
    (partial?: Partial<QualityMaster>) => {
      const beforeIds = new Set(productionMastersService.getQualities().map((q) => q.id))
      setQualities(
        productionMastersService.addQuality({
          ...partial,
          createdOn: partial?.createdOn || selectedDate,
        })
      )
      const added = productionMastersService.getQualities().find((q) => !beforeIds.has(q.id))
      return added?.id ?? null
    },
    [selectedDate]
  )

  const deleteQuality = useCallback((id: string) => {
    setQualities(productionMastersService.deleteQuality(id))
  }, [])

  const reassignEndedQuality = useCallback(
    (id: string, createdOn: string) => {
      const { qualities: next, newQuality, archive } = productionMastersService.reassignEndedQuality(
        id,
        createdOn || selectedDate
      )
      setQualities(next)
      if (newQuality) {
        void productionMastersService.flushReassign(newQuality, archive).then((ok) => {
          setQualities(productionMastersService.getQualities())
          if (!ok) {
            showError({
              title: 'Reuse save fail',
              message:
                'Quality Active pe aa gayi lekin DB me save nahi hui. Internet/login check karke dobara Reuse dabao — warna refresh pe gayab ho sakti hai.',
            })
          }
        })
      }
      return newQuality?.id ?? null
    },
    [selectedDate, showError]
  )

  const startNewDay = useCallback(
    async (targetDate: string) => {
    setLoading(true)
    try {
        await productionMastersService.startNewDay(targetDate)
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
    addQualitySegment,
    removeQualitySegment,
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
