'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Slim top-of-viewport progress bar during App Router navigations.
 * Keeps the current page visible (no white flash / full-screen overlay).
 */
function NavigationProgressInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)
  const [completing, setCompleting] = useState(false)
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failsafe = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(false)

  const clearTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current)
    if (doneTimer.current) clearTimeout(doneTimer.current)
    if (failsafe.current) clearTimeout(failsafe.current)
    showTimer.current = null
    doneTimer.current = null
    failsafe.current = null
  }

  const start = useCallback(() => {
    if (activeRef.current) return
    activeRef.current = true
    setCompleting(false)
    // Delay so instant/prefetched navigations don't flash
    showTimer.current = setTimeout(() => setVisible(true), 80)
    failsafe.current = setTimeout(() => {
      activeRef.current = false
      setCompleting(true)
      doneTimer.current = setTimeout(() => {
        setVisible(false)
        setCompleting(false)
      }, 220)
    }, 12000)
  }, [])

  const finish = useCallback(() => {
    if (!activeRef.current) {
      setVisible(false)
      setCompleting(false)
      return
    }
    activeRef.current = false
    if (showTimer.current) {
      clearTimeout(showTimer.current)
      showTimer.current = null
    }
    if (failsafe.current) {
      clearTimeout(failsafe.current)
      failsafe.current = null
    }
    setVisible(true)
    setCompleting(true)
    doneTimer.current = setTimeout(() => {
      setVisible(false)
      setCompleting(false)
    }, 220)
  }, [])

  useEffect(() => {
    finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commit on route change only
  }, [pathname, searchParams])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return
      if (e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const el = e.target as Element | null
      const a = el?.closest?.('a')
      if (!a) return
      if (a.hasAttribute('download')) return
      if (a.getAttribute('target') === '_blank') return
      const href = a.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      start()
    }

    const onPopState = () => start()

    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', onPopState)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', onPopState)
      clearTimers()
    }
  }, [start])

  if (!visible) return null

  return (
    <div
      className="sara-nav-progress"
      role="progressbar"
      aria-busy="true"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Loading page"
      data-completing={completing ? 'true' : 'false'}
    >
      <div className="sara-nav-progress__bar" />
    </div>
  )
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  )
}
