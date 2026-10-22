'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Pencil, Printer, Search } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { cn } from '@/lib/utils'
import { ageLabel, daysSince, rs, todayStr } from '@/lib/accounts/util'
import type { PayablesReport } from '@/lib/accounts/types'
import { accountsApi } from '@/services/accounts/accountsApi'
import { useAccountsData } from '@/hooks/useAccounts'
import { LoadState } from '@/components/accounts/ui'
import { PaymentForm } from '@/components/accounts/PartyLedgerView'
import { useAuth } from '@/context/AuthContext'

/**
 * Payables — how much each trader / workshop is owed. Payments come later and in parts,
 * so a payment clears the oldest bills first; "Purana baqi bill" shows since when money
 * is due. Bills come from Daily Inward; payments are entered on the party's page.
 */
export default function PayablesPage() {
  const [onlyOwed, setOnlyOwed] = useState(true)
  const [kind, setKind] = useState<'ALL' | 'TRADER' | 'WORKSHOP'>('ALL')
  const [q, setQ] = useState('')
  const { data, error, loading } = useAccountsData<PayablesReport>(() => accountsApi.payables(todayStr()), [])
  const { canEditAccounts } = useAuth()
  const [editOpening, setEditOpening] = useState<PayablesReport['rows'][number] | null>(null)

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
  // Purana baqi (before July 2026) + Bills (from July, set-offs taken off) − Paid = Baqi.
  const billed = (r: PayablesReport['rows'][number]) => r.purchases - r.adjusted

  const cell = 'border border-slate-300 dark:border-slate-700'
  return (
    <div className="space-y-4">
      <PageHeader
        title="Payables"
        subtitle="Har trader / workshop ka baqi. Payment purane bill se pehle kat-ti hai — is liye dikhta hai ke kab se paise baqi hain."
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
            <button type="button" onClick={() => window.print()} className="erp-btn-secondary text-xs !min-h-9 !h-9 cursor-pointer">
              <Printer className="size-3.5" /> Print
            </button>
          </div>
        }
      />

      <LoadState loading={loading} error={error} hasData={Boolean(data)}>
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ['Purana baqi', tot((r) => r.opening), 'text-amber-700'],
                  ['Bills (July se)', tot(billed), 'text-slate-900'],
                  ['Paid', tot((r) => r.paid), 'text-emerald-700'],
                  ['Kul baqi', tot((r) => r.balance), 'text-[#0066cc]'],
                ] as Array<[string, number, string]>
              ).map(([label, value, cls]) => (
                <div key={label} className="erp-card p-3">
                  <div className="text-[10px] font-bold uppercase text-slate-500">{label}</div>
                  <div className={cn('text-xl font-black font-mono', cls)}>{rs(value)}</div>
                </div>
              ))}
            </div>

            <div className="erp-card overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-[10px] font-bold uppercase">
                    {['S.No', 'Party', 'Purana baqi', 'Bills (July se)', 'Paid', 'Baqi', 'Purana baqi bill', 'Akhri payment'].map((h, i) => (
                      <th key={h} className={cn(cell, 'px-2 py-2', i === 1 ? 'text-left' : i >= 2 && i <= 5 ? 'text-right' : 'text-center')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={cn(cell, 'py-8 text-center text-slate-500')}>
                        Koi party nahi.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => {
                      const age = r.oldestUnpaid ? daysSince(r.oldestUnpaid) : 0
                      return (
                        <tr key={r.party.id} className={cn(i % 2 && 'bg-slate-50/60', !r.party.active && 'opacity-60')}>
                          <td className={cn(cell, 'px-2 text-center font-mono text-slate-500')}>{i + 1}</td>
                          <td className={cn(cell, 'px-2 py-1.5 font-bold')}>
                            <Link href={`/accounts/${r.party.kind === 'WORKSHOP' ? 'workshops' : 'traders'}/${r.party.slug}?month=all`} className="hover:underline">
                              {r.party.name}
                            </Link>
                            <span className="ml-1.5 text-[10px] font-normal text-slate-500">{r.party.kind === 'WORKSHOP' ? 'Workshop' : 'Trader'}</span>
                          </td>
                          <td className={cn(cell, 'px-2 text-right font-mono text-amber-800')}>
                            <span className="inline-flex items-center gap-1">
                              {r.opening ? rs(r.opening) : '-'}
                              {canEditAccounts && r.openings.length <= 1 && (
                                <button
                                  type="button"
                                  onClick={() => setEditOpening(r)}
                                  className="p-0.5 text-slate-400 hover:text-sky-700 cursor-pointer print:hidden"
                                  aria-label={`${r.party.name}: purana baqi ${r.opening ? 'badlein' : 'daalein'}`}
                                  title={r.opening ? 'Purana baqi badlein' : 'Purana baqi daalein (July 2026 se pehle ka)'}
                                >
                                  <Pencil className="size-3" />
                                </button>
                              )}
                            </span>
                          </td>
                          <td className={cn(cell, 'px-2 text-right font-mono')}>{rs(billed(r))}</td>
                          <td className={cn(cell, 'px-2 text-right font-mono text-emerald-700')}>{r.paid ? rs(r.paid) : '-'}</td>
                          <td className={cn(cell, 'px-2 text-right font-mono font-black', r.balance < 0 && 'text-rose-600')}>
                            {rs(r.balance)}
                            {r.balance < 0 && <div className="text-[9px] font-semibold">advance diya hua</div>}
                          </td>
                          <td className={cn(cell, 'px-2 text-center font-mono')}>
                            {r.oldestUnpaid && r.balance >= 1 ? (
                              <>
                                {r.oldestUnpaid}
                                <span
                                  className={cn(
                                    'ml-1.5 rounded px-1 text-[10px] font-bold',
                                    age > 90 ? 'bg-rose-100 text-rose-700' : age > 60 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                                  )}
                                >
                                  {ageLabel(r.oldestUnpaid)}
                                </span>
                              </>
                            ) : (
                              <span className="text-emerald-700 font-bold">Sab paid</span>
                            )}
                          </td>
                          <td className={cn(cell, 'px-2 text-center font-mono text-slate-500')}>{r.lastPayment || '-'}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-200 font-black">
                    <td colSpan={2} className={cn(cell, 'px-3 py-2 text-right uppercase')}>
                      Total ({rows.length})
                    </td>
                    <td className={cn(cell, 'px-2 text-right font-mono')}>{rs(tot((r) => r.opening))}</td>
                    <td className={cn(cell, 'px-2 text-right font-mono')}>{rs(tot(billed))}</td>
                    <td className={cn(cell, 'px-2 text-right font-mono')}>{rs(tot((r) => r.paid))}</td>
                    <td className={cn(cell, 'px-2 text-right font-mono text-[#0066cc]')}>{rs(tot((r) => r.balance))}</td>
                    <td colSpan={2} className={cell} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-[11px] text-slate-500 print:hidden">
              Bills Daily Inward se aate hain. Payment party ke naam par click kar ke &quot;Payment&quot; se daalein (tareekh, raqam, tasveer).
              Aadhi payment bhi chalegi — wo sab se purane bill se kat-ti hai. Hisab July 2026 se hai: is se pehle ka jo
              dena tha wo &quot;Purana baqi&quot; mein ✏️ se daalein.
            </p>
            {editOpening && (
              <PaymentForm
                partyId={editOpening.party.id}
                month=""
                kind="OPENING"
                existing={editOpening.openings[0]}
                onClose={() => setEditOpening(null)}
              />
            )}
          </>
        )}
      </LoadState>
    </div>
  )
}
