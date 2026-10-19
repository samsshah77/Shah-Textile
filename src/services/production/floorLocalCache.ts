/**
 * Browser backups for floor saves that have not reached the database yet
 * (quality ends, new/reused qualities, new beams, beam Sw#). Applied on top of the DB copy.
 */
import { isClient, normalizeBeam } from '@/services/production/loomBeamHelpers'
import type { BeamMaster, QualityLoomEnd, QualityMaster } from '@/services/production/masterTypes'
import { normalizeQuality, normalizeQualityStatus } from '@/services/production/masterTypes'


/** Browser backup so Quality Ends survive refresh if DB PUT is slow/fails. */
const KEY_QUALITY_ENDS_LOCAL = 'sara_textile_quality_ends_v1'
/** Browser backup for reused/new Active qualities until DB upsert confirms. */
const KEY_QUALITY_PENDING_LOCAL = 'sara_textile_quality_pending_v1'
/** Browser backup so Sw# survives refresh if DB patch is slow/fails. */
const KEY_BEAM_SWLOT_LOCAL = 'sara_textile_beam_swlot_v1'

function readLocalBeamSwLots(): Record<string, string> {
  if (!isClient()) return {}
  try {
    const raw = localStorage.getItem(KEY_BEAM_SWLOT_LOCAL)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed || {})) {
      const s = String(v || '').trim()
      if (k && s) out[k] = s
    }
    return out
  } catch {
    return {}
  }
}

export function writeLocalBeamSwLot(beamNo: string, swLot: string | null | undefined) {
  if (!isClient() || !beamNo) return
  try {
    const map = readLocalBeamSwLots()
    const next = swLot != null && String(swLot).trim() !== '' ? String(swLot).trim() : ''
    if (next) map[beamNo] = next
    else delete map[beamNo]
    localStorage.setItem(KEY_BEAM_SWLOT_LOCAL, JSON.stringify(map))
  } catch {
    // ignore
  }
}

export function applyLocalBeamSwLots(beams: BeamMaster[]): BeamMaster[] {
  const map = readLocalBeamSwLots()
  if (!Object.keys(map).length) return beams
  let changed = false
  const next = beams.map((b) => {
    if (b.swLot && String(b.swLot).trim()) return b
    const local = map[b.beamNo]
    if (!local) return b
    changed = true
    return { ...b, swLot: local }
  })
  return changed ? next : beams
}

/** Browser backup for newly added beams until DB upsert confirms. */
const KEY_BEAM_PENDING_LOCAL = 'sara_textile_beam_pending_v1'

export function readLocalPendingBeams(): BeamMaster[] {
  if (!isClient()) return []
  try {
    const raw = localStorage.getItem(KEY_BEAM_PENDING_LOCAL)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((b) => b && typeof b === 'object' && typeof (b as BeamMaster).beamNo === 'string')
      .map((b) => normalizeBeam(b as BeamMaster))
  } catch {
    return []
  }
}

export function writeLocalPendingBeam(beam: BeamMaster) {
  if (!isClient() || !beam?.beamNo) return
  try {
    const list = readLocalPendingBeams().filter((b) => b.beamNo !== beam.beamNo)
    list.push(normalizeBeam(beam))
    localStorage.setItem(KEY_BEAM_PENDING_LOCAL, JSON.stringify(list))
  } catch {
    // ignore
  }
}

export function forgetLocalPendingBeam(beamNo: string) {
  if (!isClient() || !beamNo) return
  try {
    const list = readLocalPendingBeams().filter((b) => b.beamNo !== beamNo)
    if (list.length) localStorage.setItem(KEY_BEAM_PENDING_LOCAL, JSON.stringify(list))
    else localStorage.removeItem(KEY_BEAM_PENDING_LOCAL)
  } catch {
    // ignore
  }
}

export function applyLocalPendingBeams(beams: BeamMaster[]): BeamMaster[] {
  const pending = readLocalPendingBeams()
  if (!pending.length) return beams
  const byNo = new Map(beams.map((b) => [b.beamNo, b]))
  for (const p of pending) {
    if (!byNo.has(p.beamNo)) byNo.set(p.beamNo, p)
  }
  return [...byNo.values()]
}

type LocalQualityEnd = {
  id: string
  endedOn: string
  name?: string
  loomEnds?: QualityLoomEnd[]
}

function readLocalQualityEnds(): LocalQualityEnd[] {
  if (!isClient()) return []
  try {
    const raw = localStorage.getItem(KEY_QUALITY_ENDS_LOCAL)
    if (!raw) return []
    const parsed = JSON.parse(raw) as LocalQualityEnd[]
    return Array.isArray(parsed)
      ? parsed.filter((e) => e && e.id && e.endedOn)
      : []
  } catch {
    return []
  }
}

function writeLocalQualityEnds(rows: LocalQualityEnd[]) {
  if (!isClient()) return
  try {
    localStorage.setItem(KEY_QUALITY_ENDS_LOCAL, JSON.stringify(rows))
  } catch {
    // ignore quota
  }
}

export function readLocalPendingQualities(): QualityMaster[] {
  if (!isClient()) return []
  try {
    const raw = localStorage.getItem(KEY_QUALITY_PENDING_LOCAL)
    if (!raw) return []
    const parsed = JSON.parse(raw) as QualityMaster[]
    return Array.isArray(parsed) ? parsed.map(normalizeQuality).filter((q) => q.id && q.name) : []
  } catch {
    return []
  }
}

function writeLocalPendingQualities(rows: QualityMaster[]) {
  if (!isClient()) return
  try {
    localStorage.setItem(KEY_QUALITY_PENDING_LOCAL, JSON.stringify(rows))
  } catch {
    // ignore quota
  }
}

export function rememberLocalPendingQuality(q: QualityMaster) {
  const next = readLocalPendingQualities().filter((e) => e.id !== q.id)
  next.push(normalizeQuality(q))
  writeLocalPendingQualities(next)
}

export function forgetLocalPendingQuality(id: string) {
  writeLocalPendingQualities(readLocalPendingQualities().filter((e) => e.id !== id))
}

/** Merge pending reused/new Active rows onto DB list (refresh-safe). */
export function applyLocalPendingQualities(qualities: QualityMaster[]): QualityMaster[] {
  const pending = readLocalPendingQualities()
  if (pending.length === 0) return qualities
  const byId = new Map(qualities.map((q) => [q.id, q]))
  let changed = false
  for (const p of pending) {
    const existing = byId.get(p.id)
    const pStatus = normalizeQualityStatus(p.status)
    if (!existing) {
      // New fork or Ends archive not yet in DB.
      byId.set(p.id, normalizeQuality(p))
      changed = true
      continue
    }
    const eStatus = normalizeQualityStatus(existing.status)
    // Same-id reuse: pending ACTIVE must win over stale DB/local ENDED.
    if (pStatus === 'ACTIVE' && eStatus !== 'ACTIVE') {
      forgetLocalQualityEnd(p.id)
      byId.set(
        p.id,
        normalizeQuality({
          ...existing,
          ...p,
          status: 'ACTIVE',
          endedOn: null,
          loomEnds: [],
          createdOn: p.createdOn || existing.createdOn,
        })
      )
      changed = true
      continue
    }
    if (pStatus === 'ACTIVE' && eStatus === 'ACTIVE') {
      // Prefer pending createdOn until DB catches up — but do NOT drop pending here.
      // Early forget let hydrate overwrite Continue with stale ENDED before flush finished.
      if (p.createdOn && p.createdOn !== existing.createdOn) {
        byId.set(
          p.id,
          normalizeQuality({
            ...existing,
            createdOn: p.createdOn,
            endedOn: null,
            loomEnds: [],
          })
        )
        changed = true
      }
      continue
    }
    if (pStatus === eStatus) {
      forgetLocalPendingQuality(p.id)
      continue
    }
    byId.set(p.id, normalizeQuality({ ...existing, ...p }))
    changed = true
  }
  return changed ? [...byId.values()] : qualities
}

export function mergeLoomEndLists(
  a: QualityLoomEnd[] | undefined,
  b: QualityLoomEnd[] | undefined
): QualityLoomEnd[] {
  const map = new Map<string, QualityLoomEnd>()
  for (const e of [...(a || []), ...(b || [])]) {
    map.set(`${e.date}:${e.loomNumber}`, e)
  }
  return [...map.values()].sort((x, y) =>
    x.date === y.date ? x.loomNumber - y.loomNumber : x.date.localeCompare(y.date)
  )
}

export function rememberLocalQualityEnd(
  id: string,
  endedOn: string,
  name?: string,
  newLoomEnds?: QualityLoomEnd[]
) {
  const existing = readLocalQualityEnds().find((e) => e.id === id)
  const next = readLocalQualityEnds().filter((e) => e.id !== id)
  next.push({
    id,
    endedOn,
    name,
    loomEnds: mergeLoomEndLists(existing?.loomEnds, newLoomEnds),
  })
  writeLocalQualityEnds(next)
}

export function forgetLocalQualityEnd(id: string) {
  const next = readLocalQualityEnds().filter((e) => e.id !== id)
  writeLocalQualityEnds(next)
}

/** Merge browser-backed ends onto DB qualities (refresh-safe). */
export function applyLocalQualityEnds(qualities: QualityMaster[]): QualityMaster[] {
  const ends = readLocalQualityEnds()
  if (ends.length === 0) return qualities
  // Same-id reuse: never force ENDED if a pending Active revive exists.
  const pendingActiveIds = new Set(
    readLocalPendingQualities()
      .filter((p) => normalizeQualityStatus(p.status) === 'ACTIVE')
      .map((p) => p.id)
  )
  const byId = new Map(ends.map((e) => [e.id, e]))
  return qualities.map((q) => {
    if (pendingActiveIds.has(q.id)) return q
    const local = byId.get(q.id)
    if (!local) return q
    const loomEnds = mergeLoomEndLists(q.loomEnds, local.loomEnds)
    if (q.status === 'ENDED' && q.endedOn) {
      return normalizeQuality({ ...q, loomEnds })
    }
    return normalizeQuality({
      ...q,
      status: 'ENDED',
      endedOn: local.endedOn,
      loomEnds,
    })
  })
}
