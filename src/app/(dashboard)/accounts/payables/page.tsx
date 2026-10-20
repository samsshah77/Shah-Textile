'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Download, Printer, Search } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { cn } from '@/lib/utils'
import { rs } from '@/lib/accounts/util'
import type { PayablesReport } from '@/lib/accounts/types'
import { accountsApi } from '@/services/accounts/accountsApi'
import { useAccountsData } from '@/hooks/useAccounts'
import { LoadState } from '@/components/accounts/ui'

/**
 * A/P Synopsis (Accounts Payable): how much we owe every supplier on a date, split by the
 * account that pays them (Sara Textile / FOI) — the "Synopsis" sheet of the Traders
 * Ledger AP workbook. Each party's page is its "Payable Ledger Account".
 */
export default function PayablesPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [asOf, setAsOf] = useState(today)
  const [onlyOwed, setOnlyOwed] = useState(true)
  const [kind, setKind] = useState<'ALL' | 'TRADER' | 'WORKSHOP'>('ALL')
  const [q, setQ] = useState('')
  const { data, error, loading } = useAccountsData<PayablesReport>(() => accountsApi.payables(asOf), [asOf])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data?.rows || []).filter(
      (r) =>
        (!onlyOwed || Math.abs(r.balance) >= 1) &&
        (kind === 'ALL' || r.party.kind === kind) &&
        (!needle || r.party.name.toLowerCase().includes(needle))
    )
  }, [data, onlyOwed, kind, q])
  const tot = (f: (r: PayablesReport['rows'][number]) => number) => rows.reduce((t, r) => t + f(r), 0)
  const sara = (r: PayablesReport['rows'][number]) => (r.party.account === 'FOI' ? 0 : r.balance)
  const foi = (r: PayablesReport['rows'][number]) => (r.party.account === 'FOI' ? r.balance : 0)

  const exportCsv = () => {
    const head = ['S.No', 'Party', 'Type', 'Opening', 'Bills', 'Paid', 'Adjustments', 'Payable Sara', 'Payable FOI', 'Total', 'Last bill', 'Last payment']
    const lines = rows.map((r, i) =>
      [i + 1, r.party.name, r.party.kind === 'WORKSHOP' ? 'Workshop' : 'Trader', r.opening, r.purchases, r.paid, r.adjusted, sara(r), foi(r), r.balance, r.lastBill || '', r.lastPayment || '']
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `AP-Synopsis-${asOf}.csv`
    a.click()
  }

  const cell = 'border border-slate-300 dark:border-slate-700'
  return (
    <div className="space-y-4">
      <PageHeader
        title="Payables (A/P Synopsis)"
        subtitle="Har supplier ka baqi — bills (debit) minus payments / adjustments (credit), purane ledger ke opening balance samait."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              Tareekh tak
              <input type="date" value={asOf} max="2100-12-31" onChange={(e) => e.target.value && setAsOf(e.target.value)} className="h-9 rounded-md border border-slate-300 bg-background px-2 text-xs" />
            </label>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-9 rounded-md border border-slate-300 bg-background px-2 text-xs font-semibold">
              <option value="ALL">Traders + Workshops</option>
              <option value="TRADER">Traders</option>
              <option value="WORKSHOP">Workshops</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <input type="checkbox" checked={onlyOwed} onChange={(e) => setOnlyOwed(e.target.checked)} />
              Sirf jin ka baqi hai
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Party dhoondein" className="h-9 w-44 rounded-md border border-slate-300 bg-background pl-7 pr-2 text-xs" />
            </div>
            <button type="button" onClick={exportCsv} className="erp-btn-secondary text-xs !min-h-9 !h-9 cursor-pointer">
              <Download className="size-3.5" /> CSV
            </button>
            <button type="button" onClick={() => window.print()} className="erp-btn-secondary text-xs !min-h-9 !h-9 cursor-pointer">
              <Printer className="size-3.5" /> Print
            </button>
          </div>
        }
      />

      <LoadState loading={loading} error={error} hasData={Boolean(data)}>
        {data && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(
                [
                  ['Payable — Sara Textile', data.totals.sara, 'text-slate-900'],
                  ['Payable — FOI', data.totals.foi, 'text-amber-700'],
                  ['Total payable', data.totals.total, 'text-[#0066cc]'],
                ] as Array<[string, number, string]>
              ).map(([label, value, cls]) => (
                <div key={label} className="erp-card p-3">
                  <div className="text-[10px] font-bold uppercase text-slate-500">{label}</div>
                  <div className={cn('text-xl font-black font-mono', cls)}>{rs(value)}</div>
                </div>
              ))}
            </div>

            <div className="erp-card overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-[10px] font-bold uppercase">
                    {['S.No', 'Party', 'Opening', 'Bills', 'Paid', 'Adjust', 'Payable Sara', 'Payable FOI', 'Total', 'Last bill', 'Last payment'].map((h, i) => (
                      <th key={h} className={cn(cell, 'px-2 py-2', i === 1 ? 'text-left' : i >= 2 && i <= 8 ? 'text-right' : 'text-center')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className={cn(cell, 'py-8 text-center text-slate-500')}>
                        Koi party nahi.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => (
                      <tr key={r.party.id} className={cn(i % 2 && 'bg-slate-50/60', !r.party.active && 'opacity-60')}>
                        <td className={cn(cell, 'px-2 text-center font-mono text-slate-500')}>{i + 1}</td>
                        <td className={cn(cell, 'px-2 py-1.5 font-bold')}>
                          <Link href={`/accounts/${r.party.kind === 'WORKSHOP' ? 'workshops' : 'traders'}/${r.party.slug}?month=all`} className="hover:underline">
                            {r.party.name}
                          </Link>
                          <span className="ml-1.5 text-[10px] font-normal text-slate-500">{r.party.kind === 'WORKSHOP' ? 'Workshop' : 'Trader'}</span>
                          {r.party.account === 'FOI' && <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">FOI</span>}
                        </td>
                        <td className={cn(cell, 'px-2 text-right font-mono text-slate-600')}>{r.opening ? rs(r.opening) : ''}</td>
                        <td className={cn(cell, 'px-2 text-right font-mono')}>{rs(r.purchases)}</td>
                        <td className={cn(cell, 'px-2 text-right font-mono text-emerald-700')}>{rs(r.paid)}</td>
                        <td className={cn(cell, 'px-2 text-right font-mono text-sky-700')}>{r.adjusted ? rs(r.adjusted) : ''}</td>
                        <td className={cn(cell, 'px-2 text-right font-mono')}>{sara(r) ? rs(sara(r)) : ''}</td>
                        <td className={cn(cell, 'px-2 text-right font-mono text-amber-700')}>{foi(r) ? rs(foi(r)) : ''}</td>
                        <td className={cn(cell, 'px-2 text-right font-mono font-black', r.balance < 0 && 'text-rose-600')}>{rs(r.balance)}</td>
                        <td className={cn(cell, 'px-2 text-center font-mono text-slate-500')}>{r.lastBill || '-'}</td>
                        <td className={cn(cell, 'px-2 text-center font-mono text-slate-500')}>{r.lastPayment || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-200 font-black">
                    <td colSpan={2} className={cn(cell, 'px-3 py-2 text-right uppercase')}>
                      Total ({rows.length})
                    </td>
                    <td className={cn(cell, 'px-2 text-right font-mono')}>{rs(tot((r) => r.opening))}</td>
                    <td className={cn(cell, 'px-2 text-right font-mono')}>{rs(tot((r) => r.purchases))}</td>
                    <td className={cn(cell, 'px-2 text-right font-mono')}>{rs(tot((r) => r.paid))}</td>
                    <td className={cn(cell, 'px-2 text-right font-mono')}>{rs(tot((r) => r.adjusted))}</td>
                    <td className={cn(cell, 'px-2 text-right font-mono')}>{rs(tot(sara))}</td>
                    <td className={cn(cell, 'px-2 text-right font-mono')}>{rs(tot(foi))}</td>
                    <td className={cn(cell, 'px-2 text-right font-mono text-[#0066cc]')}>{rs(tot((r) => r.balance))}</td>
                    <td colSpan={2} className={cell} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-[11px] text-slate-500 print:hidden">
              Bills Daily Inward se aate hain. Payment, purane ledger ka opening balance aur adjustment party ke page par
              &quot;Payment / entry&quot; se daalein. Party Sara ki hai ya FOI ki — party edit mein &quot;Payable kis account se&quot;.
            </p>
          </>
        )}
      </LoadState>
    </div>
  )
}
