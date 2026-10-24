'use client'

import { useMemo } from 'react'
import type { YarnMaster, YarnMovementRecord } from '@/services/production/masterTypes'
import { kgToLbs } from '@/services/production/loomBeamHelpers'

type Row = { id: string; yarnType: string; opening: number; inKg: number; inBags: number; outKg: number; closing: number }

/**
 * Yarn hisab for a date / week / month, worked out only from dated movements:
 * Opening (everything before the start) + Aya − Gaya = Closing (at the end).
 * Entries made for later dates never change an earlier day's figures.
 */
export function YarnDateBalance({
  yarn,
  movements,
  range,
  periodLabel,
  unit,
}: {
  yarn: YarnMaster[]
  movements: YarnMovementRecord[]
  range: { start: string; end: string } | null
  periodLabel: string
  unit: 'KG' | 'LBS'
}) {
  const rows = useMemo(() => {
    const byId = new Map<string, Row>()
    const rowFor = (id: string, type: string) => {
      let r = byId.get(id)
      if (!r) {
        r = { id, yarnType: yarn.find((y) => y.id === id)?.yarnType || type || id, opening: 0, inKg: 0, inBags: 0, outKg: 0, closing: 0 }
        byId.set(id, r)
      }
      return r
    }
    for (const m of movements) {
      if (range && m.date > range.end) continue
      const kg = (Number(m.weightKg) || 0) * (m.type === 'OUTWARD' ? -1 : 1)
      const r = rowFor(m.yarnId, m.yarnType)
      if (range && m.date < range.start) {
        r.opening += kg
      } else if (m.type === 'INWARD') {
        r.inKg += Number(m.weightKg) || 0
        r.inBags += Number(m.bags) || 0
      } else {
        r.outKg += Number(m.weightKg) || 0
      }
      r.closing += kg
    }
    return [...byId.values()]
      .filter((r) => Math.abs(r.opening) > 0.005 || r.inKg > 0 || r.outKg > 0 || Math.abs(r.closing) > 0.005)
      .sort((a, b) => a.yarnType.localeCompare(b.yarnType))
  }, [yarn, movements, range])

  const w = (kg: number) =>
    (unit === 'KG' ? kg : kgToLbs(kg)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const total = rows.reduce(
    (t, r) => ({ opening: t.opening + r.opening, inKg: t.inKg + r.inKg, inBags: t.inBags + r.inBags, outKg: t.outKg + r.outKg, closing: t.closing + r.closing }),
    { opening: 0, inKg: 0, inBags: 0, outKg: 0, closing: 0 }
  )
  const u = unit === 'KG' ? 'kg' : 'lbs'

  return (
    <div className="card-body p-0">
      <div className="p-3 bg-light border-bottom small">
        <strong>{periodLabel}</strong> — shuru ka stock + jo aya − jo gaya = aakhir ka stock. Yeh hisab sirf in tareekhon tak ki entries se banta hai,
        baad ki entry is ko nahi badalti. Din / hafta / mahina upar date bar se badlein.
      </div>
      <div className="table-responsive">
        <table className="table table-sm table-bordered table-hover align-middle mb-0 small">
          <thead className="table-light">
            <tr>
              <th>Yarn</th>
              <th className="text-end">Shuru ka stock ({u})</th>
              <th className="text-end text-success">Aya ({u})</th>
              <th className="text-end">Bags</th>
              <th className="text-end text-danger">Gaya ({u})</th>
              <th className="text-end">Aakhir ka stock ({u})</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-secondary py-4">
                  Is waqt ka koi yarn hisab nahi.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="fw-semibold">{r.yarnType}</td>
                <td className="text-end">{w(r.opening)}</td>
                <td className="text-end text-success">{r.inKg ? w(r.inKg) : '—'}</td>
                <td className="text-end">{r.inBags || '—'}</td>
                <td className="text-end text-danger">{r.outKg ? w(r.outKg) : '—'}</td>
                <td className={`text-end fw-bold ${r.closing < -0.005 ? 'text-danger' : ''}`}>{w(r.closing)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="table-light fw-bold">
              <tr>
                <td>Total</td>
                <td className="text-end">{w(total.opening)}</td>
                <td className="text-end text-success">{w(total.inKg)}</td>
                <td className="text-end">{total.inBags}</td>
                <td className="text-end text-danger">{w(total.outKg)}</td>
                <td className="text-end">{w(total.closing)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
