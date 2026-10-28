'use client'

import { BillPhotosLink } from '@/components/accounts/BillPhotosLink'
import { PictureStrip } from '@/components/shared/PictureStrip'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Printer, Pencil, Wallet, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { ageLabel, monthLabel, rs, todayStr } from '@/lib/accounts/util'
import type { BillClearance, LedgerRow, PartyKind, PartyLedger, Payment } from '@/lib/accounts/types'
import { accountsApi } from '@/services/accounts/accountsApi'
import { useAccountsData, useAccountsMonth } from '@/hooks/useAccounts'
import { LoadState, MonthPicker } from '@/components/accounts/ui'
import { PartyForm } from '@/components/accounts/PartyDirectory'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { ResizableTh } from '@/components/shared/ResizableTh'

const DEFAULT_LEDGER_WIDTHS: Record<string, number> = {
  serialNo: 48,
  date: 96,
  billNo: 240,
  bill: 110,
  paid: 110,
  balance: 120,
  status: 120,
  actions: 70,
}

/**
 * A bill's item lines shown as one row (like the Excel khata): date, bill no, bill amount,
 * paid, running balance. Item details stay in Daily Inward.
 */
function billRows(rows: LedgerRow[]): LedgerRow[] {
  const out: LedgerRow[] = []
  for (const r of rows) {
    const prev = out[out.length - 1]
    const sameBill =
      r.kind === 'LINE' &&
      prev?.kind === 'LINE' &&
      (r.billId ? r.billId === prev.billId : r.billNo === prev.billNo && r.date === prev.date)
    if (sameBill) {
      out[out.length - 1] = {
        ...prev,
        amount: prev.amount + r.amount,
        balance: r.balance,
        billStatus: prev.billStatus || r.billStatus,
        attachments: prev.attachments?.length ? prev.attachments : r.attachments,
      }
    } else out.push({ ...r })
  }
  return out
}

/** One party's date-wise ledger: every bill and payment with a running balance. */
export function PartyLedgerView({ slug, kind }: { slug: string; kind: PartyKind }) {
  const { canEditAccounts } = useAuth()
  const { month, setMonth, months } = useAccountsMonth({ allowAll: true })
  const { data: ledger, error, loading } = useAccountsData<PartyLedger | null>(
    () => (month ? accountsApi.ledger(slug, month === 'all' ? 'all' : month) : Promise.resolve(null)),
    [slug, month]
  )
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState<false | 'PAYMENT' | 'OPENING'>(false)
  const [editPay, setEditPay] = useState<Payment | null>(null)
  const back = kind === 'WORKSHOP' ? '/accounts/workshops' : '/accounts/traders'
  const period = month === 'all' ? 'All months' : monthLabel(month)
  const cell = 'border border-slate-400 dark:border-slate-600'
  const { widths, setColumnWidth, resetColumnWidth, resetAllWidths } = useResizableColumns(
    'party_ledger_v1',
    DEFAULT_LEDGER_WIDTHS
  )
  const tableMinWidth = Object.values(widths).reduce((a, b) => a + b, 0)

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
                  <button type="button" onClick={() => setPaying('PAYMENT')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white cursor-pointer !min-h-9 !h-9">
                    <Wallet className="size-4" /> Payment
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaying('OPENING')}
                    className="erp-btn-secondary text-xs !min-h-9 !h-9 cursor-pointer"
                    title="ERP se pehle ka hisab (Opening balance / purane register se)"
                  >
                    Purana Hisab
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
                  ...(ledger.opening ? [['Balance b/f', ledger.opening, 'text-slate-600']] : []),
                  ...(ledger.summary.opening ? [['Purana Hisab', ledger.summary.opening, 'text-amber-700']] : []),
                  ['Bills', ledger.summary.purchases, 'text-slate-900'],
                  ['Paid', ledger.summary.paid, 'text-emerald-700'],
                  ...(ledger.summary.adjusted ? [['Adjustments', ledger.summary.adjusted, 'text-sky-700']] : []),
                  ['Balance', ledger.opening + ledger.summary.balance, 'text-[#0066cc]'],
                ] as Array<[string, number, string]>
              ).map(([label, value, cls]) => (
                <div key={label as string} className="erp-card p-3">
                  <div className="text-[10px] font-bold uppercase text-slate-500">{label}</div>
                  <div className={cn('text-lg font-black font-mono', cls as string)}>{rs(value as number)}</div>
                </div>
              ))}
              <div className="erp-card p-3">
                <div className="text-[10px] font-bold uppercase text-slate-500">Purana Pending Bill</div>
                {ledger.oldestUnpaid ? (
                  <div className="text-sm font-black font-mono text-rose-700">
                    {ledger.oldestUnpaid} <span className="text-[11px] font-bold">({ageLabel(ledger.oldestUnpaid)})</span>
                  </div>
                ) : (
                  <div className="text-sm font-black text-emerald-700">Sab bills paid</div>
                )}
              </div>
            </div>

            <div className="erp-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-slate-50 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider">
                  {ledger.party.name} · {ledger.party.kind === 'WORKSHOP' ? 'Workshop' : 'Trader'} · {period}
                  {!ledger.party.active && <span className="ml-2 text-rose-600">(removed from list)</span>}
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{ledger.summary.bills} bills</span>
                  <button
                    type="button"
                    onClick={resetAllWidths}
                    className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer print:hidden"
                    title="Reset column widths to default"
                  >
                    Reset widths
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table
                  className="w-full text-xs border-collapse"
                  style={{ tableLayout: 'fixed', minWidth: `${tableMinWidth}px` }}
                >
                  <colgroup>
                    <col style={{ width: widths.serialNo }} />
                    <col style={{ width: widths.date }} />
                    <col style={{ width: widths.billNo }} />
                    <col style={{ width: widths.bill }} />
                    <col style={{ width: widths.paid }} />
                    <col style={{ width: widths.balance }} />
                    <col style={{ width: widths.status }} />
                    {canEditAccounts && <col className="print:hidden" style={{ width: widths.actions }} />}
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-100 font-bold uppercase text-[10px]">
                      <ResizableTh
                        columnKey="serialNo"
                        width={widths.serialNo}
                        minWidth={36}
                        onResize={setColumnWidth}
                        onReset={resetColumnWidth}
                        className={cn(cell, 'py-2 px-2 text-center')}
                      >
                        S.No
                      </ResizableTh>
                      <ResizableTh
                        columnKey="date"
                        width={widths.date}
                        minWidth={75}
                        onResize={setColumnWidth}
                        onReset={resetColumnWidth}
                        className={cn(cell, 'py-2 px-2 text-center')}
                      >
                        Date
                      </ResizableTh>
                      <ResizableTh
                        columnKey="billNo"
                        width={widths.billNo}
                        minWidth={120}
                        onResize={setColumnWidth}
                        onReset={resetColumnWidth}
                        className={cn(cell, 'py-2 px-2 text-left')}
                      >
                        Bill No
                      </ResizableTh>
                      <ResizableTh
                        columnKey="bill"
                        width={widths.bill}
                        minWidth={80}
                        onResize={setColumnWidth}
                        onReset={resetColumnWidth}
                        className={cn(cell, 'py-2 px-2 text-right')}
                      >
                        Bill
                      </ResizableTh>
                      <ResizableTh
                        columnKey="paid"
                        width={widths.paid}
                        minWidth={80}
                        onResize={setColumnWidth}
                        onReset={resetColumnWidth}
                        className={cn(cell, 'py-2 px-2 text-right')}
                      >
                        Paid
                      </ResizableTh>
                      <ResizableTh
                        columnKey="balance"
                        width={widths.balance}
                        minWidth={80}
                        onResize={setColumnWidth}
                        onReset={resetColumnWidth}
                        className={cn(cell, 'py-2 px-2 text-right')}
                      >
                        Balance
                      </ResizableTh>
                      <ResizableTh
                        columnKey="status"
                        width={widths.status}
                        minWidth={90}
                        onResize={setColumnWidth}
                        onReset={resetColumnWidth}
                        className={cn(cell, 'py-2 px-2 text-center')}
                      >
                        Bill status
                      </ResizableTh>
                      {canEditAccounts && (
                        <ResizableTh
                          columnKey="actions"
                          width={widths.actions}
                          minWidth={50}
                          onResize={setColumnWidth}
                          onReset={resetColumnWidth}
                          className={cn(cell, 'print:hidden py-2 px-2 text-center')}
                        >
                          Actions
                        </ResizableTh>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.opening !== 0 && (
                      <tr className="bg-amber-50/60 italic">
                        <td className={cn(cell, 'px-2 text-center')}>-</td>
                        <td className={cn(cell, 'px-2 text-center')} />
                        <td className={cn(cell, 'px-2')}>Balance b/f — Pichla Hisab</td>
                        <td className={cell} colSpan={2} />
                        <td className={cn(cell, 'px-2 text-right font-mono font-bold')}>{rs(ledger.opening)}</td>
                        <td className={cell} />
                        {canEditAccounts && <td className={cn(cell, 'print:hidden')} />}
                      </tr>
                    )}
                    {ledger.rows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className={cn(cell, 'py-8 text-center text-muted-foreground')}>
                          {period} mein koi bill ya payment nahi.
                        </td>
                      </tr>
                    ) : (
                      billRows(ledger.rows).map((r, i) => {
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
                            <td className={cn(cell, 'px-2 py-1.5', r.kind === 'LINE' ? 'font-mono font-bold' : 'font-semibold')}>
                              {r.kind === 'LINE' ? `Bill no ${r.billNo || '-'}` : `${r.description}${r.billNo ? ` (Ref ${r.billNo})` : ''}`}
                              <BillPhotosLink urls={r.attachments} title={r.billNo ? `Bill #${r.billNo}` : 'Payment / Bill Photo'} />
                            </td>
                            <td className={cn(cell, 'px-2 text-right font-mono font-bold')}>{r.amount ? rs(r.amount) : ''}</td>
                            <td className={cn(cell, 'px-2 text-right font-mono text-emerald-700')}>{r.paid ? rs(r.paid) : ''}</td>
                            <td className={cn(cell, 'px-2 text-right font-mono font-bold')}>{rs(r.balance)}</td>
                            <td className={cn(cell, 'px-2 text-center')}>{r.billStatus && <BillStatusChip s={r.billStatus} />}</td>
                            {canEditAccounts && (
                              <td className={cn(cell, 'text-center whitespace-nowrap print:hidden')}>
                                {r.payment && (
                                  <button type="button" onClick={() => setEditPay(r.payment!)} className="p-1 text-slate-400 hover:text-sky-700 cursor-pointer" aria-label="Edit entry" title="Badlein / tasveer lagayein">
                                    <Pencil className="size-3.5" />
                                  </button>
                                )}
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
                      <td colSpan={3} className={cn(cell, 'px-3 py-2 text-right uppercase')}>
                        Total ({period})
                      </td>
                      <td className={cn(cell, 'px-2 text-right font-mono')}>{rs(ledger.summary.purchases)}</td>
                      <td className={cn(cell, 'px-2 text-right font-mono text-emerald-700')}>{rs(ledger.summary.paid)}</td>
                      <td className={cn(cell, 'px-2 text-right font-mono text-[#0066cc]')}>{rs(ledger.opening + ledger.summary.balance)}</td>
                      <td className={cell} />
                      {canEditAccounts && <td className={cn(cell, 'print:hidden')} />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            {editing && <PartyForm kind={kind} party={ledger.party} onClose={() => setEditing(false)} />}
            {paying && (
              <PaymentForm partyId={ledger.party.id} month={month === 'all' ? '' : month} kind={paying} onClose={() => setPaying(false)} />
            )}
            {editPay && <PaymentForm partyId={ledger.party.id} month="" existing={editPay} onClose={() => setEditPay(null)} />}
          </>
        )}
      </LoadState>
    </div>
  )
}

function BillStatusChip({ s }: { s: BillClearance }) {
  if (s.status === 'PAID')
    return <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">Paid</span>
  if (s.status === 'PARTLY')
    return (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800" title={`${rs(s.cleared)} paid`}>
        Balance {rs(s.due)}
      </span>
    )
  return <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">Unpaid</span>
}

/** Payment: just date, amount, a note and pictures. Also used to fix an entry later. */
/** First month kept in the ERP (July 2026): an old balance is dated on its first day. */
const OPENING_DATE = '2026-07-01'

/** Payment or old-balance entry: date, amount, a note and pictures. Also edits an existing one. */
export function PaymentForm({
  partyId,
  month,
  existing,
  kind: newKind = 'PAYMENT',
  onClose,
}: {
  partyId: string
  month: string
  existing?: Payment
  /** For a new entry: a payment, or the party's old balance from before the ERP. */
  kind?: 'PAYMENT' | 'OPENING'
  onClose: () => void
}) {
  const today = todayStr()
  const opening = existing ? existing.kind === 'OPENING' : newKind === 'OPENING'
  const [date, setDate] = useState(
    existing?.date || (opening ? OPENING_DATE : month && !today.startsWith(month) ? `${month}-01` : today)
  )
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '')
  const [note, setNote] = useState(existing?.remarks || '')
  const [pictures, setPictures] = useState<string[]>(existing?.attachments || [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isPayment = existing ? existing.kind === 'PAYMENT' : !opening
  const input = 'w-full px-2.5 py-1.5 text-xs bg-background border border-slate-300 rounded-md'
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (existing) {
        await accountsApi.updatePayment(existing.id, existing.version, { date, amount: Number(amount), remarks: note, attachments: pictures })
      } else {
        await accountsApi.createPayment({
          partyId,
          date,
          amount: Number(amount),
          kind: opening ? 'OPENING' : 'PAYMENT',
          mode: 'OTHER',
          remarks: note,
          attachments: pictures,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save nahi hua.')
    } finally {
      setBusy(false)
    }
  }
  const title = existing
    ? existing.kind === 'PAYMENT'
      ? 'Payment badlein'
      : existing.kind === 'OPENING'
        ? 'Purana Hisab badlein'
        : 'Adjustment badlein'
    : opening
      ? 'Purana Hisab (Opening Balance)'
      : 'Payment'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="w-full max-w-md bg-background rounded-xl border border-border shadow-2xl p-5 space-y-3">
        <h3 className="font-bold text-sm">{title}</h3>
        {!existing && !opening && (
          <p className="text-[11px] text-slate-500">
            Jitni raqam di — poori ya aadhi. Ye sab se purane bill se kat-ti hai; balance apne aap hisab ho jata hai.
          </p>
        )}
        {opening && (
          <p className="text-[11px] text-slate-500">
            July 2026 se pehle ka jo hisab purane register / Excel mein tha. Hum ne dena hai to seedhi raqam (jaise 25000);
            party ko advance diya hua hai to minus mein (jaise -5000). Ye sab se pehle wala bill maana jata hai.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Tareekh *</span>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Raqam *</span>
            <input
              type="number"
              min={isPayment ? 0.01 : undefined}
              step="any"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={cn(input, 'font-mono text-right')}
            />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-slate-600">Note (cheque no., bank, waghera)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Meezan cheque 34378721" className={input} />
        </label>
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-600">Tasveer (cheque / raseed)</span>
          <PictureStrip urls={pictures} onChange={setPictures} kind="bill" editable max={6} label="Tasveer lagayein" />
        </div>
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
