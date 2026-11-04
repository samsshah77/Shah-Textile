'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { Printer, Trash2, Plus, BarChart3 } from 'lucide-react'
import { SheetHeader } from '@/components/shared/SheetHeader'
import { PageHeader } from '@/components/shared/PageHeader'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { monthLabel, rs } from '@/lib/accounts/util'
import type { PettyCashEntry, PettyCashKind, PettyCashStatement } from '@/lib/accounts/types'
import { accountsApi } from '@/services/accounts/accountsApi'
import { useAccountsData, useAccountsMonth } from '@/hooks/useAccounts'
import { LoadState, LockControl, MonthPicker, useSaveStatus } from '@/components/accounts/ui'
import { AccountsTableSkeleton } from '@/components/accounts/AccountsSkeleton'

const KIND_LABEL: Record<PettyCashKind, string> = {
  OPENING: 'Opening balance',
  CASH_IN: 'Cash in (Dr)',
  EXPENSE: 'Mill expense (Cr)',
  SALARY: 'Salary / contractor paid (Cr)',
}
const isIn = (k: PettyCashKind) => k === 'OPENING' || k === 'CASH_IN'

/**
 * Petty Cash Statement. "Balance b/f" comes from the previous months automatically;
 * running balance is always recomputed on the server — never typed.
 */
function PettyCashContent() {
  const { canEditAccounts } = useAuth()
  const { month, setMonth, months } = useAccountsMonth()
  const { data: st, setData, error, loading, reload } = useAccountsData<PettyCashStatement | null>(
    () => (month ? accountsApi.petty(month) : Promise.resolve(null)),
    [month],
    { reloadOnChange: false }
  )
  const save = useSaveStatus()
  const canEdit = canEditAccounts && !st?.lock.locked
  const today = new Date().toISOString().slice(0, 10)
  const [draft, setDraft] = useState({ date: '', description: '', kind: 'EXPENSE' as PettyCashKind, amount: '' })
  const cell = 'border border-slate-300 dark:border-slate-700'

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const date = draft.date || (today.startsWith(month) ? today : `${month}-01`)
    const entry = await save.run(() =>
      accountsApi.createPetty({ date, description: draft.description, kind: draft.kind, amount: Number(draft.amount) || 0 })
    )
    if (entry) {
      setDraft({ date: draft.date, description: '', kind: draft.kind, amount: '' })
      void reload()
    }
  }
  const edit = async (e: PettyCashEntry, patch: Partial<{ date: string; description: string; kind: PettyCashKind; amount: number }>) => {
    const amount = e.debit || e.credit
    if (
      (patch.date === undefined || patch.date === e.date) &&
      (patch.description === undefined || patch.description === e.description) &&
      (patch.kind === undefined || patch.kind === e.kind) &&
      (patch.amount === undefined || patch.amount === amount)
    )
      return
    await save.run(() => accountsApi.updatePetty(e.id, e.version, patch))
    void reload()
  }
  const remove = async (e: PettyCashEntry) => {
    if (!window.confirm(`"${e.description}" delete karein?`)) return
    await save.run(() => accountsApi.deletePetty(e.id, e.version))
    void reload()
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Petty Cash — ${month ? monthLabel(month) : ''}`}
        showTitle={false}
        actions={
          <div className="flex flex-wrap items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-2">
              {st && <LockControl lock={st.lock} canEdit={canEditAccounts} onChanged={(lock) => setData((s) => (s ? { ...s, lock } : s))} />}
              <Link href="/accounts/petty-cash/monthly" className="erp-btn-secondary text-xs !min-h-9 !h-9">
                <BarChart3 className="size-3.5" /> Monthly summary
              </Link>
            </div>
            <div className="flex items-center gap-2">
              {save.node}
              <MonthPicker month={month} months={months} onChange={setMonth} />
              <button type="button" onClick={() => window.print()} className="sara-allow-readonly erp-btn-secondary text-xs !min-h-9 !h-9 cursor-pointer">
                <Printer className="size-3.5" /> Print
              </button>
            </div>
          </div>
        }
      />
      <LoadState loading={loading} error={error} hasData={Boolean(st)}>
        {st && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:hidden">
              {[
                ['Balance b/f', st.opening],
                ['Cash in', st.totalIn],
                ['Cash out', st.totalOut],
                ['Mill expense (Cost Statement)', st.expenseOut],
                ['Closing balance', st.closing],
              ].map(([l, v]) => (
                <div key={l as string} className="erp-card p-3">
                  <div className="text-[10px] font-bold uppercase text-slate-500">{l}</div>
                  <div className="text-lg font-black font-mono">{rs(v as number)}</div>
                </div>
              ))}
            </div>
            <div className="erp-card overflow-hidden">
              <div className="px-3 pt-3">
                <SheetHeader title="PETTY CASH JOURNAL" subtitle={<>Month: {month ? monthLabel(month) : ''}</>} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 font-bold uppercase text-[10px]">
                      <th className={cn(cell, 'py-2 px-2 w-12 text-center')}>S.No</th>
                      <th className={cn(cell, 'py-2 px-2 w-32')}>Date</th>
                      <th className={cn(cell, 'py-2 px-2 text-left')}>Description</th>
                      <th className={cn(cell, 'py-2 px-2 w-48')}>Type</th>
                      <th className={cn(cell, 'py-2 px-2 w-32 text-right')}>Dr (cash in)</th>
                      <th className={cn(cell, 'py-2 px-2 w-32 text-right')}>Cr (cash out)</th>
                      <th className={cn(cell, 'py-2 px-2 w-32 text-right')}>Balance</th>
                      {canEdit && <th className={cn(cell, 'w-10 print:hidden')} />}
                    </tr>
                  </thead>
                  <tbody>
                    {!st.entries.some((e) => e.kind === 'OPENING') && (
                      <tr className="bg-amber-50/60 italic">
                        <td className={cn(cell, 'text-center')}>-</td>
                        <td className={cn(cell, 'px-2 font-mono')}>{month}-01</td>
                        <td className={cn(cell, 'px-2')}>Balance b/f</td>
                        <td className={cell} />
                        <td className={cell} />
                        <td className={cell} />
                        <td className={cn(cell, 'px-2 text-right font-mono font-bold')}>{rs(st.opening)}</td>
                        {canEdit && <td className={cn(cell, 'print:hidden')} />}
                      </tr>
                    )}
                    {st.entries.map((e, i) => (
                      <tr key={e.id} className={cn(i % 2 ? 'bg-slate-50/60' : '', e.kind === 'OPENING' && 'bg-amber-50/70 font-semibold')}>
                        <td className={cn(cell, 'text-center font-mono text-slate-500')}>{i + 1}</td>
                        <td className={cn(cell, 'px-1')}>
                          {canEdit ? (
                            <input type="date" defaultValue={e.date} aria-label="Date" onBlur={(ev) => edit(e, { date: ev.target.value })} className="w-full bg-transparent px-1 py-1 font-mono" />
                          ) : (
                            <span className="px-1 font-mono">{e.date}</span>
                          )}
                        </td>
                        <td className={cn(cell, 'px-1')}>
                          {canEdit ? (
                            <input defaultValue={e.description} aria-label="Description" onBlur={(ev) => edit(e, { description: ev.target.value.trim() })} className="w-full bg-transparent px-1 py-1" />
                          ) : (
                            <span className="px-1">{e.description}</span>
                          )}
                        </td>
                        <td className={cn(cell, 'px-1')}>
                          {canEdit ? (
                            <select value={e.kind} aria-label="Type" onChange={(ev) => edit(e, { kind: ev.target.value as PettyCashKind })} className="w-full bg-transparent px-1 py-1">
                              {(Object.keys(KIND_LABEL) as PettyCashKind[]).map((k) => (
                                <option key={k} value={k}>
                                  {KIND_LABEL[k]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="px-1">{KIND_LABEL[e.kind]}</span>
                          )}
                        </td>
                        {(['debit', 'credit'] as const).map((side) => (
                          <td key={side} className={cn(cell, 'px-1 text-right font-mono')}>
                            {canEdit && (side === 'debit') === isIn(e.kind) ? (
                              <input
                                type="number"
                                min={0}
                                step="any"
                                aria-label={side === 'debit' ? 'Dr amount' : 'Cr amount'}
                                defaultValue={e[side]}
                                onBlur={(ev) => edit(e, { amount: Number(ev.target.value) || 0 })}
                                className="w-full bg-transparent px-1 py-1 text-right"
                              />
                            ) : e[side] ? (
                              rs(e[side])
                            ) : (
                              ''
                            )}
                          </td>
                        ))}
                        <td className={cn(cell, 'px-2 text-right font-mono font-bold')}>{rs(e.balance)}</td>
                        {canEdit && (
                          <td className={cn(cell, 'text-center print:hidden')}>
                            <button type="button" onClick={() => remove(e)} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer" aria-label="Delete entry">
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  {canEdit && (
                    <tfoot className="print:hidden">
                      <tr className="bg-blue-50/50">
                        <td className={cn(cell, 'text-center')}>
                          <Plus className="size-3.5 mx-auto text-[#0066cc]" />
                        </td>
                        <td className={cn(cell, 'px-1')}>
                          <input type="date" value={draft.date} aria-label="New entry date" onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="w-full bg-white border rounded px-1 py-1 font-mono" />
                        </td>
                        <td className={cn(cell, 'px-1')} colSpan={1}>
                          <form id="petty-add" onSubmit={add} />
                          <input
                            form="petty-add"
                            required
                            value={draft.description}
                            aria-label="New entry description"
                            onChange={(e) => {
                              const v = e.target.value
                              setDraft((d) => ({ ...d, description: v, kind: /paid salar|salaries|wages/i.test(v) && d.kind === 'EXPENSE' ? 'SALARY' : d.kind }))
                            }}
                            placeholder="Description (e.g. Bearing 6207 5pcs)"
                            className="w-full bg-white border rounded px-2 py-1"
                          />
                        </td>
                        <td className={cn(cell, 'px-1')}>
                          <select form="petty-add" value={draft.kind} aria-label="New entry type" onChange={(e) => setDraft({ ...draft, kind: e.target.value as PettyCashKind })} className="w-full bg-white border rounded px-1 py-1">
                            {(Object.keys(KIND_LABEL) as PettyCashKind[])
                              .filter((k) => k !== 'OPENING' || st.entries.length === 0)
                              .map((k) => (
                                <option key={k} value={k}>
                                  {KIND_LABEL[k]}
                                </option>
                              ))}
                          </select>
                        </td>
                        <td className={cn(cell, 'px-1')} colSpan={2}>
                          <input form="petty-add" required type="number" min={0} step="any" value={draft.amount} aria-label="New entry amount" onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="Amount" className="w-full bg-white border rounded px-2 py-1 text-right font-mono" />
                        </td>
                        <td className={cn(cell, 'px-1')} colSpan={2}>
                          <button form="petty-add" type="submit" className="w-full px-2 py-1 rounded bg-[#0066cc] text-white font-bold cursor-pointer">
                            Add
                          </button>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                  <tfoot>
                    <tr className="bg-slate-200 font-black">
                      <td colSpan={4} className={cn(cell, 'px-3 py-2 text-right uppercase')}>
                        Total
                      </td>
                      <td className={cn(cell, 'px-2 text-right font-mono')}>{rs(st.totalIn)}</td>
                      <td className={cn(cell, 'px-2 text-right font-mono')}>{rs(st.totalOut)}</td>
                      <td className={cn(cell, 'px-2 text-right font-mono text-[#0066cc]')}>{rs(st.closing)}</td>
                      {canEdit && <td className={cn(cell, 'print:hidden')} />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </LoadState>
    </div>
  )
}

export default function PettyCashPage() {
  return (
    <Suspense fallback={<AccountsTableSkeleton />}>
      <PettyCashContent />
    </Suspense>
  )
}
