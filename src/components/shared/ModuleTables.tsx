'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'

export type ModuleTextSize = 'small' | 'normal' | 'large' | 'xlarge'
const SIZES: Array<[ModuleTextSize, string, string]> = [
  ['small', 'A−', 'Chhota (zyada columns ek page par print)'],
  ['normal', 'A', 'Normal'],
  ['large', 'A+', 'Bara (+15%)'],
  ['xlarge', 'A++', 'Sab se bara (+30%)'],
]

/** "Rs 1,200", "-3,500.50", "12%", "1,250 m" — an amount / count, aligned right. */
const NUMBER = /^[-−+]?\s*(rs\.?\s*)?[-−]?[\d,]+(\.\d+)?\s*(%|m|hrs?|days?)?$/i
const DATE = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[-/ ]\w{2,3}[-/ ]\d{2,4}$/
const SERIAL_HEAD = /^(s\.?\s*(no|#)\.?|sr\.?\s*(no)?\.?|#|no\.?)$/i
/** Bill no., inward no., CNIC, phone … — codes, not amounts: centred. */
const CODE_HEAD = /\b(bill|ref|inward|inw|cheque|chq)\b\s*(\/\s*\w+\s*)?(no\.?|#|number)|\b(cnic|phone|mobile|code)\b/i
const STRONG_HEAD = /\b(net|total|baqi|balance|payable|gross|payout)\b/i

function cellText(td: HTMLTableCellElement): string {
  const field = td.querySelector('input:not([type=checkbox]):not([type=hidden]), select') as HTMLInputElement | HTMLSelectElement | null
  if (field && !td.textContent?.trim()) {
    const v = field.value.trim()
    if (v) return v
    // An empty number box (attendance, hours …) still makes a number column.
    const numeric = field instanceof HTMLInputElement && (field.type === 'number' || /decimal|numeric/.test(field.inputMode) || field.classList.contains('sara-num-input'))
    return numeric ? '0' : ''
  }
  return (td.textContent || '').trim()
}

function setAttr(el: Element, name: string, value: string | null) {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name)
  } else if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}

/** Marks every column as text (left), number (right) or date / serial (centre) from its cells. */
function tidyTable(table: HTMLTableElement) {
  if (table.closest('[data-no-tidy]')) return
  const bodyRows = [...table.querySelectorAll(':scope > tbody > tr')] as HTMLTableRowElement[]
  const headRows = [...table.querySelectorAll(':scope > thead > tr')] as HTMLTableRowElement[]
  const footRows = [...table.querySelectorAll(':scope > tfoot > tr')] as HTMLTableRowElement[]
  // Real column of every cell, counting row spans (a bill's date / party cell spans its item rows).
  const colIndex = new Map<HTMLTableCellElement, number>()
  for (const rows of [headRows, bodyRows, footRows]) {
    const taken: Array<Set<number>> = []
    rows.forEach((row, r) => {
      const busy = taken[r] || new Set<number>()
      let c = 0
      for (const cell of [...row.cells]) {
        while (busy.has(c)) c++
        colIndex.set(cell, c)
        for (let dr = 0; dr < Math.max(1, cell.rowSpan); dr++) {
          const set = (taken[r + dr] = taken[r + dr] || new Set<number>())
          for (let dc = 0; dc < cell.colSpan; dc++) set.add(c + dc)
        }
        c += cell.colSpan
      }
    })
  }
  const colsOf = (row: HTMLTableRowElement) => {
    const out: Array<[number, HTMLTableCellElement]> = []
    for (const cell of [...row.cells]) if (cell.colSpan === 1) out.push([colIndex.get(cell) ?? 0, cell])
    return out
  }
  const stats = new Map<number, { num: number; date: number; text: number }>()
  for (const row of bodyRows) {
    for (const [c, td] of colsOf(row)) {
      const t = cellText(td)
      if (!t || t === '-' || t === '—') continue
      const s = stats.get(c) || { num: 0, date: 0, text: 0 }
      if (DATE.test(t)) s.date++
      else if (NUMBER.test(t)) s.num++
      else s.text++
      stats.set(c, s)
    }
  }
  const kind = new Map<number, 'num' | 'date' | 'text'>()
  for (const [c, s] of stats) {
    const n = s.num + s.date + s.text
    kind.set(c, s.num >= n * 0.7 ? 'num' : s.date >= n * 0.7 ? 'date' : 'text')
  }
  // Header text decides serial / emphasised columns.
  const serial = new Set<number>()
  const strong = new Set<number>()
  for (const row of headRows) {
    for (const [c, th] of colsOf(row)) {
      const t = (th.textContent || '').trim()
      if (SERIAL_HEAD.test(t) || CODE_HEAD.test(t)) serial.add(c)
      if (STRONG_HEAD.test(t)) strong.add(c)
    }
  }
  const align = (c: number) => (serial.has(c) ? 'center' : kind.get(c) === 'num' ? 'right' : kind.get(c) === 'date' ? 'center' : kind.get(c) === 'text' ? 'left' : null)
  for (const row of [...headRows, ...bodyRows, ...footRows]) {
    for (const [c, cell] of colsOf(row)) {
      setAttr(cell, 'data-align', align(c))
      setAttr(cell, 'data-kind', kind.get(c) === 'date' ? 'date' : null)
      setAttr(cell, 'data-strong', strong.has(c) && row.parentElement?.tagName === 'TBODY' ? '' : null)
    }
  }
  // A body row that is a total line ("Total", "Grand total", "Totals & …") is bold.
  for (const row of bodyRows) {
    const first = (row.cells[0]?.textContent || '').trim()
    setAttr(row, 'data-total-row', /^(grand\s+)?totals?\b/i.test(first) ? '' : null)
  }
}

// Chosen size per module, kept in this browser (falls back to normal when storage is blocked).
const SIZE_EVENT = 'sara:text-size'
const memory = new Map<string, ModuleTextSize>()
function readSize(key: string): ModuleTextSize {
  try {
    const saved = window.localStorage.getItem(key) as ModuleTextSize | null
    if (saved && SIZES.some(([k]) => k === saved)) return saved
  } catch {
    /* storage blocked */
  }
  return memory.get(key) || 'normal'
}
function writeSize(key: string, next: ModuleTextSize) {
  memory.set(key, next)
  try {
    window.localStorage.setItem(key, next)
  } catch {
    /* storage blocked — kept for this visit only */
  }
  window.dispatchEvent(new Event(SIZE_EVENT))
}
function subscribeSize(cb: () => void) {
  window.addEventListener(SIZE_EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(SIZE_EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

/**
 * Accounts + Salary pages: one text-size control (also used for print) and tidy tables —
 * text left, amounts right, dates / S.No centre, totals bold. Wraps the module content.
 */
export function ModuleTables({ storageKey, children }: { storageKey: string; children: React.ReactNode }) {
  const size = useSyncExternalStore(subscribeSize, () => readSize(storageKey), () => 'normal' as ModuleTextSize)
  const box = useRef<HTMLDivElement>(null)
  const choose = (next: ModuleTextSize) => writeSize(storageKey, next)

  useEffect(() => {
    const root = box.current
    if (!root) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const run = () => {
      timer = null
      for (const t of root.querySelectorAll('table')) tidyTable(t as HTMLTableElement)
    }
    const schedule = () => {
      if (!timer) timer = setTimeout(run, 120)
    }
    run()
    const obs = new MutationObserver(schedule)
    obs.observe(root, { childList: true, subtree: true, characterData: true })
    return () => {
      obs.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [])

  return (
    <div ref={box} className={cn('sara-tidy-tables', `sara-text-${size}`)}>
      <div className="sara-text-size-bar print:hidden" role="group" aria-label="Table text size">
        <span>Text size</span>
        {SIZES.map(([k, label, title]) => (
          <button key={k} type="button" title={title} aria-pressed={size === k} onClick={() => choose(k)} className={cn(size === k && 'is-active')}>
            {label}
          </button>
        ))}
      </div>
      {children}
    </div>
  )
}
