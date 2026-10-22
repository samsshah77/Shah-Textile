/**
 * Browser-side helpers for floor saves.
 *
 * Until Oct 2026 the browser also kept its own copies of unsent quality ends, new /
 * reused qualities, new beams and beam Sw# in localStorage, and re-sent them on every
 * page load. With row-level saving the server is the only record: a refused or failed
 * save shows a red "Not saved" banner instead, and old copies could undo what someone
 * else saved later. Those copies are no longer written, and the old keys are removed
 * on load (see clearLegacyFloorLocalStorage in floorStore).
 */
import type { QualityLoomEnd } from '@/services/production/masterTypes'

/** localStorage keys of the old browser-only copies (removed on load). */
export const LEGACY_LOCAL_COPY_KEYS = [
  'sara_textile_quality_ends_v1',
  'sara_textile_quality_pending_v1',
  'sara_textile_beam_swlot_v1',
  'sara_textile_beam_pending_v1',
] as const

/** Loom-end stamps of a quality, merged by day + loom (later list wins), sorted. */
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

/** New beams whose first save has not been confirmed yet — this tab only, never stored. */
const unconfirmedBeams = new Set<string>()
export const markBeamUnconfirmed = (beamNo: string) => unconfirmedBeams.add(beamNo)
export const markBeamConfirmed = (beamNo: string) => unconfirmedBeams.delete(beamNo)
export const isBeamUnconfirmed = (beamNo: string) => unconfirmedBeams.has(beamNo)
