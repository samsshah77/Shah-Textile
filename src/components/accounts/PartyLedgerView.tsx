'use client'

import { BillPhotosLink } from '@/components/accounts/BillPhotosLink'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Printer, Pencil, Wallet, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { monthLabel, rs, qty } from '@/lib/accounts/util'
import type { PartyKind, PartyLedger, PayAccount, PaymentKind, PaymentMode } from '@/lib/accounts/types'
import { accountsApi } from '@/services/accounts/accountsApi'
import { useAccountsData, useAccountsMonth } from '@/hooks/useAccounts'
import { LoadState, MonthPicker } from '@/components/accounts/ui'
import { PartyForm } from '@/components/accounts/PartyDirectory'

/** One party's date-wise ledger: every purchase line and payment with a running balance. */
export function PartyLedgerView({ slug, kind }: { slug: string; kind: PartyKind }) {
  const { canEditAccounts } = useAuth()
  const { month, setMonth, months } = useAccountsMonth({ allowAll: true })
  const { data: ledger, error, loading } = useAccountsData<PartyLedger | null>(
    () => (month ? accountsApi.ledger(slug, month === 'all' ? 'all' : month) : Promise.resolve(null)),
    [slug, month]
  )
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)
  const back = kind === 'WORKSHOP' ? '/accounts/workshops' : '/accounts/traders'
  const period = month === 'all' ? 'All months' : monthLabel(month)
  const cell = 'border border-slate-400 dark:border-slate-600'

  const removePayment = async (id: string, version: number) => {
    if (!window.confirm('Yeh entry delete karein?')) return
    await accountsApi.deletePayment(id, version).catch(() => {})
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={ledger ? ledger.party.name : 'Ledger'}
        showTitle={false}
        actions={
          <div className="flex flex-wrap items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-2">
              <Link href={`${back}?month=${month}`} className="erp-btn-secondary text-xs !min-h-9 !h-9">
                <ArrowLeft className="size-3.5" /> Back
              </Link>
              {canEditAccounts && ledger && (
                <>
                  <button type="button" onClick={() => setPaying(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white cursor-pointer !min-h-9 !h-9">
                    <Wallet className="size-4" /> Payment / entry
                  </button>
                  <button type="button" onClick={() => setEditing(true)} className="erp-btn-secondary text-xs !min-h-9 !h-9 cursor-pointer">
                    <Pencil className="size-3.5" /> Edit party
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <MonthPicker month={month} months={months} onChange={setMonth} allowAll />
              <button type="button" onClick={() => window.print()} className="erp-btn-secondary text-xs !min-h-9 !h-9 cursor-pointer">
                <Printer className="size-3.5" /> Print
              </button>
            </div>
          </div>
        }
      />

      <LoadState loading={loading} error={error} hasData={Boolean(ledger)}>
        {ledger && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {(
                [
                  ['Brought forward', ledger.opening, 'text-slate-600'],
                  ...(ledger.summary.opening ? [['Opening balance', ledger.summary.opening, 'text-amber-700']] : []),
                  ['Bills (debit)', ledger.summary.purchases, 'text-slate-900'],
                  ['Paid (credit)', ledger.summary.paid, 'text-emerald-700'],
                  ...(ledger.summary.adjusted ? [['Adjustments', ledger.summary.adjusted, 'text-sky-700']] : []),
                  [`Total payable${ledger.party.account === 'FOI' ? ' (FOI)' : ''}`, ledger.opening + ledger.summary.balance, 'text-[#0066cc]'],
                ] as Array<[string, number, string]>
              ).map(([label, value, cls]) => (
                <div key={label as string} className="erp-card p-3">
                  <div className="text-[10px] font-bold uppercase text-slate-500">{label}</div>
                  <div className={cn('text-lg font-black font-mono', cls as string)}>{rs(value as number)}</div>
                </div>
              ))}
            </div>

            <div className="erp-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-slate-50 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider">
                  {ledger.party.name} · {ledger.party.kind === 'WORKSHOP' ? 'Workshop' : 'Trader'} · {period}
                  {!ledger.party.active && <span className="ml-2 text-rose-600">(removed from list)</span>}
                </h2>
                <span className="text-xs text-slate-500">{ledger.summary.bills} bills · {qty(ledger.summary.items)} items</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 font-bold uppercase text-[10px]">
                      {['S.No', 'Date', 'Bill / Ref No', 'Inward No', 'Description', 'Qty', 'Rate', 'Debit (bill)', 'Credit (paid)', 'Balance'].map((h, i) => (
                        <th key={h} className={cn(cell, 'py-2 px-2', i >= 5 ? 'text-right' : i === 4 ? 'text-left' : 'text-center')}>
                          {h}
                        </th>
                      ))}
                      {canEditAccounts && <th className={cn(cell, 'print:hidden w-10')} />}
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.opening !== 0 && (
                      <tr className="bg-amber-50/60 italic">
                        <td className={cn(cell, 'px-2 text-center')}>-</td>
                        <td className={cn(cell, 'px-2 text-center')} colSpan={3}>
                          Balance b/f
                        </td>
                        <td className={cn(cell, 'px-2')}>Pichle mahinon ka baqi</td>
                        <td className={cell} colSpan={4} />
                        <td className={cn(cell, 'px-2 text-right font-mono font-bold')}>{rs(ledger.opening)}</td>
                        {canEditAccounts && <td className={cn(cell, 'print:hidden')} />}
                      </tr>
                    )}
                    {ledger.rows.length === 0 ? (
                      <tr>
                        <td colSpan={11} className={cn(cell, 'py-8 text-center text-muted-foreground')}>
                          {period} mein koi bill ya payment nahi.
                        </td>
                      </tr>
                    ) : (
                      ledger.rows.map((r, i) => {
                        return (
                          <tr
                            key={i}
                            className={
                              r.kind === 'PAYMENT'
                                ? 'bg-emerald-50/60'
                                : r.kind === 'OPENING'
                                  ? 'bg-amber-50/70'
                                  : r.kind === 'ADJUSTMENT'
                                    ? 'bg-sky-50/70'
                                    : i % 2
                                      ? 'bg-slate-50/60'
                                      : ''
                            }
                          >
                            <td className={cn(cell, 'px-2 text-center font-mono text-slate-500')}>{i + 1}</td>
                            <td className={cn(cell, 'px-2 text-center font-mono')}>{r.date}</td>
                            <td className={cn(cell, 'px-2 text-center font-mono font-bold')}>{r.billNo || '-'}<BillPhotosLink urls={r.attachments} /></td>
                            <td className={cn(cell, 'px-2 text-center font-mono text-[#0066cc]')}>{r.inwardNo || '-'}</td>
                            <td className={cn(cell, 'px-2 py-1.5')}>{r.description}</td>
                            <td className={cn(cell, 'px-2 text-right font-mono')}>{r.kind === 'LINE' ? qty(r.quantity) : ''}</td>
                            <td className={cn(cell, 'px-2 text-right font-mono')}>{r.kind === 'LINE' ? qty(r.rate) : ''}</td>
                            <td className={cn(cell, 'px-2 text-right font-mono font-bold')}>{r.amount ? rs(r.amount) : ''}</td>
                            <td className={cn(cell, 'px-2 text-right font-mono text-emerald-700')}>{r.paid ? rs(r.paid) : ''}</td>
                            <td className={cn(cell, 'px-2 text-right font-mono font-bold')}>{rs(r.balance)}</td>
                            {canEditAccounts && (
                              <td className={cn(cell, 'text-center print:hidden')}>
                                {r.paymentId && (
                                  <button type="button" onClick={() => removePayment(r.paymentId!, r.paymentVersion || 1)} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer" aria-label="Delete entry">
                                    <Trash2 className="size-3.5" />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-200 font-black">
                      <td colSpan={7} className={cn(cell, 'px-3 py-2 text-right uppercase')}>
                        Total ({period})
                      </td>
                      <td className={cn(cell, 'px-2 text-right font-mono')}>{rs(ledger.summary.purchases)}</td>
                      <td className={cn(cell, 'px-2 text-right font-mono text-emerald-700')}>{rs(ledger.summary.paid)}</td>
                      <td className={cn(cell, 'px-2 text-right font-mono text-[#0066cc]')}>{rs(ledger.opening + ledger.summary.balance)}</td>
                      {canEditAccounts && <td className={cn(cell, 'print:hidden')} />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            {editing && <PartyForm kind={kind} party={ledger.party} onClose={() => setEditing(false)} />}
            {paying && (
              <PaymentForm partyId={ledger.party.id} account={ledger.party.account} month={month === 'all' ? '' : month} onClose={() => setPaying(false)} />
            )}
          </>
        )}
      </LoadState>
    </div>
  )
}

function PaymentForm({
  partyId,
  account,
  month,
  onClose,
}: {
  partyId: string
  account: PayAccount
  month: string
  onClose: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [kind, setKind] = useState<PaymentKind>('PAYMENT')
  const [date, setDate] = useState(month && !today.startsWith(month) ? `${month}-01` : today)
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<PaymentMode>('CHEQUE')
  const [paidFrom, setPaidFrom] = useState<PayAccount>(account)
  const [reference, setReference] = useState('')
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = 'w-full px-2.5 py-1.5 text-xs bg-background border border-slate-300 rounded-md'
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await accountsApi.createPayment({
        partyId,
        date,
        amount: Number(amount),
        kind,
        mode: kind === 'PAYMENT' ? mode : 'OTHER',
        paidFrom: kind === 'PAYMENT' ? paidFrom : account,
        reference,
        remarks,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save nahi hua.')
    } finally {
      setBusy(false)
    }
  }
  const hint: Record<PaymentKind, string> = {
    PAYMENT: 'Party ko diye gaye paise (cheque / cash). Is se baqi kam hota hai.',
    OPENING:
      'Purane ledger ka baqi jo is system se pehle ka hai (jis tareekh tak). Positive = humne dena hai; minus = party ko advance diya hua.',
    ADJUSTMENT: 'Set-off / discount / maal wapsi (jaise scrap sale ka adjust). Positive se baqi kam hota hai; minus se barhta hai.',
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="w-full max-w-md bg-background rounded-xl border border-border shadow-2xl p-5 space-y-3">
        <h3 className="font-bold text-sm">Ledger entry</h3>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {(
            [
              ['PAYMENT', 'Payment'],
              ['OPENING', 'Opening balance'],
              ['ADJUSTMENT', 'Adjustment'],
            ] as Array<[PaymentKind, string]>
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn('flex-1 rounded-md px-2 py-1 text-xs font-bold cursor-pointer', kind === k ? 'bg-white shadow text-slate-900' : 'text-slate-500')}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">{hint[kind]}</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Date *</span>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Amount *</span>
            <input
              type="number"
              min={kind === 'PAYMENT' ? 0.01 : undefined}
              step="any"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={cn(input, 'font-mono text-right')}
            />
          </label>
          {kind === 'PAYMENT' && (
            <>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">Mode</span>
                <select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)} className={input}>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CASH">Cash</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">Kis account se</span>
                <select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value as PayAccount)} className={input}>
                  <option value="SARA">Sara Textile</option>
                  <option value="FOI">FOI</option>
                </select>
              </label>
            </>
          )}
          <label className={cn('block space-y-1', kind !== 'PAYMENT' && 'col-span-2')}>
            <span className="text-[11px] font-semibold text-slate-600">{kind === 'PAYMENT' ? 'Bank / cheque no.' : 'Reference'}</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={kind === 'PAYMENT' ? 'Meezan 34378721' : ''} className={input} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-slate-600">Remarks</span>
          <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className={input} />
        </label>
        {error && <div className="alert alert-danger py-2 px-3 small mb-0">{error}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="erp-btn-secondary text-xs cursor-pointer">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white cursor-pointer disabled:opacity-60">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
