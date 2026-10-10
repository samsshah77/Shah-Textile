'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  expenseService,
  type CostStatementModel,
  type NamedCostItem,
  type StoreCostItem,
} from '@/services/expenseService'
import { formatNumber, cn } from '@/lib/utils'
import {
  Printer,
  Save,
  RotateCcw,
  Edit3,
  Eye,
  Link2,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'

const COST_MONTH = '2026-08'

export default function CostStatementPage() {
  const [data, setData] = useState<CostStatementModel>(() =>
    expenseService.buildCostStatement(COST_MONTH)
  )
  const [isEditing, setIsEditing] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [traderListsDirty, setTraderListsDirty] = useState(false)

  const reload = () => {
    setData(expenseService.buildCostStatement(COST_MONTH))
    setTraderListsDirty(false)
  }

  useEffect(() => {
    reload()
    const handleSync = () => reload()
    window.addEventListener('payroll_synced', handleSync)
    window.addEventListener('accounts_synced', handleSync)
    return () => {
      window.removeEventListener('payroll_synced', handleSync)
      window.removeEventListener('accounts_synced', handleSync)
    }
  }, [])

  // =========================================================================
  // LIVE EXCEL FORMULAS COMPUTATION
  // =========================================================================
  const totalSalariesAndWages = useMemo<number>(() => {
    return Object.values(data.salariesAndWages).reduce((s: number, v: number) => s + (Number(v) || 0), 0)
  }, [data.salariesAndWages])

  const totalContractorsBills = useMemo<number>(() => {
    return data.contractorsBills.reduce((s: number, b: NamedCostItem) => s + (Number(b.amount) || 0), 0)
  }, [data.contractorsBills])

  const totalMachineryParts = useMemo<number>(() => {
    return data.machineryParts.reduce((s: number, t: NamedCostItem) => s + (Number(t.amount) || 0), 0)
  }, [data.machineryParts])

  const totalElectricMaintenance = useMemo<number>(() => {
    return data.electricMaintenance.reduce((s: number, t: NamedCostItem) => s + (Number(t.amount) || 0), 0)
  }, [data.electricMaintenance])

  const totalRepairExpense = useMemo<number>(() => {
    return data.repairDetails.reduce((s: number, r: NamedCostItem) => s + (Number(r.amount) || 0), 0)
  }, [data.repairDetails])

  const totalStoreInventory = useMemo<number>(() => {
    return data.storeInventory.reduce((s: number, it: StoreCostItem) => s + (Number(it.amount) || 0), 0)
  }, [data.storeInventory])

  const totalOverheads = useMemo(() => {
    return (
      (Number(data.powerAndLight) || 0) +
      (Number(data.vehicleFuel) || 0) +
      (Number(data.generatorFuel) || 0) +
      (Number(data.waterSupplies) || 0) +
      (Number(data.pettyCash) || 0) +
      (Number(data.guardSalary) || 0) +
      (Number(data.solarPanelSystem) || 0) +
      (Number(data.depreciationProduction) || 0)
    )
  }, [data])

  const totalCostOfProduction = useMemo(() => {
    return (
      totalSalariesAndWages +
      totalContractorsBills +
      totalMachineryParts +
      totalElectricMaintenance +
      totalRepairExpense +
      totalStoreInventory +
      totalOverheads
    )
  }, [
    totalSalariesAndWages,
    totalContractorsBills,
    totalMachineryParts,
    totalElectricMaintenance,
    totalRepairExpense,
    totalStoreInventory,
    totalOverheads,
  ])

  const totalAdminExp = useMemo(() => {
    return Object.values(data.adminExpenses).reduce((s, v) => s + (Number(v) || 0), 0)
  }, [data.adminExpenses])

  const totalConversionCost = useMemo(() => {
    return totalCostOfProduction + totalAdminExp
  }, [totalCostOfProduction, totalAdminExp])

  const monthlyMeters = Number(data.monthlyProductionMeters) || 104183
  const perMeterCost = monthlyMeters > 0 ? totalConversionCost / monthlyMeters : 0

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print()
  }

  const handleSave = () => {
    expenseService.saveCostStatementModel(data, { persistTraderLists: traderListsDirty })
    setTraderListsDirty(false)
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2500)
  }

  const handleReset = () => {
    if (
      confirm(
        'Reset manual Cost Statement overrides? Live payroll / petty cash / traders lines will rebuild from source sheets.'
      )
    ) {
      setData(expenseService.resetCostStatement(COST_MONTH))
      setTraderListsDirty(false)
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2000)
    }
  }

  const updateMachinery = (index: number, amount: number) => {
    setTraderListsDirty(true)
    setData((prev) => {
      const copy = [...prev.machineryParts]
      copy[index] = { ...copy[index], amount }
      return { ...prev, machineryParts: copy }
    })
  }

  const updateElectric = (index: number, amount: number) => {
    setTraderListsDirty(true)
    setData((prev) => {
      const copy = [...prev.electricMaintenance]
      copy[index] = { ...copy[index], amount }
      return { ...prev, electricMaintenance: copy }
    })
  }

  const updateStoreInventory = (index: number, amount: number) => {
    setTraderListsDirty(true)
    setData((prev) => {
      const copy = [...prev.storeInventory]
      copy[index] = { ...copy[index], amount }
      return { ...prev, storeInventory: copy }
    })
  }

  const updateAdmin = (key: keyof CostStatementModel['adminExpenses'], val: number) => {
    setData((prev) => ({
      ...prev,
      adminExpenses: { ...prev.adminExpenses, [key]: val },
    }))
  }

  const LinkedBadge = ({ label }: { label: string }) => (
    <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-sky-50 dark:bg-sky-950/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800 print:hidden">
      <Link2 className="size-2.5" />
      {label}
            </span>
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div className="print:hidden">
        <PageHeader
          title="Cost Statement"
          showTitle={false}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Accounts', href: '/accounts/cost-statement' },
            { label: 'Cost Statement' },
          ]}
          actions={
            <>
              <div className="inline-flex shrink-0 items-center gap-1.5" />
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  className={cn(
                    'erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800',
                    isEditing && '!border-amber-400 !bg-amber-50 !text-amber-900'
                  )}
                >
                  {isEditing ? <Eye className="size-3.5" /> : <Edit3 className="size-3.5" />}
                  <span>{isEditing ? 'View' : 'Edit'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  title="Reset to Authentic Excel Defaults"
                  className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800"
                >
                  <RotateCcw className="size-3.5" />
                  <span>Reset</span>
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="erp-btn-success text-xs !min-h-9 !h-9"
                >
                  <Save className="size-3.5" />
                  <span>{isSaved ? 'Saved!' : 'Save'}</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="erp-btn-primary text-xs !min-h-9 !h-9"
                >
                  <Printer className="size-3.5" />
                  <span>Print</span>
                </button>
              </div>
            </>
          }
        />
      </div>

      {/* Mode Banner Indicator */}
      {isEditing && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <Edit3 className="size-4 text-amber-600 shrink-0" />
            <span>
              <strong>Edit Mode:</strong> Manual lines (power, fuel, admin, meters, trader overrides) are editable.
              Linked blocks (<Link2 className="inline size-3" /> Payroll / Petty Cash) refresh automatically from source sheets.
            </span>
          </div>
          <button
            onClick={() => setIsEditing(false)}
            className="font-bold underline ml-2 cursor-pointer"
          >
            Done Editing
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. A4 PRINTABLE SPREADSHEET (Exact Layout of 08. Cost Statement)          */}
      {/* ========================================================================= */}
      <div className="erp-card p-6 sm:p-8 shadow-xs print:p-0 print:border-none print:shadow-none bg-white dark:bg-slate-900">
        {/* Mill Header */}
        <div className="text-center border-b border-slate-200 dark:border-slate-700 pb-4 mb-6">
          <h1 className="text-2xl font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
            {data.companyName}
          </h1>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 tracking-wide mt-0.5">
            {data.title}
          </h2>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
            {data.period}
          </p>
        </div>

        <div className="space-y-6">
          {/* Main Section: Cost Of Production */}
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-3">
              Cost Of Production
            </h3>

            {/* 1. Salaries & Wages Block */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden mb-4">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300">
                    <th className="py-2.5 px-3 text-left font-sans w-2/3 border-r border-slate-200 dark:border-slate-700">
                      Salaries & Wages
                      <LinkedBadge label="Payroll" />
                      {isEditing && (
                        <span className="ml-2 text-[10px] font-mono text-purple-600 dark:text-purple-400 font-bold">
                          fx: =SUM(C8:C14)
                        </span>
                      )}
                    </th>
                    <th className="py-2.5 px-3 text-right text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-100/60 dark:bg-slate-800/60">
                      {formatNumber(totalSalariesAndWages, 0)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {(
                    [
                      ['Staff & Contract Employee Salary', data.salariesAndWages.staffSalary],
                      ['Staff & Contract Employee Overtime', data.salariesAndWages.staffOvertime],
                      ['Contract Employee Efficency', data.salariesAndWages.contractEmployeeEfficiency],
                      ['Weaver Wages', data.salariesAndWages.weaverWages],
                      ['Weaver Holy Days Amount', data.salariesAndWages.weaverHolidays],
                      ['Weaver Efficency', data.salariesAndWages.weaverEfficiency],
                      ['Helper Wages', data.salariesAndWages.helperWages],
                    ] as const
                  ).map(([label, value]) => (
                    <tr key={label} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">
                        {label}
                    </td>
                      <td className="py-2 px-3 text-right">{formatNumber(value, 0)}</td>
                  </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 2. Contractors Bill Amount Block */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden mb-4">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300">
                    <th className="py-2.5 px-3 text-left font-sans w-2/3 border-r border-slate-200 dark:border-slate-700">
                      Contractors Bill Amount
                      <LinkedBadge label="Payroll" />
                      {isEditing && (
                        <span className="ml-2 text-[10px] font-mono text-purple-600 dark:text-purple-400 font-bold">
                          fx: =SUM(C17:C25)
                        </span>
                      )}
                    </th>
                    <th className="py-2.5 px-3 text-right text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-100/60 dark:bg-slate-800/60">
                      {formatNumber(totalContractorsBills, 0)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {data.contractorsBills.map((b) => (
                    <tr key={b.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">
                        {b.name}{b.role ? ` (${b.role})` : ''}
                      </td>
                      <td className="py-2 px-3 text-right">{formatNumber(b.amount, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 3. Power, Fuel & Energy Single Rows */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden mb-4">
              <table className="w-full text-xs font-mono border-collapse">
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  <tr className="bg-slate-50/60 dark:bg-slate-800/60 font-semibold text-slate-800 dark:text-slate-200">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans w-2/3">Power & Light</td>
                    <td className="py-2 px-3 text-right text-xs font-bold">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.powerAndLight}
                          onChange={(e) => setData({ ...data, powerAndLight: Number(e.target.value) })}
                          className="w-36 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.powerAndLight, 0)
                      )}
                    </td>
                  </tr>
                  <tr className="bg-slate-50/60 dark:bg-slate-800/60 font-semibold text-slate-800 dark:text-slate-200">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans w-2/3">Vehicle Fuel</td>
                    <td className="py-2 px-3 text-right text-xs font-bold">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.vehicleFuel}
                          onChange={(e) => setData({ ...data, vehicleFuel: Number(e.target.value) })}
                          className="w-36 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.vehicleFuel, 0)
                      )}
                    </td>
                  </tr>
                  <tr className="bg-slate-50/60 dark:bg-slate-800/60 font-semibold text-slate-800 dark:text-slate-200">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans w-2/3">Generator Fuel</td>
                    <td className="py-2 px-3 text-right text-xs font-bold">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.generatorFuel}
                          onChange={(e) => setData({ ...data, generatorFuel: Number(e.target.value) })}
                          className="w-36 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : data.generatorFuel > 0 ? (
                        formatNumber(data.generatorFuel, 0)
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 4. Machinery Parts / Traders Block */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden mb-4">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300">
                    <th className="py-2.5 px-3 text-left font-sans w-2/3 border-r border-slate-200 dark:border-slate-700">
                      Machinery Parts / Traders
                      <LinkedBadge label="Traders" />
                      {isEditing && (
                        <span className="ml-2 text-[10px] font-mono text-purple-600 dark:text-purple-400 font-bold">
                          fx: =SUM(C35:C43)
                        </span>
                      )}
                    </th>
                    <th className="py-2.5 px-3 text-right text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-100/60 dark:bg-slate-800/60">
                      {formatNumber(totalMachineryParts, 0)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {data.machineryParts.map((t, idx) => (
                    <tr key={t.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">{t.name}</td>
                      <td className="py-2 px-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            value={t.amount}
                            onChange={(e) => updateMachinery(idx, Number(e.target.value))}
                            className="w-32 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                          />
                        ) : (
                          formatNumber(t.amount, 0)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 5. Electric / Maintenance Block */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden mb-4">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300">
                    <th className="py-2.5 px-3 text-left font-sans w-2/3 border-r border-slate-200 dark:border-slate-700">
                      Electric / Maintenance
                      {isEditing && (
                        <span className="ml-2 text-[10px] font-mono text-purple-600 dark:text-purple-400 font-bold">
                          fx: =SUM(C46:C48)
                        </span>
                      )}
                    </th>
                    <th className="py-2.5 px-3 text-right text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-100/60 dark:bg-slate-800/60">
                      {formatNumber(totalElectricMaintenance, 0)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {data.electricMaintenance.map((t, idx) => (
                    <tr key={t.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">{t.name}</td>
                      <td className="py-2 px-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            value={t.amount}
                            onChange={(e) => updateElectric(idx, Number(e.target.value))}
                            className="w-32 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                          />
                        ) : t.amount > 0 ? (
                          formatNumber(t.amount, 0)
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 6. Repair Expense */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden mb-4">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300">
                    <th className="py-2.5 px-3 text-left font-sans w-2/3 border-r border-slate-200 dark:border-slate-700">
                      Repair Expense
                      {isEditing && (
                        <span className="ml-2 text-[10px] font-mono text-purple-600 dark:text-purple-400 font-bold">
                          fx: =SUM(C51:C52)
                        </span>
                      )}
                    </th>
                    <th className="py-2.5 px-3 text-right text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-100/60 dark:bg-slate-800/60">
                      {formatNumber(totalRepairExpense, 0)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {data.repairDetails.map((r, idx) => (
                    <tr key={r.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">{r.name}</td>
                      <td className="py-2 px-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            value={r.amount}
                            onChange={(e) => {
                              setTraderListsDirty(true)
                              const copy = [...data.repairDetails]
                              copy[idx] = { ...copy[idx], amount: Number(e.target.value) }
                              setData({ ...data, repairDetails: copy, repairExpense: Number(e.target.value) })
                            }}
                            className="w-32 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                          />
                        ) : (
                          formatNumber(r.amount, 0)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 7. Store Inventory Expense */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden mb-4">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300">
                    <th className="py-2.5 px-3 text-left font-sans w-2/3 border-r border-slate-200 dark:border-slate-700">
                      Store Inventory Expense
                      {isEditing && (
                        <span className="ml-2 text-[10px] font-mono text-purple-600 dark:text-purple-400 font-bold">
                          fx: =SUM(C55:C56)
                        </span>
                      )}
                    </th>
                    <th className="py-2.5 px-3 text-right text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-100/60 dark:bg-slate-800/60">
                      {formatNumber(totalStoreInventory, 0)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {data.storeInventory.map((item, idx) => (
                    <tr key={item.item} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">{item.item}</td>
                      <td className="py-2 px-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            value={item.amount}
                            onChange={(e) => updateStoreInventory(idx, Number(e.target.value))}
                            className="w-32 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                          />
                        ) : (
                          formatNumber(item.amount, 0)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 8. Overheads Direct Block */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden mb-6">
              <table className="w-full text-xs font-mono border-collapse">
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  <tr className="bg-slate-50/60 dark:bg-slate-800/60 font-semibold text-slate-800 dark:text-slate-200">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans w-2/3">Water Supplies</td>
                    <td className="py-2 px-3 text-right text-xs font-bold">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.waterSupplies}
                          onChange={(e) => setData({ ...data, waterSupplies: Number(e.target.value) })}
                          className="w-36 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.waterSupplies, 0)
                      )}
                    </td>
                  </tr>
                  <tr className="bg-slate-50/60 dark:bg-slate-800/60 font-semibold text-slate-800 dark:text-slate-200">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans w-2/3">
                      Petty Cash
                      <LinkedBadge label="Petty Cash" />
                    </td>
                    <td className="py-2 px-3 text-right text-xs font-bold">
                      {formatNumber(data.pettyCash, 0)}
                    </td>
                  </tr>
                  <tr className="bg-slate-50/60 dark:bg-slate-800/60 font-semibold text-slate-800 dark:text-slate-200">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans w-2/3">Guard Salary</td>
                    <td className="py-2 px-3 text-right text-xs font-bold">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.guardSalary}
                          onChange={(e) => setData({ ...data, guardSalary: Number(e.target.value) })}
                          className="w-36 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.guardSalary, 0)
                      )}
                    </td>
                  </tr>
                  <tr className="bg-slate-50/60 dark:bg-slate-800/60 font-semibold text-slate-800 dark:text-slate-200">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans w-2/3">Solar Panel System</td>
                    <td className="py-2 px-3 text-right text-xs font-bold">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.solarPanelSystem}
                          onChange={(e) => setData({ ...data, solarPanelSystem: Number(e.target.value) })}
                          className="w-36 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.solarPanelSystem, 0)
                      )}
                    </td>
                  </tr>
                  <tr className="bg-slate-50/60 dark:bg-slate-800/60 font-semibold text-slate-800 dark:text-slate-200">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans w-2/3">Depreciation Exp (Production)</td>
                    <td className="py-2 px-3 text-right text-xs font-bold">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.depreciationProduction}
                          onChange={(e) => setData({ ...data, depreciationProduction: Number(e.target.value) })}
                          className="w-36 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.depreciationProduction, 0)
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Total Cost of Production Row */}
            <div className="rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 p-3.5 flex justify-between items-center font-bold text-sm">
              <span className="font-sans uppercase text-slate-800 dark:text-slate-200">
                Total Cost Of Production
                {isEditing && (
                  <span className="ml-2 text-[11px] font-mono text-purple-600 dark:text-purple-400">
                    fx: =SUM(D7:D62)
                  </span>
                )}
              </span>
              <span className="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                {formatNumber(totalCostOfProduction, 0)}
              </span>
            </div>
          </div>

          {/* Section: Admin & Selling Exp */}
          <div className="pt-2">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-3">
              Admin & Selling Exp
            </h3>

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden mb-4">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300">
                    <th className="py-2.5 px-3 text-left font-sans w-2/3 border-r border-slate-200 dark:border-slate-700">
                      Admin & Selling Exp Total
                      {isEditing && (
                        <span className="ml-2 text-[10px] font-mono text-purple-600 dark:text-purple-400 font-bold">
                          fx: =SUM(C67:C70)
                        </span>
                      )}
                    </th>
                    <th className="py-2.5 px-3 text-right text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-100/60 dark:bg-slate-800/60">
                      {formatNumber(totalAdminExp, 0)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">Salaries</td>
                    <td className="py-2 px-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.adminExpenses.salaries}
                          onChange={(e) => updateAdmin('salaries', Number(e.target.value))}
                          className="w-32 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.adminExpenses.salaries, 0)
                      )}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">Overtime</td>
                    <td className="py-2 px-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.adminExpenses.overtime}
                          onChange={(e) => updateAdmin('overtime', Number(e.target.value))}
                          className="w-32 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.adminExpenses.overtime, 0)
                      )}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">Telephone & Internet</td>
                    <td className="py-2 px-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.adminExpenses.telephoneInternet}
                          onChange={(e) => updateAdmin('telephoneInternet', Number(e.target.value))}
                          className="w-32 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.adminExpenses.telephoneInternet, 0)
                      )}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">Depreciation Exp (Admin)</td>
                    <td className="py-2 px-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.adminExpenses.depreciationAdmin}
                          onChange={(e) => updateAdmin('depreciationAdmin', Number(e.target.value))}
                          className="w-32 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.adminExpenses.depreciationAdmin, 0)
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Conversion & Per-Meter Cost Highlight Box */}
          <div className="rounded-xl border border-slate-300 dark:border-slate-700 p-4 bg-slate-50/80 dark:bg-slate-800/50 space-y-3 mt-6">
            <div className="flex justify-between items-center text-sm font-bold">
              <span className="uppercase text-slate-800 dark:text-slate-200">
                TOTAL CONVERSION COST
                {isEditing && (
                  <span className="ml-2 text-xs font-mono text-purple-600 dark:text-purple-400">
                    fx: =SUM(D64:D66)
                  </span>
                )}
              </span>
              <span className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400">
                {formatNumber(totalConversionCost, 0)}
              </span>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-2.5 flex justify-between items-center text-xs">
              <span className="font-sans font-semibold text-slate-600 dark:text-slate-400">Monthly Production (Meters):</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {isEditing ? (
                  <input
                    type="number"
                    value={data.monthlyProductionMeters}
                    onChange={(e) => setData({ ...data, monthlyProductionMeters: Number(e.target.value) })}
                    className="w-36 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold bg-background focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                  />
                ) : (
                  `${formatNumber(monthlyMeters, 0)} Meters`
                )}
              </span>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-2.5 flex justify-between items-center text-sm font-bold text-slate-900 dark:text-slate-100">
              <span className="uppercase">
                Per Meter Cost
                {isEditing && (
                  <span className="ml-2 text-xs font-mono text-purple-600 dark:text-purple-400 font-bold">
                    fx: =D72/D74
                  </span>
                )}
              </span>
              <span className="font-mono text-base font-bold bg-[#0066cc]/10 text-[#0066cc] dark:text-sky-300 px-3 py-1 rounded-md border border-[#0066cc]/20">
                PKR {perMeterCost.toFixed(2)} / m
              </span>
            </div>
          </div>
        </div>

        {/* Footer Signatures for Official A4 Format */}
        <div className="grid grid-cols-3 gap-8 pt-10 mt-8 text-center text-xs font-semibold text-slate-600 dark:text-slate-400">
          <div className="border-t border-slate-300 dark:border-slate-700 pt-2">Prepared By: Mill Accountant</div>
          <div className="border-t border-slate-300 dark:border-slate-700 pt-2">Checked By: Accounts Head</div>
          <div className="border-t border-slate-300 dark:border-slate-700 pt-2">Approved By: Chief Executive</div>
        </div>
      </div>
    </div>
  )
}
