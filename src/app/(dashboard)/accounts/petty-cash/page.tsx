'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { PettyCashEntry } from '@/types/expense'
import { expenseService } from '@/services/expenseService'
import { PettyCashForm } from '@/components/accounts/PettyCashForm'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  FileSpreadsheet,
  RotateCcw,
  Trash2,
  CheckCircle2,
  Download,
  Printer,
} from 'lucide-react'
import { accountsData } from '@/data/accountsData'

const INITIAL_AUTHENTIC_PETTY_CASH: PettyCashEntry[] = accountsData.dailyExpense.pettyCash.map((item, idx) => ({
  id: `pc-${item.sNo || idx + 1}`,
  date: item.date || '2026-08-01',
  description: item.description,
  debitAmount: item.debit || 0,
  creditAmount: item.credit || 0,
  balance: item.balance || 0,
}))

export default function PettyCashPage() {
  const [entries, setEntries] = useState<PettyCashEntry[]>([])
  const [search, setSearch] = useState('')
  const [isSaved, setIsSaved] = useState(false)

  const refreshData = () => {
    const list = expenseService.getPettyCashEntries()
    setEntries(list)
  }

  useEffect(() => {
    refreshData()
  }, [])

  // =========================================================================
  // REACTIVE EXCEL FORMULAS COMPUTATION
  // =========================================================================
  // Excel formula: Balance_n = Balance_{n-1} + Debit_n - Credit_n
  const computedEntries = useMemo(() => {
    let runningBalance = 0
    return entries.map((entry, idx) => {
      const dr = Number(entry.debitAmount) || 0
      const cr = Number(entry.creditAmount) || 0

      if (idx === 0 && entry.description.toLowerCase().includes('balance b/f')) {
        runningBalance = entry.balance || (dr - cr)
      } else {
        runningBalance = runningBalance + dr - cr
      }

      return {
        ...entry,
        debitAmount: dr,
        creditAmount: cr,
        balance: runningBalance,
      }
    })
  }, [entries])

  const currentBalance = computedEntries.length > 0 ? computedEntries[computedEntries.length - 1].balance : 0
  const totalDebit = useMemo(() => computedEntries.reduce((s, e) => s + e.debitAmount, 0), [computedEntries])
  const totalCredit = useMemo(() => computedEntries.reduce((s, e) => s + e.creditAmount, 0), [computedEntries])

  // Operational cash expenses (excluding salary and contractor bulk pass-through payments)
  const operationalExpenses = useMemo(() => {
    return computedEntries
      .filter((e) => !e.description.toLowerCase().includes('paid salaries'))
      .reduce((s, e) => s + e.creditAmount, 0)
  }, [computedEntries])

  const filteredEntries = useMemo(() => {
    if (!search.trim()) return computedEntries
    const q = search.toLowerCase()
    return computedEntries.filter(
      (entry) => entry.description.toLowerCase().includes(q) || entry.date.toLowerCase().includes(q)
    )
  }, [computedEntries, search])

  const handleDelete = (id: string) => {
    if (confirm('Delete this cash entry? Running balances will recalculate automatically.')) {
      const updated = entries.filter((e) => e.id !== id)
      expenseService.savePettyCashEntries(updated)
      refreshData()
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2000)
    }
  }

  const handleReset = () => {
    if (confirm('Reset Petty Cash Ledger to authentic Excel defaults (27 transactions • Closing PKR 4,635)?')) {
      expenseService.savePettyCashEntries(INITIAL_AUTHENTIC_PETTY_CASH)
      refreshData()
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2000)
    }
  }

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  const exportCSV = () => {
    const headers = ['S.No', 'Date', 'Description', 'Debit (Cash In)', 'Credit (Cash Out)', 'Balance']
    const rows = filteredEntries.map((e, idx) => [
      idx + 1,
      e.date,
      `"${e.description}"`,
      e.debitAmount,
      e.creditAmount,
      e.balance,
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', 'Sara_Textile_Petty_Cash_Aug2026.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6 pb-16">
      {/* ========================================================================= */}
      {/* 1. HEADER SECTION                                                         */}
      {/* ========================================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Accounts Module • Dynamic Petty Cash
            </span>
            <span className="text-xs font-bold text-muted-foreground">• August 2026</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground mt-1">
            Petty Cash Statement & Cash in Hand
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Excel Formula Engine: <code className="font-mono text-purple-600">Balance = Prev + Dr - Cr</code> • <code className="font-mono text-emerald-600">Total Dr = =SUM(Dr)</code> • <code className="font-mono text-rose-600">Total Cr = =SUM(Cr)</code>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Reset Button */}
          <button
            onClick={handleReset}
            title="Reset to Excel authentic data"
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shadow-xs"
          >
            <RotateCcw className="size-3.5" />
            <span>Reset</span>
          </button>

          {/* Export CSV */}
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors cursor-pointer shadow-xs"
          >
            <Download className="size-4 text-emerald-600" />
            <span>Export CSV</span>
          </button>

          {/* Print */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-xl bg-[#0066cc] hover:bg-[#0052a3] px-4 py-2 text-xs font-bold text-white transition-colors cursor-pointer shadow-xs"
          >
            <Printer className="size-4" />
            <span>Print Statement</span>
          </button>

          <Link
            href="/accounts/petty-cash/monthly"
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition-colors shadow-xs"
          >
            <FileSpreadsheet className="size-4" />
            <span>Monthly View</span>
          </Link>
        </div>
      </div>

      {/* Save Toast Notification */}
      {isSaved && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2 animate-in fade-in print:hidden">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span>Formulas recalculated and cash balance updated successfully!</span>
        </div>
      )}

      {/* Quick Add Form */}
      <PettyCashForm onEntryAdded={refreshData} />

      {/* ========================================================================= */}
      {/* 3. PRINTABLE COMPANY HEADER                                               */}
      {/* ========================================================================= */}
      <div className="hidden print:block text-center border-b pb-4 mb-4">
        <h1 className="text-2xl font-black uppercase tracking-wider text-slate-900">SARA TEXTILE</h1>
        <h2 className="text-base font-bold text-slate-700">Petty Cash Statement</h2>
        <p className="text-xs font-semibold text-slate-500">
          For the Month Of August-2026 • Closing Balance: PKR {formatNumber(currentBalance)}
        </p>
      </div>

      {/* ========================================================================= */}
      {/* 4. DATA TABLE                                                             */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border bg-muted/20 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-amber-600" />
            <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
              Cash Transaction Journal ({filteredEntries.length} Vouchers)
            </h3>
          </div>

          <div className="relative print:hidden">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search description, date..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-60 rounded-xl border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-hidden"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-black uppercase text-[10px] text-muted-foreground tracking-wider">
                <th className="py-3 px-3 text-center w-12">S.No</th>
                <th className="py-3 px-3 w-28">Date</th>
                <th className="py-3 px-3">Description / Purpose</th>
                <th className="py-3 px-3 text-right w-36">Debit (Cash In)</th>
                <th className="py-3 px-3 text-right w-36">Credit (Cash Out)</th>
                <th className="py-3 px-4 text-right w-36">
                  Balance (PKR)
                  <span className="block text-[8px] font-mono text-purple-600 lowercase font-normal">fx: =Prev+Dr-Cr</span>
                </th>
                <th className="py-3 px-3 text-center w-16 print:hidden">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredEntries.map((entry, idx) => (
                <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-muted-foreground">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-muted-foreground whitespace-nowrap">
                    {entry.date}
                  </td>
                  <td className="py-2.5 px-3 text-foreground font-medium">
                    {entry.description}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                    {entry.debitAmount ? `+${formatNumber(entry.debitAmount)}` : '-'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                    {entry.creditAmount ? `-${formatNumber(entry.creditAmount)}` : '-'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-black text-foreground">
                    {formatNumber(entry.balance)}
                  </td>
                  <td className="py-2.5 px-3 text-center print:hidden">
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
                      title="Delete Entry"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/50 font-black text-xs">
                <td colSpan={3} className="py-3 px-3 uppercase text-foreground">
                  Total Monthly Petty Cash Transactions
                </td>
                <td className="py-3 px-3 text-right font-mono text-blue-600 dark:text-blue-400 font-black text-sm">
                  {formatCurrency(totalDebit)}
                </td>
                <td className="py-3 px-3 text-right font-mono text-rose-600 dark:text-rose-400 font-black text-sm">
                  {formatCurrency(totalCredit)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-black text-sm">
                  {formatCurrency(currentBalance)}
                </td>
                <td className="print:hidden"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
