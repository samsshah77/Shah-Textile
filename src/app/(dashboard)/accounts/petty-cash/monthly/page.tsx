'use client'

import { useState, useEffect } from 'react'
import { expenseService } from '@/services/expenseService'
import { PettyCashEntry } from '@/types/expense'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Printer, Download, ArrowLeft, Receipt, Building } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/PageHeader'

export default function MonthlyPettyCashStatementPage() {
  const [statements, setStatements] = useState<
    { month: string; entries: PettyCashEntry[]; totalDr: number; totalCr: number; closingBalance: number }[]
  >([])
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-08')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const list = expenseService.getMonthlyPettyCashStatements()
    setStatements(list)
    setLoading(false)
  }, [])

  const currentStatement = statements.find((s) => s.month === selectedMonth) || statements[0]

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div className="print:hidden">
        <PageHeader
          title="Petty Cash Statement"
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Accounts', href: '/accounts/petty-cash' },
            { label: 'Petty Cash', href: '/accounts/petty-cash' },
            { label: 'Monthly Statement' },
          ]}
          actions={
            <>
              <Link
                href="/accounts/petty-cash"
                className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
              >
                <ArrowLeft className="size-3.5" />
                <span>Daily Journal</span>
              </Link>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="form-select form-select-sm"
                aria-label="Statement month"
              >
                <option value="2026-08">August-2026</option>
                <option value="2026-07">July-2026</option>
                <option value="2026-09">September-2026</option>
              </select>
              <button
                type="button"
                onClick={handlePrint}
                className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"
              >
                <Printer className="size-3.5" />
                <span>Print</span>
              </button>
            </>
          }
        />
      </div>

      {/* Formal Statement Layout (Designed to match the exact Excel Sheet) */}
      <div className="rounded-2xl border border-border bg-white text-black p-8 sm:p-10 shadow-lg print:border-none print:p-0 print:shadow-none font-sans">
        {/* Header Title */}
        <div className="text-center border-b-2 border-black pb-4 mb-6">
          <h1 className="text-xl sm:text-2xl font-black tracking-wide uppercase text-black">
            Sara Textile
          </h1>
          <h2 className="text-base sm:text-lg font-bold text-gray-900 mt-0.5 underline">
            Petty Cash Statement
          </h2>
          <p className="text-xs sm:text-sm font-semibold text-gray-700 mt-0.5">
            For the Month Of {selectedMonth === '2026-08' ? 'August-2026' : selectedMonth}
          </p>
        </div>

        {/* Statement Table */}
        <div className="overflow-x-auto rounded-xl border border-black shadow-xs">
          <table className="w-full min-w-[850px] text-left border-collapse border border-black text-xs font-mono">
            <thead>
              <tr className="bg-gray-200 border-b border-black font-bold uppercase text-[11px]">
                <th className="border-r border-black py-2.5 px-3 text-center w-14 min-w-[56px]">S.No</th>
                <th className="border-r border-black py-2.5 px-3 text-center w-28 min-w-[110px]">Date</th>
                <th className="border-r border-black py-2.5 px-4 text-left font-sans min-w-[320px]">Description</th>
                <th className="border-r border-black py-2.5 px-4 text-right w-32 min-w-[120px]">Dr.</th>
                <th className="border-r border-black py-2.5 px-4 text-right w-32 min-w-[120px]">Cr.</th>
                <th className="py-2.5 px-4 text-right w-32 min-w-[130px] font-bold">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-300">
              {currentStatement?.entries.map((entry, index) => {
                const isOpening = entry.description.toLowerCase().includes('balance b/f')
                return (
                  <tr key={entry.id} className="text-black hover:bg-gray-50">
                    <td className="border-r border-black py-2 px-3 text-center font-bold min-w-[56px]">
                      {index + 1}
                    </td>
                    <td className="border-r border-black py-2 px-3 text-center text-gray-800 min-w-[110px]">
                      {entry.date}
                    </td>
                    <td className="border-r border-black py-2 px-4 font-sans font-medium text-black min-w-[320px]">
                      {entry.description}
                    </td>
                    <td className="border-r border-black py-2 px-4 text-right font-bold min-w-[120px]">
                      {entry.debitAmount && entry.debitAmount > 0
                        ? formatNumber(entry.debitAmount, 0)
                        : ''}
                    </td>
                    <td className="border-r border-black py-2 px-4 text-right min-w-[120px]">
                      {entry.creditAmount && entry.creditAmount > 0
                        ? formatNumber(entry.creditAmount, 0)
                        : ''}
                    </td>
                    <td className="py-2 px-4 text-right font-bold min-w-[130px]">
                      {formatNumber(entry.balance, 0)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black bg-gray-100 font-bold text-black text-xs">
                <td colSpan={3} className="border-r border-black py-3 px-4 font-sans uppercase min-w-[480px]">
                  Monthly Total Aggregates:
                </td>
                <td className="border-r border-black py-3 px-4 text-right text-sm min-w-[120px]">
                  {formatNumber(currentStatement?.totalDr || 0, 0)}
                </td>
                <td className="border-r border-black py-3 px-4 text-right text-sm min-w-[120px]">
                  {formatNumber(currentStatement?.totalCr || 0, 0)}
                </td>
                <td className="py-3 px-4 text-right text-sm font-black min-w-[130px]">
                  {formatNumber(currentStatement?.closingBalance || 0, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Signatures */}
        <div className="mt-14 pt-4 border-t border-gray-300">
          <div className="grid grid-cols-3 gap-6 text-center text-xs font-mono">
            <div>
              <div className="border-t border-black pt-1.5 font-bold">Prepared By</div>
              <div className="text-[10px] text-gray-600">Mill Accountant</div>
            </div>
            <div>
              <div className="border-t border-black pt-1.5 font-bold">Verified By</div>
              <div className="text-[10px] text-gray-600">Internal Auditor</div>
            </div>
            <div>
              <div className="border-t border-black pt-1.5 font-bold">Approved By</div>
              <div className="text-[10px] text-gray-600">Director / GM Operations</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
