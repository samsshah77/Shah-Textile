'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { cn } from '@/lib/utils'
import { monthLabel, rs } from '@/lib/accounts/util'
import { useAuth } from '@/context/AuthContext'
import { accountsApi } from '@/services/accounts/accountsApi'
import { useAccountsData } from '@/hooks/useAccounts'
import { LoadState } from '@/components/accounts/ui'
import { AccountsTableSkeleton } from '@/components/accounts/AccountsSkeleton'
import type { MonthImportPreview, MonthImportResult } from '@/server/accounts/monthImport'

const BADGE: Record<string, string> = {
  new: 'bg-emerald-100 text-emerald-800',
  exists: 'bg-slate-200 text-slate-700',
  differs: 'bg-amber-100 text-amber-800',
}
const LABEL: Record<string, string> = { new: 'Will be added', exists: 'Already there', differs: 'Different — will not be added' }

/**
 * One-time import of a month kept in Excel (Daily Expense: bills + petty cash).
 * Shows exactly what would be added; only missing rows are added, nothing is changed.
 */
function MonthImport() {
  const month = useSearchParams().get('month') || '2026-09'
  const { canEditAccounts } = useAuth()
  const { data, error, loading, reload } = useAccountsData<MonthImportPreview>(() => accountsApi.monthImportPreview(month), [month])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MonthImportResult | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const run = async () => {
    if (!data) return
    const t = data.totals
    if (
      !window.confirm(
        `${monthLabel(month)}: ${t.billsToAdd} bills (${rs(t.amountToAdd)}) and ${t.pettyToAdd} petty cash entries will be added. ` +
          'What is already in the ERP stays as it is. Import?'
      )
    )
      return
    setBusy(true)
    setFailed(null)
    try {
      setResult(await accountsApi.monthImport(month))
      await reload()
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  const cell = 'border border-slate-300 px-2 py-1'
  return (
    <div className="space-y-4">
      <PageHeader
        title={`Import — ${monthLabel(month)}`}
        subtitle="Excel month into the ERP: first see what will be added. Only what is not in the ERP is added — nothing is changed or deleted."
      />
      <LoadState loading={loading} error={error} hasData={Boolean(data)}>
        {data && (
          <>
            <div className="erp-card p-3 text-xs space-y-1">
              <div>
                File: <b>{data.source}</b>
              </div>
              {data.imported && (
                <div className="font-bold text-emerald-700">This import was done on {data.imported.at} — it will not run again.</div>
              )}
              {data.locked && <div className="font-bold text-rose-700">{monthLabel(month)} is locked — unlock it before importing.</div>}
              {data.warnings.map((w) => (
                <div key={w} className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(
                [
                  ['Bills in file', rs(data.totals.fileBills)],
                  ['In ERP now (this month)', rs(data.totals.erpBillsBefore)],
                  [`Will be added: ${data.totals.billsToAdd} bills / ${data.totals.linesToAdd} lines`, rs(data.totals.amountToAdd)],
                  ['In ERP after import', rs(data.totals.erpBillsAfter)],
                  ['Petty: file b/f', data.totals.pettyOpeningFile == null ? '-' : rs(data.totals.pettyOpeningFile)],
                  ['Petty: ERP b/f', rs(data.totals.pettyOpeningErp)],
                  [`Petty entries to add`, String(data.totals.pettyToAdd)],
                  [
                    `Petty closing: file ${data.totals.pettyClosingFile == null ? '-' : rs(data.totals.pettyClosingFile)}`,
                    `ERP ${rs(data.totals.pettyClosingErpAfter)}`,
                  ],
                ] as Array<[string, string]>
              ).map(([k, v]) => (
                <div key={k} className="erp-card p-3">
                  <div className="text-[10px] font-bold uppercase text-slate-500">{k}</div>
                  <div className="text-lg font-black font-mono">{v}</div>
                </div>
              ))}
            </div>

            {data.newParties.length > 0 && (
              <div className="erp-card p-3 text-xs">
                New parties will be created (as Trader; you can change this later on the Traders page): <b>{data.newParties.join(', ')}</b>
              </div>
            )}

            {result && (
              <div className="erp-card border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                Imported: {result.bills} bills ({result.lines} lines, {rs(result.amount)}) and {result.petty} petty cash entries.{' '}
                <Link className="underline" href={`/accounts/inventory-inward?month=${month}`}>
                  Daily Inward
                </Link>{' '}
                ·{' '}
                <Link className="underline" href={`/accounts/petty-cash?month=${month}`}>
                  Petty Cash
                </Link>
              </div>
            )}
            {failed && <div className="erp-card border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-800">{failed}</div>}

            {canEditAccounts && !data.imported && (
              <button
                type="button"
                disabled={busy || data.locked || (data.totals.billsToAdd === 0 && data.totals.pettyToAdd === 0)}
                onClick={run}
                className="erp-btn-primary cursor-pointer disabled:opacity-50"
              >
                {busy ? 'Importing…' : `Import (${data.totals.billsToAdd} bills, ${data.totals.pettyToAdd} petty)`}
              </button>
            )}

            <div className="erp-card overflow-x-auto">
              <div className="px-3 py-2 text-xs font-black uppercase">Bills (file)</div>
              <table className="w-full min-w-[900px] border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-[10px] uppercase">
                    {['Date', 'Bill', 'Inward', 'Party', 'Items', 'Total', 'Status'].map((h) => (
                      <th key={h} className={cn(cell, 'text-left')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.bills.map((b, i) => (
                    <tr key={i} className={cn(b.status !== 'new' && 'opacity-70')}>
                      <td className={cn(cell, 'font-mono')}>{b.date}</td>
                      <td className={cn(cell, 'font-mono')}>{b.billNo}</td>
                      <td className={cn(cell, 'font-mono')}>{b.inwardNo}</td>
                      <td className={cell}>
                        {b.party.name}
                        {b.party.name !== b.partyName && <span className="text-slate-500"> (file: {b.partyName})</span>}
                        {b.party.isNew && <span className="ml-1 rounded bg-sky-100 px-1 text-[10px] font-bold text-sky-800">new</span>}
                      </td>
                      <td className={cell}>
                        {b.lines.map((l) => `${l.description} ${l.quantity}×${l.rate}`).join(', ')}
                      </td>
                      <td className={cn(cell, 'text-right font-mono font-bold')}>{rs(b.total)}</td>
                      <td className={cell}>
                        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', BADGE[b.status])}>{LABEL[b.status]}</span>
                        {b.note && <div className="text-[10px] text-slate-500">{b.note}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.extraInErp.length > 0 && (
              <div className="erp-card overflow-x-auto">
                <div className="px-3 py-2 text-xs font-black uppercase">In ERP, not in file (nothing will change)</div>
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {data.extraInErp.map((b, i) => (
                      <tr key={i}>
                        <td className={cn(cell, 'font-mono')}>{b.date}</td>
                        <td className={cell}>{b.partyName}</td>
                        <td className={cn(cell, 'font-mono')}>{b.billNo || '-'}</td>
                        <td className={cn(cell, 'text-right font-mono')}>{rs(b.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="erp-card overflow-x-auto">
              <div className="px-3 py-2 text-xs font-black uppercase">Petty cash (file; the ERP brings Balance b/f by itself)</div>
              <table className="w-full min-w-[800px] border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-[10px] uppercase">
                    {['Date', 'Description', 'Dr (in)', 'Cr (out)', 'Status'].map((h) => (
                      <th key={h} className={cn(cell, 'text-left')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.petty.map((p, i) => (
                    <tr key={i} className={cn(p.status !== 'new' && 'opacity-70')}>
                      <td className={cn(cell, 'font-mono')}>{p.date}</td>
                      <td className={cell}>{p.description}</td>
                      <td className={cn(cell, 'text-right font-mono')}>{p.kind === 'CASH_IN' ? rs(p.amount) : ''}</td>
                      <td className={cn(cell, 'text-right font-mono')}>{p.kind === 'CASH_IN' ? '' : rs(p.amount)}</td>
                      <td className={cell}>
                        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', BADGE[p.status])}>{LABEL[p.status]}</span>
                        {p.note && <div className="text-[10px] text-slate-500">{p.note}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </LoadState>
    </div>
  )
}

export default function MonthImportPage() {
  return (
    <Suspense fallback={<AccountsTableSkeleton />}>
      <MonthImport />
    </Suspense>
  )
}
