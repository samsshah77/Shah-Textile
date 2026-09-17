'use client'

import { useState, useCallback } from 'react'

export function useResizableColumns(
  tableKey: string,
  defaultWidths: Record<string, number>
) {
  const storageKey = `sara_col_widths_${tableKey}`

  const [widths, setWidths] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(storageKey)
        if (saved) {
          return { ...defaultWidths, ...JSON.parse(saved) }
        }
      } catch (e) {
        console.error('Failed to load column widths:', e)
      }
    }
    return defaultWidths
  })

  // Update a single column's width
  const setColumnWidth = useCallback(
    (colKey: string, newWidth: number) => {
      setWidths((prev) => {
        const updated = { ...prev, [colKey]: Math.max(35, Math.round(newWidth)) }
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(storageKey, JSON.stringify(updated))
          } catch (e) {}
        }
        return updated
      })
    },
    [storageKey]
  )

  // Reset all columns to default widths
  const resetAllWidths = useCallback(() => {
    setWidths(defaultWidths)
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(storageKey)
      } catch (e) {}
    }
  }, [defaultWidths, storageKey])

  // Reset a specific single column to default width
  const resetColumnWidth = useCallback(
    (colKey: string) => {
      const def = defaultWidths[colKey]
      if (def !== undefined) {
        setColumnWidth(colKey, def)
      }
    },
    [defaultWidths, setColumnWidth]
  )

  return {
    widths,
    setColumnWidth,
    resetAllWidths,
    resetColumnWidth,
  }
}
