import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { usePayrollDirtyContextOptional } from '@/context/PayrollDirtyContext'

export interface UsePayrollDirtyTrackerOptions<T> {
  /** Specific editable fields to monitor. If omitted, checks all primitive keys. */
  editableFields?: Array<keyof T | string>
  /** Custom function to resolve a row's unique identifier (default: row.id) */
  getId?: (row: T) => string
  /** Human-readable sheet name (e.g. "Weavers Wages 1-15") */
  sheetName?: string
  /** Optional Save handler */
  onSave?: () => void | Promise<void>
  /** Optional Discard handler callback */
  onDiscard?: () => void
}

/**
 * Tracks unsaved cell changes across payroll tables (Advances, Weavers, Helpers, Staff, Contract, etc.).
 *
 * Provides:
 * - `isCellDirty(rowId, field)`: returns true if the cell differs from the saved baseline.
 * - `isRowDirty(rowId)`: returns true if any editable field in the row was edited.
 * - `dirtyCount`: total count of modified cells / new / deleted rows.
 * - `hasUnsavedChanges`: boolean flag indicating if Save is required.
 * - `commitSaved()`: call upon successful Save to mark current data as clean baseline.
 * - `discardChanges()`: reverts rows back to clean snapshot.
 * - Browser unload protection (`beforeunload`) when changes are pending.
 */
export function usePayrollDirtyTracker<T extends { id?: string }>(
  currentRows: T[],
  dependencyKey: string,
  options?: UsePayrollDirtyTrackerOptions<T>
) {
  const getId = useCallback(
    (row: T): string => {
      if (options?.getId) return options.getId(row)
      return row.id || ''
    },
    [options]
  )

  // Map of rowId -> snapshot of the row when clean
  const [snapshotMap, setSnapshotMap] = useState<Map<string, T>>(() => new Map())
  const [isInitialized, setIsInitialized] = useState(false)
  const lastDepKeyRef = useRef(dependencyKey)

  // When dependencyKey (month/fortnight) changes, reset snapshot to incoming data
  useEffect(() => {
    if (lastDepKeyRef.current !== dependencyKey) {
      lastDepKeyRef.current = dependencyKey
      const nextMap = new Map<string, T>()
      currentRows.forEach((r) => {
        const id = getId(r)
        if (id) nextMap.set(id, JSON.parse(JSON.stringify(r)))
      })
      setSnapshotMap(nextMap)
      setIsInitialized(currentRows.length > 0)
    }
  }, [dependencyKey, currentRows, getId])

  // Initialize snapshot once when initial rows load
  useEffect(() => {
    if (!isInitialized && currentRows.length > 0) {
      const nextMap = new Map<string, T>()
      currentRows.forEach((r) => {
        const id = getId(r)
        if (id) nextMap.set(id, JSON.parse(JSON.stringify(r)))
      })
      setSnapshotMap(nextMap)
      setIsInitialized(true)
    }
  }, [currentRows, isInitialized, getId])

  /** Re-initialize snapshot explicitly (e.g. after reload from store) */
  const resetSnapshot = useCallback(
    (rows: T[]) => {
      const nextMap = new Map<string, T>()
      rows.forEach((r) => {
        const id = getId(r)
        if (id) nextMap.set(id, JSON.parse(JSON.stringify(r)))
      })
      setSnapshotMap(nextMap)
      setIsInitialized(true)
    },
    [getId]
  )

  /** Commit current data as the new clean baseline (call after successful Save) */
  const commitSaved = useCallback(
    (rows?: T[]) => {
      const target = rows || currentRows
      const nextMap = new Map<string, T>()
      target.forEach((r) => {
        const id = getId(r)
        if (id) nextMap.set(id, JSON.parse(JSON.stringify(r)))
      })
      setSnapshotMap(nextMap)
    },
    [currentRows, getId]
  )

  /** Discard unsaved changes and return array of clean rows */
  const discardChanges = useCallback((): T[] => {
    const list: T[] = []
    snapshotMap.forEach((val) => {
      list.push(JSON.parse(JSON.stringify(val)))
    })
    return list
  }, [snapshotMap])

  /** Check if a specific cell differs from saved snapshot */
  const isCellDirty = useCallback(
    (rowId: string, field: keyof T | string, currentValue?: unknown): boolean => {
      if (!isInitialized || !rowId) return false
      const original = snapshotMap.get(rowId)
      if (!original) {
        // Newly added row not in snapshot
        return true
      }

      const origObj = original as Record<string, unknown>
      let origVal: unknown
      let curVal = currentValue

      // Check for customFields sub-object
      if (typeof field === 'string' && field.startsWith('cf_')) {
        const colId = field.replace('cf_', '')
        origVal = (origObj.customFields as Record<string, unknown> | undefined)?.[colId]
        if (curVal === undefined) {
          const curRow = currentRows.find((r) => getId(r) === rowId) as Record<string, unknown> | undefined
          curVal = (curRow?.customFields as Record<string, unknown> | undefined)?.[colId]
        }
      } else {
        origVal = origObj[field as string]
        if (curVal === undefined) {
          const curRow = currentRows.find((r) => getId(r) === rowId) as Record<string, unknown> | undefined
          curVal = curRow?.[field as string]
        }
      }

      // Numeric comparison
      if (typeof origVal === 'number' || typeof curVal === 'number') {
        return Number(origVal || 0) !== Number(curVal || 0)
      }

      // String / other comparison
      const sOrig = String(origVal ?? '').trim()
      const sCur = String(curVal ?? '').trim()
      return sOrig !== sCur
    },
    [snapshotMap, isInitialized, currentRows, getId]
  )

  /** Check if any editable field in a row was modified */
  const isRowDirty = useCallback(
    (rowId: string): boolean => {
      if (!isInitialized || !rowId) return false
      const original = snapshotMap.get(rowId)
      if (!original) return true // newly added row

      const curRow = currentRows.find((r) => getId(r) === rowId)
      if (!curRow) return true // deleted row

      const fieldsToCheck =
        options?.editableFields || (Object.keys(curRow) as Array<keyof T | string>)

      for (const field of fieldsToCheck) {
        if (
          field === 'id' ||
          field === 'serialNo' ||
          field === 'month' ||
          field === 'fortnight' ||
          field === 'createdAt' ||
          field === 'updatedAt'
        ) {
          continue
        }
        if (isCellDirty(rowId, field)) return true
      }
      return false
    },
    [snapshotMap, isInitialized, currentRows, getId, options, isCellDirty]
  )

  /** Compute total dirty count (modified cells + newly added + deleted rows) */
  const dirtyCount = useMemo(() => {
    if (!isInitialized || snapshotMap.size === 0) return 0
    let count = 0

    // Check rows in currentRows
    for (const row of currentRows) {
      const id = getId(row)
      if (!id) continue
      const orig = snapshotMap.get(id)
      if (!orig) {
        count += 1
        continue
      }
      const fieldsToCheck =
        options?.editableFields || (Object.keys(row) as Array<keyof T | string>)

      for (const field of fieldsToCheck) {
        if (
          field === 'id' ||
          field === 'serialNo' ||
          field === 'month' ||
          field === 'fortnight' ||
          field === 'createdAt' ||
          field === 'updatedAt'
        ) {
          continue
        }
        if (isCellDirty(id, field)) {
          count += 1
        }
      }
    }

    // Check if any row from snapshot was deleted
    for (const [id] of snapshotMap) {
      if (!currentRows.some((r) => getId(r) === id)) {
        count += 1
      }
    }

    return count
  }, [snapshotMap, currentRows, isInitialized, getId, options, isCellDirty])

  const hasUnsavedChanges = dirtyCount > 0

  // Register with shared PayrollDirtyContext for global page-change warnings
  const dirtyContext = usePayrollDirtyContextOptional()
  const register = dirtyContext?.register
  const unregister = dirtyContext?.unregister
  const instanceIdRef = useRef(`tracker-${Math.random().toString(36).slice(2, 9)}`)

  const sheetNameRef = useRef(options?.sheetName)
  sheetNameRef.current = options?.sheetName
  const onDiscardRef = useRef(options?.onDiscard || discardChanges)
  onDiscardRef.current = options?.onDiscard || discardChanges
  const onSaveRef = useRef(options?.onSave)
  onSaveRef.current = options?.onSave

  // Notify dirty context when dirty status changes
  useEffect(() => {
    if (!register) return
    register({
      id: instanceIdRef.current,
      dirtyCount,
      hasUnsavedChanges,
      sheetName: sheetNameRef.current,
      onDiscard: () => onDiscardRef.current?.(),
      onSave: () => onSaveRef.current?.(),
    })
  }, [register, dirtyCount, hasUnsavedChanges])

  // Unregister on unmount ONLY
  useEffect(() => {
    if (!unregister) return
    const id = instanceIdRef.current
    return () => {
      unregister(id)
    }
  }, [unregister])

  // Browser unload warning (tab close or reload)
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  /**
   * Helper to guard internal page transitions (e.g. Month change, Fortnight change, View tab change).
   * If clean: executes action immediately.
   * If dirty: prompts user to confirm discarding or staying.
   */
  const requestNavigationGuard = useCallback(
    (action: () => void | Promise<void>, customMessage?: ReactNode) => {
      if (dirtyContext) {
        dirtyContext.requestNavigationGuard(action, customMessage)
        return
      }
      if (!hasUnsavedChanges) {
        void action()
        return
      }
      const ok = window.confirm(
        `Aap ke paas ${dirtyCount} unsaved changes hain. Agar aap switch karein ge toh unsaved edits zaya ho jayengi. Proceed karein?`
      )
      if (ok) {
        discardChanges()
        void action()
      }
    },
    [dirtyContext, hasUnsavedChanges, dirtyCount, discardChanges]
  )

  return {
    isCellDirty,
    isRowDirty,
    dirtyCount,
    hasUnsavedChanges,
    commitSaved,
    resetSnapshot,
    discardChanges,
    requestNavigationGuard,
  }
}
