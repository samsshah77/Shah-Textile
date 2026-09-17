'use client'

import { useState, useEffect, useMemo } from 'react'
import { accountsData } from '@/data/accountsData'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import {
  DollarSign,
  Printer,
  Calculator,
  Save,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  TrendingDown,
  RotateCcw,
  Edit3,
  Eye,
  Info,
} from 'lucide-react'

interface NamedItem {
  name: string
  amount: number
  role?: string
}

interface StoreItem {
  item: string
  amount: number
}

export interface CostStatementModel {
  companyName: string
  title: string
  period: string
  salariesAndWages: {
    staffSalary: number
    staffOvertime: number
    contractEmployeeEfficiency: number
    weaverWages: number
    weaverHolidays: number
    weaverEfficiency: number
    helperWages: number
  }
  contractorsBills: NamedItem[]
  powerAndLight: number
  vehicleFuel: number
  generatorFuel: number
  machineryParts: NamedItem[]
  electricMaintenance: NamedItem[]
  repairExpense: number
  repairDetails: NamedItem[]
  storeInventory: StoreItem[]
  waterSupplies: number
  pettyCash: number
  guardSalary: number
  solarPanelSystem: number
  depreciationProduction: number
  adminExpenses: {
    salaries: number
    overtime: number
    telephoneInternet: number
    depreciationAdmin: number
  }
  monthlyProductionMeters: number
}

const DEFAULT_COST_STATEMENT: CostStatementModel = {
  companyName: 'SARA TEXTILE',
  title: 'COST STATEMENT',
  period: 'For The Month of Aug-2026',
  salariesAndWages: {
    staffSalary: 584280,
    staffOvertime: 80353,
    contractEmployeeEfficiency: 43865,
    weaverWages: 718950,
    weaverHolidays: 87850,
    weaverEfficiency: 108246,
    helperWages: 347200,
  },
  contractorsBills: [
    { name: 'Amir', role: 'PU Technician', amount: 70000 },
    { name: 'Basit', role: 'Electronics Contractor', amount: 70000 },
    { name: 'Naseer', role: 'Reed Repair', amount: 5500 },
    { name: 'Nawab', role: 'Gitta Winder', amount: 30000 },
    { name: 'Zafar Gul', role: 'Chowkidar', amount: 32000 },
    { name: 'Shoaib', role: 'Electrical Helper', amount: 25000 },
    { name: 'Rehbar Ali', role: 'Hand Knotting', amount: 83549 },
    { name: 'Shahid', role: 'Machine Knotting', amount: 34100 },
    { name: 'Nazim Hussain', role: 'Sarning', amount: 28200 },
  ],
  powerAndLight: 1975726,
  vehicleFuel: 48000,
  generatorFuel: 0,
  machineryParts: [
    { name: 'Fahad Traders', amount: 23400 },
    { name: 'A.A.I Engineering', amount: 4000 },
    { name: 'Janjoha Brothers', amount: 140000 },
    { name: 'G.Q Fire Services', amount: 94900 },
    { name: 'Blue Reed', amount: 173106 },
    { name: 'Muhammad Ali', amount: 15300 },
    { name: 'F.T Traders', amount: 52300 },
    { name: 'VIP Petroleum', amount: 14000 },
    { name: 'A.A Engineering', amount: 60300 },
  ],
  electricMaintenance: [
    { name: 'Textile Engineering', amount: 68545 },
    { name: 'JAB Electronics', amount: 0 },
    { name: 'SMD Traders', amount: 28700 },
  ],
  repairExpense: 3000,
  repairDetails: [
    { name: 'Marhaba Engineering Works', amount: 3000 },
  ],
  storeInventory: [
    { item: 'Spocket Belt G-6200 (1 Pieces)', amount: 12600 },
    { item: 'Rapier Tape G-6200  (1 Pieces)', amount: 20000 },
  ],
  waterSupplies: 60000,
  pettyCash: 167145,
  guardSalary: 60000,
  solarPanelSystem: 400000,
  depreciationProduction: 136677,
  adminExpenses: {
    salaries: 120000,
    overtime: 47333,
    telephoneInternet: 8070,
    depreciationAdmin: 9673,
  },
  monthlyProductionMeters: 104183,
}

const STORAGE_KEY = 'sara_textile_cost_statement_editable_v1'

export default function CostStatementPage() {
  const [data, setData] = useState<CostStatementModel>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) return JSON.parse(stored) as CostStatementModel
      } catch (err) {
        console.error(err)
      }
    }
    return DEFAULT_COST_STATEMENT
  })

  const [isEditing, setIsEditing] = useState(false)
  const [isSaved, setIsSaved] = useState(false)

  // =========================================================================
  // LIVE EXCEL FORMULAS COMPUTATION
  // =========================================================================
  // Formula: =SUM(C8:C14)
  const totalSalariesAndWages = useMemo<number>(() => {
    return Object.values(data.salariesAndWages).reduce((s: number, v: number) => s + (Number(v) || 0), 0)
  }, [data.salariesAndWages])

  // Formula: =SUM(C17:C25)
  const totalContractorsBills = useMemo<number>(() => {
    return data.contractorsBills.reduce((s: number, b: NamedItem) => s + (Number(b.amount) || 0), 0)
  }, [data.contractorsBills])

  // Formula: =SUM(C35:C43)
  const totalMachineryParts = useMemo<number>(() => {
    return data.machineryParts.reduce((s: number, t: NamedItem) => s + (Number(t.amount) || 0), 0)
  }, [data.machineryParts])

  // Formula: =SUM(C46:C48)
  const totalElectricMaintenance = useMemo<number>(() => {
    return data.electricMaintenance.reduce((s: number, t: NamedItem) => s + (Number(t.amount) || 0), 0)
  }, [data.electricMaintenance])

  // Formula: =SUM(C51:C52)
  const totalRepairExpense = useMemo<number>(() => {
    return data.repairDetails.reduce((s: number, r: NamedItem) => s + (Number(r.amount) || 0), 0)
  }, [data.repairDetails])

  // Formula: =SUM(C55:C56)
  const totalStoreInventory = useMemo<number>(() => {
    return data.storeInventory.reduce((s: number, it: StoreItem) => s + (Number(it.amount) || 0), 0)
  }, [data.storeInventory])

  // Overheads direct lines
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

  // Formula: =SUM(D7:D62) -> Total Cost Of Production
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

  // Formula: =SUM(C67:C70) -> Admin & Selling Exp
  const totalAdminExp = useMemo(() => {
    return Object.values(data.adminExpenses).reduce((s, v) => s + (Number(v) || 0), 0)
  }, [data.adminExpenses])

  // Formula: =SUM(D64:D66) -> TOTAL CONVERSION COST
  const totalConversionCost = useMemo(() => {
    return totalCostOfProduction + totalAdminExp
  }, [totalCostOfProduction, totalAdminExp])

  // Formula: =D72/D74 -> Per Meter Cost
  const monthlyMeters = Number(data.monthlyProductionMeters) || 104183
  const perMeterCost = monthlyMeters > 0 ? totalConversionCost / monthlyMeters : 0

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  const handleSave = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    }
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2500)
  }

  const handleReset = () => {
    if (confirm('Reset all values to the authentic Excel original (Conversion Cost: PKR 6,091,868)?')) {
      setData(DEFAULT_COST_STATEMENT)
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY)
      }
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2000)
    }
  }

  // Update handlers
  const updateSalary = (key: keyof typeof data.salariesAndWages, val: number) => {
    setData((prev: typeof data) => ({
      ...prev,
      salariesAndWages: { ...prev.salariesAndWages, [key]: val },
    }))
  }

  const updateContractor = (index: number, amount: number) => {
    setData((prev: typeof data) => {
      const copy = [...prev.contractorsBills]
      copy[index] = { ...copy[index], amount }
      return { ...prev, contractorsBills: copy }
    })
  }

  const updateMachinery = (index: number, amount: number) => {
    setData((prev: typeof data) => {
      const copy = [...prev.machineryParts]
      copy[index] = { ...copy[index], amount }
      return { ...prev, machineryParts: copy }
    })
  }

  const updateElectric = (index: number, amount: number) => {
    setData((prev: typeof data) => {
      const copy = [...prev.electricMaintenance]
      copy[index] = { ...copy[index], amount }
      return { ...prev, electricMaintenance: copy }
    })
  }

  const updateStoreInventory = (index: number, amount: number) => {
    setData((prev: typeof data) => {
      const copy = [...prev.storeInventory]
      copy[index] = { ...copy[index], amount }
      return { ...prev, storeInventory: copy }
    })
  }

  const updateAdmin = (key: keyof typeof data.adminExpenses, val: number) => {
    setData((prev: typeof data) => ({
      ...prev,
      adminExpenses: { ...prev.adminExpenses, [key]: val },
    }))
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & TOOLBAR                                                   */}
      {/* ========================================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="erp-badge-blue">
              Accounts Module • Dynamic Cost Statement
            </span>
            <span className="text-xs font-semibold text-slate-500">• August 2026</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl mt-1.5">
            Mill Cost Statement & Conversion Cost
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Real Excel mathematical formula engine with editable inputs & instant reactive recalculation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Edit Mode Toggle */}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer shadow-xs border',
              isEditing
                ? 'bg-amber-600 text-white border-amber-600 shadow-amber-600/20'
                : 'erp-btn-secondary'
            )}
          >
            {isEditing ? <Eye className="size-3.5" /> : <Edit3 className="size-3.5 text-amber-600" />}
            <span>{isEditing ? 'View Mode' : 'Edit Cells & Formulas'}</span>
          </button>

          {/* Reset Button */}
          <button
            onClick={handleReset}
            title="Reset to Authentic Excel Defaults"
            className="erp-btn-secondary"
          >
            <RotateCcw className="size-3.5" />
            <span>Reset</span>
          </button>

          {/* Save Button */}
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer shadow-xs"
          >
            <Save className="size-3.5 text-emerald-600" />
            <span>{isSaved ? 'Saved!' : 'Save Edits'}</span>
          </button>

          {/* Print Button */}
          <button
            onClick={handlePrint}
            className="erp-btn-primary"
          >
            <Printer className="size-3.5" />
            <span>Print A4 Statement</span>
          </button>
        </div>
      </div>

      {/* Mode Banner Indicator */}
      {isEditing && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <Edit3 className="size-4 text-amber-600 shrink-0" />
            <span>
              <strong>Edit Mode Active:</strong> You can edit any numeric cell below. Formulas (highlighted with <code className="bg-amber-200 dark:bg-amber-900/60 px-1 py-0.2 rounded font-mono font-black">fx: =SUM(...)</code>) will automatically recompute all totals and the per-meter cost live!
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
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">Staff & Contract Employee Salary</td>
                    <td className="py-2 px-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.salariesAndWages.staffSalary}
                          onChange={(e) => updateSalary('staffSalary', Number(e.target.value))}
                          className="w-32 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.salariesAndWages.staffSalary, 0)
                      )}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">Staff & Contract Employee Overtime</td>
                    <td className="py-2 px-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.salariesAndWages.staffOvertime}
                          onChange={(e) => updateSalary('staffOvertime', Number(e.target.value))}
                          className="w-32 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.salariesAndWages.staffOvertime, 0)
                      )}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">Contract Employee Efficency</td>
                    <td className="py-2 px-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.salariesAndWages.contractEmployeeEfficiency}
                          onChange={(e) => updateSalary('contractEmployeeEfficiency', Number(e.target.value))}
                          className="w-32 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.salariesAndWages.contractEmployeeEfficiency, 0)
                      )}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">Weaver Wages</td>
                    <td className="py-2 px-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.salariesAndWages.weaverWages}
                          onChange={(e) => updateSalary('weaverWages', Number(e.target.value))}
                          className="w-32 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.salariesAndWages.weaverWages, 0)
                      )}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">Weaver Holy Days Amount</td>
                    <td className="py-2 px-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.salariesAndWages.weaverHolidays}
                          onChange={(e) => updateSalary('weaverHolidays', Number(e.target.value))}
                          className="w-32 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.salariesAndWages.weaverHolidays, 0)
                      )}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">Weaver Efficency</td>
                    <td className="py-2 px-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.salariesAndWages.weaverEfficiency}
                          onChange={(e) => updateSalary('weaverEfficiency', Number(e.target.value))}
                          className="w-32 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.salariesAndWages.weaverEfficiency, 0)
                      )}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">Helper Wages</td>
                    <td className="py-2 px-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.salariesAndWages.helperWages}
                          onChange={(e) => updateSalary('helperWages', Number(e.target.value))}
                          className="w-32 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.salariesAndWages.helperWages, 0)
                      )}
                    </td>
                  </tr>
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
                  {data.contractorsBills.map((b, idx) => (
                    <tr key={b.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans text-slate-700 dark:text-slate-300">
                        {b.name} ({b.role})
                      </td>
                      <td className="py-2 px-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            value={b.amount}
                            onChange={(e) => updateContractor(idx, Number(e.target.value))}
                            className="w-32 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                          />
                        ) : (
                          formatNumber(b.amount, 0)
                        )}
                      </td>
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
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 font-sans w-2/3">Petty Cash</td>
                    <td className="py-2 px-3 text-right text-xs font-bold">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data.pettyCash}
                          onChange={(e) => setData({ ...data, pettyCash: Number(e.target.value) })}
                          className="w-36 rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-right font-mono text-xs font-bold focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
                        />
                      ) : (
                        formatNumber(data.pettyCash, 0)
                      )}
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
