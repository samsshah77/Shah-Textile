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

/** Clean WhatsApp summary text for one day's production sheet (numbers + PDF attachment notice). */
export function productionWhatsAppText(date: string, rows: DailyLoomProductionEntry[]): string {
  const s = summarizeProductionDay(rows)
  const lines = [
    `*Sara Textile Weaving Mill*`,
    `📄 *Daily Loom Production Sheet*`,
    dayLabel(date),
    `─────────────────────────`,
    `📊 *Total Production:* *${n(s.meters)} m*`,
    `   • Shift A: ${n(s.shiftA)} m`,
    `   • Shift B: ${n(s.shiftB)} m`,
    `⚡ *Running Efficiency:* *${Math.round(s.efficiency)}%* (24h: ${Math.round(s.efficiency24)}%)`,
    `🏭 *Active Looms:* ${s.running} / ${s.looms} Running`,
  ]
  if (s.weightKg > 0) lines.push(`⚖️ *Total Weight:* ${n(s.weightKg)} kg`)
  if (s.stopped.length) {
    lines.push(`⚠️ *Stopped Looms (${s.stopped.length}):*`)
    for (const x of s.stopped) {
      lines.push(`   • L-${String(x.loom).padStart(2, '0')}: ${x.status}${x.remarks ? ` (${x.remarks})` : ''}`)
    }
  }
  lines.push(`─────────────────────────`, `📌 *Attached:* Detailed Loom Production Sheet (.pdf)`)
  return lines.join('\n')
}
