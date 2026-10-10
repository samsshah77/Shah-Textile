'use client'

import { useEffect, useRef } from 'react'

function getScrollParent(element: HTMLElement | null): HTMLElement | null {
  let parent = element?.parentElement
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent)
    const overflowY = style.overflowY
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent
    }
    parent = parent.parentElement
  }
  return null
}

/**
 * Table scroll pane: click-drag / touch pans both horizontally and vertically (hand cursor).
 * Works across all tables in the Production module:
 * - If container has internal vertical scroll, it scrolls el.scrollTop.
 * - If page / ancestor scrolls, it scrolls the page smoothly.
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
    let originWindowY = 0
    let originParentY = 0
    let vScrollParent: HTMLElement | null = null
    let pointerId: number | null = null

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const target = e.target as HTMLElement | null
      if (
        target?.closest(
          'input, textarea, select, button, a, label, [contenteditable="true"], .btn, .dropdown-menu'
        )
      ) {
        return
      }
      dragging = true
      pointerId = e.pointerId
      startX = e.clientX
      startY = e.clientY
      originLeft = el.scrollLeft
      originTop = el.scrollTop
      originWindowY =
        window.scrollY ||
        window.pageYOffset ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0

      vScrollParent = getScrollParent(el)
      if (vScrollParent) {
        originParentY = vScrollParent.scrollTop
      }

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

      // Horizontal scroll
      el.scrollLeft = originLeft - dx

      // Vertical scroll:
      const elStyle = window.getComputedStyle(el)
      const canElScrollY =
        (elStyle.overflowY === 'auto' || elStyle.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight + 4

      if (canElScrollY) {
        el.scrollTop = originTop - dy
      } else if (vScrollParent) {
        vScrollParent.scrollTop = originParentY - dy
      } else {
        const targetY = originWindowY - dy
        window.scrollTo({ top: targetY, behavior: 'instant' })
        document.documentElement.scrollTop = targetY
        document.body.scrollTop = targetY
      }

      e.preventDefault()
    }

    const onUp = (e: PointerEvent) => {
      if (!dragging) return
      if (pointerId != null && e.pointerId !== pointerId) return
      dragging = false
      pointerId = null
      vScrollParent = null
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
