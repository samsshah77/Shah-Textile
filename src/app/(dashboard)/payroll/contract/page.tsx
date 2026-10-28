'use client'

import { Suspense } from 'react'
import { payrollService } from '@/services/payrollService'
import { AddColumnButton } from '@/components/shared/CustomColumnModal'
import { Printer, Lock } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { PayrollMonthSelect } from '@/components/payroll/PayrollMonthSelect'
import { MonthLockButton } from '@/components/payroll/MonthLockBanner'
import { EmployeePaySlipModal } from '@/components/payroll/EmployeePaySlipModal'
import { PayrollSaveButton } from '@/components/payroll/PayrollSaveButton'
import { PayrollUnsavedBanner } from '@/components/payroll/PayrollUnsavedBanner'
import { useContractPage } from '@/components/payroll/contract/useContractPage'
import { ContractSalaryTab } from '@/components/payroll/contract/ContractSalaryTab'
import { ContractOvertimeTab } from '@/components/payroll/contract/ContractOvertimeTab'
import { ContractNetPaymentTab } from '@/components/payroll/contract/ContractNetPaymentTab'
import { PrintOrientationSelect } from '@/components/shared/PrintOrientationSelect'
import { usePrintOrientation } from '@/hooks/usePrintOrientation'

function ContractPayrollContent() {
  const sheetPrint = usePrintOrientation('contract')
  const page = useContractPage()
  const { canEditAccounts, askConfirm, modals, activeTab, setContractList, selectedMonth, setSelectedMonth, daysInMonth, setDaysInMonth, activeSlip, setActiveSlip, isEditable, dirtyCount, hasUnsavedChanges, requestNavigationGuard, reload, handleSave, handleDiscard, handleAddCustomColumn, staleRows, staleTotals, saveRecalc } = page

  return (
    <div className="space-y-6 print:space-y-2">
      <div className="print:hidden">
        <PageHeader
          title={
            activeTab === 'overtime'
              ? 'Contract OverTime'
              : activeTab === 'net-payment'
                ? 'Net Payment Contract 1 to 31'
                : 'Contract Employees'
          }
          showTitle={false}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Payroll', href: '/payroll/contract' },
            {
              label:
                activeTab === 'overtime'
                  ? 'Contract OverTime'
                  : activeTab === 'net-payment'
                    ? 'Net Payment Contract 1 to 31'
                    : 'Contract Employees',
            },
          ]}
          actions={
            <>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <PayrollMonthSelect
                  value={selectedMonth}
                  disabled={!canEditAccounts}
                  onChange={
                    canEditAccounts
                      ? (m) => {
                          if (m === selectedMonth) return
                          if (hasUnsavedChanges) {
                            askConfirm({
                              title: 'Unsaved Changes',
                              message:
                                'Aap ke paas unsaved changes hain. Agar aap month change karein ge toh unsaved changes zaya ho jayengi. Proceed karein?',
                              confirmText: 'Discard & Switch',
                              onConfirm: async () => {
                                await payrollService.setActiveSalariedMonthAsync(m)
                                setSelectedMonth(m)
                              },
                            })
                            return
                          }
                          payrollService.setActiveSalariedMonthAsync(m).then(() => setSelectedMonth(m))
                        }
                      : undefined
                  }
                />
                <select
                  value={daysInMonth}
                  disabled={!canEditAccounts}
                  onChange={(e) => {
                    const days = Number(e.target.value)
                    if (days === daysInMonth) return
                    requestNavigationGuard(() => {
                      setDaysInMonth(days)
                      setContractList((prev) =>
                        prev.map((row) => payrollService.calculateContractSalaryRow(row, days))
                      )
                    })
                  }}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
                  aria-label="Days in month"
                >
                  <option value={30}>30 Days</option>
                  <option value={31}>31 Days</option>
                  <option value={28}>28 Days</option>
                </select>
              </div>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <AddColumnButton onAddColumn={handleAddCustomColumn} />

                <PayrollSaveButton
                  onClick={handleSave}
                  disabled={!isEditable}
                  dirtyCount={dirtyCount}
                />
                <MonthLockButton month={selectedMonth} onStatusChange={reload} />
                <PrintOrientationSelect value={sheetPrint.orientation} onChange={sheetPrint.setOrientation} />
                <button
                  type="button"
                  onClick={sheetPrint.print}
                  className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800"
                >
                  <Printer className="size-3.5" />
                  <span>Print</span>
                </button>
                <ExportPdfButton orientation={sheetPrint.orientation} filename={`Contract-${activeTab}-${selectedMonth}`} className="!min-h-9 !h-9" />
              </div>
            </>
          }
        />
      </div>

      {/* Safety Notice if Editing is Disabled */}
      {!canEditAccounts && (
        <div className="flex items-center gap-2.5 p-3 rounded-md border border-amber-200 bg-amber-50/50 text-amber-900 text-xs font-medium print:hidden">
          <Lock className="size-4 shrink-0 text-amber-600" />
          <span>
            Edit Protection Active: Click <strong>&quot;Enable Editing&quot;</strong> in the top navigation bar to modify contract payroll, overtime, or insert rows.
          </span>
        </div>
      )}

      {/* Unsaved changes banner */}
      <PayrollUnsavedBanner
        dirtyCount={dirtyCount}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      {/* Saved before the Excel-like (paise) hisab — e.g. September: show and let Tufail save. */}
      {staleRows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 print:hidden">
          <span>
            Is mahine ki save ki hui raqam purane hisab (har row round) se hai. Excel jaisa hisab (paise ke saath) se{' '}
            <strong>{staleRows.length}</strong> logon ki raqam 1–2 rupay badalti hai — OT total{' '}
            <strong>{Math.round(staleTotals.otBefore).toLocaleString('en-US')}</strong> →{' '}
            <strong>{Math.round(staleTotals.otAfter).toLocaleString('en-US')}</strong>, Net total{' '}
            <strong>{Math.round(staleTotals.netBefore).toLocaleString('en-US')}</strong> →{' '}
            <strong>{Math.round(staleTotals.netAfter).toLocaleString('en-US')}</strong>. Table naya hisab dikha raha hai.
          </span>
          {isEditable ? (
            <button type="button" onClick={saveRecalc} className="rounded-md bg-sky-700 px-3 py-1.5 font-semibold text-white cursor-pointer">
              Naya hisab save karein
            </button>
          ) : canEditAccounts ? (
            <span className="font-semibold">Mahina locked hai — pehle unlock karein, phir save.</span>
          ) : null}
        </div>
      )}

      {modals}

      {/* VIEW 1: Sheet 4 - Contract Salaries */}
      {activeTab === 'employees' && <ContractSalaryTab page={page} />}

      {/* VIEW 2: Sheet 5 - Contract OverTime */}
      {activeTab === 'overtime' && <ContractOvertimeTab page={page} />}

      {/* VIEW 3: Sheet 7 - Net Payment Contract 1 to 31 */}
      {activeTab === 'net-payment' && <ContractNetPaymentTab page={page} />}
      {/* Employee Pay Slip Modal */}
      {activeSlip && (
        <EmployeePaySlipModal
          slip={activeSlip}
          onClose={() => setActiveSlip(null)}
        />
      )}
    </div>
  )
}

export default function ContractEmployeesPayrollPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Contract Sheet...</div>}>
      <ContractPayrollContent />
    </Suspense>
  )
}
