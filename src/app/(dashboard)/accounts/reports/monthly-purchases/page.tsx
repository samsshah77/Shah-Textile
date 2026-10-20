'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Printer } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { cn } from '@/lib/utils'
import { monthLabel, rs, qty } from '@/lib/accounts/util'
import type { MonthBook } from '@/lib/accounts/types'
import { accountsApi } from '@/services/accounts/accountsApi'
import { useAccountsData, useAccountsMonth } from '@/hooks/useAccounts'
import { LoadState, MonthPicker } from '@/components/accounts/ui'

/** Monthly spares & supplier purchases — read-only view of the month's bills. */
function MonthlyPurchasesContent() {
  const { month, setMonth, months } = useAccountsMonth()
  const { data: book, error, loading } = useAccountsData<MonthBook | null>(
    () => (month ? accountsApi.book(month) : Promise.resolve(null)),
    [month]
  )
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<'ALL' | 'TRADER' | 'WORKSHOP'>('ALL')

  const { lines, byParty } = useMemo(() => {
    const parties = new Map((book?.parties || []).map((p) => [p.id, p]))
    const q = search.trim().toLowerCase()
    const lines = (book?.bills || []).flatMap((b) => {
      const party = parties.get(b.partyId)
      if (kind !== 'ALL' && party?.kind !== kind) return []
      return b.lines
        .filter((l) => !q || `${party?.name} ${b.billNo} ${b.inwardNo} ${l.description} ${l.machine}`.toLowerCase().includes(q))
        .map((l) => ({ bill: b, line: l, party }))
    })
    const agg = new Map<string, { name: string; slug: string; kind: string; amount: number; bills: Set<string> }>()
    for (const r of lines) {
      const key = r.party?.id || '?'
      const a = agg.get(key) || { name: r.party?.name || '-', slug: r.party?.slug || '', kind: r.party?.kind || '', amount: 0, bills: new Set<string>() }
      a.amount += r.line.amount
      a.bills.add(r.bill.id)
      agg.set(key, a)
    }
    return { lines, byParty: [...agg.values()].sort((a, b) => b.amount - a.amount) }
  }, [book, search, kind])
  const total = lines.reduce((t, r) => t + r.line.amount, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Monthly Purchases — ${month ? monthLabel(month) : ''}`}
        showTitle={false}
        actions={
          <div className="flex items-center justify-end gap-2 w-full">
            <MonthPicker month={month} months={months} onChange={setMonth} />
            <button type="button" onClick={() => window.print()} className="erp-btn-secondary text-xs !min-h-9 !h-9 cursor-pointer">
              <Printer className="size-3.5" /> Print
            </button>
          </div>
        }
      />
      <LoadState loading={loading} error={error} hasData={Boolean(book)}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Total purchases', rs(total)],
            ['Bills', String(new Set(lines.map((l) => l.bill.id)).size)],
            ['Items', String(lines.length)],
            ['Parties', String(byParty.length)],
          ].map(([l, v]) => (
            <div key={l} className="erp-card p-3">
              <div className="text-[10px] font-bold uppercase text-slate-500">{l}</div>
              <div className="text-lg font-black font-mono">{v}</div>
            </div>
          ))}
        </div>

        <div className="erp-card overflow-hidden">
          <div className="p-3 border-b flex flex-wrap gap-2 items-center bg-slate-50/50 print:hidden">
            <div className="relative w-72">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search party, item, bill #..." className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg" />
            </div>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="text-xs font-bold border border-slate-300 rounded-lg px-2 py-1.5" aria-label="Party type">
              <option value="ALL">All parties</option>
              <option value="TRADER">Traders</option>
              <option value="WORKSHOP">Workshops</option>
            </select>
          </div>
          <div className="grid lg:grid-cols-[320px_1fr]">
            <div className="border-r border-slate-200 p-3">
              <h3 className="text-[11px] font-bold uppercase text-slate-600 mb-2">By party</h3>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {byParty.map((p) => (
                    <tr key={p.slug}>
                      <td className="py-1.5">
                        <Link href={`/accounts/${p.kind === 'WORKSHOP' ? 'workshops' : 'traders'}/${p.slug}?month=${month}`} className="hover:underline font-semibold">
                          {p.name}
                        </Link>
                        <span className="text-slate-400"> · {p.bills.size}</span>
                      </td>
                      <td className="py-1.5 text-right font-mono font-bold">{rs(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 font-bold uppercase text-[10px] border-b-2 border-slate-800">
                    {['Date', 'Bill #', 'Inw #', 'Party', 'Item', 'Machine', 'Qty', 'Rate', 'Total'].map((h, i) => (
                      <th key={h} className={cn('py-2.5 px-2', i >= 6 ? 'text-right' : 'text-left')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map(({ bill, line, party }) => (
                    <tr key={line.id} className="hover:bg-blue-50/40">
                      <td className="py-1.5 px-2 font-mono">{bill.date}</td>
                      <td className="py-1.5 px-2 font-mono">{bill.billNo || '-'}</td>
                      <td className="py-1.5 px-2 font-mono">{bill.inwardNo || '-'}</td>
                      <td className="py-1.5 px-2 font-semibold">{party?.name}</td>
                      <td className="py-1.5 px-2">{line.description}</td>
                      <td className="py-1.5 px-2">{line.machine}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{qty(line.quantity)}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{qty(line.rate)}</td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold">{rs(line.amount)}</td>
                    </tr>
                  ))}
                  {!lines.length && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-muted-foreground">
                        Koi purchase nahi.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-200 font-black border-t-2 border-slate-800">
                    <td colSpan={8} className="py-2.5 px-2 text-right uppercase">
                      Total
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-[#0066cc]">{rs(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </LoadState>
    </div>
  )
}

export default function MonthlyPurchasesPage() {
  return (
    <Suspense fallback={null}>
      <MonthlyPurchasesContent />
    </Suspense>
  )
}
