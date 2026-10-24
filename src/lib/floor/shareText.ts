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

/** Short WhatsApp text for one day's production sheet (numbers as on the sheet, plus a link). */
export function productionWhatsAppText(date: string, rows: DailyLoomProductionEntry[]): string {
  const s = summarizeProductionDay(rows)
  const origin = typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('localhost')
    ? window.location.origin
    : 'https://saratextilesweaving.com'
  const viewLink = `${origin}/floor/production?tab=sheet&date=${date}`
  const printLink = `${origin}/floor/production?tab=sheet&date=${date}&print=1`
  const lines = [
    `*Sara Textile — Production Sheet*`,
    dayLabel(date),
    ``,
    `Production: *${n(s.meters)} m* (A ${n(s.shiftA)} / B ${n(s.shiftB)})`,
    `Efficiency: ${Math.round(s.efficiency)}% · 24h: ${Math.round(s.efficiency24)}%`,
    `Looms chal rahe: ${s.running} / ${s.looms}`,
  ]
  if (s.weightKg > 0) lines.push(`Weight: ${n(s.weightKg)} kg`)
  if (s.stopped.length) lines.push(`Running nahi: ${s.stopped.map((x) => `${x.loom} (${x.status})`).join(', ')}`)
  lines.push(``, `🔗 *View Sheet:* ${viewLink}`, `🖨️ *Print / Save PDF:* ${printLink}`)
  return lines.join('\n')
}
