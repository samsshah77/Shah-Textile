'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const MIN_H = 30
const MAX_H = 240

/**
 * Height of a sheet's signature boxes, remembered per sheet on this device.
 * Drag the corner of any box and every box on that sheet follows (room for a revenue ticket).
 */
export function useSignatureBoxHeight(sheetKey: string, fallback = 50) {
  const storageKey = `sara_signature_h_${sheetKey}`
  const [height, setState] = useState<number>(() => {
    try {
      const saved = Number(window.localStorage.getItem(storageKey))
      return saved >= MIN_H && saved <= MAX_H ? saved : fallback
    } catch {
      return fallback
    }
  })
  const setHeight = useCallback(
    (next: number) => {
      const h = Math.round(Math.min(MAX_H, Math.max(MIN_H, next)))
      setState(h)
      try {
        window.localStorage.setItem(storageKey, String(h))
      } catch {
        /* storage blocked */
      }
    },
    [storageKey]
  )
  return { height, setHeight }
}

/**
 * Box for a signature on the printed sheet. Its width is the column's width (drag the column
 * edge); its height is shared by the sheet (drag the box's bottom-right corner). Hovering shows
 * the size in px (width × height). On paper it keeps at least the column's width so a ticket fits.
 */
export function SignatureBox({
  height,
  onHeightChange,
  width,
  className,
  children,
}: {
  height: number
  onHeightChange: (h: number) => void
  /** Column width in px, kept as the minimum on paper. */
  width?: number
  className?: string
  children?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Live size, shown on hover and while dragging, so the same size can be used on every sheet.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const commit = () => {
    const h = ref.current?.offsetHeight
    if (h && Math.abs(h - height) > 1) onHeightChange(h)
  }
  return (
    <div
      ref={ref}
      onPointerUp={commit}
      onMouseUp={commit}
      title="Box ka kona kheench kar oonchai badlein (sab boxes saath badlenge)"
      style={{ height, ...(width ? ({ '--sig-w': `${width - 10}px` } as CSSProperties) : {}) }}
      className={cn(
        'group/sig relative w-full resize-y overflow-hidden rounded border border-slate-300 print:resize-none print:border-slate-500',
        width && 'print:min-w-(--sig-w)',
        className
      )}
    >
      {children}
      {size ? (
        <span className="pointer-events-none absolute left-1 top-0.5 z-10 rounded bg-slate-800/85 px-1 py-px font-mono text-[10px] leading-tight text-white [visibility:hidden] group-hover/sig:[visibility:visible] print:hidden">
          {size.w} × {size.h}
        </span>
      ) : null}
    </div>
  )
}

