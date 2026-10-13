'use client'

import { useMemo, useState } from 'react'
import { DailyLoomProductionEntry } from '@/types/production'
import { TextCellInput } from '@/components/shared/NumericCellInput'
import { TablePanScroll } from '@/components/shared/TablePanScroll'
import { EmptyPlaceholder } from '@/components/shared/EmptyPlaceholder'
import { cn } from '@/lib/utils'

interface FabricFaultTableProps {
  entries: DailyLoomProductionEntry[]
  selectedDate: string
  onUpdateEntry: (
    loomNumber: number,
    patch: Partial<DailyLoomProductionEntry>,
    editorName?: string
  ) => void
  canEdit?: boolean
}

/**
 * Per-loom fabric faults for the selected day (same field as Daily Entry → Fabric Fault).
 */
export function FabricFaultTable({
  entries,
  selectedDate,
  onUpdateEntry,
  canEdit = false,
}: FabricFaultTableProps) {
  /** Default: only looms with a fault (overall view). */
  const [onlyWithFault, setOnlyWithFault] = useState(true)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...entries]
      .filter((e) => {
        const fault = (e.fabricFault || '').trim()
        if (onlyWithFault && !fault) return false
        if (!q) return true
        return (
          String(e.loomNumber).includes(q) ||
          (e.qualityName || '').toLowerCase().includes(q) ||
          fault.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => a.loomNumber - b.loomNumber || (a.segmentIndex || 1) - (b.segmentIndex || 1))
  }, [entries, onlyWithFault, search])

  const faultCount = useMemo(
    () => entries.filter((e) => (e.fabricFault || '').trim()).length,
    [entries]
  )

  return (
    <div className="space-y-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 print:hidden">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <input
            type="search"
            className="form-control form-control-sm"
            style={{ width: 200 }}
            placeholder="Search loom / quality / fault…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search fabric faults"
          />
          <div className="btn-group btn-group-sm" role="group" aria-label="Fault filter">
            <button
              type="button"
              className={cn('btn', !onlyWithFault ? 'btn-primary' : 'btn-outline-secondary')}
              onClick={() => setOnlyWithFault(false)}
            >
              All looms ({entries.length})
            </button>
            <button
              type="button"
              className={cn('btn', onlyWithFault ? 'btn-primary' : 'btn-outline-secondary')}
              onClick={() => setOnlyWithFault(true)}
            >
              With fault ({faultCount})
            </button>
          </div>
        </div>
        <div className="small text-secondary">
          Date: <strong>{selectedDate}</strong> — edit Daily Entry or yahan; same field.
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyPlaceholder
          icon="bi-exclamation-diamond"
          title={onlyWithFault ? 'Is din koi fabric fault nahi' : 'Koi loom row nahi'}
          hint={
            onlyWithFault
              ? 'Daily Entry me Fabric Fault likho, phir yahan “With fault” pe dikhega.'
              : 'Pehle Daily Entry / Production day load karo.'
          }
        />
      ) : (
        <TablePanScroll className="card border">
          <table className="table table-sm table-bordered table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th className="px-2" style={{ width: 72 }}>
                  Loom #
                </th>
                <th className="px-2" style={{ minWidth: 140 }}>
                  Quality
                </th>
                <th className="px-2" style={{ width: 110 }}>
                  Fabric Type
                </th>
                <th className="px-2" style={{ width: 100 }}>
                  Status
                </th>
                <th className="px-2" style={{ minWidth: 280 }}>
                  Fabric Fault
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, idx) => {
                const seg = e.segmentIndex && e.segmentIndex > 1 ? ` · P${e.segmentIndex}` : ''
                return (
                  <tr key={e.id || `${e.loomNumber}-${e.segmentIndex || 1}`}>
                    <td className="fw-semibold px-2">
                      {e.loomNumber}
                      {seg}
                    </td>
                    <td className="px-2 text-truncate">{e.qualityName || '—'}</td>
                    <td className="small text-secondary px-2 text-truncate">
                      {e.fabricType || '—'}
                    </td>
                    <td className="small px-2">{e.status || '—'}</td>
                    <td className="px-1">
                      {canEdit ? (
                        <TextCellInput
                          className="form-control form-control-sm"
                          value={e.fabricFault || ''}
                          placeholder="Loom fabric fault…"
                          navRow={idx}
                          navCol={0}
                          onValueChange={(v) =>
                            onUpdateEntry(e.loomNumber, {
                              fabricFault: v,
                              segmentIndex: e.segmentIndex,
                            })
                          }
                        />
                      ) : (
                        <div
                          className="px-1 small"
                          title={e.fabricFault || ''}
                        >
                          {(e.fabricFault || '').trim() || '—'}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TablePanScroll>
      )}
    </div>
  )
}
