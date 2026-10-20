'use client'

import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { monthLabel, rs } from '@/lib/accounts/util'
import { accountsApi } from '@/services/accounts/accountsApi'
import { useAccountsData } from '@/hooks/useAccounts'
import { LoadState } from '@/components/accounts/ui'

/** Month-by-month petty cash: b/f, in, out, mill expense, closing. */
export default function PettyCashMonthlyPage() {
  const { data: rows, error, loading } = useAccountsData(() => accountsApi.pettySummary(), [])
  return (
    <div className="space-y-4">
      <PageHeader
        title="Petty Cash — Monthly"
        showTitle={false}
        actions={
          <div className="flex items-center justify-between w-full">
            <Link href="/accounts/petty-cash" className="erp-btn-secondary text-xs !min-h-9 !h-9">
              <ArrowLeft className="size-3.5" /> Petty cash journal
            </Link>
            <button type="button" onClick={() => window.print()} className="erp-btn-secondary text-xs !min-h-9 !h-9 cursor-pointer">
              <Printer className="size-3.5" /> Print
            </button>
          </div>
        }
      />
      <LoadState loading={loading} error={error} hasData={Boolean(rows)}>
        <div className="erp-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="bg-slate-100 font-bold uppercase text-[10px] border-b-2 border-slate-800">
                <th className="py-2.5 px-3 text-left">Month</th>
                <th className="py-2.5 px-3 text-right">Balance b/f</th>
                <th className="py-2.5 px-3 text-right">Cash in</th>
                <th className="py-2.5 px-3 text-right">Cash out</th>
                <th className="py-2.5 px-3 text-right">Mill expense</th>
                <th className="py-2.5 px-3 text-right">Closing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(rows || []).map((r) => (
                <tr key={r.month} className="hover:bg-blue-50/40">
                  <td className="py-2 px-3 font-bold">
                    <Link href={`/accounts/petty-cash?month=${r.month}`} className="hover:underline">
                      {monthLabel(r.month)}
                    </Link>
                  </td>
                  <td className="py-2 px-3 text-right font-mono">{rs(r.opening)}</td>
                  <td className="py-2 px-3 text-right font-mono">{rs(r.totalIn)}</td>
                  <td className="py-2 px-3 text-right font-mono">{rs(r.totalOut)}</td>
                  <td className="py-2 px-3 text-right font-mono">{rs(r.expenseOut)}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold">{rs(r.closing)}</td>
                </tr>
              ))}
              {rows && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Abhi koi petty cash entry nahi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </LoadState>
    </div>
  )
}
