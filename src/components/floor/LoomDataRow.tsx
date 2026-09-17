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
}

const statusConfig: Record<LoomStatus, { label: string; icon: any; badge: string }> = {
  RUNNING: {
    label: 'RUNNING',
    icon: PlayCircle,
    badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  },
  STOPPED: {
    label: 'STOPPED',
    icon: PauseCircle,
    badge: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  },
  BREAKDOWN: {
    label: 'BREAKDOWN',
    icon: Wrench,
    badge: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
  KNOTTING: {
    label: 'KNOTTING',
    icon: RefreshCw,
    badge: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
  },
  BEAM_END: {
    label: 'BEAM END',
    icon: AlertOctagon,
    badge: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  },
}

export function LoomDataRow({ entry, onUpdate, isModified, readOnly = false }: LoomDataRowProps) {
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

  const isSuboptimal = liveCalculations.efficiencyPercentage < 70 && status === 'RUNNING'

  return (
    <tr
      className={cn(
        'group border-b border-border/60 transition-colors hover:bg-muted/40 font-mono text-xs',
        isSuboptimal && 'bg-rose-500/5 hover:bg-rose-500/10',
        isModified && 'bg-amber-500/5'
      )}
    >
      {/* 1. Loom # & Model */}
      <td className="py-2.5 px-3 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-muted border border-border font-bold text-foreground">
            {entry.loomNumber.toString().padStart(2, '0')}
          </div>
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-bold border',
              entry.category === 'G6200' && 'bg-blue-500/10 text-blue-600 border-blue-500/20',
              entry.category === 'G6300' && 'bg-sky-500/10 text-sky-600 border-sky-500/20',
              entry.category === 'PU' && 'bg-purple-500/10 text-purple-600 border-purple-500/20'
            )}
          >
            {entry.category}
          </span>
        </div>
      </td>

      {/* 2. Quality Name, Type & Specifications */}
      <td className="py-2.5 px-3 max-w-[220px] font-sans text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-foreground truncate" title={entry.qualityName}>
            {entry.qualityName}
          </span>
          {entry.lot && (
            <span className="font-mono text-[9px] bg-muted px-1 rounded text-muted-foreground border shrink-0">
              {entry.lot}
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground flex gap-1 font-mono truncate pt-0.5">
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

      {/* 3. Status Dropdown */}
      <td className="py-2.5 px-2">
        <select
          value={status}
          disabled={readOnly}
          onChange={(e) => handleStatusChange(e.target.value as LoomStatus)}
          className={cn(
            'rounded-md border px-2 py-1 text-[10px] font-bold outline-none transition-colors',
            readOnly ? 'cursor-default opacity-80' : 'cursor-pointer',
            statusConfig[status]?.badge || 'bg-muted border-border'
          )}
        >
          <option value="RUNNING">RUNNING</option>
          <option value="STOPPED">STOPPED</option>
          <option value="KNOTTING">KNOTTING</option>
          <option value="BREAKDOWN">BREAKDOWN</option>
          <option value="BEAM_END">BEAM END</option>
        </select>
        {entry.remarks && (
          <span className="block text-[9px] text-muted-foreground font-sans pt-0.5">
            {entry.remarks}
          </span>
        )}
      </td>

      {/* 4. RPM */}
      <td className="py-2.5 px-2 text-right">
        <input
          type="number"
          value={rpm}
          disabled={readOnly}
          onChange={(e) => setRpm(e.target.value)}
          onBlur={handleBlurCommit}
          className={cn(
            'w-14 rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-xs font-semibold text-foreground',
            readOnly ? 'cursor-default' : 'hover:border-border focus:border-blue-500 focus:bg-background focus:outline-none'
          )}
        />
      </td>

      {/* 5. Pick */}
      <td className="py-2.5 px-2 text-right">
        <input
          type="number"
          value={pick}
          disabled={readOnly}
          onChange={(e) => setPick(e.target.value)}
          onBlur={handleBlurCommit}
          className={cn(
            'w-12 rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-xs font-semibold text-foreground',
            readOnly ? 'cursor-default' : 'hover:border-border focus:border-blue-500 focus:bg-background focus:outline-none'
          )}
        />
      </td>

      {/* 6. Running Hours */}
      <td className="py-2.5 px-2 text-right">
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
            'w-12 rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-xs font-semibold text-foreground',
            readOnly ? 'cursor-default' : 'hover:border-border focus:border-blue-500 focus:bg-background focus:outline-none'
          )}
        />
      </td>

      {/* 7. Shift A (m) */}
      <td className="py-2.5 px-2 text-right">
        <input
          type="number"
          step="1"
          value={shiftA}
          disabled={readOnly}
          onChange={(e) => setShiftA(e.target.value)}
          onBlur={handleBlurCommit}
          className={cn(
            'w-16 rounded border border-border/80 bg-background/50 px-1.5 py-1 text-right font-mono text-xs font-bold text-foreground',
            readOnly ? 'cursor-default opacity-80' : 'focus:border-blue-500 focus:bg-background focus:outline-none'
          )}
        />
      </td>

      {/* 8. Shift B (m) */}
      <td className="py-2.5 px-2 text-right">
        <input
          type="number"
          step="1"
          value={shiftB}
          disabled={readOnly}
          onChange={(e) => setShiftB(e.target.value)}
          onBlur={handleBlurCommit}
          className={cn(
            'w-16 rounded border border-border/80 bg-background/50 px-1.5 py-1 text-right font-mono text-xs font-bold text-foreground',
            readOnly ? 'cursor-default opacity-80' : 'focus:border-blue-500 focus:bg-background focus:outline-none'
          )}
        />
      </td>

      {/* 9. Actual Total Meters */}
      <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground whitespace-nowrap">
        {liveCalculations.totalMeters.toFixed(0)} m
      </td>

      {/* 10. Theoretical Meters */}
      <td className="py-2.5 px-3 text-right font-mono text-muted-foreground whitespace-nowrap">
        {liveCalculations.theoreticalMeters.toFixed(0)} m
      </td>

      {/* 11. Efficiency & Bonus Badge */}
      <td className="py-2.5 px-3 whitespace-nowrap">
        <LoomEfficiencyBadge
          efficiency={liveCalculations.efficiencyPercentage}
          bonusPercentage={liveCalculations.bonusPercentage}
          size="sm"
        />
      </td>

      {/* 12. Stop Loss (Meters) */}
      <td className="py-2.5 px-3 text-right font-mono font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap">
        {liveCalculations.stopLossMeters > 0 ? `${liveCalculations.stopLossMeters.toFixed(0)} m` : '—'}
      </td>
    </tr>
  )
}
