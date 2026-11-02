import type { DailyLoomProductionEntry } from '@/types/production'
import { summarizeProductionDay } from '@/lib/floor/daySummary'

const n = (v: number) => Math.round(v).toLocaleString('en-US')

function dayLabel(date: string) {
  try {
    return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return date
  }
}

/** Short WhatsApp / email text for one day's production sheet — the numbers as on the sheet. */
export function productionWhatsAppText(date: string, rows: DailyLoomProductionEntry[]): string {
  const s = summarizeProductionDay(rows)
  const lines = [
    `*Shah Textile — Production Sheet*`,
    dayLabel(date),
    ``,
    `Production: *${n(s.meters)} m* (A ${n(s.shiftA)} / B ${n(s.shiftB)})`,
    `Efficiency: ${Math.round(s.efficiency)}% · 24h: ${Math.round(s.efficiency24)}%`,
    `Looms chal rahe: ${s.running} / ${s.looms}`,
  ]
  if (s.weightKg > 0) lines.push(`Weight: ${n(s.weightKg)} kg`)
  if (s.stopped.length) lines.push(`Band: ${s.stopped.map((x) => `L${x.loom} ${x.status}`).join(', ')}`)
  return lines.join('\n')
}
