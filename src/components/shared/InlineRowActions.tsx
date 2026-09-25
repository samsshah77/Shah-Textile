'use client'

import { ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SerialCellProps {
  serialNo: number
  index: number
  onMoveUp?: (index: number) => void
  onMoveDown?: (index: number) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  className?: string
}

export function reorderSerialRows<T extends { serialNo?: number | null }>(
  list: T[],
  index: number,
  direction: 'up' | 'down'
): T[] | null {
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= list.length) return null
  const next = [...list]
  const [row] = next.splice(index, 1)
  next.splice(target, 0, row)
  return next.map((item, i) => ({ ...item, serialNo: i + 1 }) as T)
}

export function SerialCellWithInsert({
  serialNo,
  index,
  onMoveUp,
  onMoveDown,
  canMoveUp = true,
  canMoveDown = true,
  className,
}: SerialCellProps) {
  const showReorder = Boolean(onMoveUp || onMoveDown)
  return (
    <td
      className={cn(
        'relative border-r border-slate-900 py-1.5 px-1 text-center font-bold text-slate-950 dark:text-slate-100 select-none',
        className
      )}
    >
      <div className="relative flex items-center justify-center min-h-[28px] min-w-[36px]">
        <span className="tabular-nums">{serialNo}</span>
        {showReorder && (
          <div className="sara-serial-arrows">
            <button
              type="button"
              disabled={!canMoveUp || !onMoveUp}
              onClick={(e) => {
                e.stopPropagation()
                onMoveUp?.(index)
              }}
              title="Move up"
            >
              <ChevronUp className="size-4 stroke-[2.5]" />
            </button>
            <button
              type="button"
              disabled={!canMoveDown || !onMoveDown}
              onClick={(e) => {
                e.stopPropagation()
                onMoveDown?.(index)
              }}
              title="Move down"
            >
              <ChevronDown className="size-4 stroke-[2.5]" />
            </button>
          </div>
        )}
      </div>
    </td>
  )
}
