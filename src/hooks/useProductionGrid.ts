'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { LoomCategory, LoomStatus } from '@/types/loom'
import { DailyLoomProductionEntry, ProductionSummary } from '@/types/production'
import { productionService } from '@/services/productionService'

export function useProductionGrid() {
  const [entries, setEntries] = useState<DailyLoomProductionEntry[]>([])
  const [summary, setSummary] = useState<ProductionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState<LoomCategory | 'ALL'>('ALL')
  const [filterStatus, setFilterStatus] = useState<LoomStatus | 'ALL'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  )
  const [modifiedLoomIds, setModifiedLoomIds] = useState<Set<number>>(new Set())

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await productionService.getAllEntries()
      const summaryData = await productionService.getFloorSummary(selectedDate)
      setEntries(data)
      setSummary(summaryData)
    } catch (err) {
      console.error('Error fetching production grid data:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => {
    loadData()
  }, [loadData])

  const updateEntry = useCallback(
    async (loomNumber: number, patch: Partial<DailyLoomProductionEntry>) => {
      try {
        const updated = await productionService.updateEntry(loomNumber, patch)
        setEntries((prev) => prev.map((e) => (e.loomNumber === loomNumber ? updated : e)))
        setModifiedLoomIds((prev) => new Set(prev).add(loomNumber))
        const newSummary = await productionService.getFloorSummary(selectedDate)
        setSummary(newSummary)
      } catch (err) {
        console.error(`Failed to update Loom #${loomNumber}:`, err)
      }
    },
    [selectedDate]
  )

  const resetDefaults = useCallback(async () => {
    setLoading(true)
    try {
      const reset = await productionService.resetToDefaults()
      const newSummary = await productionService.getFloorSummary(selectedDate)
      setEntries(reset)
      setSummary(newSummary)
      setModifiedLoomIds(new Set())
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

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
      e.totalMeters.toFixed(1),
      `${e.efficiencyPercentage.toFixed(1)}%`,
      e.stopLossMeters.toFixed(1),
      (e.totalMeters * (e.pick * 0.95)).toFixed(0),
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Sara_Textile_Daily_Production_${selectedDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [entries, selectedDate])

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (filterCategory !== 'ALL' && entry.category !== filterCategory) {
        return false
      }
      if (filterStatus !== 'ALL' && entry.status !== filterStatus) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchesLoomNo = entry.loomNumber.toString().includes(q)
        const matchesQuality = entry.qualityName.toLowerCase().includes(q)
        const matchesFabric = entry.fabricType.toLowerCase().includes(q)
        if (!matchesLoomNo && !matchesQuality && !matchesFabric) {
          return false
        }
      }
      return true
    })
  }, [entries, filterCategory, filterStatus, searchQuery])

  return {
    entries,
    filteredEntries,
    summary,
    loading,
    filterCategory,
    setFilterCategory,
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,
    selectedDate,
    setSelectedDate,
    updateEntry,
    resetDefaults,
    exportToCsv,
    modifiedLoomIds,
  }
}
