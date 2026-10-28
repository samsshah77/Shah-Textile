'use client'

import { useCallback, useState } from 'react'
import { applyPrintOrientation, type PrintOrientation } from '@/lib/printOrientation'

/**
 * Paper direction for a sheet's Print / PDF buttons, remembered per page on this device.
 * Wide sheets start landscape; the user can switch to portrait.
 */
export function usePrintOrientation(pageKey: string, fallback: PrintOrientation = 'landscape') {
  const storageKey = `sara_print_orientation_${pageKey}`
  const [orientation, setState] = useState<PrintOrientation>(() => {
    try {
      const saved = window.localStorage.getItem(storageKey)
      return saved === 'portrait' || saved === 'landscape' ? saved : fallback
    } catch {
      return fallback
    }
  })

  const setOrientation = useCallback(
    (next: PrintOrientation) => {
      setState(next)
      try {
        window.localStorage.setItem(storageKey, next)
      } catch {
        /* storage blocked */
      }
    },
    [storageKey]
  )

  const print = useCallback(() => {
    const undo = applyPrintOrientation(orientation)
    window.print()
    undo()
  }, [orientation])

  return { orientation, setOrientation, print }
}
