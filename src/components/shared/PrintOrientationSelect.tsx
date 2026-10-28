'use client'

import type { PrintOrientation } from '@/lib/printOrientation'

/** "A4 Portrait / A4 Landscape" picker shown next to a sheet's Print button. */
export function PrintOrientationSelect({
  value,
  onChange,
}: {
  value: PrintOrientation
  onChange: (next: PrintOrientation) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as PrintOrientation)}
      aria-label="Kaghaz ka rukh"
      title="Print / PDF orientation"
      className="sara-allow-readonly h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 outline-none focus:border-[#0066cc] print:hidden"
    >
      <option value="portrait">A4 Portrait</option>
      <option value="landscape">A4 Landscape</option>
    </select>
  )
}
