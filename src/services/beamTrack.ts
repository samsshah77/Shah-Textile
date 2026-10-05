import type { DailyLoomProductionEntry } from '@/types/production'
import type { BeamMaster } from '@/services/productionMastersService'
import { getProductionToday } from '@/constants/productionCalendar'

/** Normalize beam / lot labels so "G 174" ≈ "G174", "Sw # 331" ≈ "sw331". */
export function normalizeBeamLotKey(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Daily Entry SW # text from beam Sw# only (Beam Identity is separate — never used as lot). */
export function formatSwLotForDailyEntry(
  swLot: string | null | undefined,
  _fallbackBeamNo?: string
): string {
  const raw = (swLot || '').trim()
  if (!raw) return ''
  if (/sw/i.test(raw)) return raw.replace(/\s+/g, ' ').trim()
  const digits = raw.replace(/\D/g, '')
  if (digits) return `Sw # ${digits}`
  return raw
}

/** Daily Entry column follows beam.swLot only. */
export function beamDailyEntryLot(beam: Pick<BeamMaster, 'beamNo' | 'swLot'>): string {
  return formatSwLotForDailyEntry(beam.swLot)
}

/**
 * Track keys = Sw# only.
 * Same Sw# can sit on many beams — per-beam Track also filters by that beam's loom.
 */
export function beamTrackLotKeys(beam: Pick<BeamMaster, 'beamNo' | 'swLot'>): string[] {
  const keys = new Set<string>()
  const raw = (beam.swLot || '').trim()
  if (!raw) return []
  keys.add(normalizeBeamLotKey(formatSwLotForDailyEntry(raw)))
  keys.add(normalizeBeamLotKey(raw))
  const digits = raw.replace(/\D/g, '')
  if (digits) keys.add(normalizeBeamLotKey(digits))
  return [...keys].filter(Boolean)
}

function entryMeters(e: {
  totalMeters?: number | null
  shiftAMeters?: number
  shiftBMeters?: number
}): number {
  if (e.totalMeters != null) return Number(e.totalMeters) || 0
  return (Number(e.shiftAMeters) || 0) + (Number(e.shiftBMeters) || 0)
}

export type BeamTrackDay = {
  date: string
  meters: number
  loomNumbers: number[]
}

export type BeamTrackResult = {
  beamNo: string
  swLot: string | null
  warp: string
  qualityId: string | null
  qualityName: string | null
  length: number
  consumed: number
  balance: number
  from: string | null
  to: string | null
  loomHint: string | null
  days: BeamTrackDay[]
  totalThreads: number
  loomType: string
}

/**
 * Excel “Beem Length” model: Length (master) − Σ daily meters on rows whose lot matches this beam.
 * Current life window: mountedOn → beamEndedOn | today; else first→last lot-hit day.
 */
export function buildBeamTrackFromEntries(
  beam: BeamMaster,
  entries: DailyLoomProductionEntry[],
  today: string = getProductionToday(),
  qualityName: string | null = null
): BeamTrackResult {
  const matchKeys = new Set(beamTrackLotKeys(beam))
  const length = Number(beam.length) || 0
  const loomHint = beam.usedInLoom
    ? String(beam.usedInLoom)
    : beam.endedFromLoom
      ? String(beam.endedFromLoom)
      : null

  // Same Sw# can cover many beams — count only this beam's loom(s).
  const loomNums = new Set<number>()
  const mountLoom = Number(beam.usedInLoom)
  const endLoom = Number(beam.endedFromLoom)
  if (Number.isFinite(mountLoom) && mountLoom > 0) loomNums.add(mountLoom)
  if (Number.isFinite(endLoom) && endLoom > 0) loomNums.add(endLoom)

  const lotHits = entries.filter((e) => {
    if (!matchKeys.size) return false
    const lotKey = normalizeBeamLotKey(e.lot || '')
    if (!lotKey || !matchKeys.has(lotKey)) return false
    // If we know the beam's loom, require it (avoids charging 5 beams the full Sw# total).
    if (loomNums.size > 0 && e.loomNumber != null && !loomNums.has(Number(e.loomNumber))) {
      return false
    }
    return true
  })

  const mountedOn = beam.mountedOn ? String(beam.mountedOn).slice(0, 10) : null
  const endedOn = beam.beamEndedOn ? String(beam.beamEndedOn).slice(0, 10) : null
  const todayDay = String(today || getProductionToday()).slice(0, 10)

  let from: string | null = mountedOn
  let to: string | null = mountedOn ? endedOn || todayDay : null

  if (!from) {
    const dates = [
      ...new Set(lotHits.map((e) => String(e.date || '').slice(0, 10)).filter(Boolean)),
    ].sort()
    from = dates[0] || null
    to = dates[dates.length - 1] || null
  }

  const inWindow = (dateStr: string) => {
    const d = String(dateStr || '').slice(0, 10)
    if (!d) return false
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  }

  const byDate = new Map<string, { meters: number; looms: Set<number> }>()
  for (const e of lotHits) {
    const d = String(e.date || '').slice(0, 10)
    if (!inWindow(d)) continue
    const m = entryMeters(e)
    if (m <= 0) continue
    const prev = byDate.get(d) || { meters: 0, looms: new Set<number>() }
    prev.meters += m
    if (e.loomNumber) prev.looms.add(e.loomNumber)
    byDate.set(d, prev)
  }

  const days: BeamTrackDay[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      meters: v.meters,
      loomNumbers: [...v.looms].sort((a, b) => a - b),
    }))

  const consumed = days.reduce((s, d) => s + d.meters, 0)
  const balance = length - consumed

  const swLotDisplay = beam.swLot?.trim()
    ? formatSwLotForDailyEntry(beam.swLot, '')
    : null

  return {
    beamNo: beam.beamNo,
    swLot: swLotDisplay || beam.swLot?.trim() || null,
    warp: beam.warp || '',
    qualityId: beam.qualityId ?? null,
    qualityName: qualityName || null,
    length,
    consumed,
    balance,
    from,
    to,
    loomHint,
    days,
    totalThreads: Number(beam.totalThreads) || 0,
    loomType: beam.loomType || '',
  }
}
