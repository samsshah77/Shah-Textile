import { longDayDateFromYmd } from '@/lib/longDate'
import type { YarnMaster } from '@/services/production/masterTypes'

const fmt = (v: number) =>
  (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Short WhatsApp / email text for Yarn Stock — same style as Production Sheet & Quality. */
export function yarnWhatsAppText(date: string, yarn: YarnMaster[]): string {
  const received = yarn.reduce((s, y) => s + (y.receivedKg || 0), 0)
  const issued = yarn.reduce((s, y) => s + (y.issuedKg || 0), 0)
  const balance = yarn.reduce((s, y) => s + (y.balanceKg || 0), 0)
  const bags = yarn.reduce((s, y) => s + (y.bags || 0), 0)

  const lines = [
    `*Sara Textile — Yarn Stock (Weft)*`,
    longDayDateFromYmd(date),
    ``,
    `Received: *${fmt(received)} kg* (${bags} bags)`,
    `Issued: *${fmt(issued)} kg*`,
    `Balance: *${fmt(balance)} kg*`,
    ``,
    ...yarn.map((y, i) => `${i + 1}. ${y.yarnType} — Bal: ${fmt(y.balanceKg)} kg (${y.bags} bags)`),
  ]
  return lines.join('\n')
}

