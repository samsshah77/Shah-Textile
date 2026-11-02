'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { PlusCircle, Search, Download, Printer, Pencil, X, AlertTriangle } from 'lucide-react'
import { SheetHeader } from '@/components/shared/SheetHeader'
import { PageHeader } from '@/components/shared/PageHeader'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { monthLabel, rs } from '@/lib/accounts/util'
import type { CostBucket, Party, PartyKind, PartySummary, PayAccount } from '@/lib/accounts/types'
import { accountsApi } from '@/services/accounts/accountsApi'
import { useAccountsData, useAccountsMonth } from '@/hooks/useAccounts'
import { LoadState, MonthPicker } from '@/components/accounts/ui'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { ResizableTh } from '@/components/shared/ResizableTh'

const BUCKET_LABEL: Record<CostBucket, string> = {
  MACHINERY: 'Machinery Parts',
  ELECTRIC: 'Electric / Maint.',
  REPAIR: 'Repair',
}

const DEFAULT_DIRECTORY_WIDTHS: Record<string, number> = {
  serialNo: 50,
  name: 280,
  category: 180,
  costBucket: 220,
  purchases: 160,
  actions: 80,
}

/**
 * Traders and Workshops directory (same screen, `kind` decides which). Totals come from
 * the bills on Daily Inward, so they always agree with it.
 */
export function PartyDirectory({ kind }: { kind: PartyKind }) {
  const { canEditAccounts } = useAuth()
  const { month, setMonth, months } = useAccountsMonth({ allowAll: true })
  const { data: rows, error, loading } = useAccountsData<PartySummary[] | null>(
    () => (month ? accountsApi.directory(kind, month === 'all' ? 'all' : month) : Promise.resolve(null)),
    [month, kind]
  )
  const [search, setSearch] = useState('')
  const [showRemoved, setShowRemoved] = useState(false)
  const [showIdle, setShowIdle] = useState(false)
  const [editing, setEditing] = useState<Party | 'new' | null>(null)

  const { widths, setColumnWidth, resetColumnWidth, resetAllWidths } = useResizableColumns(
    `party_directory_${kind.toLowerCase()}_v1`,
    DEFAULT_DIRECTORY_WIDTHS
  )
  const tableMinWidth = useMemo(
    () =>
      Object.entries(widths).reduce(
        (sum, [key, w]) => (key === 'actions' && !canEditAccounts ? sum : sum + w),
        0
      ),
    [widths, canEditAccounts]
  )

  const noun = kind === 'WORKSHOP' ? 'Workshop' : 'Trader'
  const base = kind === 'WORKSHOP' ? '/accounts/workshops' : '/accounts/traders'
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (rows || []).filter(
      (r) =>
        (showRemoved || r.party.active) &&
        (showIdle || month === 'all' || r.bills > 0 || r.paid !== 0 || r.opening !== 0 || r.adjusted !== 0) &&
        (!q || `${r.party.name} ${r.party.category} ${r.party.remarks}`.toLowerCase().includes(q))
    )
  }, [rows, search, showRemoved, showIdle, month])
  const removedCount = (rows || []).filter((r) => !r.party.active).length
  const tot = (pick: (r: PartySummary) => number) => shown.reduce((s, r) => s + pick(r), 0)
  const period = month === 'all' ? 'All months' : monthLabel(month)

  const exportCSV = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [
      ['S.No', `${noun} Name`, 'Category', 'Cost block', 'Purchases'].join(','),
      ...shown.map((r, i) =>
        [i + 1, r.party.name, r.party.category, BUCKET_LABEL[r.party.costBucket], r.purchases]
          .map(esc)
          .join(',')
      ),
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `${noun}s_${month}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${noun}s — ${period}`}
        showTitle={false}
        actions={
          <div className="flex flex-wrap items-center justify-between gap-3 w-full">
            <div>
              {canEditAccounts && (
                <button
                  type="button"
                  onClick={() => setEditing('new')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0066cc] hover:bg-[#0052a3] text-white cursor-pointer !min-h-9 !h-9"
                >
                  <PlusCircle className="size-4" /> Add {noun}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <MonthPicker month={month} months={months} onChange={setMonth} allowAll />
              <button type="button" onClick={exportCSV} className="sara-allow-readonly erp-btn-secondary text-xs !min-h-9 !h-9 cursor-pointer">
                <Download className="size-3.5" /> Export CSV
              </button>
              <button type="button" onClick={() => window.print()} className="sara-allow-readonly erp-btn-secondary text-xs !min-h-9 !h-9 cursor-pointer">
                <Printer className="size-3.5" /> Print
              </button>
            </div>
          </div>
        }
      />

      <LoadState loading={loading} error={error} hasData={Boolean(rows)}>
        <div className="erp-card overflow-hidden">
          <div className="px-3 pt-3">
            <SheetHeader title={`${noun.toUpperCase()}S`} subtitle={<>Period: {period}</>} />
          </div>
          <div className="p-3 border-b border-border flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 print:hidden">
            <div className="relative w-72">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <input
                placeholder="Search name, category, remarks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="sara-allow-readonly w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex items-center gap-4">
              {month !== 'all' && (
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" className="sara-allow-readonly" checked={showIdle} onChange={(e) => setShowIdle(e.target.checked)} />
                  Is mahine bina bill walay bhi dikhayein
                </label>
              )}
              {removedCount > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" className="sara-allow-readonly" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
                  Removed bhi dikhayein ({removedCount})
                </label>
              )}
              <span className="text-xs text-slate-500 font-semibold">
                {shown.length} {noun.toLowerCase()}s
              </span>
              <button
                type="button"
                onClick={resetAllWidths}
                className="sara-allow-readonly text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer print:hidden"
                title="Reset column widths to default"
              >
                Reset widths
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table
              className="w-full text-left border-collapse text-xs"
              style={{ tableLayout: 'fixed', minWidth: `${tableMinWidth}px` }}
            >
              <colgroup>
                <col style={{ width: widths.serialNo }} />
                <col style={{ width: widths.name }} />
                <col style={{ width: widths.category }} />
                <col style={{ width: widths.costBucket }} />
                <col style={{ width: widths.purchases }} />
                {canEditAccounts && <col className="print:hidden" style={{ width: widths.actions }} />}
              </colgroup>
              <thead>
                <tr className="bg-slate-100 font-bold uppercase text-[10px] text-slate-700 border-b-2 border-slate-800">
                  <ResizableTh
                    columnKey="serialNo"
                    width={widths.serialNo}
                    minWidth={36}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className="py-2.5 px-3 text-center"
                  >
                    S.No
                  </ResizableTh>
                  <ResizableTh
                    columnKey="name"
                    width={widths.name}
                    minWidth={150}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className="py-2.5 px-3"
                  >
                    {noun} Name
                  </ResizableTh>
                  <ResizableTh
                    columnKey="category"
                    width={widths.category}
                    minWidth={100}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className="py-2.5 px-3"
                  >
                    Category
                  </ResizableTh>
                  <ResizableTh
                    columnKey="costBucket"
                    width={widths.costBucket}
                    minWidth={120}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className="py-2.5 px-3"
                  >
                    Cost block
                  </ResizableTh>
                  <ResizableTh
                    columnKey="purchases"
                    width={widths.purchases}
                    minWidth={110}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className="py-2.5 px-3 text-right"
                  >
                    Purchases
                  </ResizableTh>
                  {canEditAccounts && (
                    <ResizableTh
                      columnKey="actions"
                      width={widths.actions}
                      minWidth={50}
                      onResize={setColumnWidth}
                      onReset={resetColumnWidth}
                      className="py-2.5 px-3 text-center print:hidden"
                    >
                      Actions
                    </ResizableTh>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan={canEditAccounts ? 6 : 5} className="py-10 text-center text-muted-foreground">
                      {month === 'all' || showIdle ? `Koi ${noun.toLowerCase()} nahi mila.` : `${period} mein kisi ${noun.toLowerCase()} ka bill nahi.`}
                    </td>
                  </tr>
                ) : (
                  shown.map((r, i) => (
                    <tr key={r.party.id} className={cn('hover:bg-blue-50/40', !r.party.active && 'opacity-60')}>
                      <td className="py-2 px-3 text-center font-mono text-slate-500">{i + 1}</td>
                      <td className="py-2 px-3 font-bold">
                        <Link href={`${base}/${r.party.slug}?month=${month}`} className="hover:underline text-slate-900">
                          {r.party.name}
                        </Link>
                        {r.party.account === 'FOI' && <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">FOI</span>}
                        {!r.party.active && <span className="ml-1.5 text-[10px] font-semibold text-rose-600">(removed)</span>}
                      </td>
                      <td className="py-2 px-3 text-slate-600">{r.party.category || '-'}</td>
                      <td className="py-2 px-3 text-slate-600">{BUCKET_LABEL[r.party.costBucket]}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{rs(r.purchases)}</td>
                      {canEditAccounts && (
                        <td className="py-2 px-3 text-center print:hidden">
                          <button
                            type="button"
                            onClick={() => setEditing(r.party)}
                            className="rounded p-1 text-slate-500 hover:bg-blue-50 hover:text-[#0066cc] cursor-pointer"
                            title={`Edit ${r.party.name}`}
                            aria-label={`Edit ${r.party.name}`}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-200 font-black border-t-2 border-slate-800">
                  <td colSpan={4} className="py-2.5 px-3 text-right uppercase">Total ({period})</td>
                  <td className="py-2.5 px-3 text-right font-mono text-[#0066cc] font-bold">{rs(tot((r) => r.purchases))}</td>
                  {canEditAccounts && <td className="print:hidden" />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </LoadState>

      {editing && <PartyForm kind={kind} party={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** Add or edit a party: name, Trader/Workshop, category, cost block, remarks, remove. */
export function PartyForm({ kind, party, onClose }: { kind: PartyKind; party?: Party; onClose: () => void }) {
  const [name, setName] = useState(party?.name || '')
  const [k, setK] = useState<PartyKind>(party?.kind || kind)
  const [category, setCategory] = useState(party?.category || '')
  const [bucket, setBucket] = useState<CostBucket | ''>(party?.costBucket || '')
  const [remarks, setRemarks] = useState(party?.remarks || '')
  const [account, setAccount] = useState<PayAccount>(party?.account || 'SARA')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = 'w-full px-2.5 py-1.5 text-xs bg-background border border-slate-300 rounded-md'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (party) {
        await accountsApi.updateParty(party.id, party.version, { name, kind: k, category, remarks, account, ...(bucket ? { costBucket: bucket } : {}) })
      } else {
        await accountsApi.createParty({ name, kind: k, category, remarks, account, ...(bucket ? { costBucket: bucket } : {}) })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save nahi hua.')
    } finally {
      setBusy(false)
    }
  }
  const [confirmRemove, setConfirmRemove] = useState(false)
  const setActive = async (active: boolean) => {
    if (!party) return
    setBusy(true)
    try {
      await accountsApi.updateParty(party.id, party.version, { active })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save nahi hua.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="w-full max-w-md bg-background rounded-xl border border-border shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-bold text-sm">{party ? `Edit ${party.name}` : `Add ${kind === 'WORKSHOP' ? 'Workshop' : 'Trader'}`}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted cursor-pointer" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Name *</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={input} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-slate-600">Type</span>
              <select value={k} onChange={(e) => setK(e.target.value as PartyKind)} className={input}>
                <option value="TRADER">Trader</option>
                <option value="WORKSHOP">Workshop</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-slate-600">Cost Statement block</span>
              <select value={bucket} onChange={(e) => setBucket(e.target.value as CostBucket | '')} className={input}>
                {!party && <option value="">Auto</option>}
                <option value="MACHINERY">Machinery Parts</option>
                <option value="ELECTRIC">Electric / Maintenance</option>
                <option value="REPAIR">Repair Expense</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Payable kis account se (A/P Synopsis)</span>
            <select value={account} onChange={(e) => setAccount(e.target.value as PayAccount)} className={input}>
              <option value="SARA">Sara Textile</option>
              <option value="FOI">FOI</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Category</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Spares, Electronics, Petroleum…" className={input} />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Remarks</span>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Phone, address, terms…" className={input} />
          </label>
          {confirmRemove && party && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 space-y-2 text-xs text-rose-800">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="size-4" /> &quot;{party.name}&quot; ko list se hata dein?
              </div>
              <p className="text-rose-700">
                Ye Daily Inward ki dropdown mein nahi aayegi. Purane bills aur hisaab waisay hi rahenge, aur &quot;Bring back&quot; se wapas aa sakti hai.
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmRemove(false)} className="erp-btn-secondary text-xs cursor-pointer">
                  Nahi
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setActive(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white cursor-pointer disabled:opacity-60"
                >
                  Haan, hata dein
                </button>
              </div>
            </div>
          )}
          {error && <div className="alert alert-danger py-2 px-3 small mb-0">{error}</div>}
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <div>
            {party &&
              (party.active ? (
                <button type="button" disabled={busy} onClick={() => setConfirmRemove(true)} className="text-xs font-bold text-rose-700 cursor-pointer">
                  Remove from list
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => setActive(true)} className="text-xs font-bold text-emerald-700 cursor-pointer">
                  Bring back
                </button>
              ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="erp-btn-secondary text-xs cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg text-xs font-bold bg-[#0066cc] text-white cursor-pointer disabled:opacity-60">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
