'use client'

import React, { type CSSProperties, type ReactNode } from 'react'
import { useTablePanScroll } from '@/hooks/useTablePanScroll'
import { cn } from '@/lib/utils'

export interface TablePanScrollProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  title?: string
}

export function TablePanScroll({
  children,
  className,
  style,
  title = 'Click and drag (hand) to scroll horizontally & vertically',
}: TablePanScrollProps) {
  const panRef = useTablePanScroll<HTMLDivElement>()

  return (
    <div
      ref={panRef}
      className={cn('sara-hscroll-pane', className)}
      style={style}
      title={title}
    >
      {children}
    </div>
  )
}
