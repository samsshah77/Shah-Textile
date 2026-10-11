'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { payrollService, formatPayrollMonthLabel } from '@/services/payrollService'
import { FortnightSynopsis, MonthlyGrandSalarySynopsis } from '@/types/payroll'
import { useAuth } from '@/context/AuthContext'
import { cn, formatCurrency, formatNumber, numberToWordsPKR } from '@/lib/utils'
import {
  FileSpreadsheet,
  Printer,
  DollarSign,
  Building,
  CheckCircle2,
  Layers,
  Banknote,
  RotateCcw,
  Save,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { NumericCellInput } from '@/components/shared/NumericCellInput'
import { PayrollMonthSelect } from '@/components/payroll/PayrollMonthSelect'
import { fortnightDisplayLabel, secondHalfLabel } from '@/components/payroll/FortnightSelect'
import { usePayrollModals } from '@/hooks/usePayrollModals'

function DisbursementSynopsisContent() {
  const { canEditAccounts } = useAuth()
  const { showSuccess, showError, modals } = usePayrollModals()
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
  const [savingInflow, setSavingInflow] = useState(false)
  const draftInflowRef = useRef<Partial<Record<'1-15' | '16-31', number>>>({})
  const skipSyncReloadRef = useRef(false)

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

  const applyLocalInflow = (fortnight: '1-15' | '16-31', amount: number) => {
    const n = Math.max(0, Math.round(Number(amount) || 0))
    draftInflowRef.current[fortnight] = n
    if (fortnight === '1-15') {
      setF1((prev) =>
        prev
          ? { ...prev, pettyCashInflow: n, totalBankCheque: prev.totalPayrollCash + n }
          : prev
      )
    } else {
      setF2((prev) =>
        prev
          ? { ...prev, pettyCashInflow: n, totalBankCheque: prev.totalPayrollCash + n }
          : prev
      )
    }
  }

  const savePettyInflow = async (fortnight: '1-15' | '16-31') => {
    if (!canEditAccounts) return false
    const source =
      draftInflowRef.current[fortnight] ??
      (fortnight === '1-15' ? f1?.pettyCashInflow : f2?.pettyCashInflow) ??
      0
    const n = Math.max(0, Math.round(Number(source) || 0))
    setSavingInflow(true)
    skipSyncReloadRef.current = true
    try {
      const ok = await payrollService.setPettyCashInflowAsync(selectedMonth, fortnight, n)
      delete draftInflowRef.current[fortnight]
      reloadData()
      if (ok) {
        showSuccess(
          'Saved',
          `Petty cash inflow ${formatNumber(n, 0)} — ${fortnightDisplayLabel(selectedMonth, fortnight)}`
        )
      } else {
        showError('Save failed', 'DB me save nahi hua. Dobara Save dabayein.')
      }
      return ok
    } finally {
      setSavingInflow(false)
      skipSyncReloadRef.current = false
    }
  }

  useEffect(() => {
    reloadData()
    const handleSync = () => {
      if (skipSyncReloadRef.current) return
      // Keep user's month + view (1–15 / 16–xx / Monthly); only refresh totals.
      reloadData()
    }
    window.addEventListener('payroll_synced', handleSync)
    return () => window.removeEventListener('payroll_synced', handleSync)
  }, [selectedMonth])

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print()
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
                {canEditAccounts && (activeTab === 'f1' || activeTab === 'f2') && (
                  <button
                    type="button"
                    disabled={savingInflow}
                    onClick={() =>
                      void savePettyInflow(activeTab === 'f1' ? '1-15' : '16-31')
                    }
                    className="erp-btn-success text-xs !min-h-9 !h-9"
                  >
                    <Save className="size-3.5" />
                    <span>{savingInflow ? 'Saving…' : 'Save'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handlePrint}
                  className="erp-btn-primary text-xs !min-h-9 !h-9"
                >
                  <Printer className="size-3.5" />
                  <span>Print</span>
                </button>
                <ExportPdfButton filename={`Synopsis-${selectedMonth || 'month'}`} className="!min-h-9 !h-9" />
              </div>
            </>
          }
        />
      </div>

      {/* Tab 1: Grand Monthly Summary */}
      {activeTab === 'grand' && (
        <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
          <div className="text-center border-b border-slate-200 pb-3 mb-4">
            <h1 className="text-xl font-bold uppercase text-slate-900 tracking-wide">SARA TEXTILES</h1>
            <h2 className="text-xs font-semibold text-slate-600 mt-0.5">
              STAFF, CONTRACT EMPLOYEE, EFFICIENCY, WEAVER WAGES, OVERTIME, HELPER & CONTRACTOR SYNOPSIS
            </h2>
            <p className="text-[11px] text-slate-500 font-mono">
              Statement for Month: {formatPayrollMonthLabel(selectedMonth)}
            </p>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
            <table className="w-full min-w-[1100px] text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                  <th className="border-r border-slate-200 py-2 px-2 text-center w-12 min-w-[50px]">S.#</th>
                  <th className="border-r border-slate-200 py-2 px-3 font-sans min-w-[320px]">Description of Expense Head</th>
                  <th className="border-r border-slate-200 py-2 px-3 text-right w-44 min-w-[170px]">Disbursed Cash (PKR)</th>
                  <th className="border-r border-slate-200 py-2 px-3 text-right w-40 min-w-[150px]">Bank Cheque</th>
                  <th className="border-r border-slate-200 py-2 px-3 text-right w-40 min-w-[150px] text-red-600">Advance Recovered</th>
                  <th className="py-2 px-3 text-right w-44 min-w-[170px] font-semibold text-slate-900">Total Gross Head (PKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {grand.grandSynopsisItems.map((item) => (
                  <tr key={item.serialNo} className="text-slate-800 hover:bg-slate-50/80 transition-colors">
                    <td className="border-r border-slate-100 py-2 px-2 text-center font-semibold min-w-[50px] text-slate-600">{item.serialNo}</td>
                    <td className="border-r border-slate-100 py-2 px-3 font-medium font-sans min-w-[320px] text-slate-800">{item.description}</td>
                    <td className="border-r border-slate-100 py-2 px-3 text-right font-semibold text-slate-900 min-w-[170px]">
                      {formatNumber(item.amount, 0)}
                    </td>
                    <td className="border-r border-slate-100 py-2 px-3 text-right text-slate-700 font-medium min-w-[150px]">
                      {item.chequeAmount ? formatNumber(item.chequeAmount, 0) : '—'}
                    </td>
                    <td className="border-r border-slate-100 py-2 px-3 text-right text-red-600 font-medium min-w-[150px]">
                      {item.advance ? formatNumber(item.advance, 0) : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-slate-900 min-w-[170px]">
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
                  <td className="border-r border-slate-200 py-2.5 px-3 text-right font-bold text-sm text-[#0066cc] min-w-[170px]">
                    {formatNumber(grand.grandSynopsisItems.reduce((s, i) => s + i.amount, 0), 0)}
                  </td>
                  <td className="border-r border-slate-200 py-2.5 px-3 text-right font-semibold text-slate-800 min-w-[150px]">
                    {formatNumber(grand.grandSynopsisItems.reduce((s, i) => s + (i.chequeAmount || 0), 0), 0)}
                  </td>
                  <td className="border-r border-slate-200 py-2.5 px-3 text-right font-semibold text-red-600 min-w-[150px]">
                    {formatNumber(grand.grandSynopsisItems.reduce((s, i) => s + (i.advance || 0), 0), 0)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-sm text-slate-900 min-w-[170px]">
                    {formatNumber(grand.grandSynopsisItems.reduce((s, i) => s + i.totalGrossHead, 0), 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Prominent Calculated Total in Words */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 font-sans print:border-none print:p-2">
            <div>
              <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Grand Monthly Disbursal in Words (PKR):</span>
              <div className="text-xs font-semibold text-slate-900 mt-0.5">{numberToWordsPKR(grand.monthlyTotalSalary)}</div>
            </div>
            <div className="sm:text-right border-t sm:border-t-0 border-slate-200 pt-2 sm:pt-0 w-full sm:w-auto">
              <span className="text-[11px] font-semibold uppercase text-slate-500">Reconciled Monthly Total:</span>
              <div className="text-lg font-bold text-[#0066cc]">{formatCurrency(grand.monthlyTotalSalary)}</div>
            </div>
          </div>

          {/* Bank Cheque Summary Box */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <div className="bg-blue-50/60 p-3 rounded-md border border-blue-200">
              <div className="text-[11px] text-[#0066cc] font-semibold uppercase">Grand Monthly Cheque Total:</div>
              <div className="text-base font-bold text-slate-900 mt-0.5">{formatCurrency(grand.monthlyTotalSalary)}</div>
              <div className="text-[10px] text-[#0066cc] font-medium mt-0.5">100% Fully Balanced & Audited</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Fortnight 1 Disbursal (01 to 15) */}
      {activeTab === 'f1' && (
        <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
          <div className="text-center border-b border-slate-200 pb-3 mb-4">
            <h1 className="text-xl font-bold uppercase text-slate-900 tracking-wide">SARA TEXTILES</h1>
            <h2 className="text-xs font-semibold text-slate-600 mt-0.5">
              WEAVERS, HELPER, ADVANCE, CONTRACTOR BILL PAYMENT SYNOPSIS (
              {formatPayrollMonthLabel(selectedMonth)} · {fortnightDisplayLabel(selectedMonth, '1-15')})
            </h2>
            <p className="text-[11px] text-slate-500 font-mono">
              {fortnightDisplayLabel(selectedMonth, '1-15')} Bank Disbursal Voucher
            </p>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
            <table className="w-full min-w-[800px] text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                  <th className="border-r border-slate-200 py-2 px-2 text-center w-14 min-w-[56px]">S.#</th>
                  <th className="border-r border-slate-200 py-2 px-3 font-sans min-w-[450px]">Disbursement Category</th>
                  <th className="py-2 px-3 text-right w-48 min-w-[180px] font-semibold text-slate-900">Amount (PKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {f1.items.map((item) => (
                  <tr key={item.serialNo} className="text-slate-800 hover:bg-slate-50/80 transition-colors">
                    <td className="border-r border-slate-100 py-2 px-2 text-center font-semibold min-w-[56px] text-slate-600">{item.serialNo}</td>
                    <td className="border-r border-slate-100 py-2 px-3 font-medium font-sans min-w-[450px] text-slate-800">{item.description}</td>
                    <td className="py-2 px-3 text-right font-semibold text-slate-900 min-w-[180px]">
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
                  <td className="py-2.5 px-3 text-right font-bold text-[#0066cc] min-w-[180px]">
                    {formatNumber(f1.totalPayrollCash, 0)}
                  </td>
                </tr>
                <tr className="border-t border-slate-200 bg-white font-medium text-slate-700 text-xs">
                  <td colSpan={2} className="border-r border-slate-200 py-2 px-3 font-sans min-w-[500px]">
                    + Petty Cash Transfer Inflow (Factory Floor Operational):
                  </td>
                  <td className="py-2 px-3 text-right font-medium text-slate-700 min-w-[180px]">
                    {canEditAccounts ? (
                      <NumericCellInput
                        value={f1.pettyCashInflow}
                        disabled={!canEditAccounts || savingInflow}
                        onValueChange={(v) => applyLocalInflow('1-15', v)}
                        className="w-full text-right bg-amber-50 border border-amber-200 px-2 py-1 text-xs font-semibold text-slate-900 focus:bg-white focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded font-mono print:border-0 print:bg-transparent"
                      />
                    ) : (
                      formatNumber(f1.pettyCashInflow, 0)
                    )}
                  </td>
                </tr>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900 text-xs">
                  <td colSpan={2} className="border-r border-slate-200 py-2.5 px-3 font-sans uppercase min-w-[500px]">
                    Total Bank Cheque Amount Drawn (1st Fortnight):
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-sm text-slate-900 min-w-[180px]">
                    {formatNumber(f1.totalBankCheque, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Prominent Calculated 1st Fortnight Bank Cheque Total in Words */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 font-sans print:border-none print:p-2">
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
          <div className="text-center border-b border-slate-200 pb-3 mb-4">
            <h1 className="text-xl font-bold uppercase text-slate-900 tracking-wide">SARA TEXTILES</h1>
            <h2 className="text-xs font-semibold text-slate-600 mt-0.5">
              SALARY EXPENSE ({formatPayrollMonthLabel(selectedMonth)} · {secondHalfLabel(selectedMonth)})
            </h2>
            <p className="text-[11px] text-slate-500 font-mono">
              {secondHalfLabel(selectedMonth)} Bank Disbursal Voucher
            </p>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
            <table className="w-full min-w-[800px] text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                  <th className="border-r border-slate-200 py-2 px-2 text-center w-14 min-w-[56px]">S.#</th>
                  <th className="border-r border-slate-200 py-2 px-3 font-sans min-w-[450px]">Disbursement Category</th>
                  <th className="py-2 px-3 text-right w-48 min-w-[180px] font-semibold text-slate-900">Amount (PKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {f2.items.map((item) => (
                  <tr key={item.serialNo} className="text-slate-800 hover:bg-slate-50/80 transition-colors">
                    <td className="border-r border-slate-100 py-2 px-2 text-center font-semibold min-w-[56px] text-slate-600">{item.serialNo}</td>
                    <td className="border-r border-slate-100 py-2 px-3 font-medium font-sans min-w-[450px] text-slate-800">{item.description}</td>
                    <td className="py-2 px-3 text-right font-semibold text-slate-900 min-w-[180px]">
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
                  <td className="py-2.5 px-3 text-right font-bold text-[#0066cc] min-w-[180px]">
                    {formatNumber(f2.totalPayrollCash, 0)}
                  </td>
                </tr>
                <tr className="border-t border-slate-200 bg-white font-medium text-slate-700 text-xs">
                  <td colSpan={2} className="border-r border-slate-200 py-2 px-3 font-sans min-w-[500px]">
                    + Petty Cash Transfer Inflow (Factory Floor Operational):
                  </td>
                  <td className="py-2 px-3 text-right font-medium text-slate-700 min-w-[180px]">
                    {canEditAccounts ? (
                      <NumericCellInput
                        value={f2.pettyCashInflow}
                        disabled={!canEditAccounts || savingInflow}
                        onValueChange={(v) => applyLocalInflow('16-31', v)}
                        className="w-full text-right bg-amber-50 border border-amber-200 px-2 py-1 text-xs font-semibold text-slate-900 focus:bg-white focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded font-mono print:border-0 print:bg-transparent"
                      />
                    ) : (
                      formatNumber(f2.pettyCashInflow, 0)
                    )}
                  </td>
                </tr>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900 text-xs">
                  <td colSpan={2} className="border-r border-slate-200 py-2.5 px-3 font-sans uppercase min-w-[500px]">
                    Total Bank Cheque Amount Drawn (2nd Fortnight):
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-sm text-slate-900 min-w-[180px]">
                    {formatNumber(f2.totalBankCheque, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Prominent Calculated 2nd Fortnight Bank Cheque Total in Words */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 font-sans print:border-none print:p-2">
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
