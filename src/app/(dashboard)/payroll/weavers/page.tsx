'use client'

import { Suspense } from 'react'
import { payrollService } from '@/services/payrollService'
import { AddColumnButton } from '@/components/shared/CustomColumnModal'
import { Printer, Lock, CalendarPlus, X } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { PayrollMonthSelect } from '@/components/payroll/PayrollMonthSelect'
import { FortnightSelect, fortnightDisplayLabel } from '@/components/payroll/FortnightSelect'
import { MonthLockButton } from '@/components/payroll/MonthLockBanner'
import { EmployeePaySlipModal } from '@/components/payroll/EmployeePaySlipModal'
import { PayrollSaveButton } from '@/components/payroll/PayrollSaveButton'
import { PayrollUnsavedBanner } from '@/components/payroll/PayrollUnsavedBanner'
import { useWeaversPage } from '@/components/payroll/weavers/useWeaversPage'
import { WeaverWagesTab } from '@/components/payroll/weavers/WeaverWagesTab'
import { WeaverOvertimeTab } from '@/components/payroll/weavers/WeaverOvertimeTab'
import { WeaverNetPaymentTab } from '@/components/payroll/weavers/WeaverNetPaymentTab'

function WeaversPayrollContent() {
  const page = useWeaversPage()
  const { canEditAccounts, modals, activeFortnight, setActiveFortnight, activeTab, setActiveTab, pushFilters, selectedMonth, setSelectedMonth, showGenerateDialog, setShowGenerateDialog, activeSlip, setActiveSlip, isEditable, newMonth, setNewMonth, newFortnight, setNewFortnight, dirtyCount, requestNavigationGuard, reload, openGenerateDialog, confirmGenerateFortnight, handleSave, handleDiscard, handlePrint, handleAddCustomColumn } = page

  return (
    <div className="space-y-6 print:space-y-2">
      {modals}
      <div className="print:hidden">
        <PageHeader
          title={
            activeTab === 'overtime'
              ? `Weawers OT ${activeFortnight}`
              : activeTab === 'net-payment'
                ? `Net Payment Weawers ${activeFortnight}`
                : `Weawers Wages ${activeFortnight}`
          }
          showTitle={false}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Payroll', href: '/payroll/weavers' },
            {
              label:
                activeTab === 'overtime'
                  ? `Weawers OT ${activeFortnight}`
                  : activeTab === 'net-payment'
                    ? `Net Payment Weawers ${activeFortnight}`
                    : `Weawers Wages ${activeFortnight}`,
            },
          ]}
          actions={
            <>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <PayrollMonthSelect
                  value={selectedMonth}
                  months={payrollService.listFortnightMonths()}
                  disabled={!canEditAccounts}
                  onChange={
                    canEditAccounts
                      ? (m) => {
                          if (m === selectedMonth) return
                          requestNavigationGuard(async () => {
                            const halves = payrollService.listAvailableFortnightsForMonth(m)
                            const nextFn = halves.includes(activeFortnight)
                              ? activeFortnight
                              : halves[0] || '1-15'
                            await payrollService.setActiveFortnightPeriodAsync(m, nextFn)
                            setSelectedMonth(m)
                            setActiveFortnight(nextFn)
                            pushFilters({ month: m, fortnight: nextFn, tab: activeTab })
                          })
                        }
                      : undefined
                  }
                />
                <FortnightSelect
                  month={selectedMonth}
                  value={activeFortnight}
                  disabled={!canEditAccounts}
                  onChange={
                    canEditAccounts
                      ? (fn) => {
                          if (fn === activeFortnight) return
                          requestNavigationGuard(async () => {
                            await payrollService.setActiveFortnightPeriodAsync(selectedMonth, fn)
                            setActiveFortnight(fn)
                            pushFilters({ fortnight: fn, tab: activeTab })
                          })
                        }
                      : undefined
                  }
                />
                <select
                  value={activeTab}
                  onChange={(e) => {
                    const tab = e.target.value as 'wages' | 'overtime' | 'net-payment'
                    if (tab === activeTab) return
                    requestNavigationGuard(() => {
                      setActiveTab(tab)
                      pushFilters({ tab, fortnight: activeFortnight })
                    })
                  }}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
                  aria-label="Sheet view"
                >
                  <option value="wages">Wages</option>
                  <option value="overtime">Overtime</option>
                  <option value="net-payment">Net Payment</option>
                </select>
                {canEditAccounts && (
                  <button
                    type="button"
                    onClick={openGenerateDialog}
                    className="erp-btn-primary text-xs !min-h-9 !h-9"
                  >
                    <CalendarPlus className="size-3.5" />
                    <span>Generate</span>
                  </button>
                )}
              </div>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <AddColumnButton onAddColumn={handleAddCustomColumn} />

                <PayrollSaveButton
                  onClick={handleSave}
                  disabled={!isEditable}
                  dirtyCount={dirtyCount}
                />
                <MonthLockButton month={selectedMonth} onStatusChange={reload} />
                <button
                  type="button"
                  onClick={handlePrint}
                  className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800"
                >
                  <Printer className="size-3.5" />
                  <span>Print</span>
                </button>
                <ExportPdfButton
                  filename={`Weavers-${selectedMonth}-${activeFortnight || 'all'}`}
                  className="!min-h-9 !h-9"
                />
              </div>
            </>
          }
        />
      </div>

      {showGenerateDialog && (
        <div
          className="fixed inset-0 z-[1080] flex items-center justify-center p-4 print:hidden"
          style={{ background: 'rgba(15, 23, 42, 0.48)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowGenerateDialog(false)
          }}
        >
          <div className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/5">
            <div className="relative px-5 pt-5 pb-4">
              <button
                type="button"
                onClick={() => setShowGenerateDialog(false)}
                className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
              <h3 className="text-[15px] font-semibold text-slate-900 pr-8">Generate fortnight</h3>
              <p className="mt-1.5 text-[13px] text-slate-600">
                Month aur half select karo, phir confirm karo.
              </p>
              <div className="mt-4 space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">Month</span>
                  <input
                    type="month"
                    value={newMonth}
                    onChange={(e) => setNewMonth(e.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0066cc] outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">Fortnight</span>
                  <select
                    value={newFortnight}
                    onChange={(e) => setNewFortnight(e.target.value as '1-15' | '16-31')}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
                  >
                    <option value="1-15">{fortnightDisplayLabel(newMonth, '1-15')}</option>
                    <option value="16-31">{fortnightDisplayLabel(newMonth, '16-31')}</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowGenerateDialog(false)}
                className="erp-btn-secondary text-xs"
              >
                Cancel
              </button>
              <button type="button" onClick={confirmGenerateFortnight} className="erp-btn-primary text-xs">
                <CalendarPlus className="size-3.5" />
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safety Notice if Editing is Disabled */}
      {!canEditAccounts && (
        <div className="flex items-center gap-2.5 p-3 rounded-md border border-amber-200 bg-amber-50/50 text-amber-900 text-xs font-medium print:hidden">
          <Lock className="size-4 shrink-0 text-amber-600" />
          <span>
            Edit Protection Active: Click <strong>&quot;Enable Editing&quot;</strong> in the top navigation bar to modify weaver wages, attendance, extra looms, or save changes.
          </span>
        </div>
      )}

      {/* Unsaved changes banner */}
      <PayrollUnsavedBanner
        dirtyCount={dirtyCount}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      {/* VIEW 1: Weavers Wages (Sheets 8 & 15) */}
      {activeTab === 'wages' && <WeaverWagesTab page={page} />}

      {/* VIEW 2: Weavers OT (Sheets 9 & 16) */}
      {activeTab === 'overtime' && <WeaverOvertimeTab page={page} />}

      {/* VIEW 3: Net Payment Weavers (Sheets 10 & 17) */}
      {activeTab === 'net-payment' && <WeaverNetPaymentTab page={page} />}
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

export default function WeaversPayrollPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Weavers Sheet...</div>}>
      <WeaversPayrollContent />
    </Suspense>
  )
}
