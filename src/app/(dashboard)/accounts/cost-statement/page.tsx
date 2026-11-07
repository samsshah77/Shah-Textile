'use client'

import { Suspense, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Edit3, Eye, RotateCcw, Save, Printer, Link2, Plus, Trash2 } from 'lucide-react'
import { SheetHeader } from '@/components/shared/SheetHeader'
import { PageHeader } from '@/components/shared/PageHeader'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { monthLabel, rs } from '@/lib/accounts/util'
import type { CostInputs, CostStatement, NamedAmount } from '@/lib/accounts/types'
import { accountsApi } from '@/services/accounts/accountsApi'
import { useAccountsData, useAccountsMonth } from '@/hooks/useAccounts'
import { LoadState, LockControl, MonthPicker } from '@/components/accounts/ui'

type Money = number | undefined

function Badge({ label, tone = 'sky' }: { label: string; tone?: 'sky' | 'amber' | 'slate' }) {
  const t =
    tone === 'amber'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : tone === 'slate'
        ? 'bg-slate-50 text-slate-600 border-slate-200'
        : 'bg-sky-50 text-sky-700 border-sky-200'
  return (
    <span className={cn('ml-2 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide border print:hidden', t)}>
      <Link2 className="size-2.5" />
      {label}
    </span>
  )
}

function Block({
  title,
  total,
  badge,
  rows,
  editRow,
}: {
  title: React.ReactNode
  total: number
  badge?: React.ReactNode
  rows: { label: React.ReactNode; value: number; key?: string; name?: string }[]
  editRow?: (row: { label: React.ReactNode; value: number; key?: string; name?: string }) => React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden mb-4">
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
            <th className="py-2.5 px-3 text-left font-sans w-2/3 border-r border-slate-200">
              {title}
              {badge}
            </th>
            <th className="py-2.5 px-3 text-right font-bold text-slate-900 bg-slate-100/60">{rs(total)}</th>
          </tr>
        </thead>
        {rows.length > 0 && (
          <tbody className="divide-y divide-slate-200">
            {rows.map((r, i) => (
              <tr key={r.key || i}>
                <td className="py-2 px-3 border-r border-slate-200 font-sans text-slate-700">
                  <div className="flex items-center gap-1">{r.label}</div>
                </td>
                <td className="py-1.5 px-3 text-right">{editRow ? editRow(r) : rs(r.value)}</td>
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  )
}

/**
 * Final Cost Statement — Excel layout. Salaries come from the Salary sheets, purchases
 * from Daily Inward (only this month), petty cash from the journal, meters from the
 * production ledger; the accountant types the manual lines and saves them per month.
 */
function CostStatementContent() {
  const { canEditAccounts } = useAuth()
  const { month, setMonth, months } = useAccountsMonth()
  const { data: cs, setData, error, loading } = useAccountsData<CostStatement | null>(
    () => (month ? accountsApi.cost(month) : Promise.resolve(null)),
    [month]
  )
  const [draft, setDraft] = useState<CostInputs | null>(null)
  const [busy, setBusy] = useState(false)
  const editing = draft !== null

  // Typed manual lines are only kept after Save — warn before leaving the page.
  useEffect(() => {
    if (!editing) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [editing])
  const canEdit = canEditAccounts && cs && !cs.lock.locked

  const startEdit = () => cs && setDraft(JSON.parse(JSON.stringify(cs.inputs)) as CostInputs)
  const setField = (k: keyof CostInputs, v: Money) => setDraft((d) => (d ? { ...d, [k]: v } : d))
  const setAdmin = (k: keyof NonNullable<CostInputs['adminExpenses']>, v: Money) =>
    setDraft((d) => (d ? { ...d, adminExpenses: { ...(d.adminExpenses || {}), [k]: v } } : d))
  const store = (draft?.storeInventory ?? cs?.storeInventory ?? []) as NamedAmount[]
  const setStore = (list: NamedAmount[]) => setDraft((d) => (d ? { ...d, storeInventory: list } : d))

  /** A heading / row name: the saved one (or the default); a text box while editing. */
  const labelText = (key: string, def: string) => {
    const saved = (editing ? draft?.labels?.[key] : cs?.inputs?.labels?.[key])?.trim()
    return saved || def
  }
  const setLabel = (key: string, def: string, text: string) =>
    setDraft((d) => {
      if (!d) return d
      const labels = { ...(d.labels || {}) }
      if (!text.trim() || text.trim() === def) delete labels[key]
      else labels[key] = text
      return { ...d, labels }
    })
  const L = (key: string, def: string, className?: string) =>
    editing ? (
      <input
        aria-label={`Naam: ${def}`}
        value={draft?.labels?.[key] ?? def}
        onChange={(e) => setLabel(key, def, e.target.value)}
        className={cn('w-full max-w-md bg-amber-50 border border-amber-300 rounded px-2 py-0.5 font-sans text-slate-800', className)}
      />
    ) : (
      labelText(key, def)
    )

  const save = async () => {
    if (!cs || !draft) return
    setBusy(true)
    try {
      setData(await accountsApi.saveCost(month, cs.inputsVersion, draft))
      setDraft(null)
    } catch {
      // banner shown
    } finally {
      setBusy(false)
    }
  }
  const reset = async () => {
    if (!cs || !cs.inputsVersion) return
    if (!window.confirm(`${monthLabel(month)} ki save ki hui manual values hata dein? Pichle saved mahine ki values wapas aa jayengi.`)) return
    setBusy(true)
    try {
      setData(await accountsApi.resetCost(month, cs.inputsVersion))
      setDraft(null)
    } catch {
      // banner shown
    } finally {
      setBusy(false)
    }
  }

  const num = (v: Money, on: (v: Money) => void, label: string) => (
    <input
      type="number"
      step="any"
      min={0}
      aria-label={label}
      value={v ?? ''}
      onChange={(e) => on(e.target.value === '' ? undefined : Number(e.target.value))}
      className="w-36 text-right font-mono bg-amber-50 border border-amber-300 rounded px-2 py-0.5"
    />
  )
  // ---- Row order (Edit → ▲ ▼): saved per list, carried to later months like the names.
  const orderOf = (group: string): string[] => (editing ? draft?.order?.[group] : cs?.inputs?.order?.[group]) || []
  /** Rows in the saved order; rows not in it (new contractor / party) after them, as they came. */
  const arrange = <T extends { id: string }>(group: string, items: T[]): T[] => {
    const order = orderOf(group)
    const at = (id: string) => {
      const i = order.indexOf(id)
      return i < 0 ? order.length : i
    }
    return items.map((it, i) => ({ it, i })).sort((a, b) => at(a.it.id) - at(b.it.id) || a.i - b.i).map((x) => x.it)
  }
  const moveTo = (group: string, ids: string[], i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    const next = [...ids]
    ;[next[i], next[j]] = [next[j], next[i]]
    setDraft((d) => (d ? { ...d, order: { ...(d.order || {}), [group]: next } } : d))
  }
  const moveBtns = (count: number, i: number, onMove: (dir: -1 | 1) => void) =>
    editing ? (
      <span className="inline-flex shrink-0 print:hidden">
        <button
          type="button"
          disabled={i === 0}
          onClick={() => onMove(-1)}
          className="p-0.5 text-slate-500 hover:text-[#0066cc] disabled:opacity-25 cursor-pointer"
          aria-label="Upar"
          title="Upar"
        >
          <ArrowUp className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={i === count - 1}
          onClick={() => onMove(1)}
          className="p-0.5 text-slate-500 hover:text-[#0066cc] disabled:opacity-25 cursor-pointer"
          aria-label="Neeche"
          title="Neeche"
        >
          <ArrowDown className="size-3.5" />
        </button>
      </span>
    ) : null
  /** Block rows in order, with ▲ ▼ in front of each name while editing. */
  const ordered = <T extends { id: string; label: React.ReactNode }>(group: string, items: T[]): T[] => {
    const list = arrange(group, items)
    const ids = list.map((r) => r.id)
    return list.map((r, i) => ({
      ...r,
      label: (
        <>
          {moveBtns(list.length, i, (dir) => moveTo(group, ids, i, dir))}
          {r.label}
        </>
      ),
    }))
  }
  const moveStore = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= store.length) return
    const next = [...store]
    ;[next[i], next[j]] = [next[j], next[i]]
    setStore(next)
  }

  const manual = (key: keyof CostInputs, label: string, value: number, btns?: React.ReactNode) => (
    <tr key={key}>
      <td className="py-2 px-3 border-r border-slate-200 font-sans text-slate-700 font-semibold">
        <div className="flex items-center gap-1">
          {btns}
          {L(key, label)}
        </div>
      </td>
      <td className="py-1.5 px-3 text-right font-mono">
        {editing ? num(draft?.[key] as Money, (v) => setField(key, v), labelText(key, label)) : rs(value)}
      </td>
    </tr>
  )

  const manualSource = cs
    ? cs.sources.manualFrom === 'saved'
      ? 'Manual · saved'
      : cs.sources.manualFrom === 'previous-month'
        ? `Manual · ${monthLabel(cs.sources.manualFromMonth || '')} se`
        : 'Manual · not entered'
    : ''

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-16">
      <PageHeader
        title={`Cost Statement — ${month ? monthLabel(month) : ''}`}
        showTitle={false}
        actions={
          <div className="flex flex-wrap items-center justify-between gap-2 w-full">
            <div className="flex items-center gap-2">
              {cs && <LockControl lock={cs.lock} canEdit={canEditAccounts} onChanged={(lock) => setData((s) => (s ? { ...s, lock } : s))} />}
              {canEdit &&
                (editing ? (
                  <>
                    <button type="button" disabled={busy} onClick={save} className="erp-btn-success text-xs !min-h-9 !h-9 cursor-pointer">
                      <Save className="size-3.5" /> {busy ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setDraft(null)} className="erp-btn-secondary text-xs !min-h-9 !h-9 cursor-pointer">
                      <Eye className="size-3.5" /> Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={startEdit} className="erp-btn-secondary text-xs !min-h-9 !h-9 cursor-pointer">
                    <Edit3 className="size-3.5" /> Edit
                  </button>
                ))}
              {canEdit && cs?.inputsVersion ? (
                <button type="button" disabled={busy} onClick={reset} className="erp-btn-secondary text-xs !min-h-9 !h-9 cursor-pointer" title="Is mahine ki saved manual values hata dein">
                  <RotateCcw className="size-3.5" /> Reset
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <MonthPicker month={month} months={months} onChange={(m) => (setDraft(null), setMonth(m))} />
              <button type="button" onClick={() => window.print()} className="sara-allow-readonly erp-btn-primary text-xs !min-h-9 !h-9 cursor-pointer">
                <Printer className="size-3.5" /> Print
              </button>
            </div>
          </div>
        }
      />

      <LoadState loading={loading} error={error} hasData={Boolean(cs)}>
        {cs && (
          <div className="erp-card p-6 sm:p-8 bg-white print:p-0 print:border-none print:shadow-none">
            {editing && (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 print:hidden">
                Peelay khaane badal sakte hain — har heading aur line ka naam bhi, aur ▲ ▼ se lines ki tarteeb. Salaries, contractors, purchases aur petty cash ki raqam
                apni sheets se khud aati hai (contractor / party ke naam bhi wahin se). Badle hue naam aur tarteeb agle mahinon mein bhi rehte hain.
              </div>
            )}
            <div className="mb-5">
              <SheetHeader
                title="COST STATEMENT"
                subtitle={
                  editing ? (
                    <input
                      aria-label="Period title"
                      value={draft?.period ?? cs.period}
                      onChange={(e) => setDraft((d) => (d ? { ...d, period: e.target.value } : d))}
                      className="text-right bg-amber-50 border border-amber-300 rounded px-2"
                    />
                  ) : (
                    cs.period
                  )
                }
              />
              <p className="-mt-2 text-right text-[10px] text-slate-500 print:hidden">{manualSource}</p>
            </div>

            <h3 className="text-xs font-bold uppercase tracking-wider mb-3">{L('h_cop', 'Cost Of Production', 'uppercase')}</h3>
            <Block
              title={L('h_salaries', 'Salaries & Wages')}
              total={cs.salariesAndWages.total}
              badge={<Badge label="Salary sheets" />}
              rows={ordered('salaries', [
                { id: 'sal_contract', key: 'sal_contract', label: L('sal_contract', 'Contract Employee Salary'), value: cs.salariesAndWages.staffSalary },
                { id: 'sal_contractOt', key: 'sal_contractOt', label: L('sal_contractOt', 'Contract Employee Overtime'), value: cs.salariesAndWages.staffOvertime },
                { id: 'sal_contractEff', key: 'sal_contractEff', label: L('sal_contractEff', 'Contract Employee Efficency'), value: cs.salariesAndWages.contractEmployeeEfficiency },
                { id: 'sal_weaver', key: 'sal_weaver', label: L('sal_weaver', 'Weaver Wages'), value: cs.salariesAndWages.weaverWages },
                { id: 'sal_weaverHol', key: 'sal_weaverHol', label: L('sal_weaverHol', 'Weaver Holy Days Amount'), value: cs.salariesAndWages.weaverHolidays },
                { id: 'sal_weaverEff', key: 'sal_weaverEff', label: L('sal_weaverEff', 'Weaver Efficency'), value: cs.salariesAndWages.weaverEfficiency },
                { id: 'sal_helper', key: 'sal_helper', label: L('sal_helper', 'Helper Wages'), value: cs.salariesAndWages.helperWages },
              ])}
            />
            <Block
              title={L('h_contractors', 'Contractors Bill Amount')}
              total={cs.contractorsTotal}
              badge={<Badge label="Contractors sheet" />}
              rows={ordered(
                'contractors',
                cs.contractorsBills.map((c) => ({
                  id: c.name.trim().toLowerCase(),
                  key: `c:${c.name}`,
                  label: `${c.name}${c.role ? ` (${c.role})` : ''}`,
                  value: c.amount,
                }))
              )}
            />

            <div className="rounded-lg border border-slate-200 overflow-hidden mb-4">
              <table className="w-full text-xs border-collapse">
                <tbody className="divide-y divide-slate-200">
                  {(() => {
                    const list = arrange('lines1', [
                      { id: 'powerAndLight', label: 'Power & Light', value: cs.powerAndLight },
                      { id: 'vehicleFuel', label: 'Vehicle Fuel', value: cs.vehicleFuel },
                      { id: 'generatorFuel', label: 'Generator Fuel', value: cs.generatorFuel },
                    ] as { id: keyof CostInputs; label: string; value: number }[])
                    const ids = list.map((r) => r.id)
                    return list.map((r, i) =>
                      manual(r.id, r.label, r.value, moveBtns(list.length, i, (dir) => moveTo('lines1', ids, i, dir)))
                    )
                  })()}
                </tbody>
              </table>
            </div>

            <Block title={L('h_machinery', 'Machinery Parts / Traders')} total={cs.machineryTotal} badge={<Badge label="Daily Inward" />} rows={ordered('machinery', cs.machineryParts.map((r) => ({ id: r.name.trim().toLowerCase(), key: `p:${r.name}`, label: r.name, value: r.amount })))} />
            <Block title={L('h_electric', 'Electric / Maintenance')} total={cs.electricTotal} badge={<Badge label="Daily Inward" />} rows={ordered('electric', cs.electricMaintenance.map((r) => ({ id: r.name.trim().toLowerCase(), key: `p:${r.name}`, label: r.name, value: r.amount })))} />
            <Block title={L('h_repair', 'Repair Expense')} total={cs.repairTotal} badge={<Badge label="Daily Inward" />} rows={ordered('repair', cs.repairDetails.map((r) => ({ id: r.name.trim().toLowerCase(), key: `p:${r.name}`, label: r.name, value: r.amount })))} />

            <div className="rounded-lg border border-slate-200 overflow-hidden mb-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                    <th className="py-2.5 px-3 text-left font-sans w-2/3 border-r border-slate-200">
                      {L('h_store', 'Store Inventory Expense')}
                      <Badge label="Manual · items issued from store" tone="amber" />
                    </th>
                    <th className="py-2.5 px-3 text-right font-mono font-bold bg-slate-100/60">
                      {rs(store.reduce((t, s) => t + (Number(s.amount) || 0), 0))}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {store.map((s, i) => (
                    <tr key={i}>
                      <td className="py-1.5 px-3 border-r border-slate-200">
                        {editing ? (
                          <div className="flex items-center gap-1">
                            {moveBtns(store.length, i, (dir) => moveStore(i, dir))}
                            <input
                              aria-label="Store item"
                              value={s.name}
                              onChange={(e) => setStore(store.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                              className="flex-1 bg-amber-50 border border-amber-300 rounded px-2 py-0.5"
                            />
                            <button type="button" onClick={() => setStore(store.filter((_, j) => j !== i))} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer" aria-label="Remove store item">
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        ) : (
                          s.name
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono">
                        {editing
                          ? num(s.amount, (v) => setStore(store.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x))), 'Store item amount')
                          : rs(s.amount)}
                      </td>
                    </tr>
                  ))}
                  {editing && (
                    <tr>
                      <td colSpan={2} className="py-1.5 px-3">
                        <button type="button" onClick={() => setStore([...store, { name: '', amount: 0 }])} className="inline-flex items-center gap-1 text-xs font-bold text-[#0066cc] cursor-pointer">
                          <Plus className="size-3.5" /> Add store item
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-slate-200 overflow-hidden mb-4">
              <table className="w-full text-xs border-collapse">
                <tbody className="divide-y divide-slate-200">
                  {(() => {
                    const list = arrange('lines2', [
                      { id: 'waterSupplies', label: 'Water Supplies', value: cs.waterSupplies },
                      { id: 'pettyCash', label: 'Petty Cash', value: cs.pettyCash },
                      { id: 'guardSalary', label: 'Guard Salary', value: cs.guardSalary },
                      { id: 'solarPanelSystem', label: 'Solar Panel System', value: cs.solarPanelSystem },
                      { id: 'depreciationProduction', label: 'Depreciation Exp (Production)', value: cs.depreciationProduction },
                    ])
                    const ids = list.map((r) => r.id)
                    return list.map((r, i) => {
                      const btns = moveBtns(list.length, i, (dir) => moveTo('lines2', ids, i, dir))
                      if (r.id !== 'pettyCash') return manual(r.id as keyof CostInputs, r.label, r.value, btns)
                      return (
                        <tr key="pettyCash">
                          <td className="py-2 px-3 border-r border-slate-200 font-sans text-slate-700 font-semibold">
                            <div className="flex items-center gap-1">
                              {btns}
                              {L('pettyCash', 'Petty Cash')} <Badge label="Petty cash journal" />
                            </div>
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono">{rs(cs.pettyCash)}</td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-slate-900 text-white px-4 py-3 mb-6 font-bold">
              <span className="uppercase text-xs tracking-wider flex-1">{L('t_cop', 'Total Cost Of Production', 'text-slate-900 uppercase')}</span>
              <span className="font-mono">{rs(cs.totalCostOfProduction)}</span>
            </div>

            <Block
              title={L('h_admin', 'Admin & Selling Exp')}
              total={cs.adminTotal}
              badge={<Badge label="Manual" tone="amber" />}
              rows={ordered('admin', [
                { id: 'salaries', label: L('adm_salaries', 'Salaries'), name: labelText('adm_salaries', 'Salaries'), value: cs.adminExpenses.salaries, key: 'salaries' },
                { id: 'overtime', label: L('adm_overtime', 'Overtime'), name: labelText('adm_overtime', 'Overtime'), value: cs.adminExpenses.overtime, key: 'overtime' },
                {
                  id: 'telephoneInternet',
                  label: L('adm_telephone', 'Telephone & Internet'),
                  name: labelText('adm_telephone', 'Telephone & Internet'),
                  value: cs.adminExpenses.telephoneInternet,
                  key: 'telephoneInternet',
                },
                {
                  id: 'depreciationAdmin',
                  label: L('adm_depreciation', 'Depreciation Exp (Admin)'),
                  name: labelText('adm_depreciation', 'Depreciation Exp (Admin)'),
                  value: cs.adminExpenses.depreciationAdmin,
                  key: 'depreciationAdmin',
                },
              ])}
              editRow={
                editing
                  ? (r) => {
                      const k = r.key as keyof NonNullable<CostInputs['adminExpenses']>
                      return num(draft?.adminExpenses?.[k], (v) => setAdmin(k, v), r.name || String(r.key))
                    }
                  : undefined
              }
            />

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="rounded-lg bg-[#0066cc] text-white px-4 py-3">
                <div className="text-[10px] uppercase font-bold opacity-80">{L('t_conversion', 'Total Conversion Cost', 'text-slate-900 normal-case')}</div>
                <div className="text-xl font-black font-mono">{rs(cs.totalConversionCost)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 px-4 py-3">
                <div className="text-[10px] uppercase font-bold text-slate-500">
                  {L('t_meters', 'Monthly Production (m)', 'normal-case')}
                  <span className="ml-1 normal-case font-normal">{cs.sources.meters === 'saved' ? '· manual' : '· production ledger'}</span>
                </div>
                <div className="text-xl font-black font-mono">
                  {editing
                    ? num(draft?.monthlyProductionMeters ?? undefined, (v) => setField('monthlyProductionMeters', v), 'Monthly production meters')
                    : rs(cs.monthlyProductionMeters)}
                </div>
                {editing && <div className="text-[10px] text-slate-500">Khaali chhorein to production module ke meters lagenge.</div>}
              </div>
              <div className="rounded-lg border border-slate-200 px-4 py-3">
                <div className="text-[10px] uppercase font-bold text-slate-500">{L('t_perMeter', 'Per Meter Cost', 'normal-case')}</div>
                <div className="text-xl font-black font-mono">{cs.perMeterCost ? cs.perMeterCost.toFixed(2) : '—'}</div>
              </div>
            </div>
          </div>
        )}
      </LoadState>
    </div>
  )
}

export default function CostStatementPage() {
  return (
    <Suspense fallback={null}>
      <CostStatementContent />
    </Suspense>
  )
}
