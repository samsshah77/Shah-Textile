'use client'

import React, { useState, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface ResizableThProps extends Omit<React.ThHTMLAttributes<HTMLTableCellElement>, 'onResize' | 'onReset'> {
  columnKey: string
  width?: number
  minWidth?: number
  onResize?: (colKey: string, newWidth: number) => void
  onReset?: (colKey: string) => void
  children: React.ReactNode
  enableResize?: boolean
}

export function ResizableTh({
  columnKey,
  width,
  minWidth = 35,
  onResize,
  onReset,
  children,
  className,
  style,
  enableResize = true,
  ...props
}: ResizableThProps) {
  const [isResizing, setIsResizing] = useState(false)
  const thRef = useRef<HTMLTableCellElement>(null)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const startX = e.clientX
      const currentWidth =
        width || (thRef.current ? thRef.current.getBoundingClientRect().width : 100)

      setIsResizing(true)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX
        const newWidth = Math.max(minWidth, currentWidth + deltaX)
        onResize?.(columnKey, newWidth)
      }

      const handleMouseUp = () => {
        setIsResizing(false)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [columnKey, minWidth, onResize, width]
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onReset?.(columnKey)
    },
    [columnKey, onReset]
  )

  const computedStyle: React.CSSProperties = {
    ...style,
    width: width ? `${width}px` : undefined,
    minWidth: width ? `${width}px` : `${minWidth}px`,
  }

  return (
    <th
      ref={thRef}
      style={computedStyle}
      className={cn('relative group/th select-none transition-[width] duration-75', className)}
      {...props}
    >
      <div className="w-full truncate">{children}</div>

      {enableResize && (
        <div
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          className={cn(
            'absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-20 flex items-center justify-center print:hidden',
            'hover:bg-blue-500 active:bg-blue-600 transition-colors',
            isResizing
              ? 'bg-blue-600 opacity-100 ring-1 ring-blue-400'
              : 'opacity-0 group-hover/th:opacity-100 bg-slate-400/40 dark:bg-slate-600/60'
          )}
          title="Drag column border to resize width (Double click to reset)"
        >
          <div className="h-3.5 w-0.5 bg-slate-900/40 dark:bg-white/60 rounded-full" />
        </div>
      )}
    </th>
  )
}
