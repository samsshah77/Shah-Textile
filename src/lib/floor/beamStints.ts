import { beamTrackLotKeys, normalizeBeamLotKey } from '@/services/beamTrack'
import type { DailyLoomProductionEntry } from '@/types/production'

/** One time a beam sat on one loom (from /api/floor/beam-history?stints=1). */
export type BeamStint = {
  beamNo: string
  loom: number
  from: string
  /** Day it came off the loom; null = still on. */
  to: string | null
  length: number
  swLot: string | null
  warp: string
  qualityId: string | null
  /** History rows of this run (for Ended → Edit). */
  firstId?: string
  closeId?: string | null
  closeOffLoom?: boolean
}

/** Every beam-on-loom stint that overlaps from…to (read-only). */
export async function fetchBeamStints(from: string, to: string): Promise<BeamStint[]> {
  const r = await fetch(`/api/floor/beam-history?stints=1&from=${from}&to=${to}`, { credentials: 'same-origin', cache: 'no-store' })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d?.error || 'Beams load nahi ho sake.')
  return Array.isArray(d.stints) ? d.stints : []
}

export const entryMeters = (e: DailyLoomProductionEntry) =>
  e.totalMeters != null ? Number(e.totalMeters) || 0 : (Number(e.shiftAMeters) || 0) + (Number(e.shiftBMeters) || 0)

export const stintLotKeys = (s: BeamStint) => new Set(beamTrackLotKeys({ beamNo: s.beamNo, swLot: s.swLot }))

/**
 * Daily Entry rows made from the beam(s): rows of their loom inside any of their stints
 * whose lot is theirs (a row with no lot written counts too). Each row once, so two beams
 * side by side on one loom are not doubled.
 */
export function rowsFromBeams(entries: DailyLoomProductionEntry[], beams: BeamStint[], today: string): DailyLoomProductionEntry[] {
  if (!beams.length) return []
  const loom = beams[0].loom
  const keys = new Map(beams.map((s) => [s, stintLotKeys(s)]))
  return entries.filter((e) => {
    if (Number(e.loomNumber) !== loom) return false
    const d = String(e.date || '').slice(0, 10)
    if (!d) return false
    const lot = normalizeBeamLotKey(e.lot || '')
    return beams.some((s) => {
      if (d < s.from || d > (s.to || today)) return false
      const k = keys.get(s) || new Set<string>()
      return !k.size || !lot || k.has(lot)
    })
  })
}

/** Meters the beam(s) made while on the loom (any quality). */
export function beamMadeMeters(entries: DailyLoomProductionEntry[], beams: BeamStint[], today: string): number {
  return rowsFromBeams(entries, beams, today).reduce((sum, e) => sum + Math.max(0, entryMeters(e)), 0)
}

/** Ended → Edit: change the day a beam came off, or remove a record. Throws the server's message. */
export async function editBeamStint(body: {
  action: 'setStart' | 'setEnd' | 'remove' | 'add' | 'details'
  beamNo: string
  /** Not for 'add'. */
  firstId?: string
  loom?: number
  swLot?: string | null
  warp?: string
  length?: number
  from?: string
  to?: string
  oldFrom?: string
  oldTo?: string
}): Promise<void> {
  const r = await fetch('/api/floor/beam-history', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || !d?.ok) throw new Error(d?.error || 'Save nahi ho saka.')
}

/** Every beam as it stood at the end of `date` (Beams tab, past days). */
export async function fetchBeamsAsOf<T>(date: string): Promise<T[]> {
  const r = await fetch(`/api/floor/beam-history?date=${date}`, { credentials: 'same-origin', cache: 'no-store' })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d?.error || 'Beams load nahi ho sake.')
  return Array.isArray(d.beams) ? d.beams : []
}

/** Every run of one beam, oldest first (Beam History dialog). */
export async function fetchBeamRuns(beamNo: string): Promise<BeamStint[]> {
  const r = await fetch(`/api/floor/beam-history?beam=${encodeURIComponent(beamNo)}`, { credentials: 'same-origin', cache: 'no-store' })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d?.error || 'Beam history load nahi ho saki.')
  return Array.isArray(d.runs) ? d.runs : []
}

export type RunLotPlan = {
  lot: string
  empty: string[]
  same: string[]
  other: Array<{ date: string; lot: string }>
  noRow: string[]
}

async function postHistory<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch('/api/floor/beam-history', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || !d?.ok) throw new Error(d?.error || 'Save nahi ho saka.')
  return d as T
}

/** Beam History: which Daily Entry days of a run would get its Sw # (nothing is written). */
export const planRunLots = (beamNo: string, firstId: string) =>
  postHistory<{ loom: number; from: string; to: string; plan: RunLotPlan }>({ action: 'lotPlan', beamNo, firstId })

/** Beam History: write the run's Sw # into the empty Sw # cells of Daily Entry. */
export const fillRunLots = (beamNo: string, firstId: string) =>
  postHistory<{ loom: number; lot: string; filled: string[]; failed: Array<{ date: string; reason: string }> }>({
    action: 'fillLots',
    beamNo,
    firstId,
  })
