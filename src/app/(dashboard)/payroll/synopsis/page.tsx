'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { payrollService, formatPayrollMonthLabel } from '@/services/payrollService'
import { FortnightSynopsis, MonthlyGrandSalarySynopsis } from '@/types/payroll'
import { cn, formatCurrency, formatNumber, numberToWordsPKR } from '@/lib/utils'
import {
  Printer,
  RotateCcw,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { PayrollMonthSelect } from '@/components/payroll/PayrollMonthSelect'
import { fortnightDisplayLabel, secondHalfLabel } from '@/components/payroll/FortnightSelect'
import { MonthLockButton } from '@/components/payroll/MonthLockBanner'
import { usePayrollModals } from '@/hooks/usePayrollModals'
import { useAuth } from '@/context/AuthContext'
import { isMonthLocked } from '@/services/payroll/payrollStorage'
import { SheetHeader } from '@/components/shared/SheetHeader'
import { PrintOrientationSelect } from '@/components/shared/PrintOrientationSelect'
import { usePrintOrientation } from '@/hooks/usePrintOrientation'

/**
 * Petty cash to ask for with this fortnight's cheque. Tufail types it; without a typed
 * amount it is the "Cash in" total of Accounts › Petty Cash. Locked month: view only.
 */
function PettyInflowCell({ month, fortnight, amount }: { month: string; fortnight: '1-15' | '16-31'; amount: number }) {
  const { canEditAccounts } = useAuth()
  const typed = payrollService.getTypedPettyCashInflow(month, fortnight)
  const fromAccounts = payrollService.getAccountsPettyCashInflow(month, fortnight)
  const editable = canEditAccounts && !isMonthLocked(month)
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft == null) return
    const clean = draft.replace(/[,\s]/g, '')
    if (clean === '') payrollService.setPettyCashInflow(month, fortnight, null)
    else if (/^\d+(\.\d+)?$/.test(clean)) payrollService.setPettyCashInflow(month, fortnight, Number(clean))
    setDraft(null)
  }
  if (!editable) return <span>{formatNumber(amount, 0)}</span>
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <input
        inputMode="numeric"
        aria-label={`Petty cash inflow ${fortnight}`}
        value={draft ?? formatNumber(amount, 0)}
        onFocus={(e) => {
          setDraft(String(amount))
          requestAnimationFrame(() => e.target.select())
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setDraft(null)
        }}
        className="w-32 rounded border border-slate-300 bg-amber-50/60 px-2 py-0.5 text-right font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0066cc] print:border-0 print:bg-transparent"
      />
      <span className="text-[10px] font-normal text-slate-500 print:hidden">
        {typed == null ? (
          <>Accounts › Petty Cash (Cash in) se</>
        ) : (
          <>
            Likha hua · Accounts mein {formatNumber(fromAccounts, 0)}{' '}
            <button type="button" className="text-[#0066cc] underline cursor-pointer" onClick={() => payrollService.setPettyCashInflow(month, fortnight, null)}>
              Accounts wala lo
            </button>
          </>
        )}
      </span>
    </span>
  )
}

function DisbursementSynopsisContent() {
  const sheetPrint = usePrintOrientation('synopsis')
  const { modals } = usePayrollModals()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const initialFn = searchParams.get('fortnight')
  const [activeTab, setActiveTab] = useState<'grand' | 'f1' | 'f2'>(
    initialFn === '1-15' ? 'f1' : initialFn === '16-31' ? 'f2' : 'grand'
  )
  const [selectedMonth, setSelectedMonth] = useState(
    () => payrollService.getActiveSalariedMonth()
  )
  const [f1, setF1] = useState<FortnightSynopsis | null>(null)
  const [f2, setF2] = useState<FortnightSynopsis | null>(null)
  const [grand, setGrand] = useState<MonthlyGrandSalarySynopsis | null>(null)

  const pushView = (tab: 'grand' | 'f1' | 'f2') => {
    const params = new URLSearchParams(searchParams.toString())
    const fn = tab === 'f1' ? '1-15' : tab === 'f2' ? '16-31' : 'grand'
    params.set('fortnight', fn)
    router.replace(`${pathname}?${params.toString()}`)
  }

  useEffect(() => {
    const fn = searchParams.get('fortnight')
    if (fn === '1-15') setActiveTab('f1')
    else if (fn === '16-31') setActiveTab('f2')
    else if (fn === 'grand' || !fn) setActiveTab('grand')
  }, [searchParams])

  const reloadData = () => {
    setF1(payrollService.getFortnightSynopsis(selectedMonth, '1-15'))
    setF2(payrollService.getFortnightSynopsis(selectedMonth, '16-31'))
    setGrand(payrollService.getMonthlyGrandSummary(selectedMonth))
  }

  useEffect(() => {
    reloadData()
    // Petty cash comes from Accounts › Petty Cash ("Cash in" of each fortnight).
    let alive = true
    void payrollService.loadPettyCashInflow(selectedMonth, true).then(() => {
      if (alive) reloadData()
    })
    const handleSync = () => {
      // Keep user's month + view (1–15 / 16–xx / Monthly); only refresh totals.
      reloadData()
    }
    window.addEventListener('payroll_synced', handleSync)
    return () => {
      alive = false
      window.removeEventListener('payroll_synced', handleSync)
    }
  }, [selectedMonth])

  const handlePrint = () => {
    sheetPrint.print()
  }

  if (!f1 || !f2 || !grand) return null

  return (
    <div className="space-y-6 pb-12">
      {modals}
      <div className="print:hidden">
        <PageHeader
          title="Disbursement Synopsis"
          showTitle={false}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Payroll', href: '/payroll/synopsis' },
            { label: 'Synopsis' },
          ]}
          actions={
            <>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <PayrollMonthSelect
                  value={selectedMonth}
                  onChange={(m) => setSelectedMonth(m)}
                />
                <select
                  value={activeTab}
                  onChange={(e) => {
                    const tab = e.target.value as 'grand' | 'f1' | 'f2'
                    setActiveTab(tab)
                    pushView(tab)
                  }}
                  className={cn(
                    'h-9 appearance-none rounded-md border border-slate-200 bg-white px-2.5 pr-7 text-xs font-semibold text-slate-800 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40'
                  )}
                  aria-label="Synopsis view"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%33475569' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.55rem center',
                  }}
                >
                  <option value="f1">1–15</option>
                  <option value="f2">{secondHalfLabel(selectedMonth)}</option>
                  <option value="grand">Monthly</option>
                </select>
              </div>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={reloadData}
                  title="Refresh calculated numbers"
                  className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800"
                >
                  <RotateCcw className="size-3.5" />
                  <span>Recalculate</span>
                </button>
                <MonthLockButton month={selectedMonth} onStatusChange={reloadData} />
                <PrintOrientationSelect value={sheetPrint.orientation} onChange={sheetPrint.setOrientation} />
                <button
                  type="button"
                  onClick={handlePrint}
                  className="erp-btn-primary text-xs !min-h-9 !h-9"
                >
                  <Printer className="size-3.5" />
                  <span>Print</span>
                </button>
                <ExportPdfButton orientation={sheetPrint.orientation} filename={`Synopsis-${selectedMonth || 'month'}`} className="!min-h-9 !h-9" />
              </div>
            </>
          }
        />
      </div>

      {/* Tab 1: Grand Monthly Summary */}
      {activeTab === 'grand' && (
        <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
          <SheetHeader title="STAFF, CONTRACT EMPLOYEE, EFFICIENCY, WEAVER WAGES, OVERTIME, HELPER & CONTRACTOR SYNOPSIS" subtitle={<>Statement for Month: {formatPayrollMonthLabel(selectedMonth)}</>} />

          {/* Same layout as the Excel "Monthly Summery" sheet: 1–15 on the left, 16–31 on the right. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {(
              [
                {
                  key: 'f1',
                  title: `Salary Expense ${fortnightDisplayLabel(selectedMonth, '1-15')}`,
                  items: grand.fortnight1Items,
                  total: grand.fortnight1Total,
                  petty: grand.fortnight1PettyCash,
                  grandTotal: grand.fortnight1Cheque,
                },
                {
                  key: 'f2',
                  title: `Salary Expense ${secondHalfLabel(selectedMonth)}`,
                  items: grand.fortnight2Items,
                  total: grand.fortnight2SalaryTotal,
                  petty: grand.fortnight2PettyCash,
                  grandTotal: grand.fortnight2MonthTotal,
                },
              ] as const
            ).map((side) => (
              <div key={side.key} className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
                <table data-no-tidy className="w-full text-center border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-600">
                      <th colSpan={3} className="py-2 px-3 text-center font-sans">{side.title}</th>
                    </tr>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-600">
                      <th className="border-r border-slate-200 py-1.5 px-2 text-center w-12">S.#</th>
                      <th className="border-r border-slate-200 py-1.5 px-3 font-sans">Description</th>
                      <th className="py-1.5 px-3 text-center w-36">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {side.items.map((item) => (
                      <tr key={item.serialNo}>
                        <td className="border-r border-slate-100 py-1.5 px-2 text-center text-slate-600">{item.serialNo}</td>
                        <td className="border-r border-slate-100 py-1.5 px-3 font-sans font-medium">
                          {item.description}
                          {side.key === 'f2' && item.serialNo === 1 && grand.staffChequeAmount > 0 && (
                            <span className="ml-1 text-[10px] font-normal text-slate-500">
                              (cash {formatNumber(item.amount - grand.staffChequeAmount, 0)} + cheque {formatNumber(grand.staffChequeAmount, 0)})
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-3 text-center font-semibold">{formatNumber(item.amount, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                      <td colSpan={2} className="border-r border-slate-200 py-2 px-3 font-sans uppercase">Total</td>
                      <td className="py-2 px-3 text-center font-bold">{formatNumber(side.total, 0)}</td>
                    </tr>
                    <tr className="border-t border-slate-200">
                      <td colSpan={2} className="border-r border-slate-200 py-1.5 px-3 font-sans">Petty Cash</td>
                      <td className="py-1.5 px-3 text-center">{formatNumber(side.petty, 0)}</td>
                    </tr>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                      <td colSpan={2} className="border-r border-slate-200 py-2 px-3 font-sans uppercase">Total</td>
                      <td className="py-2 px-3 text-center font-bold text-sm text-[#0066cc]">{formatNumber(side.grandTotal, 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50/60 p-4 font-sans">
            <div>
              <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Monthly Total Salary in Words (PKR):</span>
              <div className="text-xs font-semibold text-slate-900 mt-0.5">{numberToWordsPKR(grand.monthlyTotalSalary)}</div>
            </div>
            <div className="sm:text-right">
              <span className="text-[11px] font-semibold uppercase text-slate-500">Monthly Total Salary:</span>
              <div className="text-lg font-bold text-[#0066cc]">{formatCurrency(grand.monthlyTotalSalary)}</div>
            </div>
          </div>

          <h3 className="mt-6 mb-2 text-sm font-bold text-slate-800">Head-wise detail (cash / bank cheque / advance)</h3>
          <div className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
            <table data-no-tidy className="w-full min-w-[1100px] text-center border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                  <th className="border-r border-slate-200 py-2 px-2 text-center w-12 min-w-[50px]">S.#</th>
                  <th className="border-r border-slate-200 py-2 px-3 font-sans min-w-[320px]">Description of Expense Head</th>
                  <th className="border-r border-slate-200 py-2 px-3 text-center w-44 min-w-[170px]">Disbursed Cash (PKR)</th>
                  <th className="border-r border-slate-200 py-2 px-3 text-center w-40 min-w-[150px]">Bank Cheque</th>
                  <th className="border-r border-slate-200 py-2 px-3 text-center w-40 min-w-[150px] text-red-600">Advance Recovered</th>
                  <th className="py-2 px-3 text-center w-44 min-w-[170px] font-semibold text-slate-900">Total Gross Head (PKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {grand.grandSynopsisItems.map((item) => (
                  <tr key={item.serialNo} className="text-slate-800 hover:bg-slate-50/80 transition-colors">
                    <td className="border-r border-slate-100 py-2 px-2 text-center font-semibold min-w-[50px] text-slate-600">{item.serialNo}</td>
                    <td className="border-r border-slate-100 py-2 px-3 font-medium font-sans min-w-[320px] text-slate-800">{item.description}</td>
                    <td className="border-r border-slate-100 py-2 px-3 text-center font-semibold text-slate-900 min-w-[170px]">
                      {formatNumber(item.amount, 0)}
                    </td>
                    <td className="border-r border-slate-100 py-2 px-3 text-center text-slate-700 font-medium min-w-[150px]">
                      {item.chequeAmount ? formatNumber(item.chequeAmount, 0) : '—'}
                    </td>
                    <td className="border-r border-slate-100 py-2 px-3 text-center text-red-600 font-medium min-w-[150px]">
                      {item.advance ? formatNumber(item.advance, 0) : '—'}
                    </td>
                    <td className="py-2 px-3 text-center font-semibold text-slate-900 min-w-[170px]">
                      {formatNumber(item.totalGrossHead, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900 text-xs">
                  <td colSpan={2} className="border-r border-slate-200 py-2.5 px-3 font-sans uppercase min-w-[370px]">
                    Grand Reconciled Totals:
                  </td>
                  <td className="border-r border-slate-200 py-2.5 px-3 text-center font-bold text-sm text-[#0066cc] min-w-[170px]">
                    {formatNumber(grand.grandSynopsisItems.reduce((s, i) => s + i.amount, 0), 0)}
                  </td>
                  <td className="border-r border-slate-200 py-2.5 px-3 text-center font-semibold text-slate-800 min-w-[150px]">
                    {formatNumber(grand.grandSynopsisItems.reduce((s, i) => s + (i.chequeAmount || 0), 0), 0)}
                  </td>
                  <td className="border-r border-slate-200 py-2.5 px-3 text-center font-semibold text-red-600 min-w-[150px]">
                    {formatNumber(grand.grandSynopsisItems.reduce((s, i) => s + (i.advance || 0), 0), 0)}
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold text-sm text-slate-900 min-w-[170px]">
                    {formatNumber(grand.grandSynopsisItems.reduce((s, i) => s + i.totalGrossHead, 0), 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Bank Cheque Summary Box */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-3 border border-slate-200 rounded-md bg-white">
              <div className="text-[11px] text-slate-500 font-semibold uppercase">
                1st Half Cheque ({fortnightDisplayLabel(selectedMonth, '1-15')}):
              </div>
              <div className="text-base font-bold text-slate-900 mt-0.5">{formatCurrency(grand.fortnight1Cheque)}</div>
              <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                Cash: {formatNumber(grand.fortnight1Total, 0)} + Petty: {formatNumber(grand.fortnight1PettyCash, 0)}
              </div>
            </div>
            <div className="p-3 border border-slate-200 rounded-md bg-white">
              <div className="text-[11px] text-slate-500 font-semibold uppercase">
                2nd Half Cheque ({secondHalfLabel(selectedMonth)}):
              </div>
              <div className="text-base font-bold text-slate-900 mt-0.5">{formatCurrency(grand.fortnight2Cheque)}</div>
              <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                Cash: {formatNumber(grand.fortnight2Total, 0)} + Petty: {formatNumber(grand.fortnight2PettyCash, 0)}
              </div>
            </div>
            <div className="p-3 border border-slate-200 rounded-md bg-white">
              <div className="text-[11px] text-slate-500 font-semibold uppercase">Staff Salary Cheque (bank):</div>
              <div className="text-base font-bold text-slate-900 mt-0.5">{formatCurrency(grand.staffChequeAmount)}</div>
              <div className="text-[10px] text-slate-500 font-medium mt-0.5">Staff ko seedha cheque — 2nd half cheque se alag</div>
            </div>
            <div className="bg-blue-50/60 p-3 rounded-md border border-blue-200">
              <div className="text-[11px] text-[#0066cc] font-semibold uppercase">Monthly Total Salary:</div>
              <div className="text-base font-bold text-slate-900 mt-0.5">{formatCurrency(grand.monthlyTotalSalary)}</div>
              <div className="text-[10px] text-[#0066cc] font-medium mt-0.5">1st half + 2nd half + staff cheque</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Fortnight 1 Disbursal (01 to 15) */}
      {activeTab === 'f1' && (
        <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
          <SheetHeader title={<>WEAVERS, HELPER, ADVANCE, CONTRACTOR BILL PAYMENT SYNOPSIS ( {formatPayrollMonthLabel(selectedMonth)} · {fortnightDisplayLabel(selectedMonth, '1-15')})</>} subtitle={<>{fortnightDisplayLabel(selectedMonth, '1-15')} Bank Disbursal Voucher</>} />

          <div className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
            <table data-no-tidy className="w-full min-w-[800px] text-center border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                  <th className="border-r border-slate-200 py-2 px-2 text-center w-14 min-w-[56px]">S.#</th>
                  <th className="border-r border-slate-200 py-2 px-3 font-sans min-w-[450px]">Disbursement Category</th>
                  <th className="py-2 px-3 text-center w-48 min-w-[180px] font-semibold text-slate-900">Amount (PKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {f1.items.map((item) => (
                  <tr key={item.serialNo} className="text-slate-800 hover:bg-slate-50/80 transition-colors">
                    <td className="border-r border-slate-100 py-2 px-2 text-center font-semibold min-w-[56px] text-slate-600">{item.serialNo}</td>
                    <td className="border-r border-slate-100 py-2 px-3 font-medium font-sans min-w-[450px] text-slate-800">{item.description}</td>
                    <td className="py-2 px-3 text-center font-semibold text-slate-900 min-w-[180px]">
                      {formatNumber(item.amount, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900 text-xs">
                  <td colSpan={2} className="border-r border-slate-200 py-2.5 px-3 font-sans uppercase min-w-[500px]">
                    Total Net Payroll Cash Disbursal:
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold text-[#0066cc] min-w-[180px]">
                    {formatNumber(f1.totalPayrollCash, 0)}
                  </td>
                </tr>
                <tr className="border-t border-slate-200 bg-white font-medium text-slate-700 text-xs">
                  <td colSpan={2} className="border-r border-slate-200 py-2 px-3 font-sans min-w-[500px]">
                    + Petty Cash Transfer Inflow (jo petty cash is cheque ke saath mangwana hai):
                  </td>
                  <td className="py-2 px-3 text-center font-medium text-slate-700 min-w-[180px]">
                    <PettyInflowCell month={selectedMonth} fortnight="1-15" amount={f1.pettyCashInflow} />
                  </td>
                </tr>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900 text-xs">
                  <td colSpan={2} className="border-r border-slate-200 py-2.5 px-3 font-sans uppercase min-w-[500px]">
                    Total Bank Cheque Amount Drawn (1st Fortnight):
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold text-sm text-slate-900 min-w-[180px]">
                    {formatNumber(f1.totalBankCheque, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Prominent Calculated 1st Fortnight Bank Cheque Total in Words */}
          <div className="print:hidden mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 font-sans print:border-none print:p-2">
            <div>
              <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">1st Fortnight Cheque in Words (PKR):</span>
              <div className="text-xs font-semibold text-slate-900 mt-0.5">{numberToWordsPKR(f1.totalBankCheque)}</div>
            </div>
            <div className="sm:text-right border-t sm:border-t-0 border-slate-200 pt-2 sm:pt-0 w-full sm:w-auto">
              <span className="text-[11px] font-semibold uppercase text-slate-500">Total Bank Cheque:</span>
              <div className="text-lg font-bold text-[#0066cc]">{formatCurrency(f1.totalBankCheque)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Fortnight 2 Disbursal (16 to 31) */}
      {activeTab === 'f2' && (
        <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
          <SheetHeader title={<>SALARY EXPENSE ({formatPayrollMonthLabel(selectedMonth)} · {secondHalfLabel(selectedMonth)})</>} subtitle={<>{secondHalfLabel(selectedMonth)} Bank Disbursal Voucher</>} />

          <div className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
            <table data-no-tidy className="w-full min-w-[800px] text-center border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                  <th className="border-r border-slate-200 py-2 px-2 text-center w-14 min-w-[56px]">S.#</th>
                  <th className="border-r border-slate-200 py-2 px-3 font-sans min-w-[450px]">Disbursement Category</th>
                  <th className="border-r border-slate-200 py-2 px-3 text-center w-48 min-w-[180px] font-semibold text-slate-900">Amount (PKR)</th>
                  <th className="border-r border-slate-200 py-2 px-3 text-center w-36">Cheque Amount</th>
                  <th className="py-2 px-3 text-center w-36 text-red-600">Advance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {f2.items.map((item) => (
                  <tr key={item.serialNo} className="text-slate-800 hover:bg-slate-50/80 transition-colors">
                    <td className="border-r border-slate-100 py-2 px-2 text-center font-semibold min-w-[56px] text-slate-600">{item.serialNo}</td>
                    <td className="border-r border-slate-100 py-2 px-3 font-medium font-sans min-w-[450px] text-slate-800">{item.description}</td>
                    <td className="border-r border-slate-100 py-2 px-3 text-center font-semibold text-slate-900 min-w-[180px]">
                      {formatNumber(item.amount, 0)}
                    </td>
                    <td className="border-r border-slate-100 py-2 px-3 text-center text-slate-700">
                      {item.chequeAmount ? formatNumber(item.chequeAmount, 0) : '—'}
                    </td>
                    <td className="py-2 px-3 text-center text-red-600">{item.advance ? formatNumber(item.advance, 0) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900 text-xs">
                  <td colSpan={2} className="border-r border-slate-200 py-2.5 px-3 font-sans uppercase min-w-[500px]">
                    Total Net Payroll Cash Disbursal:
                  </td>
                  <td className="border-r border-slate-200 py-2.5 px-3 text-center font-bold text-[#0066cc] min-w-[180px]">
                    {formatNumber(f2.totalPayrollCash, 0)}
                  </td>
                  <td className="border-r border-slate-200 py-2.5 px-3 text-center font-semibold">
                    {formatNumber(f2.items.reduce((s, i) => s + (i.chequeAmount || 0), 0), 0)}
                  </td>
                  <td className="py-2.5 px-3 text-center font-semibold text-red-600">
                    {formatNumber(f2.items.reduce((s, i) => s + (i.advance || 0), 0), 0)}
                  </td>
                </tr>
                <tr className="border-t border-slate-200 bg-white font-medium text-slate-700 text-xs">
                  <td colSpan={2} className="border-r border-slate-200 py-2 px-3 font-sans min-w-[500px]">
                    + Petty Cash Transfer Inflow (jo petty cash is cheque ke saath mangwana hai):
                  </td>
                  <td className="py-2 px-3 text-center font-medium text-slate-700 min-w-[180px]">
                    <PettyInflowCell month={selectedMonth} fortnight="16-31" amount={f2.pettyCashInflow} />
                  </td>
                  <td colSpan={2} />
                </tr>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900 text-xs">
                  <td colSpan={2} className="border-r border-slate-200 py-2.5 px-3 font-sans uppercase min-w-[500px]">
                    Total Bank Cheque Amount Drawn (2nd Fortnight):
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold text-sm text-slate-900 min-w-[180px]">
                    {formatNumber(f2.totalBankCheque, 0)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Prominent Calculated 2nd Fortnight Bank Cheque Total in Words */}
          <div className="print:hidden mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 font-sans print:border-none print:p-2">
            <div>
              <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">2nd Fortnight Cheque in Words (PKR):</span>
              <div className="text-xs font-semibold text-slate-900 mt-0.5">{numberToWordsPKR(f2.totalBankCheque)}</div>
            </div>
            <div className="sm:text-right border-t sm:border-t-0 border-slate-200 pt-2 sm:pt-0 w-full sm:w-auto">
              <span className="text-[11px] font-semibold uppercase text-slate-500">Total Bank Cheque:</span>
              <div className="text-lg font-bold text-[#0066cc]">{formatCurrency(f2.totalBankCheque)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DisbursementSynopsisPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Synopsis...</div>}>
      <DisbursementSynopsisContent />
    </Suspense>
  )
}
