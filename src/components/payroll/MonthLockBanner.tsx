'use client'

import { useState } from 'react'
import { payrollService, formatPayrollMonthLabel } from '@/services/payrollService'
import { useAuth } from '@/context/AuthContext'
import { Lock, Unlock, ShieldAlert } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export interface MonthLockBannerProps {
  month: string
  onStatusChange?: () => void
  className?: string
}

export function MonthLockButton({ month, onStatusChange, className = '' }: MonthLockBannerProps) {
  const { canEditPayroll: canEditAccounts, user } = useAuth()
  const [isProcessing, setIsProcessing] = useState(false)
  const [showConfirmLock, setShowConfirmLock] = useState(false)
  const [showConfirmUnlock, setShowConfirmUnlock] = useState(false)
  const [lockNotes, setLockNotes] = useState('')

  const lockInfo = payrollService.getMonthLock(month)
  const isLocked = Boolean(lockInfo?.locked)

  const handleLock = async () => {
    if (!canEditAccounts) return
    setIsProcessing(true)
    try {
      const actorName = user?.name || 'Accounts Admin'
      const res = await payrollService.lockMonthAsync(month, actorName, lockNotes)
      if (res.ok) {
        setShowConfirmLock(false)
        setLockNotes('')
        onStatusChange?.()
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const handleUnlock = async () => {
    if (!canEditAccounts) return
    setIsProcessing(true)
    try {
      const actorName = user?.name || 'Accounts Admin'
      const res = await payrollService.unlockMonthAsync(month, actorName)
      if (res.ok) {
        setShowConfirmUnlock(false)
        onStatusChange?.()
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const grandSummary = payrollService.getMonthlyGrandSummary(month)

  return (
    <>
      {canEditAccounts ? (
        isLocked ? (
          <button
            type="button"
            onClick={() => setShowConfirmUnlock(true)}
            disabled={isProcessing}
            title={`Locked by ${lockInfo?.lockedBy || 'Admin'}. Click to unlock for revisions.`}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 cursor-pointer transition-colors shadow-xs !min-h-9 !h-9 whitespace-nowrap print:hidden ${className}`}
          >
            <Unlock className="size-3.5 text-amber-400" />
            <span>Locked • Unlock</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowConfirmLock(true)}
            disabled={isProcessing}
            title="Finalize and lock this month to protect from accidental edits"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white cursor-pointer transition-colors shadow-xs !min-h-9 !h-9 whitespace-nowrap print:hidden ${className}`}
          >
            <Lock className="size-3.5" />
            <span>Finalize & Lock Month</span>
          </button>
        )
      ) : isLocked ? (
        <span
          title={`Locked by ${lockInfo?.lockedBy || 'Admin'}`}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 !min-h-9 !h-9 whitespace-nowrap print:hidden ${className}`}
        >
          <Lock className="size-3.5 text-slate-500" />
          <span>Locked</span>
        </span>
      ) : null}

      {/* Lock Confirmation Modal */}
      {showConfirmLock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Lock className="size-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Finalize & Lock Month?</h3>
                <p className="text-xs text-slate-500">
                  {formatPayrollMonthLabel(month)}
                </p>
              </div>
            </div>

            <div className="my-4 space-y-3">
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Reconciled Disbursal:</span>
                  <strong className="text-[#0066cc] font-sans text-sm">
                    {formatCurrency(grandSummary.monthlyTotalSalary)}
                  </strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Bank Cheque Total:</span>
                  <span className="font-semibold text-slate-800">
                    {formatCurrency(grandSummary.fortnight1Cheque + grandSummary.fortnight2Cheque)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Net Floor Cash Disbursal:</span>
                  <span className="font-semibold text-slate-800">
                    {formatCurrency(grandSummary.fortnight1Total + grandSummary.fortnight2Total)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Optional Audit / Finalization Notes:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Approved by Accounts Head & factory GM"
                  value={lockNotes}
                  onChange={(e) => setLockNotes(e.target.value)}
                  className="w-full text-xs rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
                />
              </div>

              <div className="rounded-md bg-amber-50 p-2.5 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                <ShieldAlert className="size-3.5 inline mr-1 text-amber-600 -mt-0.5" />
                Once locked, staff, weavers, and contract sheets for this month will be protected from accidental edits. Authorized accounts controllers can unlock at any time if adjustments are required.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowConfirmLock(false)}
                disabled={isProcessing}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLock}
                disabled={isProcessing}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md shadow-xs transition-colors"
              >
                {isProcessing ? 'Locking...' : 'Yes, Lock & Finalize'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unlock Confirmation Modal */}
      {showConfirmUnlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Unlock className="size-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Unlock Month for Edits?</h3>
                <p className="text-xs text-slate-500">
                  {formatPayrollMonthLabel(month)}
                </p>
              </div>
            </div>

            <p className="my-4 text-xs text-slate-600 leading-relaxed">
              Unlocking will allow salary, attendance, and overtime modifications on the Staff, Weavers, and Contract sheets. All changes will be logged in audit history.
            </p>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowConfirmUnlock(false)}
                disabled={isProcessing}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUnlock}
                disabled={isProcessing}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md shadow-xs transition-colors"
              >
                {isProcessing ? 'Unlocking...' : 'Unlock for Editing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Backward-compatibility export
export const MonthLockBanner = MonthLockButton
