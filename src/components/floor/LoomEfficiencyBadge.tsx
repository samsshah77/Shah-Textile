'use client'

import { cn } from '@/lib/utils'
import { Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react'

interface LoomEfficiencyBadgeProps {
  efficiency: number
  bonusPercentage?: number
  showBonus?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function LoomEfficiencyBadge({
  efficiency,
  bonusPercentage = 0,
  showBonus = true,
  size = 'md',
}: LoomEfficiencyBadgeProps) {
  const isHigh = efficiency >= 85
  const isNormal = efficiency >= 70 && efficiency < 85
  const isSuboptimal = efficiency < 70

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full font-mono font-bold transition-all shadow-xs',
          sizeClasses[size],
          isHigh && 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/40',
          isNormal && 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30',
          isSuboptimal && 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 animate-pulse'
        )}
      >
        <span
          className={cn(
            'size-1.5 rounded-full',
            isHigh && 'bg-blue-500',
            isNormal && 'bg-sky-500',
            isSuboptimal && 'bg-rose-500'
          )}
        />
        <span>{efficiency.toFixed(1)}%</span>
        {isHigh && <Sparkles className="size-3 text-blue-600 dark:text-blue-400" />}
        {isSuboptimal && <AlertCircle className="size-3 text-rose-600 dark:text-rose-400" />}
      </div>

      {showBonus && (
        <span
          className={cn(
            'font-mono text-[10px] font-semibold',
            bonusPercentage > 0
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-muted-foreground'
          )}
        >
          {bonusPercentage > 0 ? `Bonus: +${bonusPercentage}%` : 'No Bonus (<70%)'}
        </span>
      )}
    </div>
  )
}
