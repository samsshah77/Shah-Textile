import { longDayDateFromYmd } from '@/lib/longDate'

/** One quality line as the Quality tab shows it (Active / Hold) on the selected day. */
export interface QualityShareRow {
  name: string
  looms: number[]
  fabricType: string
  warpYarn: string
  weftYarn: string
  weavePlan: string
  reed: number
  pick: number
  widthInch: number
  gsm: number | null
  start: string
  production: number
}

export interface QualityShareData {
  /** 'Active Qualities' / 'Hold Qualities' */
  title: string
  date: string
  rows: QualityShareRow[]
}

/** Short WhatsApp / email text — same style as the Production Sheet message. */
export function qualityWhatsAppText(data: QualityShareData): string {
  const looms = new Set(data.rows.flatMap((r) => r.looms))
  const lines = [
    `*Shah Textile — ${data.title}*`,
    longDayDateFromYmd(data.date),
    ``,
    `Qualities: *${data.rows.length}* · Looms: ${looms.size}`,
    ``,
    ...data.rows.map((r, i) => `${i + 1}. ${r.name}${r.looms.length ? ` — L# ${r.looms.join(', ')}` : ''}`),
  ]
  return lines.join('\n')
}

