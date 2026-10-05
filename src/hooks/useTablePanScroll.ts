'use client'

import { useEffect, useRef } from 'react'

/**
 * Table scroll pane: click-drag / touch pans horizontally (hand cursor).
 * Does not force a max-height box — page scrolls normally; hand moves sideways.
 */
export function useTablePanScroll<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let dragging = false
    let startX = 0
    let startY = 0
    let originLeft = 0
    let originTop = 0
    let pointerId: number | null = null

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, button, a, label, [contenteditable="true"]')) {
        return
      }
      dragging = true
      pointerId = e.pointerId
      startX = e.clientX
      startY = e.clientY
      originLeft = el.scrollLeft
      originTop = el.scrollTop
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      el.classList.add('sara-hscroll-dragging')
    }

    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return
      el.scrollLeft = originLeft - dx
      // Vertical: page scroll only — don't trap Y inside the pane
      if (el.scrollHeight > el.clientHeight) {
        el.scrollTop = originTop - dy
      }
      e.preventDefault()
    }

    const onUp = (e: PointerEvent) => {
      if (!dragging) return
      if (pointerId != null && e.pointerId !== pointerId) return
      dragging = false
      pointerId = null
      el.classList.remove('sara-hscroll-dragging')
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove, { passive: false })
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)

    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.classList.remove('sara-hscroll-dragging')
    }
  }, [])

  return ref
}
