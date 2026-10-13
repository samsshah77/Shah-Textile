'use client'

import { useEffect, useState } from 'react'
import { TextCellInput } from '@/components/shared/NumericCellInput'

/** Persist multiple faults as newline-separated lines in `fabricFault`. */
export function parseFabricFaults(raw?: string | null): string[] {
  const nonEmpty = String(raw || '')
    .split(/\r?\n/)
    .map((s) => s.trimEnd())
    .filter((s) => s.trim() !== '')
  return nonEmpty.length > 0 ? nonEmpty : ['']
}

export function joinFabricFaults(lines: string[]): string {
  return lines
    .map((s) => s.trimEnd())
    .filter((s) => s.trim() !== '')
    .join('\n')
}

interface FabricFaultMultiInputProps {
  value?: string | null
  onChange: (next: string) => void
  canEdit?: boolean
  placeholder?: string
  navRow?: number
  /** Base navCol for first line; later lines use navCol+i */
  navCol?: number
  className?: string
}

/**
 * One box: multiple fabric-fault entries in a row (1–3 across) + plus to add another.
 */
export function FabricFaultMultiInput({
  value,
  onChange,
  canEdit = false,
  placeholder = 'Fabric fault…',
  navRow = 0,
  navCol = 0,
  className,
}: FabricFaultMultiInputProps) {
  const [lines, setLines] = useState(() => parseFabricFaults(value))

  useEffect(() => {
    setLines(parseFabricFaults(value))
  }, [value])

  const persist = (nextLines: string[]) => {
    setLines(nextLines.length > 0 ? nextLines : [''])
    onChange(joinFabricFaults(nextLines))
  }

  const setLine = (index: number, text: string) => {
    const next = [...lines]
    next[index] = text
    persist(next)
  }

  const addLine = () => {
    const kept = lines.filter((s) => s.trim() !== '')
    persist([...kept, ''])
  }

  const removeLine = (index: number) => {
    const next = lines.filter((_, i) => i !== index)
    persist(next.length ? next : [''])
  }

  if (!canEdit) {
    const shown = parseFabricFaults(value).filter((s) => s.trim() !== '')
    if (shown.length === 0) {
      return <div className={`small text-secondary ${className || ''}`}>—</div>
    }
    return (
      <div
        className={`small d-flex flex-wrap align-items-center gap-1 ${className || ''}`}
        title={shown.join('\n')}
        style={{ whiteSpace: 'normal' }}
      >
        {shown.map((line, i) => (
          <span key={i} className="text-truncate" style={{ maxWidth: '9rem' }}>
            {shown.length > 1 ? (
              <span className="text-secondary me-1">{i + 1}.</span>
            ) : null}
            {line}
            {i < shown.length - 1 ? (
              <span className="text-secondary ms-1">·</span>
            ) : null}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div
      className={`d-flex flex-wrap align-items-center gap-1 ${className || ''}`}
      style={{ whiteSpace: 'normal' }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          className="d-flex align-items-center gap-1"
          style={{ flex: '1 1 30%', minWidth: '5.5rem', maxWidth: '100%' }}
        >
          {lines.length > 1 ? (
            <span
              className="badge text-bg-light text-secondary border flex-shrink-0"
              style={{ fontSize: '0.6rem', minWidth: '1.1rem' }}
            >
              {i + 1}
            </span>
          ) : null}
          <TextCellInput
            className="form-control form-control-sm flex-grow-1"
            style={{ width: '100%', minWidth: 0 }}
            value={line}
            placeholder={i === 0 ? placeholder : `F${i + 1}`}
            navRow={navRow}
            navCol={navCol + i}
            onValueChange={(v) => setLine(i, v)}
          />
          {lines.length > 1 ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-danger py-0 px-1 flex-shrink-0"
              style={{ fontSize: '0.7rem', lineHeight: 1.2 }}
              title="Is fault ko hatao"
              onClick={() => removeLine(i)}
            >
              <i className="bi bi-x" />
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary py-0 px-2 flex-shrink-0"
        style={{ fontSize: '0.7rem' }}
        title="Isi loom pe aur fabric fault add karo"
        onClick={addLine}
      >
        <i className="bi bi-plus-lg" />
      </button>
    </div>
  )
}
