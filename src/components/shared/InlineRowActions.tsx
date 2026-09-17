'use client'

import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SerialCellProps {
  serialNo: number
  index: number
  onInsertRow?: (index: number) => void
  className?: string
}

export function SerialCellWithInsert({
  serialNo,
  index,
  onInsertRow,
  className,
}: SerialCellProps) {
  return (
    <td
      className={cn(
        'group/serial relative border-r border-slate-900 py-1.5 px-1 text-center font-bold text-slate-950 dark:text-slate-100 select-none',
        className
      )}
    >
      <div className="flex items-center justify-center gap-1">
        <span>{serialNo}</span>
        {onInsertRow && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onInsertRow(index)
            }}
            title={`Insert new row below row ${serialNo}`}
            className="hidden sm:inline-flex opacity-0 group-hover/serial:opacity-100 hover:scale-110 size-4 items-center justify-center rounded bg-blue-600 text-white shadow-xs transition-all cursor-pointer print:hidden"
          >
            <Plus className="size-3 stroke-[3]" />
          </button>
        )}
      </div>
    </td>
  )
}
