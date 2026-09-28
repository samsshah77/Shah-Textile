'use client'

import { useState, useEffect } from 'react'
import { DailyLoomProductionEntry, calculateProductionMetrics } from '@/types/production'
import { LoomCategory, LoomStatus } from '@/types/loom'
import { LoomEfficiencyBadge } from './LoomEfficiencyBadge'
import { LoomStatusSelect } from '@/components/floor/LoomStatusSelect'
import { cn } from '@/lib/utils'
import { Sparkles } from 'lucide-react'

interface LoomCardProps {
  entry: DailyLoomProductionEntry
  onUpdate: (loomNumber: number, patch: Partial<DailyLoomProductionEntry>) => void
  isModified?: boolean
  readOnly?: boolean
  availableQualities?: string[]
}

export function LoomCard({
  entry,
  onUpdate,
  isModified,
  readOnly = false,
  availableQualities = [],
}: LoomCardProps) {
  const [shiftA, setShiftA] = useState<number | string>(entry.shiftAMeters)
  const [shiftB, setShiftB] = useState<number | string>(entry.shiftBMeters)
  const [rpm, setRpm] = useState<number | string>(entry.rpm)
  const [pick, setPick] = useState<number | string>(entry.pick)
  const [status, setStatus] = useState<LoomStatus>(entry.status)

  useEffect(() => {
    setShiftA(entry.shiftAMeters)
    setShiftB(entry.shiftBMeters)
    setRpm(entry.rpm)
    setPick(entry.pick)
    setStatus(entry.status)
  }, [entry])

  const numShiftA = Number(shiftA) || 0
  const numShiftB = Number(shiftB) || 0
  const numRpm = Number(rpm) || 340
  const numPick = Number(pick) || 60

  const liveCalculations = calculateProductionMetrics({
    shiftAMeters: numShiftA,
    shiftBMeters: numShiftB,
    rpm: numRpm,
    pick: numPick,
    runningHours: entry.runningHours || 24,
    loomNumber: entry.loomNumber,
  })

  const handleBlurCommit = () => {
    if (readOnly) return
    onUpdate(entry.loomNumber, {
      shiftAMeters: numShiftA,
      shiftBMeters: numShiftB,
      rpm: numRpm,
      pick: numPick,
    })
  }

  const handleStatusChange = (newStatus: LoomStatus) => {
    if (readOnly) return
    setStatus(newStatus)
    onUpdate(entry.loomNumber, {
      status: newStatus,
    })
  }

  const isSuboptimal = liveCalculations.efficiencyPercentage < 70 && status === 'RUNNING'

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-all shadow-xs bg-white dark:bg-slate-900',
        isSuboptimal
          ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/20'
          : isModified
          ? 'border-amber-300 dark:border-amber-800 bg-amber-50/20 dark:bg-amber-950/10'
          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
      )}
    >
      {/* Top Bar: Loom Number, Category & Status */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-base font-extrabold text-[#0066cc] dark:text-sky-300 shadow-xs">
            {entry.loomNumber.toString().padStart(2, '0')}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Loom #{entry.loomNumber}
              </span>
              <span
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs font-bold border',
                  entry.category === 'G6200' && 'bg-blue-500/10 text-blue-600 border-blue-500/20',
                  entry.category === 'G6300' && 'bg-sky-500/10 text-sky-600 border-sky-500/20',
                  entry.category === 'PU' && 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                )}
              >
                {entry.category}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              RPM: {numRpm} • Pick: {numPick}
            </p>
          </div>
        </div>

        {/* Status Dropdown */}
        <LoomStatusSelect
          value={status}
          disabled={readOnly}
          onChange={handleStatusChange}
        />
      </div>

      {/* Fabric / Quality Info */}
      <div className="py-3 space-y-2">
        <div className="min-w-0">
          <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
            {entry.qualityName}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {entry.fabricType} • {entry.widthInch}&quot; • {typeof entry.gsm === 'number' && entry.gsm > 0 ? entry.gsm.toFixed(2) : (entry.gsm ?? '—')} GSM
            {entry.reed > 0 && ` • Reed ${entry.reed}`}
          </p>
        </div>
        {entry.lot && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">SW #</span>
            <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {entry.lot.toLowerCase().includes('sw') ? entry.lot : `Sw # ${entry.lot}`}
            </span>
          </div>
        )}
        {entry.remarks && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 px-2 py-1 text-xs text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <strong>Note:</strong> {entry.remarks}
          </div>
        )}
      </div>

      {/* Inputs: Shift A & Shift B (Touch Friendly for Mobile/iPhone) */}
      <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
            Shift A (Day)
          </label>
          <div className="relative">
            <input
              type="number"
              step="1"
              value={shiftA}
              disabled={readOnly}
              onChange={(e) => setShiftA(e.target.value)}
              onBlur={handleBlurCommit}
              className={cn(
                'h-11 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base font-mono font-bold text-slate-900 dark:text-slate-100 focus:border-[#0066cc] focus:ring-2 focus:ring-[#0066cc]/20 focus:outline-none transition-all',
                readOnly && 'cursor-default opacity-80'
              )}
              placeholder="0"
            />
            <span className="absolute right-3 top-3 font-mono text-xs font-semibold text-slate-400">
              m
            </span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
            Shift B (Night)
          </label>
          <div className="relative">
            <input
              type="number"
              step="1"
              value={shiftB}
              disabled={readOnly}
              onChange={(e) => setShiftB(e.target.value)}
              onBlur={handleBlurCommit}
              className={cn(
                'h-11 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base font-mono font-bold text-slate-900 dark:text-slate-100 focus:border-[#0066cc] focus:ring-2 focus:ring-[#0066cc]/20 focus:outline-none transition-all',
                readOnly && 'cursor-default opacity-80'
              )}
              placeholder="0"
            />
            <span className="absolute right-3 top-3 font-mono text-xs font-semibold text-slate-400">
              m
            </span>
          </div>
        </div>
      </div>

      {/* Production & Efficiency Live Metric Badges */}
      <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
        <div>
          <span className="text-slate-500 dark:text-slate-400 font-medium">Total: </span>
          <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm">
            {liveCalculations.totalMeters.toFixed(0)} m
          </span>
          <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px] ml-1">
            (Target: {liveCalculations.theoreticalMeters.toFixed(0)}m)
          </span>
        </div>

        <LoomEfficiencyBadge
          efficiency={liveCalculations.efficiencyPercentage}
          bonusPercentage={liveCalculations.bonusPercentage}
          size="sm"
        />
      </div>

      {liveCalculations.stopLossMeters > 0 && (
        <div className="mt-2 text-right font-mono text-xs font-medium text-rose-600 dark:text-rose-400">
          Stop Loss: -{liveCalculations.stopLossMeters.toFixed(0)} m
        </div>
      )}
    </div>
  )
}
