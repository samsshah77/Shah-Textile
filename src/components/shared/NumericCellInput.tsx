'use client'

import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react'
import { cn } from '@/lib/utils'

type NavDir = 'up' | 'down' | 'left' | 'right'

function focusNavCell(row: number, col: number) {
  const next = document.querySelector<HTMLElement>(
    `[data-nav-row="${row}"][data-nav-col="${col}"]`
  )
  if (next && !next.hasAttribute('disabled') && !(next as HTMLInputElement).disabled) {
    next.focus()
    if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
      next.select?.()
    }
    return true
  }
  return false
}

function focusSiblingCell(el: HTMLElement, dir: NavDir) {
  const row = Number(el.dataset.navRow)
  const col = Number(el.dataset.navCol)
  if (Number.isNaN(row) || Number.isNaN(col)) return

  let nextRow = row
  let nextCol = col
  if (dir === 'up') nextRow -= 1
  if (dir === 'down') nextRow += 1
  if (dir === 'left') nextCol -= 1
  if (dir === 'right') nextCol += 1

  if (!focusNavCell(nextRow, nextCol) && dir === 'right') {
    // wrap to next row, first editable col
    focusNavCell(row + 1, 0)
  }
}

/** Enter / Tab: next field (right), wrap to next row. */
export function focusNextField(el: HTMLElement) {
  const row = Number(el.dataset.navRow)
  const col = Number(el.dataset.navCol)
  if (Number.isNaN(row) || Number.isNaN(col)) return
  if (!focusNavCell(row, col + 1)) {
    focusNavCell(row + 1, 0)
  }
}

export interface NumericCellInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: number
  onValueChange: (value: number) => void
  navRow?: number
  navCol?: number
}

/**
 * Number cell for floor/ERP grids:
 * - no spinner arrows
 * - empty while focused when value is 0 (typing not blocked by zero)
 * - Enter / Tab → next field; arrows move between cells
 */
export function NumericCellInput({
  value,
  onValueChange,
  navRow,
  navCol,
  className,
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}: NumericCellInputProps) {
  const [text, setText] = useState(() => (value === 0 ? '' : String(value)))
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!focused) {
      setText(value === 0 ? '' : String(value))
    }
  }, [value, focused])

  const commit = (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed === '-' || trimmed === '.') {
      onValueChange(0)
      setText('')
      return
    }
    const n = Number(trimmed)
    onValueChange(Number.isFinite(n) ? n : 0)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return

    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
      if (navRow === undefined || navCol === undefined) return
      e.preventDefault()
      commit(text)
      focusNextField(e.currentTarget)
      return
    }
    if (e.key === 'Tab' && e.shiftKey) {
      if (navRow === undefined || navCol === undefined) return
      e.preventDefault()
      commit(text)
      focusSiblingCell(e.currentTarget, 'left')
      return
    }

    const map: Record<string, NavDir | undefined> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    }
    const dir = map[e.key]
    if (!dir) return
    if (navRow === undefined || navCol === undefined) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault()
      return
    }

    if (dir === 'left' || dir === 'right') {
      const el = e.currentTarget
      const start = el.selectionStart ?? 0
      const end = el.selectionEnd ?? 0
      const len = el.value.length
      const allSelected = start === 0 && end === len && len > 0
      if (dir === 'left' && start > 0 && !allSelected) return
      if (dir === 'right' && end < len && !allSelected) return
    }

    e.preventDefault()
    commit(text)
    focusSiblingCell(e.currentTarget, dir)
  }

  return (
    <input
      {...rest}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      data-nav-row={navRow}
      data-nav-col={navCol}
      value={focused ? text : value === 0 ? '' : String(value)}
      placeholder={focused ? '' : '0'}
      className={cn('sara-num-input', className)}
      onFocus={(e) => {
        setFocused(true)
        setText(value === 0 ? '' : String(value))
        requestAnimationFrame(() => e.currentTarget.select())
        onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        commit(text)
        onBlur?.(e)
      }}
      onChange={(e) => {
        const next = e.target.value
        if (next !== '' && !/^-?\d*\.?\d*$/.test(next)) return
        setText(next)
        // live parse when complete number so totals update while typing
        if (next !== '' && next !== '-' && next !== '.' && /^-?\d+\.?\d*$/.test(next)) {
          const n = Number(next)
          if (Number.isFinite(n)) onValueChange(n)
        } else if (next === '') {
          onValueChange(0)
        }
      }}
      onKeyDown={handleKeyDown}
    />
  )
}

export interface TextCellInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string
  onValueChange: (value: string) => void
  navRow?: number
  navCol?: number
}

/** Text cell with same Enter / arrow nav as NumericCellInput. */
export function TextCellInput({
  value,
  onValueChange,
  navRow,
  navCol,
  className,
  onKeyDown,
  onFocus,
  ...rest
}: TextCellInputProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return

    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
      if (navRow === undefined || navCol === undefined) return
      e.preventDefault()
      focusNextField(e.currentTarget)
      return
    }
    if (e.key === 'Tab' && e.shiftKey) {
      if (navRow === undefined || navCol === undefined) return
      e.preventDefault()
      focusSiblingCell(e.currentTarget, 'left')
      return
    }

    const map: Record<string, NavDir | undefined> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
    }
    const dir = map[e.key]
    if (!dir || navRow === undefined || navCol === undefined) return
    e.preventDefault()
    focusSiblingCell(e.currentTarget, dir)
  }

  return (
    <input
      {...rest}
      type="text"
      autoComplete="off"
      data-nav-row={navRow}
      data-nav-col={navCol}
      value={value}
      className={className}
      onFocus={(e) => {
        requestAnimationFrame(() => e.currentTarget.select())
        onFocus?.(e)
      }}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={handleKeyDown}
    />
  )
}
