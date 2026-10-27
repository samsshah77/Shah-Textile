/**
 * Beam history — one row each time a beam changes (mount, unmount, sizing, Sw#, specs),
 * stamped with the production day the change belongs to. The Beams tab uses it to show
 * the beams as they were on any past day (like the other floor tables).
 *
 * Append-only and best-effort: it is written after the beam save has committed, so a
 * problem here never blocks a beam save. Created at runtime like the other floor tables.
 */
import { prisma } from '@/lib/prisma'
import { getProductionToday } from '@/constants/productionCalendar'
import { normalizeBeam } from '@/services/production/loomBeamHelpers'
import type { BeamMaster } from '@/services/production/masterTypes'

const DDL = [
  `CREATE TABLE IF NOT EXISTS "floor_beam_history" (
    "id" BIGSERIAL PRIMARY KEY,
    "beamNo" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "state" JSONB,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')
  )`,
  `CREATE INDEX IF NOT EXISTS "floor_beam_history_day_idx" ON "floor_beam_history"("beamNo", "effectiveDate", "id")`,
]

/** Before this day there is no record of where a beam was; it counts as in the store. */
const BASELINE_DAY = '2000-01-01'

const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const day = (s: unknown) => (typeof s === 'string' ? s.slice(0, 10) : '')

let ready: Promise<void> | null = null
export function ensureBeamHistoryTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const sql of DDL) await prisma.$executeRawUnsafe(sql)
      await seedBaseline()
    })().catch((e) => {
      ready = null
      throw e
    })
  }
  return ready
}

/**
 * First run only (empty table): today's beams become the starting point. A beam on a loom
 * counts from its mount date (in the store before that); every other beam from the start.
 */
async function seedBaseline() {
  const [{ n }] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "floor_beam_history"`)
  if (n > 0) return
  const rows = await prisma.floorBeam.findMany({ orderBy: { beamNo: 'asc' } })
  for (const r of rows) {
    const beam = normalizeBeam(r as unknown as BeamMaster)
    const mountDay = day(beam.mountedOn)
    if (beam.usedInLoom && isYmd(mountDay)) {
      const inStore = normalizeBeam({ ...beam, usedInLoom: null, location: 'STORE', mountedOn: null, beamEndedOn: null, endedFromLoom: null })
      await insert(beam.beamNo, BASELINE_DAY, inStore)
      await insert(beam.beamNo, mountDay, beam)
    } else {
      await insert(beam.beamNo, BASELINE_DAY, beam)
    }
  }
}

async function insert(beamNo: string, effectiveDate: string, state: BeamMaster | null) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "floor_beam_history" ("beamNo","effectiveDate","state") VALUES ($1, $2::date, $3::jsonb)`,
    beamNo,
    effectiveDate,
    state ? JSON.stringify(state) : null
  )
}

/** The fields that make up "the state of a beam" for the day view. */
const TRACKED: Array<keyof BeamMaster> = [
  'warp', 'reed', 'width', 'totalThreads', 'length', 'loomType', 'fillStatus', 'usedInLoom', 'location',
  'mountedOn', 'beamEndedOn', 'endedFromLoom', 'qualityId', 'swLot', 'beamRepeat',
]
const sameState = (a: BeamMaster, b: BeamMaster) => TRACKED.every((k) => (a[k] ?? null) === (b[k] ?? null))

/**
 * The production day a change belongs to:
 *  - mounted (or the mount date corrected) → the mount date;
 *  - a change to a beam that stays on the same loom (Sw#, specs) → its mount date too, so
 *    the lot belongs to the whole time on that loom;
 *  - taken off / sent to sizing → the day it ended;
 *  - anything else (deleted, store ↔ sizing, specs of a store beam) → today.
 */
export function beamChangeDay(before: BeamMaster | null, after: BeamMaster | null, today: string): string {
  if (!after) return today
  const mountDay = day(after.mountedOn)
  if (after.usedInLoom) return isYmd(mountDay) && mountDay <= today ? mountDay : today
  const endDay = day(after.beamEndedOn)
  if (isYmd(endDay) && endDay <= today && endDay !== day(before?.beamEndedOn)) return endDay
  if (before?.usedInLoom && isYmd(endDay) && endDay <= today) return endDay
  return today
}

export type BeamChange = { before: BeamMaster | null; after: BeamMaster | null }

/** Write one history row per real change. Never throws — the beam save already happened. */
export async function recordBeamChanges(changes: BeamChange[]): Promise<void> {
  const real = changes.filter((c) => (c.before && c.after ? !sameState(c.before, c.after) : c.before || c.after))
  if (!real.length) return
  try {
    await ensureBeamHistoryTable()
    const today = getProductionToday()
    for (const c of real) {
      const beamNo = (c.after?.beamNo || c.before?.beamNo || '').trim()
      if (!beamNo) continue
      await insert(beamNo, beamChangeDay(c.before, c.after, today), c.after ? normalizeBeam(c.after) : null)
    }
  } catch (err) {
    console.error('[beamHistory] record failed', err)
  }
}

/** Every beam as it stood at the end of `date` (beams added later or deleted by then are left out). */
export async function beamsAsOf(date: string): Promise<BeamMaster[]> {
  await ensureBeamHistoryTable()
  const rows = await prisma.$queryRawUnsafe<Array<{ beamNo: string; state: unknown }>>(
    `SELECT DISTINCT ON ("beamNo") "beamNo", "state"
       FROM "floor_beam_history"
      WHERE "effectiveDate" <= $1::date
      ORDER BY "beamNo", "effectiveDate" DESC, "id" DESC`,
    date
  )
  return rows
    .filter((r) => r.state && typeof r.state === 'object')
    .map((r) => normalizeBeam({ ...(r.state as BeamMaster), beamNo: r.beamNo }))
}
