'use client'

import { useState } from 'react'
import { payrollService, formatPayrollMonthLabel } from '@/services/payrollService'
import { useAuth } from '@/context/AuthContext'
import { MonthLockInfo } from '@/types/payroll'
import { Lock, Unlock, CheckCircle2, ShieldAlert, Sparkles, FileText, ChevronRight } from 'lucide-react'
import { formatCurrency, formatNumber } from '@/lib/utils'

interface MonthLockBannerProps {
  month: string
  onStatusChange?: () => void
  className?: string
}

export function MonthLockBanner({ month, onStatusChange, className = '' }: MonthLockBannerProps) {
  const { canEditAccounts, user } = useAuth()
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
      <div
        className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg border print:hidden transition-all ${
          isLocked
            ? 'bg-slate-900 border-slate-700 text-white shadow-sm'
            : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
        } ${className}`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center justify-center size-9 rounded-md shrink-0 font-mono text-xs ${
              isLocked
                ? 'bg-blue-500/20 text-blue-400 border border-blue-400/30'
                : 'bg-emerald-500/20 text-emerald-700 border border-emerald-400/30'
            }`}
          >
            {isLocked ? <Lock className="size-4" /> : <Sparkles className="size-4" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  isLocked
                    ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
                    : 'bg-emerald-200/60 text-emerald-800 border border-emerald-300'
                }`}
              >
                {isLocked ? 'FINALIZED & LOCKED' : 'WORKING DRAFT'}
              </span>
              <span className="text-xs font-semibold">
                {formatPayrollMonthLabel(month)}
              </span>
            </div>
            <p className={`text-[11px] mt-0.5 ${isLocked ? 'text-slate-300' : 'text-emerald-800/80'}`}>
              {isLocked ? (
                <>
                  Audited & posted by <strong className="text-white">{lockInfo?.lockedBy || 'Admin'}</strong> on{' '}
                  {lockInfo?.lockedAt ? new Date(lockInfo.lockedAt).toLocaleDateString('en-GB') : 'N/A'}. Edits are protected.
                </>
              ) : (
                'Live draft mode: formulas calculate automatically. Changes will update totals immediately.'
              )}
            </p>
          </div>
        </div>

        {canEditAccounts && (
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {isLocked ? (
              <button
                type="button"
                onClick={() => setShowConfirmUnlock(true)}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 cursor-pointer transition-colors shadow-xs"
              >
                <Unlock className="size-3.5 text-amber-400" />
                <span>Unlock for Revisions</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowConfirmLock(true)}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer transition-colors shadow-xs"
              >
                <Lock className="size-3.5" />
                <span>Finalize & Lock Month</span>
              </button>
            )}
          </div>
        )}
      </div>

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
