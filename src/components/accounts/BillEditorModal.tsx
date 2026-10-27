'use client'

import { useEffect, useMemo, useState } from 'react'
import { Receipt, X, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { lineAmount, monthLabel, slugifyPartyName, rs } from '@/lib/accounts/util'
import { MACHINE_OPTIONS, type Bill, type Party, type PartyKind } from '@/lib/accounts/types'
import { accountsApi, type LineDraft } from '@/services/accounts/accountsApi'
import { PictureStrip } from '@/components/shared/PictureStrip'
import { closeSidebar } from '@/lib/sidebarToggle'

type Draft = { key: string; id?: string; description: string; machine: string; quantity: string; rate: string }

let seq = 0
const blank = (machine = 'G-6200'): Draft => ({ key: `n${++seq}`, description: '', machine, quantity: '1', rate: '' })

/**
 * Add a new bill, or edit a whole bill (header + all items). One Save = one request,
 * so a bill is never half saved.
 */
export function BillEditorModal({
  month,
  parties,
  bill,
  suggestedInwardNo,
  onClose,
  onSaved,
}: {
  month: string
  parties: Party[]
  /** Editing this bill; omit to add a new one. */
  bill?: Bill
  suggestedInwardNo?: string
  onClose: () => void
  onSaved: (bill: Bill | null) => void
}) {
  const party = bill ? parties.find((p) => p.id === bill.partyId) : undefined
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    closeSidebar()
  }, [])

  const [date, setDate] = useState(bill?.date || (today.startsWith(month) ? today : `${month}-01`))
  const [billNo, setBillNo] = useState(bill?.billNo || '')
  const [inwardNo, setInwardNo] = useState(bill?.inwardNo || suggestedInwardNo || '')
  const [partyName, setPartyName] = useState(party?.name || '')
  const [newKind, setNewKind] = useState<PartyKind>('TRADER')
  const [remarks, setRemarks] = useState(bill?.remarks || '')
  const [attachments, setAttachments] = useState<string[]>(bill?.attachments || [])
  const [rows, setRows] = useState<Draft[]>(
    bill
      ? bill.lines.map((l) => ({ key: l.id, id: l.id, description: l.description, machine: l.machine, quantity: String(l.quantity), rate: String(l.rate) }))
      : [blank()]
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active = useMemo(() => parties.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name)), [parties])
  const matched = useMemo(() => {
    const slug = slugifyPartyName(partyName)
    return slug ? parties.find((p) => p.slug === slug) : undefined
  }, [partyName, parties])
  const total = rows.reduce((s, r) => s + lineAmount(Number(r.quantity), Number(r.rate)), 0)

  const setRow = (key: string, patch: Partial<Draft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const lines: LineDraft[] = rows
      .filter((r) => r.description.trim())
      .map((r) => ({ id: r.id, description: r.description.trim(), machine: r.machine, quantity: Number(r.quantity) || 0, rate: Number(r.rate) || 0 }))
    if (!partyName.trim()) return setError('Party name likhein.')
    if (!lines.length) return setError('Kam az kam ek item ki description likhein.')
    if (!date.startsWith(month) && !window.confirm(`Bill ki date ${date} hai magar yeh ${monthLabel(month)} ki sheet mein jayega. Theek hai?`)) return
    setBusy(true)
    try {
      if (bill) {
        let partyId = matched?.id
        if (!partyId) partyId = (await accountsApi.createParty({ name: partyName.trim(), kind: newKind })).id
        onSaved(await accountsApi.updateBill(bill.id, bill.version, { date, billNo, inwardNo, partyId, remarks, lines, attachments }))
      } else {
        onSaved(
          await accountsApi.createBill({
            month,
            date,
            billNo,
            inwardNo,
            remarks,
            lines,
            attachments,
            ...(matched ? { partyId: matched.id } : { partyName: partyName.trim(), partyKind: newKind }),
          })
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save nahi hua.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!bill || !window.confirm(`Bill ${bill.billNo || '-'} (${party?.name || ''}) ke tamam ${bill.lines.length} items delete karein?`)) return
    setBusy(true)
    try {
      await accountsApi.deleteBill(bill.id, bill.version)
      onSaved(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete nahi hua.')
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full px-2.5 py-1.5 text-xs bg-background border border-slate-300 dark:border-slate-700 rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#0066cc]'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-5xl bg-background rounded-xl border border-border shadow-2xl my-6">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Receipt className="size-5 text-[#0066cc]" />
            <h3 className="font-bold text-base">{bill ? 'Edit Bill' : 'Add Inward / Purchase Entry'}</h3>
            <span className="ml-2 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-[#0066cc]">{monthLabel(month)}</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-muted cursor-pointer" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-600">Date *</span>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-600">Bill No</span>
              <input value={billNo} onChange={(e) => setBillNo(e.target.value)} className={cn(input, 'font-mono')} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-600">Inward No</span>
              <input value={inwardNo} onChange={(e) => setInwardNo(e.target.value)} className={cn(input, 'font-mono')} />
            </label>
            <label className="space-y-1 col-span-2 md:col-span-3">
              <span className="text-[11px] font-semibold text-slate-600">Party (Trader / Workshop) *</span>
              <input
                list="acc-party-list"
                required
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                placeholder="Naam likhein ya list se chunein"
                className={input}
              />
              <datalist id="acc-party-list">
                {active.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.kind === 'WORKSHOP' ? 'Workshop' : 'Trader'}
                  </option>
                ))}
              </datalist>
              {partyName.trim() &&
                (matched ? (
                  <span className="text-[11px] text-slate-500">
                    {matched.kind === 'WORKSHOP' ? 'Workshop' : 'Trader'}
                    {!matched.active && ' · removed party — save karne se wapas aa jayegi'}
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-[11px] text-amber-700">
                    Nayi party banegi:
                    <select value={newKind} onChange={(e) => setNewKind(e.target.value as PartyKind)} className="border rounded px-1 py-0.5 text-[11px]">
                      <option value="TRADER">Trader</option>
                      <option value="WORKSHOP">Workshop</option>
                    </select>
                  </span>
                ))}
            </label>
          </div>

          <div className="overflow-x-auto border border-slate-300 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 text-[10px] uppercase font-bold text-slate-700">
                <tr>
                  <th className="py-2 px-2 w-8">#</th>
                  <th className="py-2 px-2 text-left">Description *</th>
                  <th className="py-2 px-2 w-28">Machine</th>
                  <th className="py-2 px-2 w-20">Qty</th>
                  <th className="py-2 px-2 w-28">Rate</th>
                  <th className="py-2 px-2 w-28 text-right">Total</th>
                  <th className="py-2 px-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} className="border-t border-slate-200">
                    <td className="px-2 text-center text-slate-500">{i + 1}</td>
                    <td className="px-1 py-1">
                      <input value={r.description} onChange={(e) => setRow(r.key, { description: e.target.value })} className={input} aria-label={`Item ${i + 1} description`} />
                    </td>
                    <td className="px-1">
                      <select value={r.machine} onChange={(e) => setRow(r.key, { machine: e.target.value })} className={input} aria-label={`Item ${i + 1} machine`}>
                        <option value="">— chunein —</option>
                        {[...new Set([...MACHINE_OPTIONS, r.machine].filter(Boolean))].map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1">
                      <input type="number" min={0} step="any" value={r.quantity} onChange={(e) => setRow(r.key, { quantity: e.target.value })} className={cn(input, 'text-center font-mono')} aria-label={`Item ${i + 1} qty`} />
                    </td>
                    <td className="px-1">
                      <input type="number" min={0} step="any" value={r.rate} onChange={(e) => setRow(r.key, { rate: e.target.value })} className={cn(input, 'text-right font-mono')} aria-label={`Item ${i + 1} rate`} />
                    </td>
                    <td className="px-2 text-right font-mono font-bold">{rs(lineAmount(Number(r.quantity), Number(r.rate)))}</td>
                    <td className="px-1 text-center">
                      {rows.length > 1 && (
                        <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer" aria-label="Remove item">
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-400 bg-slate-50 font-bold">
                  <td colSpan={2} className="px-2 py-2">
                    <button type="button" onClick={() => setRows((rs) => [...rs, blank(rs[rs.length - 1]?.machine)])} className="inline-flex items-center gap-1 text-[#0066cc] cursor-pointer">
                      <Plus className="size-3.5" /> Add item
                    </button>
                  </td>
                  <td colSpan={3} className="px-2 text-right uppercase text-[11px]">Bill total</td>
                  <td className="px-2 text-right font-mono text-[#0066cc]">{rs(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Remarks</span>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className={input} />
          </label>

          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Bill ki tasveer (kaghaz wala bill)</span>
            <PictureStrip urls={attachments} onChange={setAttachments} kind="bill" editable label="Bill photo" />
          </div>

          {error && <div className="alert alert-danger py-2 px-3 small mb-0">{error}</div>}

          <div className="flex items-center justify-between gap-2 pt-1">
            <div>
              {bill && (
                <button type="button" disabled={busy} onClick={remove} className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-700 border border-rose-200 hover:bg-rose-50 cursor-pointer">
                  Delete bill
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="erp-btn-secondary text-xs cursor-pointer">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg text-xs font-bold bg-[#0066cc] hover:bg-[#0052a3] text-white cursor-pointer disabled:opacity-60">
                {busy ? 'Saving…' : bill ? 'Save bill' : 'Add bill'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
