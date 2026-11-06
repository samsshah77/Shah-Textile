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
  // Rows of an Ended record removed from the Ended tab (a beam ended twice by mistake):
  // kept, but left out of every view. Reversible.
  `ALTER TABLE "floor_beam_history" ADD COLUMN IF NOT EXISTS "hidden" BOOLEAN NOT NULL DEFAULT false`,
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
      WHERE "effectiveDate" <= $1::date AND NOT "hidden"
      ORDER BY "beamNo", "effectiveDate" DESC, "id" DESC`,
    date
  )
  return rows
    .filter((r) => r.state && typeof r.state === 'object')
    .map((r) => normalizeBeam({ ...(r.state as BeamMaster), beamNo: r.beamNo }))
}

/** One time a beam sat on one loom: mounted `from`, taken off `to` (null = still on). */
export type BeamLoomStint = {
  beamNo: string
  loom: number
  from: string
  to: string | null
  length: number
  swLot: string | null
  warp: string
  qualityId: string | null
  /** History rows of this stint: the first one, and the one that took it off (for edits). */
  firstId: string
  closeId: string | null
  /** The closing row took the beam off every loom (not straight onto another loom). */
  closeOffLoom: boolean
}

/**
 * Every time a beam sat on a loom, read from the beam history (so a beam that was taken off,
 * re-filled at sizing and mounted again shows each time separately, with the length and
 * Sw# it had then). Only stints that overlap from…to are returned. Read-only.
 */
export async function beamLoomStints(from: string, to: string): Promise<BeamLoomStint[]> {
  await ensureBeamHistoryTable()
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; beamNo: string; effectiveDate: Date | string; state: unknown }>>(
    // Numeric order of the row id (the text copy would sort "105" before "28").
    `SELECT h."id"::text AS "id", h."beamNo", to_char(h."effectiveDate", 'YYYY-MM-DD') AS "effectiveDate", h."state"
       FROM "floor_beam_history" h
      WHERE NOT h."hidden"
      ORDER BY h."beamNo", h."id"`
  )
  // Rows are read in the order they were recorded (id), not by their day: a mount entered
  // later with an earlier date (e.g. back-dated after the beam came back from sizing today)
  // must still come after that return. The days themselves come from mountedOn / beamEndedOn.
  const out: BeamLoomStint[] = []
  let cur: BeamLoomStint | null = null
  let curBeam = ''
  const close = (end: string, rowId: string, offLoom: boolean) => {
    if (cur) out.push({ ...cur, to: end < cur.from ? cur.from : end, closeId: rowId, closeOffLoom: offLoom })
    cur = null
  }
  for (const r of rows) {
    if (r.beamNo !== curBeam) {
      if (cur) out.push(cur) // still on its loom at the end of the history
      cur = null
      curBeam = r.beamNo
    }
    const effective = day(String(r.effectiveDate))
    const state = r.state && typeof r.state === 'object' ? (r.state as BeamMaster) : null
    const loom = state?.usedInLoom ? Number(state.usedInLoom) : NaN
    const onLoom = Number.isFinite(loom) && loom > 0
    const c = cur as BeamLoomStint | null
    // No mount date written: the same loom continues the stint, a new loom starts that day.
    const mount = isYmd(day(state?.mountedOn)) ? day(state?.mountedOn) : c && onLoom && loom === c.loom ? c.from : effective
    if (c && (!onLoom || loom !== c.loom || mount !== c.from)) {
      const ended = day(state?.beamEndedOn)
      close(isYmd(ended) && !onLoom ? ended : effective, r.id, !onLoom)
    }
    if (onLoom && state && !cur) {
      // Put back on the same loom from the same day right after coming off (a beam ended by
      // mistake, then restored): that is still one run, so the closed part is reopened.
      const last = out[out.length - 1]
      if (last && last.beamNo === r.beamNo && last.loom === loom && last.from === mount && last.to != null) {
        out.pop()
        cur = { ...last, to: null, closeId: null, closeOffLoom: false }
      }
    }
    if (onLoom && state) {
      const next: BeamLoomStint = {
        beamNo: r.beamNo,
        loom,
        from: mount,
        to: null,
        length: Number(state.length) || 0,
        swLot: state.swLot ?? null,
        warp: state.warp || '',
        qualityId: state.qualityId ?? null,
        // Same stint: it started at its first row.
        firstId: (cur as BeamLoomStint | null)?.firstId ?? r.id,
        closeId: null,
        closeOffLoom: false,
      }
      // Same stint: keep the latest length / Sw# / quality written while it was on the loom.
      cur = next
    }
  }
  if (cur) out.push(cur)
  return out.filter((s) => s.from <= to && (s.to == null || s.to >= from))
}

/** Every run (stint) of one beam, oldest first — Beam History dialog. */
export async function beamRuns(beamNo: string): Promise<BeamLoomStint[]> {
  return (await beamLoomStints('0000-01-01', '9999-12-31')).filter((s) => s.beamNo === beamNo)
}

/** The run of `beamNo` that starts at history row `firstId`, with the runs before / after it. */
async function findStint(
  beamNo: string,
  firstId: string
): Promise<{ stint: BeamLoomStint; prev: BeamLoomStint | null; next: BeamLoomStint | null } | null> {
  const all = await beamRuns(beamNo)
  const i = all.findIndex((s) => s.firstId === firstId)
  if (i < 0) return null
  return { stint: all[i], prev: all[i - 1] || null, next: all[i + 1] || null }
}

export class BeamHistoryEditError extends Error {
  readonly status = 400
}

/**
 * Change the day a beam came off a loom ("Utra") — an ended run that went off every loom.
 * Stays inside the run: not before it started, not after the next run started, not after
 * today. Changes that one history row only (no new run is written).
 */
export async function setStintEndDate(beamNo: string, firstId: string, newTo: string, today: string): Promise<BeamLoomStint> {
  await ensureBeamHistoryTable()
  const found = await findStint(beamNo, firstId)
  if (!found) throw new BeamHistoryEditError('Ye record nahi mila — page refresh karein.')
  const { stint, next } = found
  if (stint.to == null || !stint.closeId) throw new BeamHistoryEditError('Ye beam abhi loom pe laga hai — pehle End karein.')
  if (!stint.closeOffLoom) throw new BeamHistoryEditError('Ye beam seedha doosri loom pe gaya tha — Utra ki date agle run ke Laga se badlein.')
  if (!isYmd(newTo)) throw new BeamHistoryEditError('Date sahi nahi.')
  if (newTo < stint.from) throw new BeamHistoryEditError(`Utra ${stint.from} (Laga) se pehle nahi ho sakta.`)
  if (newTo > today) throw new BeamHistoryEditError('Aane wali date nahi ho sakti.')
  if (next && newTo > next.from) throw new BeamHistoryEditError(`Is beam ka agla run ${next.from} ko shuru hua — Utra us se baad nahi ho sakta.`)
  await prisma.$executeRawUnsafe(
    `UPDATE "floor_beam_history"
        SET "effectiveDate" = $1::date,
            "state" = jsonb_set(COALESCE("state", '{}'::jsonb), '{beamEndedOn}', to_jsonb($1::text))
      WHERE "id" = $2::bigint AND "beamNo" = $3`,
    newTo,
    stint.closeId,
    beamNo
  )
  return { ...stint, to: newTo }
}

/**
 * Change the day a beam went on a loom ("Laga") — any run, also the one running now. Not
 * before the previous run ended (or started, when the beam came straight from another loom),
 * not after this run ended, not after today. Rewrites the mount day on this run's own history
 * rows; for the run on a loom now also the beam's mount date. No new run is written.
 */
export async function setStintStartDate(beamNo: string, firstId: string, newFrom: string, today: string): Promise<BeamLoomStint> {
  await ensureBeamHistoryTable()
  const found = await findStint(beamNo, firstId)
  if (!found) throw new BeamHistoryEditError('Ye record nahi mila — page refresh karein.')
  const { stint, prev } = found
  if (!isYmd(newFrom)) throw new BeamHistoryEditError('Date sahi nahi.')
  if (newFrom > today) throw new BeamHistoryEditError('Aane wali date nahi ho sakti.')
  if (stint.to != null && newFrom > stint.to) throw new BeamHistoryEditError(`Laga ${stint.to} (Utra) se baad nahi ho sakta.`)
  if (prev) {
    const fromPrevLoom = prev.closeId === stint.firstId
    if (fromPrevLoom && newFrom < prev.from) throw new BeamHistoryEditError(`Pichla run ${prev.from} ko shuru hua — Laga us se pehle nahi ho sakta.`)
    if (!fromPrevLoom && prev.to && newFrom < prev.to) throw new BeamHistoryEditError(`Pichla run ${prev.to} ko khatam hua — Laga us se pehle nahi ho sakta.`)
  }
  const oldFrom = stint.from
  const lastId = stint.closeId ? `(${Number(stint.closeId)} - 1)` : '9223372036854775807'
  await prisma.$transaction([
    prisma.$executeRawUnsafe(
      `UPDATE "floor_beam_history"
          SET "state" = jsonb_set("state", '{mountedOn}', to_jsonb($1::text)),
              "effectiveDate" = CASE WHEN to_char("effectiveDate", 'YYYY-MM-DD') = $2 THEN $1::date ELSE "effectiveDate" END
        WHERE "beamNo" = $3 AND "id" BETWEEN $4::bigint AND ${lastId}
          AND "state" IS NOT NULL AND "state"->>'usedInLoom' = $5`,
      newFrom,
      oldFrom,
      beamNo,
      stint.firstId,
      String(stint.loom)
    ),
    // The run on a loom now: the beam's own mount date too (that is what the Beams table shows).
    ...(stint.to == null
      ? [
          prisma.$executeRawUnsafe(
            `UPDATE "floor_beams" SET "mountedOn" = $1, "updatedAt" = now() WHERE "beamNo" = $2 AND "usedInLoom" = $3`,
            newFrom,
            beamNo,
            String(stint.loom)
          ),
        ]
      : []),
  ])
  return { ...stint, from: newFrom }
}

/**
 * Remove a run (made by mistake, e.g. the same beam ended twice). Its history rows are hidden,
 * not deleted. Not the run on a loom now. When the beam came straight from the previous run's
 * loom, that previous run now ends on this run's first day (beam taken off there).
 */
export async function hideStint(beamNo: string, firstId: string): Promise<BeamLoomStint> {
  await ensureBeamHistoryTable()
  const found = await findStint(beamNo, firstId)
  if (!found) throw new BeamHistoryEditError('Ye record nahi mila — page refresh karein.')
  const { stint, prev } = found
  if (stint.to == null || !stint.closeId) throw new BeamHistoryEditError('Ye beam abhi isi run mein loom pe laga hai — ye record hataya nahi ja sakta.')
  const lastId = stint.closeOffLoom ? Number(stint.closeId) : Number(stint.closeId) - 1
  const fromPrevLoom = Boolean(prev && prev.closeId === stint.firstId)
  await prisma.$transaction([
    prisma.$executeRawUnsafe(
      `UPDATE "floor_beam_history" SET "hidden" = true
        WHERE "beamNo" = $1 AND "id" BETWEEN $2::bigint AND $3::bigint`,
      beamNo,
      fromPrevLoom ? String(Number(stint.firstId) + 1) : stint.firstId,
      String(lastId)
    ),
    // Came straight from the previous loom: keep that row as "taken off" so the previous run
    // ends that day instead of running on into this one.
    ...(fromPrevLoom
      ? [
          prisma.$executeRawUnsafe(
            `UPDATE "floor_beam_history"
                SET "state" = "state" || jsonb_build_object(
                      'usedInLoom', NULL, 'mountedOn', NULL, 'location', 'SIZING', 'fillStatus', 'EMPTY',
                      'beamEndedOn', to_char("effectiveDate", 'YYYY-MM-DD'), 'endedFromLoom', $3::text)
              WHERE "beamNo" = $1 AND "id" = $2::bigint`,
            beamNo,
            stint.firstId,
            String(prev!.loom)
          ),
        ]
      : []),
  ])
  return stint
}
