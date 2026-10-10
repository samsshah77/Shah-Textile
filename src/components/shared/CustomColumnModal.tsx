'use client'

import { useState } from 'react'
import { CustomColumn } from '@/types/payroll'
import { Plus, X, Palette, Columns3, Pencil, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export const columnColorOptions: { id: CustomColumn['color']; name: string; bg: string; text: string; border: string; previewBg: string }[] = [
  { id: 'slate', name: 'Slate Gray', bg: 'bg-slate-200 dark:bg-slate-700', text: 'text-slate-950 dark:text-slate-50', border: 'border-slate-400', previewBg: 'bg-slate-400' },
  { id: 'emerald', name: 'Emerald Green', bg: 'bg-emerald-100 dark:bg-emerald-950/60', text: 'text-emerald-950 dark:text-emerald-200', border: 'border-emerald-500', previewBg: 'bg-emerald-500' },
  { id: 'blue', name: 'Royal Blue', bg: 'bg-blue-100 dark:bg-blue-950/60', text: 'text-blue-950 dark:text-blue-200', border: 'border-blue-500', previewBg: 'bg-blue-500' },
  { id: 'amber', name: 'Amber Gold', bg: 'bg-amber-100 dark:bg-amber-950/60', text: 'text-amber-950 dark:text-amber-200', border: 'border-amber-500', previewBg: 'bg-amber-500' },
  { id: 'purple', name: 'Purple Violet', bg: 'bg-purple-100 dark:bg-purple-950/60', text: 'text-purple-950 dark:text-purple-200', border: 'border-purple-500', previewBg: 'bg-purple-500' },
  { id: 'rose', name: 'Rose Red', bg: 'bg-rose-100 dark:bg-rose-950/60', text: 'text-rose-950 dark:text-rose-200', border: 'border-rose-500', previewBg: 'bg-rose-500' },
  { id: 'teal', name: 'Teal Cyan', bg: 'bg-teal-100 dark:bg-teal-950/60', text: 'text-teal-950 dark:text-teal-200', border: 'border-teal-500', previewBg: 'bg-teal-500' },
]

export function getColumnColorClass(color: CustomColumn['color'] = 'slate') {
  const found = columnColorOptions.find((c) => c.id === color)
  return found ? `${found.bg} ${found.text} ${found.border}` : 'bg-slate-200 text-slate-950 border-slate-400'
}

interface AddColumnButtonProps {
  onAddColumn: (col: CustomColumn) => void
  existingColumns?: CustomColumn[]
}

/** Temporarily off — flip to true when "+ Add Column" should show again. */
const SHOW_ADD_COLUMN = false

export function AddColumnButton(props: AddColumnButtonProps) {
  if (!SHOW_ADD_COLUMN) return null
  return <AddColumnButtonActive {...props} />
}

function AddColumnButtonActive({ onAddColumn }: AddColumnButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [columnLabel, setColumnLabel] = useState('')
  const [selectedColor, setSelectedColor] = useState<CustomColumn['color']>('blue')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!columnLabel.trim()) return

    const newCol: CustomColumn = {
      id: `col_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      label: columnLabel.trim(),
      color: selectedColor,
    }

    onAddColumn(newCol)
    setColumnLabel('')
    setIsOpen(false)
  }

  return (
    <div className="relative inline-block print:hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded-lg border-2 border-slate-800 dark:border-slate-600 bg-card px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 hover:bg-muted transition-colors cursor-pointer shadow-xs"
        title="Add a custom column to this table"
      >
        <Columns3 className="size-3.5 text-blue-600 dark:text-blue-400" />
        <span>+ Add Column</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border-2 border-slate-900 dark:border-slate-700 bg-card p-4 shadow-xl font-sans animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
            <div className="flex items-center gap-1.5 font-black text-xs text-slate-950 dark:text-white uppercase tracking-wider">
              <Palette className="size-3.5 text-blue-600" />
              <span>Add Custom Column</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 mb-1">
                Column Header Title *
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. Gate Pass, Tax, Notes"
                value={columnLabel}
                onChange={(e) => setColumnLabel(e.target.value)}
                className="w-full rounded-lg border-2 border-slate-300 dark:border-slate-700 bg-background px-2.5 py-1.5 text-xs font-bold text-slate-950 dark:text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                Header Accent Color
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {columnColorOptions.map((opt) => (
                  <button
                    type="button"
                    key={opt.id}
                    onClick={() => setSelectedColor(opt.id)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[10px] font-bold transition-all cursor-pointer',
                      selectedColor === opt.id
                        ? 'border-2 border-slate-950 dark:border-white ring-2 ring-blue-500/40 bg-muted/40 font-black'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-muted/20'
                    )}
                  >
                    <span className={cn('size-3.5 rounded-full border border-black/20', opt.previewBg)} />
                    <span className="truncate w-full text-center text-[9px] text-slate-700 dark:text-slate-300">{opt.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow hover:bg-blue-700 cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>Insert Column</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

interface CustomColumnHeaderProps {
  column: CustomColumn
  onUpdateColumn: (updated: CustomColumn) => void
  onRemoveColumn: (colId: string) => void
}

export function CustomColumnHeader({
  column,
  onUpdateColumn,
  onRemoveColumn,
}: CustomColumnHeaderProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [label, setLabel] = useState(column.label)
  const [color, setColor] = useState(column.color)
  const [widthVal, setWidthVal] = useState(column.width || 120)
  const [isResizing, setIsResizing] = useState(false)

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!label.trim()) return
    onUpdateColumn({ ...column, label: label.trim(), color, width: Math.max(50, widthVal) })
    setIsEditing(false)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startWidth = column.width || 120

    setIsResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const newWidth = Math.max(50, Math.round(startWidth + deltaX))
      onUpdateColumn({ ...column, width: newWidth })
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
  }

  const currentWidth = column.width || 120

  return (
    <th
      style={{ width: `${currentWidth}px`, minWidth: `${currentWidth}px` }}
      className={cn(
        'group/col relative border-r border-slate-900 py-2 px-2 text-center font-sans text-[11px] font-black select-none',
        getColumnColorClass(column.color)
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-bold truncate">{column.label}</span>
        
        {/* Edit and Delete Icons shown on Hover */}
        <div className="hidden group-hover/col:flex items-center gap-1 print:hidden">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIsEditing(true)
            }}
            title="Edit column name, width & color"
            className="p-0.5 rounded hover:bg-black/15 text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
          >
            <Pencil className="size-3" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemoveColumn(column.id)
            }}
            title="Delete this column"
            className="p-0.5 rounded hover:bg-red-500 hover:text-white text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {/* Drag Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          'absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-20 flex items-center justify-center print:hidden',
          'hover:bg-blue-500 active:bg-blue-600 transition-colors',
          isResizing
            ? 'bg-blue-600 opacity-100 ring-1 ring-blue-400'
            : 'opacity-0 group-hover/col:opacity-100 bg-slate-400/40'
        )}
        title={`Drag to resize column (Width: ${currentWidth}px)`}
      >
        <div className="h-3.5 w-0.5 bg-slate-900/40 rounded-full" />
      </div>

      {/* Inline Edit Popover */}
      {isEditing && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full mt-1 z-50 w-64 rounded-xl border-2 border-slate-900 dark:border-slate-700 bg-card p-3 shadow-xl font-sans text-left text-foreground normal-case font-normal animate-in fade-in"
        >
          <form onSubmit={handleSaveEdit} className="space-y-2.5">
            <div>
              <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 mb-1">Edit Column Title:</label>
              <input
                type="text"
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-background px-2 py-1 text-xs font-bold text-slate-950 dark:text-white focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 mb-1">Column Width (Pixels):</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="50"
                  max="500"
                  value={widthVal}
                  onChange={(e) => setWidthVal(Number(e.target.value))}
                  className="w-24 rounded border border-slate-300 dark:border-slate-700 bg-background px-2 py-1 text-xs font-bold text-slate-950 dark:text-white font-mono"
                />
                <span className="text-[10px] text-muted-foreground font-semibold">px (or drag border)</span>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 mb-1">Change Header Color:</label>
              <div className="grid grid-cols-4 gap-1">
                {columnColorOptions.map((opt) => (
                  <button
                    type="button"
                    key={opt.id}
                    onClick={() => setColor(opt.id)}
                    className={cn(
                      'flex items-center justify-center p-1 rounded border text-[9px] font-bold cursor-pointer',
                      color === opt.id ? 'border-2 border-slate-950 font-black bg-muted' : 'border-slate-200'
                    )}
                  >
                    <span className={cn('size-2.5 rounded-full mr-1', opt.previewBg)} />
                    <span>{opt.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-border">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-2 py-0.5 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1 rounded bg-blue-600 px-2.5 py-0.5 text-xs font-bold text-white shadow hover:bg-blue-700"
              >
                <Check className="size-3" />
                <span>Save</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </th>
  )
}
