'use client'

import { BillPhotosLink } from '@/components/accounts/BillPhotosLink'
import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { PlusCircle, Search, Filter, Building2, Download, Printer, Pencil, Plus, Trash2, Receipt } from 'lucide-react'
import { SheetHeader } from '@/components/shared/SheetHeader'
import { PageHeader } from '@/components/shared/PageHeader'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { MACHINE_OPTIONS, type Bill, type BillLine, type MonthBook, type Party } from '@/lib/accounts/types'
import { monthLabel, rs, qty, compareBills } from '@/lib/accounts/util'
import { accountsApi } from '@/services/accounts/accountsApi'
import { useAccountsData, useAccountsMonth } from '@/hooks/useAccounts'
import { BillEditorModal } from '@/components/accounts/BillEditorModal'
import { LoadState, LockControl, MonthPicker, partyTint, machineBadge, useSaveStatus } from '@/components/accounts/ui'
import { closeSidebar } from '@/lib/sidebarToggle'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { ResizableTh } from '@/components/shared/ResizableTh'

type Row = { bill: Bill; line: BillLine; party?: Party; first: boolean; last: boolean; span: number; group: number; balance: number }

const DEFAULT_INWARD_WIDTHS: Record<string, number> = {
  serialNo: 44,
  date: 92,
  billNo: 84,
  inwardNo: 72,
  party: 190,
  description: 250,
  machine: 90,
  qty: 62,
  rate: 90,
  total: 108,
  balance: 116,
  actions: 145,
}

/**
 * Daily Inward & Expenses — the month's purchase book. Every bill is saved on the
 * server on its own; Traders, Workshops, Monthly Purchases and the Cost Statement all
 * read these same bills.
 */
function DailyInwardContent() {
  const { canEditAccounts } = useAuth()
  const { month, setMonth, months } = useAccountsMonth()
  const { data: book, setData: setBook, error, loading, reload } = useAccountsData<(MonthBook & { nextInwardNo: string }) | null>(
    () => (month ? accountsApi.book(month) : Promise.resolve(null)),
    [month],
    { reloadOnChange: false }
  )
  const [search, setSearch] = useState('')
  const [machine, setMachine] = useState('*')
  const [kind, setKind] = useState<'ALL' | 'TRADER' | 'WORKSHOP'>('ALL')
  const [editor, setEditor] = useState<{ bill?: Bill } | null>(null)
  const [editingLine, setEditingLine] = useState<string | null>(null)
  const save = useSaveStatus()

  const { widths, setColumnWidth, resetColumnWidth, resetAllWidths } = useResizableColumns(
    'inward_expenses_v2',
    DEFAULT_INWARD_WIDTHS
  )

  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  )

  const locked = Boolean(book?.lock.locked)
  const canEdit = canEditAccounts && !locked
  const parties = useMemo(() => new Map((book?.parties || []).map((p) => [p.id, p])), [book])

  const putBill = (bill: Bill | null, removedId?: string) =>
    setBook((b) => {
      if (!b) return b
      const bills = (
        bill
          ? b.bills.some((x) => x.id === bill.id)
            ? b.bills.map((x) => (x.id === bill.id ? bill : x))
            : [...b.bills, bill]
          : b.bills.filter((x) => x.id !== removedId)
      ).sort(compareBills)
      return { ...b, bills, total: bills.reduce((t, x) => t + x.total, 0) }
    })

  const rows: Row[] = useMemo(() => {
    if (!book) return []
    const q = search.trim().toLowerCase()
    const out: Row[] = []
    let balance = 0
    let group = 0
    for (const bill of book.bills) {
      const party = parties.get(bill.partyId)
      if (kind !== 'ALL' && party?.kind !== kind) continue
      const head = `${bill.billNo} ${bill.inwardNo} ${party?.name || ''}`.toLowerCase()
      const lines = bill.lines.filter(
        (l) =>
          (machine === '*' || l.machine === machine) &&
          (!q || head.includes(q) || l.description.toLowerCase().includes(q) || l.machine.toLowerCase().includes(q))
      )
      if (!lines.length) continue
      group += 1
      lines.forEach((line, i) => {
        balance += line.amount
        out.push({ bill, line, party, first: i === 0, last: i === lines.length - 1, span: lines.length, group, balance })
      })
    }
    return out
  }, [book, parties, search, machine, kind])

  const shownTotal = rows.reduce((t, r) => t + r.line.amount, 0)
  const shownQty = rows.reduce((t, r) => t + r.line.quantity, 0)

  const editLine = async (row: Row, patch: Partial<Pick<BillLine, 'description' | 'machine' | 'quantity' | 'rate'>>) => {
    const changed = Object.entries(patch).some(([k, v]) => (row.line as unknown as Record<string, unknown>)[k] !== v)
    if (!changed) return
    const bill = await save.run(() => accountsApi.updateLine(row.bill.id, row.line.id, row.bill.version, patch))
    if (bill) putBill(bill)
    else void reload()
  }

  const addLine = async (row: Row) => {
    const bill = await save.run(() =>
      accountsApi.addLine(row.bill.id, row.bill.version, { description: '', machine: row.line.machine, quantity: 1, rate: 0 }, row.line.id)
    )
    if (!bill) return void reload()
    putBill(bill)
    const added = bill.lines.find((l) => !row.bill.lines.some((o) => o.id === l.id))
    if (added) setEditingLine(added.id)
  }

  const removeLine = async (row: Row) => {
    const last = row.bill.lines.length === 1
    if (!window.confirm(last ? `Yeh bill (${row.bill.billNo || '-'}) ka aakhri item hai — poora bill delete ho jayega. Theek hai?` : `"${row.line.description || 'Item'}" delete karein?`)) return
    const r = await save.run(() => accountsApi.deleteLine(row.bill.id, row.line.id, row.bill.version))
    if (!r) return void reload()
    if (r.bill) putBill(r.bill)
    else putBill(null, row.bill.id)
  }

  const exportCSV = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      ['S.No', 'Date', 'Bill No', 'Inward No', 'Party', 'Type', 'Description', 'Machine', 'Qty', 'Rate', 'Total', 'Balance'].join(','),
      ...rows.map((r, i) =>
        [i + 1, r.bill.date, r.bill.billNo, r.bill.inwardNo, r.party?.name, r.party?.kind, r.line.description, r.line.machine, r.line.quantity, r.line.rate, r.line.amount, r.balance]
          .map(esc)
          .join(',')
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Daily_Inward_${month}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const cell = 'border border-slate-400 dark:border-slate-600'
  const lastCls = (r: Row) => r.last && 'border-b-2 border-b-slate-800 dark:border-b-slate-200'
  const title = month ? monthLabel(month) : ''

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Daily Inward — ${title}`}
        showTitle={false}
        actions={
          <div className="flex flex-wrap items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-2">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    closeSidebar()
                    setEditor({})
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0066cc] hover:bg-[#0052a3] text-white shadow-xs cursor-pointer !min-h-9 !h-9"
                >
                  <PlusCircle className="size-4" />
                  <span>Add Entry</span>
                </button>
              )}
              {book && <LockControl lock={book.lock} canEdit={canEditAccounts} onChanged={(lock) => setBook((b) => (b ? { ...b, lock } : b))} />}
            </div>
            <div className="flex items-center gap-2">
              <MonthPicker month={month} months={months} onChange={setMonth} />
              <button type="button" onClick={exportCSV} className="sara-allow-readonly erp-btn-secondary text-xs !min-h-9 !h-9 cursor-pointer">
                <Download className="size-3.5" />
                <span>Export CSV</span>
              </button>
              <button type="button" onClick={() => window.print()} className="sara-allow-readonly erp-btn-secondary text-xs !min-h-9 !h-9 cursor-pointer">
                <Printer className="size-3.5" />
                <span>Print</span>
              </button>
            </div>
          </div>
        }
      />

      <LoadState loading={loading} error={error} hasData={Boolean(book)}>
        <div className="erp-card overflow-hidden">
          <div className="px-3 pt-3">
            <SheetHeader
              title="DAILY INWARD & PURCHASE EXPENSES"
              subtitle={<>Month: {title}{locked ? ' · Locked' : ''}</>}
            />
          </div>
          <div className="p-3 border-b border-border flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30 print:hidden">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-60">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search description, party, bill..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="sara-allow-readonly w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#0066cc]"
                />
              </div>
              <div className="flex items-center gap-1.5 bg-background border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1">
                <Filter className="size-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground font-semibold">Machine:</span>
                <select value={machine} onChange={(e) => setMachine(e.target.value)} className="bg-transparent text-xs font-bold cursor-pointer" aria-label="Machine filter">
                  <option value="*">All machines</option>
                  <option value="">Machine nahi chuni</option>
                  {MACHINE_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m === 'ALL' ? 'ALL (general)' : m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5 bg-background border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1">
                <Building2 className="size-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground font-semibold">Party:</span>
                <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="bg-transparent text-xs font-bold cursor-pointer" aria-label="Party type filter">
                  <option value="ALL">All parties</option>
                  <option value="TRADER">Traders only</option>
                  <option value="WORKSHOP">Workshops only</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {save.node}
              <span className="text-xs font-semibold text-muted-foreground">
                {rows.length} items · {new Set(rows.map((r) => r.bill.id)).size} bills
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
              className="w-full text-left border-collapse text-xs border border-slate-400 dark:border-slate-600"
              style={{ tableLayout: 'fixed', minWidth: `${tableMinWidth}px` }}
            >
              <colgroup>
                <col style={{ width: widths.serialNo }} />
                <col style={{ width: widths.date }} />
                <col style={{ width: widths.billNo }} />
                <col style={{ width: widths.inwardNo }} />
                <col style={{ width: widths.party }} />
                <col style={{ width: widths.description }} />
                <col style={{ width: widths.machine }} />
                <col style={{ width: widths.qty }} />
                <col style={{ width: widths.rate }} />
                <col style={{ width: widths.total }} />
                <col style={{ width: widths.balance }} />
                <col className="print:hidden" style={{ width: widths.actions }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 font-bold uppercase text-[10px] border-b-2 border-slate-800">
                  <ResizableTh
                    columnKey="serialNo"
                    width={widths.serialNo}
                    minWidth={36}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className={cn(cell, 'py-2 px-1 text-center')}
                  >
                    S.No
                  </ResizableTh>
                  <ResizableTh
                    columnKey="date"
                    width={widths.date}
                    minWidth={75}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className={cn(cell, 'py-2 px-1 text-center')}
                  >
                    Date
                  </ResizableTh>
                  <ResizableTh
                    columnKey="billNo"
                    width={widths.billNo}
                    minWidth={65}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className={cn(cell, 'py-2 px-1 text-center')}
                  >
                    Bill No
                  </ResizableTh>
                  <ResizableTh
                    columnKey="inwardNo"
                    width={widths.inwardNo}
                    minWidth={55}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className={cn(cell, 'py-2 px-1 text-center')}
                  >
                    Inw #
                  </ResizableTh>
                  <ResizableTh
                    columnKey="party"
                    width={widths.party}
                    minWidth={120}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className={cn(cell, 'py-2 px-1 text-center')}
                  >
                    Party Name
                  </ResizableTh>
                  <ResizableTh
                    columnKey="description"
                    width={widths.description}
                    minWidth={140}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className={cn(cell, 'py-2 px-2 text-left')}
                  >
                    Description
                  </ResizableTh>
                  <ResizableTh
                    columnKey="machine"
                    width={widths.machine}
                    minWidth={70}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className={cn(cell, 'py-2 px-1 text-center')}
                  >
                    Machine
                  </ResizableTh>
                  <ResizableTh
                    columnKey="qty"
                    width={widths.qty}
                    minWidth={50}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className={cn(cell, 'py-2 px-1 text-center')}
                  >
                    Qty
                  </ResizableTh>
                  <ResizableTh
                    columnKey="rate"
                    width={widths.rate}
                    minWidth={70}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className={cn(cell, 'py-2 px-1 text-right')}
                  >
                    Rate
                  </ResizableTh>
                  <ResizableTh
                    columnKey="total"
                    width={widths.total}
                    minWidth={85}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className={cn(cell, 'py-2 px-1 text-right')}
                  >
                    Total
                  </ResizableTh>
                  <ResizableTh
                    columnKey="balance"
                    width={widths.balance}
                    minWidth={90}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className={cn(cell, 'py-2 px-1 text-right')}
                  >
                    Balance
                  </ResizableTh>
                  <ResizableTh
                    columnKey="actions"
                    width={widths.actions}
                    minWidth={120}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className={cn(cell, 'py-2 px-1 text-center print:hidden')}
                  >
                    Actions
                  </ResizableTh>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className={cn(cell, 'py-12 text-center text-muted-foreground')}>
                      <div className="flex flex-col items-center gap-2">
                        <Receipt className="size-8 text-slate-400" />
                        <p className="font-semibold text-sm">
                          {book?.bills.length ? 'Is filter ke mutabiq koi item nahi.' : `${title} mein abhi koi bill nahi.`}
                        </p>
                        {canEdit && !book?.bills.length && (
                          <button type="button" onClick={() => setEditor({})} className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0066cc] text-white cursor-pointer">
                            <PlusCircle className="size-4" /> Add first entry
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((r, idx) => {
                    const even = r.group % 2 === 0
                    const editing = canEdit && editingLine === r.line.id
                    const bg = even ? 'bg-slate-50/70 dark:bg-slate-800/40' : 'bg-white dark:bg-slate-900'
                    return (
                      <tr key={r.line.id} className={cn('group', bg, 'hover:bg-blue-50/40 dark:hover:bg-slate-700/50')}>
                        <td className={cn(cell, 'py-1.5 px-1 text-center font-mono text-slate-600 text-[11px]', lastCls(r))}>{idx + 1}</td>
                        {r.first && (
                          <>
                            <td rowSpan={r.span} className={cn(cell, 'px-1 text-center font-mono align-middle border-b-2 border-b-slate-800', bg)}>
                              {r.bill.date}
                            </td>
                            <td rowSpan={r.span} className={cn(cell, 'px-1 text-center font-mono font-bold align-middle border-b-2 border-b-slate-800', bg)}>
                              {r.bill.billNo || '-'}
                              <BillPhotosLink urls={r.bill.attachments} title={r.bill.billNo ? `Bill #${r.bill.billNo}` : 'Bill Photo'} />
                            </td>
                            <td rowSpan={r.span} className={cn(cell, 'px-1 text-center font-mono font-bold text-[#0066cc] align-middle border-b-2 border-b-slate-800', bg)}>
                              {r.bill.inwardNo || '-'}
                            </td>
                            <td rowSpan={r.span} className={cn(cell, 'px-2 py-2 text-center align-middle border-b-2 border-b-slate-800', partyTint(r.party?.slug || ''))}>
                              {r.party ? (
                                <Link
                                  href={`/accounts/${r.party.kind === 'WORKSHOP' ? 'workshops' : 'traders'}/${r.party.slug}?month=${month}`}
                                  className="font-bold text-xs hover:underline"
                                >
                                  {r.party.name}
                                </Link>
                              ) : (
                                '-'
                              )}
                              {r.span > 1 && (
                                <span className="block mx-auto mt-0.5 w-fit px-1.5 rounded text-[10px] font-mono bg-black/10">{r.span} items</span>
                              )}
                              {r.party?.kind === 'WORKSHOP' && <span className="block text-[9px] uppercase opacity-70">Workshop</span>}
                            </td>
                          </>
                        )}
                        <td className={cn(cell, 'py-1 px-2', lastCls(r))}>
                          {editing ? (
                            <input
                              autoFocus
                              defaultValue={r.line.description}
                              aria-label="Description"
                              onBlur={(e) => editLine(r, { description: e.target.value.trim() })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                if (e.key === 'Escape') setEditingLine(null)
                              }}
                              className="w-full px-2 py-1 text-xs bg-white border-2 border-[#0066cc] rounded"
                            />
                          ) : (
                            <span className="block truncate" title={r.line.description}>
                              {r.line.description || <span className="italic text-muted-foreground">(no description)</span>}
                            </span>
                          )}
                        </td>
                        <td className={cn(cell, 'py-1 px-0.5 text-center', lastCls(r))}>
                          {canEdit ? (
                            <select
                              value={r.line.machine}
                              aria-label="Machine"
                              onChange={(e) => editLine(r, { machine: e.target.value })}
                              className={cn('w-full max-w-[78px] px-1 py-0.5 rounded text-[9px] font-bold uppercase text-center cursor-pointer border-0', machineBadge(r.line.machine))}
                            >
                              {!r.line.machine && (
                                <option value="" className="bg-white text-slate-500">
                                  chunein
                                </option>
                              )}
                              {[...new Set([...MACHINE_OPTIONS, r.line.machine].filter(Boolean))].map((m) => (
                                <option key={m} value={m} className="bg-white text-slate-900">
                                  {m}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase', machineBadge(r.line.machine))}>{r.line.machine || '-'}</span>
                          )}
                        </td>
                        <td className={cn(cell, 'py-1 px-1 text-center font-mono font-semibold', lastCls(r))}>
                          {editing ? (
                            <input
                              type="number"
                              min={0}
                              step="any"
                              aria-label="Quantity"
                              defaultValue={r.line.quantity}
                              onBlur={(e) => editLine(r, { quantity: Number(e.target.value) || 0 })}
                              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                              className="w-12 px-1 py-0.5 text-xs text-center font-mono bg-white border-2 border-[#0066cc] rounded"
                            />
                          ) : (
                            qty(r.line.quantity)
                          )}
                        </td>
                        <td className={cn(cell, 'py-1 px-1 text-right font-mono', lastCls(r))}>
                          {editing ? (
                            <input
                              type="number"
                              min={0}
                              step="any"
                              aria-label="Rate"
                              defaultValue={r.line.rate}
                              onBlur={(e) => editLine(r, { rate: Number(e.target.value) || 0 })}
                              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                              className="w-20 px-1 py-0.5 text-xs text-right font-mono bg-white border-2 border-[#0066cc] rounded"
                            />
                          ) : (
                            qty(r.line.rate)
                          )}
                        </td>
                        <td className={cn(cell, 'py-1 px-1 text-right font-mono font-bold', lastCls(r))}>{rs(r.line.amount)}</td>
                        <td className={cn(cell, 'py-1 px-1 text-right font-mono font-bold', lastCls(r))}>{rs(r.balance)}</td>
                        <td className={cn(cell, 'py-1 px-1.5 text-center print:hidden', lastCls(r))}>
                          {canEdit && (
                            <div className="flex items-center justify-center gap-1 flex-nowrap whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => addLine(r)}
                                className="inline-flex items-center justify-center size-6 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 cursor-pointer transition-colors"
                                title={`Add item to bill ${r.bill.billNo || '-'}`}
                                aria-label="Add item to this bill"
                              >
                                <Plus className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingLine(editing ? null : r.line.id)}
                                className={cn(
                                  'inline-flex items-center justify-center size-6 rounded cursor-pointer transition-colors',
                                  editing
                                    ? 'bg-blue-100 text-[#0066cc] dark:bg-blue-950 dark:text-blue-300'
                                    : 'text-slate-500 hover:bg-blue-50 hover:text-[#0066cc] dark:hover:bg-slate-800 dark:hover:text-blue-400'
                                )}
                                title={editing ? 'Done' : 'Edit this item'}
                                aria-label="Edit item"
                              >
                                <Pencil className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeLine(r)}
                                className="inline-flex items-center justify-center size-6 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 cursor-pointer transition-colors"
                                title="Delete item"
                                aria-label="Delete item"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                              {r.first && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    closeSidebar()
                                    setEditor({ bill: r.bill })
                                  }}
                                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
                                  title="Edit whole bill (date, bill no., party, all items)"
                                >
                                  <Receipt className="size-3 text-blue-600 dark:text-blue-400" />
                                  <span>Bill</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-200 dark:bg-slate-800/80 font-black text-xs border-t-2 border-slate-800">
                    <td colSpan={7} className={cn(cell, 'py-2.5 px-3 text-right uppercase tracking-wider')}>
                      {rows.length === (book?.bills.reduce((t, b) => t + b.lines.length, 0) || 0) ? `Grand Total (${title})` : 'Total (filtered)'}:
                    </td>
                    <td className={cn(cell, 'px-2 text-center font-mono')}>{qty(shownQty)}</td>
                    <td className={cn(cell, 'px-2 text-right')}>-</td>
                    <td className={cn(cell, 'px-2 text-right font-mono text-[#0066cc]')}>{rs(shownTotal)}</td>
                    <td className={cn(cell, 'px-2 text-right font-mono text-purple-700')}>{rs(rows[rows.length - 1]?.balance || 0)}</td>
                    <td className={cn(cell, 'print:hidden')} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </LoadState>

      {editor && book && (
        <BillEditorModal
          month={month}
          parties={book.parties}
          bill={editor.bill}
          suggestedInwardNo={book.nextInwardNo}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            void reload()
          }}
        />
      )}
    </div>
  )
}

export default function DailyInwardExpenseUnifiedPage() {
  return (
    <Suspense fallback={null}>
      <DailyInwardContent />
    </Suspense>
  )
}
