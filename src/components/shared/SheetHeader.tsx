import type { ReactNode } from 'react'

/**
 * Top of a printable sheet: logo + "SARA TEXTILES" on the left, the sheet title on the
 * right on the same line, and the month / period line under the title.
 */
export function SheetHeader({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="border-b border-slate-200 dark:border-slate-700 pb-2 mb-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/saratextile.png" alt="" width={28} height={28} className="size-7 shrink-0 rounded object-contain" />
          <h1 className="text-base font-bold uppercase text-slate-900 dark:text-white tracking-wide">SARA TEXTILES</h1>
        </div>
        <h2 className="text-right text-sm font-semibold uppercase text-slate-700 dark:text-slate-400">{title}</h2>
      </div>
      {subtitle ? <p className="text-right text-[11px] text-slate-500 font-mono">{subtitle}</p> : null}
    </div>
  )
}
