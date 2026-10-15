'use client'

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { useAlertDialogOptional } from '@/context/AlertDialogContext'

export interface PayrollDirtyRegistration {
  id: string
  dirtyCount: number
  hasUnsavedChanges: boolean
  onDiscard?: () => void
  onSave?: () => void | Promise<void>
  sheetName?: string
}

export interface PayrollDirtyContextValue {
  register: (reg: PayrollDirtyRegistration) => void
  unregister: (id: string) => void
  dirtyCount: number
  hasUnsavedChanges: boolean
  activeSheetName?: string
  /** Prompts user if dirty before executing action. If clean, executes immediately. */
  requestNavigationGuard: (action: () => void | Promise<void>, customMessage?: ReactNode) => void
  /** Prompts user if dirty before navigating to a target URL. */
  confirmDiscardAndNavigate: (targetHref: string) => void
}

const PayrollDirtyContext = createContext<PayrollDirtyContextValue | null>(null)

export function PayrollDirtyProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const alertDialog = useAlertDialogOptional()

  const registrationsRef = useRef<Map<string, PayrollDirtyRegistration>>(new Map())

  const [dirtyState, setDirtyState] = useState<{
    dirtyCount: number
    hasUnsavedChanges: boolean
    activeSheetName?: string
  }>({
    dirtyCount: 0,
    hasUnsavedChanges: false,
    activeSheetName: undefined,
  })

  const recompute = useCallback(() => {
    let totalCount = 0
    let anyDirty = false
    let sheetTitle: string | undefined

    for (const reg of registrationsRef.current.values()) {
      if (reg.hasUnsavedChanges && reg.dirtyCount > 0) {
        anyDirty = true
        totalCount += reg.dirtyCount
        if (!sheetTitle && reg.sheetName) sheetTitle = reg.sheetName
      }
    }

    setDirtyState((prev) => {
      if (
        prev.dirtyCount === totalCount &&
        prev.hasUnsavedChanges === anyDirty &&
        prev.activeSheetName === sheetTitle
      ) {
        return prev // Prevent unnecessary state updates / re-renders
      }
      return {
        dirtyCount: totalCount,
        hasUnsavedChanges: anyDirty,
        activeSheetName: sheetTitle,
      }
    })
  }, [])

  const register = useCallback(
    (reg: PayrollDirtyRegistration) => {
      registrationsRef.current.set(reg.id, reg)
      recompute()
    },
    [recompute]
  )

  const unregister = useCallback(
    (id: string) => {
      if (registrationsRef.current.has(id)) {
        registrationsRef.current.delete(id)
        recompute()
      }
    },
    [recompute]
  )

  const { dirtyCount, hasUnsavedChanges, activeSheetName } = dirtyState

  // Keep refs for event listeners so they always see latest values
  const hasUnsavedRef = useRef(hasUnsavedChanges)
  hasUnsavedRef.current = hasUnsavedChanges
  const dirtyCountRef = useRef(dirtyCount)
  dirtyCountRef.current = dirtyCount
  const sheetTitleRef = useRef(activeSheetName)
  sheetTitleRef.current = activeSheetName

  const discardAll = useCallback(() => {
    for (const reg of registrationsRef.current.values()) {
      try {
        reg.onDiscard?.()
      } catch {
        // ignore
      }
    }
    registrationsRef.current.clear()
    recompute()
  }, [recompute])

  /** Prompts the user before allowing an action or navigation to proceed */
  const requestNavigationGuard = useCallback(
    (action: () => void | Promise<void>, customMessage?: ReactNode) => {
      if (!hasUnsavedRef.current) {
        void action()
        return
      }

      const count = dirtyCountRef.current
      const title = sheetTitleRef.current
      const messageContent =
        customMessage ||
        (
          <div className="space-y-1.5 text-xs text-slate-600">
            <p>
              Aap ke paas{' '}
              <strong className="text-amber-700 font-bold">
                {count} unsaved change{count > 1 ? 's' : ''}
              </strong>{' '}
              {title ? `(${title})` : ''} hain.
            </p>
            <p>
              Agar aap save kiye baghair page change ya switch karein ge toh unsaved changes zaya ho jayengi.
            </p>
            <p className="text-[11px] text-slate-500 pt-1">
              • <strong>Discard & Leave:</strong> Changes zaya karke aagay barhein.<br />
              • <strong>Stay on Page:</strong> Rukain taake pehle Save button daba sakein.
            </p>
          </div>
        )

      if (alertDialog) {
        alertDialog.showConfirm({
          title: 'Unsaved Changes!',
          message: messageContent,
          confirmText: 'Discard & Leave',
          cancelText: 'Stay on Page',
          onConfirm: async () => {
            discardAll()
            await action()
          },
        })
      } else {
        const ok = window.confirm(
          `Aap ke paas ${count} unsaved changes hain. Agar aap page change karein ge toh unsaved edits zaya ho jayengi. Proceed karein?`
        )
        if (ok) {
          discardAll()
          void action()
        }
      }
    },
    [alertDialog, discardAll]
  )

  const confirmDiscardAndNavigate = useCallback(
    (targetHref: string) => {
      requestNavigationGuard(() => {
        router.push(targetHref)
      })
    },
    [requestNavigationGuard, router]
  )

  // 1. Intercept ANY link click on the page during the capture phase
  useEffect(() => {
    if (!hasUnsavedChanges) return

    const handleAnchorClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return
      // Only handle left clicks without modifier keys
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

      const anchor = (e.target as HTMLElement)?.closest('a')
      if (!anchor) return

      const rawHref = anchor.getAttribute('href')
      if (
        !rawHref ||
        rawHref === '#' ||
        rawHref.startsWith('javascript:') ||
        rawHref.startsWith('mailto:') ||
        rawHref.startsWith('tel:') ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download')
      ) {
        return
      }

      let targetUrl: URL
      try {
        targetUrl = new URL(anchor.href, window.location.href)
      } catch {
        return
      }

      const currentUrl = new URL(window.location.href)
      // If clicking current page with same query parameters, do not intercept
      if (
        targetUrl.origin === currentUrl.origin &&
        targetUrl.pathname === currentUrl.pathname &&
        targetUrl.search === currentUrl.search
      ) {
        return
      }

      // Unsaved changes exist! Intercept immediately in capture phase
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()

      const destination =
        targetUrl.origin === currentUrl.origin
          ? `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`
          : targetUrl.href

      confirmDiscardAndNavigate(destination)
    }

    window.addEventListener('click', handleAnchorClick, true)
    return () => {
      window.removeEventListener('click', handleAnchorClick, true)
    }
  }, [hasUnsavedChanges, confirmDiscardAndNavigate])

  // 2. Intercept Browser Back / Forward buttons (popstate)
  useEffect(() => {
    if (!hasUnsavedChanges) return

    // Push a dummy history state so hitting Back doesn't immediately exit
    window.history.pushState({ saraPayrollGuard: true }, '', window.location.href)

    const handlePopState = () => {
      // Re-push immediately so user stays on current page
      window.history.pushState({ saraPayrollGuard: true }, '', window.location.href)

      requestNavigationGuard(() => {
        // Discarded by user: allow back navigation
        registrationsRef.current.clear()
        recompute()
        window.history.back()
      })
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [hasUnsavedChanges, requestNavigationGuard, recompute])

  const contextValue = useMemo<PayrollDirtyContextValue>(
    () => ({
      register,
      unregister,
      dirtyCount,
      hasUnsavedChanges,
      activeSheetName,
      requestNavigationGuard,
      confirmDiscardAndNavigate,
    }),
    [
      register,
      unregister,
      dirtyCount,
      hasUnsavedChanges,
      activeSheetName,
      requestNavigationGuard,
      confirmDiscardAndNavigate,
    ]
  )

  return (
    <PayrollDirtyContext.Provider value={contextValue}>
      {children}
    </PayrollDirtyContext.Provider>
  )
}

export function usePayrollDirtyContext(): PayrollDirtyContextValue {
  const ctx = useContext(PayrollDirtyContext)
  if (!ctx) {
    throw new Error('usePayrollDirtyContext must be used within a PayrollDirtyProvider')
  }
  return ctx
}

export function usePayrollDirtyContextOptional(): PayrollDirtyContextValue | null {
  return useContext(PayrollDirtyContext)
}
