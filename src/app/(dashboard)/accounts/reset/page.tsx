'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/PageHeader'
import { monthLabel, rs } from '@/lib/accounts/util'
import { useAuth } from '@/context/AuthContext'
import { accountsApi } from '@/services/accounts/accountsApi'
import { useAccountsData } from '@/hooks/useAccounts'
import { LoadState } from '@/components/accounts/ui'
import type { ResetPreview, ResetResult } from '@/server/accounts/resetFromFiles'

/**
 * One-time: Accounts from the July–September 2026 Excel files; everything before July removed.
 * Shows exactly what goes and what comes before anything is done.
 */
export default function AccountsResetPage() {
  const { canEditAccounts } = useAuth()
  const { data, error, loading, reload } = useAccountsData<ResetPreview>(() => accountsApi.resetPreview(), [])
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<(ResetResult & { snapshot: string }) | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const run = async () => {
    if (!window.confirm('Are you sure? Everything before July will be removed and Jul–Sep will match the files. October stays as it is.')) return
    setBusy(true)
    setFailed(null)
    try {
      const r = await accountsApi.reset()
      setResult({ ...r.result, snapshot: r.snapshot })
      await reload()
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Reset failed.')
    } finally {
      setBusy(false)
    }
  }

  const cell = 'border border-slate-300 px-2 py-1'
  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounts — July to September files"
        subtitle="One-time job: everything before July is removed; July–September bills and petty cash will match the Excel files. October stays as it is."
      />
      <LoadState loading={loading} error={error} hasData={Boolean(data)}>
        {data && (
          <>
            {data.done && <div className="erp-card p-3 text-sm font-bold text-emerald-700">This was done on {data.done.at}.</div>}
            {data.lockedMonths.length > 0 && (
              <div className="erp-card border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-800">
                First unlock these months: {data.lockedMonths.map(monthLabel).join(', ')}.
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="erp-card overflow-x-auto">
                <div className="px-3 py-2 text-xs font-black uppercase text-rose-700">Will be removed</div>
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {data.remove.billsByMonth.map((m) => (
                      <tr key={m.month}>
                        <td className={cell}>{monthLabel(m.month)} — bills</td>
                        <td className={`${cell} text-right font-mono`}>{m.bills}</td>
                        <td className={`${cell} text-right font-mono`}>{rs(m.amount)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className={cell}>
                        Payments ({data.remove.payments.beforeJuly} before July, {data.remove.payments.copiedFoi} old &quot;FOI paid (copied)&quot;)
                      </td>
                      <td className={`${cell} text-right font-mono`}>{data.remove.payments.count}</td>
                      <td className={`${cell} text-right font-mono`}>{rs(data.remove.payments.amount)}</td>
                    </tr>
                    <tr>
                      <td className={cell}>Petty cash entries ({data.remove.petty.months.map(monthLabel).join(', ') || '—'})</td>
                      <td className={`${cell} text-right font-mono`}>{data.remove.petty.count}</td>
                      <td className={cell} />
                    </tr>
                    <tr>
                      <td className={cell}>Cost Statement lines ({data.remove.costMonths.map(monthLabel).join(', ') || '—'})</td>
                      <td className={`${cell} text-right font-mono`}>{data.remove.costMonths.length}</td>
                      <td className={cell} />
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="erp-card overflow-x-auto">
                <div className="px-3 py-2 text-xs font-black uppercase text-emerald-700">Will come in (from files)</div>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-[10px] uppercase">
                      <th className={cell}>Month</th>
                      <th className={cell}>Bills / items</th>
                      <th className={cell}>Total</th>
                      <th className={cell}>Petty</th>
                      <th className={cell}>b/f → closing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.add.map((m) => (
                      <tr key={m.month}>
                        <td className={cell}>{monthLabel(m.month)}</td>
                        <td className={`${cell} text-right font-mono`}>
                          {m.bills} / {m.lines}
                        </td>
                        <td className={`${cell} text-right font-mono font-bold`}>{rs(m.amount)}</td>
                        <td className={`${cell} text-right font-mono`}>{m.petty}</td>
                        <td className={`${cell} text-right font-mono`}>
                          {m.pettyOpening == null ? '-' : rs(m.pettyOpening)} → {m.pettyClosing == null ? '-' : rs(m.pettyClosing)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="space-y-1 p-3 text-[11px] text-slate-600">
                  {data.renamed.length > 0 && (
                    <div>Names matched to ERP parties: {data.renamed.map((r) => `${r.file} → ${r.erp}`).join(', ')}</div>
                  )}
                  {data.newParties.length > 0 && <div>New parties (as Trader): {data.newParties.join(', ')}</div>}
                  <div>Where the file has no machine, it stays empty — select it yourself in Daily Inward.</div>
                </div>
              </div>
            </div>

            <div className="erp-card p-3 text-xs">
              October and later: {data.keptLater.bills} bills ({rs(data.keptLater.amount)}) and {data.keptLater.petty} petty entries —{' '}
              <b>stay as they are</b>. July–September payments / opening balance entered by hand also stay. A database snapshot
              is taken before the reset.
            </div>

            {result && (
              <div className="erp-card border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                Done: removed {result.deleted.bills} old bills, {result.deleted.payments} payments, {result.deleted.petty} petty entries;{' '}
                added {result.added.bills} bills ({rs(result.added.amount)}) and {result.added.petty} petty entries. Snapshot: {result.snapshot}.{' '}
                <Link className="underline" href="/accounts/inventory-inward?month=2026-07">
                  July Daily Inward
                </Link>
              </div>
            )}
            {failed && <div className="erp-card border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-800">{failed}</div>}

            {canEditAccounts && !data.done && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder='Type "RESET" to confirm'
                  className="h-9 w-64 rounded-md border border-slate-300 px-2 text-xs"
                />
                <button
                  type="button"
                  disabled={busy || typed !== 'RESET' || data.lockedMonths.length > 0}
                  onClick={run}
                  className="rounded-lg bg-rose-700 px-4 py-2 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
                >
                  {busy ? 'Working…' : 'Reset'}
                </button>
              </div>
            )}
          </>
        )}
      </LoadState>
    </div>
  )
}
