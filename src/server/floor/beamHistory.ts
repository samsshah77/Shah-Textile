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
  // Order of the rows of one beam: normally the row id (the order they were recorded). A past
  // run added from Beam History gets a value between two existing rows, so it sits in its
  // place in time. Empty = the id.
  `ALTER TABLE "floor_beam_history" ADD COLUMN IF NOT EXISTS "ord" DOUBLE PRECISION`,
]

/** Sort key of a history row (see "ord" above). */
const KEY = `COALESCE("ord", "id"::float8)`
const keyOf = (idParam: string) => `(SELECT ${KEY} FROM "floor_beam_history" WHERE "id" = ${idParam}::bigint)`

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

/**
 * Every beam as it stood at the end of `date` (beams added later or deleted by then are left out).
 * The latest *recorded* row dated on or before that day wins (row id, like the runs below): a
 * mount entered later with an earlier date — e.g. a beam ended by mistake and put back — must
 * win over the off-loom row it corrects, or the beam shows in stock while it is on the loom.
 */
export async function beamsAsOf(date: string): Promise<BeamMaster[]> {
  await ensureBeamHistoryTable()
  const rows = await prisma.$queryRawUnsafe<Array<{ beamNo: string; state: unknown }>>(
    `SELECT DISTINCT ON ("beamNo") "beamNo", "state"
       FROM "floor_beam_history"
      WHERE "effectiveDate" <= $1::date AND NOT "hidden"
      ORDER BY "beamNo", ${KEY} DESC, "id" DESC`,
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
      ORDER BY h."beamNo", COALESCE(h."ord", h."id"::float8), h."id"`
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
  if (!found) throw new BeamHistoryEditError('Record not found. Please refresh the page.')
  const { stint, next } = found
  if (stint.to == null || !stint.closeId) throw new BeamHistoryEditError('This beam is still on a loom. End it first.')
  if (!stint.closeOffLoom) throw new BeamHistoryEditError('This beam went straight to another loom. Change the Removed date through the next run’s Mounted date.')
  if (!isYmd(newTo)) throw new BeamHistoryEditError('Invalid date.')
  if (newTo < stint.from) throw new BeamHistoryEditError(`Removed date cannot be before ${stint.from} (Mounted).`)
  if (newTo > today) throw new BeamHistoryEditError('Date cannot be in the future.')
  if (next && newTo > next.from) throw new BeamHistoryEditError(`This beam’s next run started on ${next.from}. Removed date cannot be after that.`)
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
  if (!found) throw new BeamHistoryEditError('Record not found. Please refresh the page.')
  const { stint, prev } = found
  if (!isYmd(newFrom)) throw new BeamHistoryEditError('Invalid date.')
  if (newFrom > today) throw new BeamHistoryEditError('Date cannot be in the future.')
  if (stint.to != null && newFrom > stint.to) throw new BeamHistoryEditError(`Mounted date cannot be after ${stint.to} (Removed).`)
  if (prev) {
    const fromPrevLoom = prev.closeId === stint.firstId
    if (fromPrevLoom && newFrom < prev.from) throw new BeamHistoryEditError(`The previous run started on ${prev.from}. Mounted date cannot be before that.`)
    if (!fromPrevLoom && prev.to && newFrom < prev.to) throw new BeamHistoryEditError(`The previous run ended on ${prev.to}. Mounted date cannot be before that.`)
  }
  const oldFrom = stint.from
  // This run's rows: from its first row up to (not including) the row that closed it.
  const before = stint.closeId ? `AND ${KEY} < ${keyOf(`'${Number(stint.closeId)}'`)}` : ''
  await prisma.$transaction([
    prisma.$executeRawUnsafe(
      `UPDATE "floor_beam_history"
          SET "state" = jsonb_set("state", '{mountedOn}', to_jsonb($1::text)),
              "effectiveDate" = CASE WHEN to_char("effectiveDate", 'YYYY-MM-DD') = $2 THEN $1::date ELSE "effectiveDate" END
        WHERE "beamNo" = $3 AND ${KEY} >= ${keyOf('$4')} ${before}
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
  if (!found) throw new BeamHistoryEditError('Record not found. Please refresh the page.')
  const { stint, prev } = found
  if (stint.to == null || !stint.closeId) throw new BeamHistoryEditError('This beam is still on the loom in this run. This record cannot be removed.')
  const fromPrevLoom = Boolean(prev && prev.closeId === stint.firstId)
  await prisma.$transaction([
    prisma.$executeRawUnsafe(
      `UPDATE "floor_beam_history" SET "hidden" = true
        WHERE "beamNo" = $1
          AND ${KEY} ${fromPrevLoom ? '>' : '>='} ${keyOf('$2')}
          AND ${KEY} ${stint.closeOffLoom ? '<=' : '<'} ${keyOf('$3')}`,
      beamNo,
      stint.firstId,
      stint.closeId
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

/**
 * Change an ENDED run's own details (Sw #, Warp, Length) — what that run had — in its own
 * history rows only. The beam as it is now (a later run, the Beams table) does not change.
 * The run still on a loom is changed in the Beams table, not here.
 */
/** An ended run's own details — the beam as it was in that run (not the beam as it is now). */
export type RunDetailsPatch = {
  swLot?: string | null
  warp?: string
  length?: number
  reed?: number
  width?: number
  totalThreads?: number
  beamRepeat?: string | null
  loomType?: string
}

/** The run of `beamNo` on `loom` that covers `date` (Beams table, a past date in Edit). */
export async function runOnDay(beamNo: string, loom: number, date: string): Promise<BeamLoomStint | null> {
  const runs = (await beamRuns(beamNo)).filter((r) => r.loom === loom && r.from <= date && (r.to == null || r.to >= date))
  return runs[runs.length - 1] || null
}

export async function setStintDetails(
  beamNo: string,
  firstId: string,
  patch: RunDetailsPatch
): Promise<BeamLoomStint> {
  await ensureBeamHistoryTable()
  const found = await findStint(beamNo, firstId)
  if (!found) throw new BeamHistoryEditError('Record not found. Please refresh the page.')
  const { stint } = found
  if (stint.to == null || !stint.closeId) {
    throw new BeamHistoryEditError('This beam is still on the loom in this run. Change its details in the Beams table.')
  }
  const set: Record<string, unknown> = {}
  if (patch.swLot !== undefined) set.swLot = patch.swLot ? String(patch.swLot).trim().slice(0, 40) || null : null
  if (patch.warp !== undefined) set.warp = String(patch.warp ?? '').trim().slice(0, 120)
  if (patch.length !== undefined) {
    const n = Number(patch.length)
    if (!Number.isFinite(n) || n < 0 || n > 1e7) throw new BeamHistoryEditError('Invalid length.')
    set.length = Math.round(n * 100) / 100
  }
  const num = (v: unknown, label: string, max: number) => {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0 || n > max) throw new BeamHistoryEditError(`Invalid ${label}.`)
    return Math.round(n * 100) / 100
  }
  if (patch.reed !== undefined) set.reed = num(patch.reed, 'reed', 10000)
  if (patch.width !== undefined) set.width = num(patch.width, 'width', 10000)
  if (patch.totalThreads !== undefined) set.totalThreads = Math.round(num(patch.totalThreads, 'threads', 1e7))
  if (patch.beamRepeat !== undefined) set.beamRepeat = patch.beamRepeat ? String(patch.beamRepeat).trim().slice(0, 40) || null : null
  if (patch.loomType !== undefined) set.loomType = String(patch.loomType ?? '').trim().slice(0, 20)
  if (!Object.keys(set).length) return stint
  // This run's rows: from its first row up to (not including) the row that took it off.
  await prisma.$executeRawUnsafe(
    `UPDATE "floor_beam_history" SET "state" = "state" || $4::jsonb
      WHERE "beamNo" = $1 AND NOT "hidden"
        AND ${KEY} >= ${keyOf('$2')} AND ${KEY} < ${keyOf('$3')}
        AND COALESCE("state"->>'usedInLoom', '') <> ''`,
    beamNo,
    stint.firstId,
    stint.closeId,
    JSON.stringify(set)
  )
  const after = (await beamRuns(beamNo)).find((r) => r.firstId === firstId)
  return after || stint
}

/**
 * Add a past run: the beam sat on `loom` from `from` to `to` (both days in the past) — for
 * runs from before the beam history was kept, or never entered. Only history rows are added,
 * placed in time between the runs before and after it; the beam itself (where it is now) and
 * Daily Entry production do not change. Must not overlap another run of this beam. Removable
 * again with Hatayein. Sw# empty = all of that loom's production in those days counts.
 */
export async function addPastStint(
  beamNo: string,
  loom: number,
  from: string,
  to: string,
  swLot: string | null,
  today: string
): Promise<BeamLoomStint> {
  await ensureBeamHistoryTable()
  if (!Number.isInteger(loom) || loom <= 0 || loom > 9999) throw new BeamHistoryEditError('Invalid loom number.')
  if (!isYmd(from) || !isYmd(to)) throw new BeamHistoryEditError('Both Mounted and Removed dates are required.')
  if (to < from) throw new BeamHistoryEditError('Removed date cannot be before the Mounted date.')
  if (to >= today) throw new BeamHistoryEditError('A past run must use past dates. The Removed date must be before today.')
  const runs = await beamRuns(beamNo)
  // The runs before / after the new one; none may overlap it.
  let prev: BeamLoomStint | null = null
  let next: BeamLoomStint | null = null
  for (const r of runs) {
    const end = r.to ?? '9999-12-31'
    if (end <= from) prev = r
    else if (r.from >= to) next = next ?? r
    else
      throw new BeamHistoryEditError(
        `This beam already has a run on Loom ${r.loom} (${r.from} → ${r.to ?? 'now'}). The dates overlap.`
      )
  }
  if (next && runs.indexOf(next) !== runs.indexOf(prev as BeamLoomStint) + 1) {
    throw new BeamHistoryEditError('Could not work out the run order. Please refresh the page and try again.')
  }
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; key: number; effectiveDate: string; state: unknown }>>(
    `SELECT "id"::text AS "id", ${KEY} AS "key", to_char("effectiveDate", 'YYYY-MM-DD') AS "effectiveDate", "state"
       FROM "floor_beam_history" WHERE "beamNo" = $1 AND NOT "hidden" ORDER BY ${KEY}, "id"`,
    beamNo
  )
  // Gap between the two runs: after the row that closed `prev`, before the first row of `next`.
  const keyOfId = (id: string | null | undefined) => rows.find((r) => r.id === id)?.key
  const lowKey = prev ? keyOfId(prev.closeId) ?? -Infinity : -Infinity
  const highKey = next ? keyOfId(next.firstId) ?? Infinity : Infinity
  // Inside the gap: after the rows dated up to `to` (so the new run wins on its days).
  let at = rows.findIndex((r) => r.key > lowKey)
  if (at < 0) at = rows.length
  while (at < rows.length && rows[at].key < highKey && rows[at].effectiveDate <= to) at++
  const lo = at > 0 ? Number(rows[at - 1].key) : 0
  const hi = at < rows.length ? Number(rows[at].key) : lo + 1
  const step = (hi - lo) / 4
  if (!(step > 0)) throw new BeamHistoryEditError('Cannot add a run here. Please refresh the page and try again.')

  const live = await prisma.floorBeam.findUnique({ where: { beamNo } })
  const liveState = live ? normalizeBeam(live as unknown as BeamMaster) : null
  const baseRaw = at > 0 ? rows[at - 1].state : null
  const base: BeamMaster | null = baseRaw && typeof baseRaw === 'object' ? normalizeBeam({ ...(baseRaw as BeamMaster), beamNo }) : liveState
  if (!base) throw new BeamHistoryEditError('Beam not found.')
  const L = String(loom)
  const mounted = normalizeBeam({
    ...base,
    usedInLoom: L,
    location: L,
    fillStatus: 'FULL',
    mountedOn: from,
    beamEndedOn: null,
    endedFromLoom: null,
    swLot: swLot || null,
  })
  const ended = normalizeBeam({
    ...mounted,
    usedInLoom: null,
    location: 'SIZING',
    fillStatus: 'EMPTY',
    mountedOn: null,
    beamEndedOn: to,
    endedFromLoom: L,
  })
  const ins = (date: string, state: BeamMaster, ord: number) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "floor_beam_history" ("beamNo","effectiveDate","state","ord") VALUES ($1, $2::date, $3::jsonb, $4::float8)`,
      beamNo,
      date,
      JSON.stringify(state),
      ord
    )
  // Added at the very end of the history (nothing recorded after it): the beam's state now
  // follows from the next day, so a past day after the run does not show the beam on that loom
  // and today shows the beam as it is.
  const atEnd = at >= rows.length
  const nextDay = new Date(`${to}T00:00:00Z`)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  const afterDay = nextDay.toISOString().slice(0, 10)
  await prisma.$transaction([
    ins(from, mounted, lo + step),
    ins(to, ended, lo + 2 * step),
    ...(atEnd && liveState && !liveState.usedInLoom ? [ins(afterDay < today ? afterDay : today, liveState, lo + 3 * step)] : []),
  ])
  const added = (await beamRuns(beamNo)).find((r) => r.loom === loom && r.from === from && r.to === to)
  if (!added) throw new BeamHistoryEditError('The run was added but is not showing yet. Please refresh the page.')
  return added
}
