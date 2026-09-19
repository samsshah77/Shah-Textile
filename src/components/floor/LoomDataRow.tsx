'use client'

import { useState, useEffect } from 'react'
import { DailyLoomProductionEntry, calculateProductionMetrics } from '@/types/production'
import { LoomCategory, LoomStatus } from '@/types/loom'
import { LoomEfficiencyBadge } from './LoomEfficiencyBadge'
import { cn } from '@/lib/utils'
import { PlayCircle, PauseCircle, Wrench, RefreshCw, AlertOctagon } from 'lucide-react'

interface LoomDataRowProps {
  entry: DailyLoomProductionEntry
  onUpdate: (loomNumber: number, patch: Partial<DailyLoomProductionEntry>) => void
  isModified?: boolean
  readOnly?: boolean
  availableQualities?: string[]
}

const statusConfig: Record<LoomStatus, { label: string; icon: any; badge: string }> = {
  RUNNING: {
    label: 'RUNNING',
    icon: PlayCircle,
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  },
  STOPPED: {
    label: 'STOPPED',
    icon: PauseCircle,
    badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  },
  BREAKDOWN: {
    label: 'BREAKDOWN',
    icon: Wrench,
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  KNOTTING: {
    label: 'KNOTTING',
    icon: RefreshCw,
    badge: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
  },
  BEAM_END: {
    label: 'BEAM END',
    icon: AlertOctagon,
    badge: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  },
}

export function LoomDataRow({
  entry,
  onUpdate,
  isModified,
  readOnly = false,
  availableQualities = [],
}: LoomDataRowProps) {
  const [shiftA, setShiftA] = useState<number | string>(entry.shiftAMeters)
  const [shiftB, setShiftB] = useState<number | string>(entry.shiftBMeters)
  const [rpm, setRpm] = useState<number | string>(entry.rpm)
  const [pick, setPick] = useState<number | string>(entry.pick)
  const [runningHours, setRunningHours] = useState<number | string>(entry.runningHours || 24)
  const [status, setStatus] = useState<LoomStatus>(entry.status)

  useEffect(() => {
    setShiftA(entry.shiftAMeters)
    setShiftB(entry.shiftBMeters)
    setRpm(entry.rpm)
    setPick(entry.pick)
    setRunningHours(entry.runningHours || 24)
    setStatus(entry.status)
  }, [entry])

  const numShiftA = Number(shiftA) || 0
  const numShiftB = Number(shiftB) || 0
  const numRpm = Number(rpm) || 340
  const numPick = Number(pick) || 60
  const numHours = Number(runningHours) || 24

  const liveCalculations = calculateProductionMetrics({
    shiftAMeters: numShiftA,
    shiftBMeters: numShiftB,
    rpm: numRpm,
    pick: numPick,
    runningHours: numHours,
  })

  const handleBlurCommit = () => {
    if (readOnly) return
    onUpdate(entry.loomNumber, {
      shiftAMeters: numShiftA,
      shiftBMeters: numShiftB,
      rpm: numRpm,
      pick: numPick,
      runningHours: numHours,
    })
  }

  const handleStatusChange = (newStatus: LoomStatus) => {
    if (readOnly) return
    setStatus(newStatus)
    onUpdate(entry.loomNumber, {
      status: newStatus,
    })
  }

  const handleQualityChange = (newQuality: string) => {
    if (readOnly) return
    onUpdate(entry.loomNumber, {
      qualityName: newQuality,
    })
  }

  const isSuboptimal = liveCalculations.efficiencyPercentage < 70 && status === 'RUNNING'

  return (
    <tr
      className={cn(
        'group border-b border-slate-200/80 dark:border-slate-800 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50',
        isSuboptimal && 'bg-rose-500/5 hover:bg-rose-500/10',
        isModified && 'bg-amber-500/5'
      )}
    >
      {/* 1. Loom # & Model */}
      <td className="py-3 px-3.5 whitespace-nowrap">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 font-extrabold text-sm text-[#0066cc] dark:text-sky-300 shadow-xs">
            {entry.loomNumber.toString().padStart(2, '0')}
          </div>
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
      </td>

      {/* 2. Quality Name & Fabric Spec */}
      <td className="py-3 px-3 max-w-[260px]">
        <div className="flex items-center gap-2">
          {availableQualities.length > 0 && !readOnly ? (
            <select
              value={entry.qualityName}
              onChange={(e) => handleQualityChange(e.target.value)}
              className="font-bold text-sm text-slate-900 dark:text-slate-100 bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 hover:border-[#0066cc] focus:outline-none cursor-pointer py-0.5 max-w-[180px] truncate"
            >
              {availableQualities.map((q) => (
                <option key={q} value={q} className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900">
                  {q}
                </option>
              ))}
              {!availableQualities.includes(entry.qualityName) && (
                <option value={entry.qualityName} className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900">
                  {entry.qualityName}
                </option>
              )}
            </select>
          ) : (
            <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate" title={entry.qualityName}>
              {entry.qualityName}
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-1 font-sans truncate pt-1 font-medium">
          <span>{entry.fabricType}</span>
          <span>•</span>
          <span>{entry.widthInch}&quot;</span>
          <span>•</span>
          <span>{entry.gsm} GSM</span>
          {entry.reed > 0 && (
            <>
              <span>•</span>
              <span>R{entry.reed}</span>
            </>
          )}
        </div>
      </td>

      {/* 3. SW / Lot tag */}
      <td className="py-3 px-2 whitespace-nowrap text-center">
        {entry.lot ? (
          <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-medium">
            {entry.lot.toLowerCase().includes('sw') ? entry.lot : `Sw # ${entry.lot}`}
          </span>
        ) : (
          <span className="text-slate-400 text-xs">—</span>
        )}
      </td>

      {/* 4. Status Dropdown */}
      <td className="py-3 px-2 whitespace-nowrap">
        <select
          value={status}
          disabled={readOnly}
          onChange={(e) => handleStatusChange(e.target.value as LoomStatus)}
          className={cn(
            'rounded-lg border px-2.5 py-1.5 text-xs font-bold outline-none transition-colors shadow-xs',
            readOnly ? 'cursor-default opacity-80' : 'cursor-pointer',
            statusConfig[status]?.badge || 'bg-slate-100 border-slate-200 text-slate-800'
          )}
        >
          <option value="RUNNING">RUNNING</option>
          <option value="STOPPED">STOPPED</option>
          <option value="KNOTTING">KNOTTING</option>
          <option value="BREAKDOWN">BREAKDOWN</option>
          <option value="BEAM_END">BEAM END</option>
        </select>
        {entry.remarks && (
          <span className="block text-xs text-slate-500 dark:text-slate-400 font-sans pt-1 max-w-[130px] truncate">
            {entry.remarks}
          </span>
        )}
      </td>

      {/* 4. RPM */}
      <td className="py-3 px-2 text-right">
        <input
          type="number"
          value={rpm}
          disabled={readOnly}
          onChange={(e) => setRpm(e.target.value)}
          onBlur={handleBlurCommit}
          className={cn(
            'w-16 rounded-md border border-transparent bg-transparent px-2 py-1 text-right font-mono text-sm font-semibold text-slate-900 dark:text-slate-100',
            readOnly ? 'cursor-default' : 'hover:border-slate-300 focus:border-[#0066cc] focus:bg-white dark:focus:bg-slate-800 focus:outline-none'
          )}
        />
      </td>

      {/* 5. Pick */}
      <td className="py-3 px-2 text-right">
        <input
          type="number"
          value={pick}
          disabled={readOnly}
          onChange={(e) => setPick(e.target.value)}
          onBlur={handleBlurCommit}
          className={cn(
            'w-14 rounded-md border border-transparent bg-transparent px-2 py-1 text-right font-mono text-sm font-semibold text-slate-900 dark:text-slate-100',
            readOnly ? 'cursor-default' : 'hover:border-slate-300 focus:border-[#0066cc] focus:bg-white dark:focus:bg-slate-800 focus:outline-none'
          )}
        />
      </td>

      {/* 6. Running Hours */}
      <td className="py-3 px-2 text-right">
        <input
          type="number"
          step="0.5"
          max="48"
          min="0"
          value={runningHours}
          disabled={readOnly}
          onChange={(e) => setRunningHours(e.target.value)}
          onBlur={handleBlurCommit}
          className={cn(
            'w-14 rounded-md border border-transparent bg-transparent px-2 py-1 text-right font-mono text-sm font-semibold text-slate-900 dark:text-slate-100',
            readOnly ? 'cursor-default' : 'hover:border-slate-300 focus:border-[#0066cc] focus:bg-white dark:focus:bg-slate-800 focus:outline-none'
          )}
        />
      </td>

      {/* 7. Shift A (m) */}
      <td className="py-3 px-2 text-right">
        <input
          type="number"
          step="1"
          value={shiftA}
          disabled={readOnly}
          onChange={(e) => setShiftA(e.target.value)}
          onBlur={handleBlurCommit}
          className={cn(
            'w-20 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/90 px-2 py-1.5 text-right font-mono text-sm font-bold text-slate-900 dark:text-slate-100 shadow-xs',
            readOnly ? 'cursor-default opacity-80' : 'focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none'
          )}
        />
      </td>

      {/* 8. Shift B (m) */}
      <td className="py-3 px-2 text-right">
        <input
          type="number"
          step="1"
          value={shiftB}
          disabled={readOnly}
          onChange={(e) => setShiftB(e.target.value)}
          onBlur={handleBlurCommit}
          className={cn(
            'w-20 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/90 px-2 py-1.5 text-right font-mono text-sm font-bold text-slate-900 dark:text-slate-100 shadow-xs',
            readOnly ? 'cursor-default opacity-80' : 'focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none'
          )}
        />
      </td>

      {/* 9. Actual Total Meters */}
      <td className="py-3 px-3 text-right font-mono font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 whitespace-nowrap">
        {liveCalculations.totalMeters.toFixed(0)} m
      </td>

      {/* 10. Theoretical Target Meters */}
      <td className="py-3 px-3 text-right font-mono text-sm sm:text-base font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {liveCalculations.theoreticalMeters.toFixed(0)} m
      </td>

      {/* 11. Efficiency & Bonus Badge */}
      <td className="py-3 px-3 whitespace-nowrap">
        <LoomEfficiencyBadge
          efficiency={liveCalculations.efficiencyPercentage}
          bonusPercentage={liveCalculations.bonusPercentage}
          size="sm"
        />
      </td>

      {/* 12. Stop Loss (Meters) */}
      <td className="py-3 px-3 text-right font-mono font-semibold text-sm sm:text-base text-rose-600 dark:text-rose-400 whitespace-nowrap">
        {liveCalculations.stopLossMeters > 0 ? `${liveCalculations.stopLossMeters.toFixed(0)} m` : '—'}
      </td>
    </tr>
  )
}
