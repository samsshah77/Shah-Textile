'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { LoomCategory, LoomStatus } from '@/types/loom'
import {
  DailyLoomProductionEntry,
  ProductionSummary,
  BeamStockItem,
  ActiveQualityOrder,
  MonthlyMatrixDay,
} from '@/types/production'
import { productionService } from '@/services/productionService'

export function useProductionGrid() {
  const [entries, setEntries] = useState<DailyLoomProductionEntry[]>([])
  const [summary, setSummary] = useState<ProductionSummary | null>(null)
  const [beamStock, setBeamStock] = useState<BeamStockItem[]>([])
  const [activeQualities, setActiveQualities] = useState<ActiveQualityOrder[]>([])
  const [monthlyMatrix, setMonthlyMatrix] = useState<{
    days: MonthlyMatrixDay[]
    loomTotals: Record<number, number>
    grandTotalMeters: number
    avgPerDay: number
  }>({ days: [], loomTotals: {}, grandTotalMeters: 0, avgPerDay: 0 })
  const [weftStock, setWeftStock] = useState<{ yarnColumns: string[]; days: any[] }>({
    yarnColumns: [],
    days: [],
  })

  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState<LoomCategory | 'ALL'>('ALL')
  const [filterStatus, setFilterStatus] = useState<LoomStatus | 'ALL'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDate, setSelectedDate] = useState<string>('2026-09-19')
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-09')
  const [modifiedLoomIds, setModifiedLoomIds] = useState<Set<number>>(new Set())

  const refreshAllReactiveData = useCallback(async (currentDate?: string, currentMonth?: string) => {
    const d = currentDate || selectedDate
    const m = currentMonth || (d.startsWith('2026-08') ? '2026-08' : '2026-09')
    const freshEntries = await productionService.getAllEntries(d)
    const freshSummary = await productionService.getFloorSummary(d)
    const freshBeams = productionService.getBeamStock()
    const freshQualities = productionService.getActiveQualities()
    const freshMatrix = productionService.getMonthlyMatrix(m)
    const freshWeft = productionService.getWeftStock(m)

    setEntries(freshEntries)
    setSummary(freshSummary)
    setBeamStock(freshBeams)
    setActiveQualities(freshQualities)
    setMonthlyMatrix(freshMatrix)
    setWeftStock(freshWeft)
  }, [selectedDate])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      await refreshAllReactiveData(selectedDate, selectedMonth)
    } catch (err) {
      console.error('Error fetching production grid data:', err)
    } finally {
      setLoading(false)
    }
  }, [refreshAllReactiveData, selectedDate, selectedMonth])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Update a Loom entry (triggers cascade across qualities, matrix, weft, and summary)
  const updateEntry = useCallback(
    async (loomNumber: number, patch: Partial<DailyLoomProductionEntry>) => {
      try {
        await productionService.updateEntry(loomNumber, patch, selectedDate)
        setModifiedLoomIds((prev) => new Set(prev).add(loomNumber))
        await refreshAllReactiveData(selectedDate, selectedMonth)
      } catch (err) {
        console.error(`Failed to update Loom #${loomNumber}:`, err)
      }
    },
    [refreshAllReactiveData, selectedDate, selectedMonth]
  )

  // Start new day production report
  const startNewDay = useCallback(
    async (targetDate: string) => {
      setLoading(true)
      try {
        await productionService.startNewDayProduction(targetDate, true)
        setSelectedDate(targetDate)
        if (targetDate.startsWith('2026-08')) setSelectedMonth('2026-08')
        else setSelectedMonth('2026-09')
        await refreshAllReactiveData(targetDate)
      } catch (err) {
        console.error('Failed to start new day production:', err)
      } finally {
        setLoading(false)
      }
    },
    [refreshAllReactiveData]
  )

  // Mount a beam onto a loom
  const mountBeam = useCallback(
    async (beamNo: string, loomNumber: number) => {
      try {
        await productionService.mountBeam(beamNo, loomNumber, selectedDate)
        setModifiedLoomIds((prev) => new Set(prev).add(loomNumber))
        await refreshAllReactiveData(selectedDate, selectedMonth)
      } catch (err) {
        console.error(`Failed to mount Beam #${beamNo} on Loom #${loomNumber}:`, err)
      }
    },
    [refreshAllReactiveData, selectedDate, selectedMonth]
  )

  // Unmount a beam
  const unmountBeam = useCallback(
    async (beamNo: string) => {
      try {
        await productionService.unmountBeam(beamNo)
        await refreshAllReactiveData(selectedDate, selectedMonth)
      } catch (err) {
        console.error(`Failed to unmount Beam #${beamNo}:`, err)
      }
    },
    [refreshAllReactiveData, selectedDate, selectedMonth]
  )

  const resetDefaults = useCallback(async () => {
    setLoading(true)
    try {
      await productionService.resetToDefaults()
      setModifiedLoomIds(new Set())
      await refreshAllReactiveData(selectedDate)
    } finally {
      setLoading(false)
    }
  }, [refreshAllReactiveData, selectedDate])

  const exportToCsv = useCallback(() => {
    if (!entries.length) return
    const headers = [
      'Loom #',
      'Category',
      'Quality Name',
      'Fabric Type',
      'Status',
      'RPM',
      'Pick',
      'Reed',
      'Width (Inch)',
      'GSM',
      'Running Hours',
      'Shift A (Meters)',
      'Shift B (Meters)',
      'Total Meters',
      'Efficiency (%)',
      'Stop Loss (Meters)',
      'Daily Revenue (PKR)',
    ]

    const rows = entries.map((e) => [
      e.loomNumber,
      e.category,
      `"${e.qualityName}"`,
      `"${e.fabricType}"`,
      e.status,
      e.rpm,
      e.pick,
      e.reed,
      e.widthInch,
      e.gsm,
      e.runningHours,
      e.shiftAMeters,
      e.shiftBMeters,
      e.totalMeters,
      e.efficiencyPercentage.toFixed(2),
      e.stopLossMeters.toFixed(2),
      (e.totalMeters * (e.pick * 0.95)).toFixed(2),
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `Sara_Textile_Daily_Production_${selectedDate}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [entries, selectedDate])

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const matchCat =
        filterCategory === 'ALL' || e.category === filterCategory
      const matchStatus =
        filterStatus === 'ALL' || e.status === filterStatus
      const matchQuery =
        !searchQuery ||
        e.loomNumber.toString().includes(searchQuery) ||
        e.qualityName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.fabricType.toLowerCase().includes(searchQuery.toLowerCase())
      return matchCat && matchStatus && matchQuery
    })
  }, [entries, filterCategory, filterStatus, searchQuery])

  return {
    entries,
    filteredEntries,
    summary,
    beamStock,
    activeQualities,
    monthlyMatrix,
    weftStock,
    loading,
    filterCategory,
    setFilterCategory,
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,
    selectedDate,
    setSelectedDate: (newDate: string) => {
      setSelectedDate(newDate)
      const m = newDate.startsWith('2026-08') ? '2026-08' : '2026-09'
      setSelectedMonth(m)
      refreshAllReactiveData(newDate, m)
    },
    selectedMonth,
    setSelectedMonth: (newMonth: string) => {
      setSelectedMonth(newMonth)
      refreshAllReactiveData(selectedDate, newMonth)
    },
    startNewDay,
    updateEntry,
    mountBeam,
    unmountBeam,
    resetDefaults,
    exportToCsv,
    modifiedLoomIds,
  }
}
