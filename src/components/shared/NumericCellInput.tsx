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

  const next = document.querySelector<HTMLElement>(
    `[data-nav-row="${nextRow}"][data-nav-col="${nextCol}"]`
  )
  if (next && !next.hasAttribute('disabled')) {
    next.focus()
    if (next instanceof HTMLInputElement) next.select()
  }
}

export interface NumericCellInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: number
  onValueChange: (value: number) => void
  /** Grid keyboard nav: row index (0-based) */
  navRow?: number
  /** Grid keyboard nav: column index (0-based) */
  navCol?: number
}

/**
 * Number cell for floor/ERP grids:
 * - no spinner arrows
 * - empty while focused when value is 0 (so typing is not blocked by zero)
 * - Arrow / Enter move between cells when data-nav-* is set
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
  const [text, setText] = useState(value === 0 ? '' : String(value))
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

    const map: Record<string, NavDir | undefined> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      Enter: 'down',
    }
    const dir = map[e.key]
    if (!dir) return
    if (navRow === undefined || navCol === undefined) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault()
      return
    }

    // Left/right: move cell when caret at edge (or whole value selected); else allow typing caret
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
      }}
      onKeyDown={handleKeyDown}
    />
  )
}
