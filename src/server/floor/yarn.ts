/**
 * Yarn stock on the server. The browser no longer saves yarn lists; it asks for one of
 * these actions and gets the fresh lists back. Totals on `floor_yarns` are recomputed
 * from `floor_yarn_movements` after every change (see src/lib/floor/yarn.ts).
 */
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { deriveYarnTotals, planYarnCorrection, type YarnMovementKind } from '@/lib/floor/yarn'
import { kgToLbs } from '@/services/production/loomBeamHelpers'
import { dbGetYarn, dbGetYarnIssuances, dbGetYarnMovements } from '@/server/floorDb'
import { assertDateOpen } from '@/server/floor/locks'

type Tx = Prisma.TransactionClient

export class YarnError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message)
    this.name = 'YarnError'
  }
}

const newId = (prefix: string) => `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`

export function karachiToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

async function inYarnTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('floor:yarn'))::text`)
      return fn(tx)
    },
    { timeout: 30_000 }
  )
}

async function insertMovement(
  tx: Tx,
  m: {
    type: 'INWARD' | 'OUTWARD'
    yarnId: string
    yarnType: string
    date: string
    weightKg: number
    bags?: number | null
    loomNumber?: number | null
    pick?: number | null
    lotOrSupplier?: string | null
    kind?: YarnMovementKind
  }
) {
  const prefix = m.kind === 'CORRECTION' ? 'mov-fix' : m.kind === 'OPENING' ? 'mov-open' : m.type === 'INWARD' ? 'mov-in' : 'mov-iss'
  await tx.$executeRawUnsafe(
    `INSERT INTO "floor_yarn_movements"
      ("id","type","yarnId","yarnType","date","weightKg","weightLbs","bags","loomNumber","pick","lotOrSupplier","createdAt","updatedAt","kind")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_TIMESTAMP,$13)`,
    newId(prefix),
    m.type,
    m.yarnId,
    m.yarnType,
    m.date,
    m.weightKg,
    kgToLbs(m.weightKg),
    m.bags ?? null,
    m.loomNumber ?? null,
    m.pick ?? null,
    m.lotOrSupplier ?? null,
    new Date().toISOString(),
    m.kind || 'NORMAL'
  )
}

/** Recompute the cached totals of the given yarns (all when omitted) from movements. */
export async function recomputeYarnTotals(tx: Tx, yarnIds?: string[]): Promise<void> {
  const yarns = await tx.floorYarn.findMany({ where: yarnIds ? { id: { in: yarnIds } } : undefined })
  if (yarns.length === 0) return
  const movements = await tx.floorYarnMovement.findMany({
    where: { yarnId: { in: yarns.map((y) => y.id) } },
    select: { yarnId: true, type: true, weightKg: true, bags: true },
  })
  const totals = deriveYarnTotals(
    yarns.map((y) => y.id),
    movements
  )
  for (const y of yarns) {
    const t = totals.get(y.id)
    if (!t) continue
    const same =
      y.bags === t.bags &&
      y.receivedKg === t.receivedKg &&
      y.issuedKg === t.issuedKg &&
      y.balanceKg === t.balanceKg &&
      y.receivedLbs === t.receivedLbs &&
      y.issuedLbs === t.issuedLbs &&
      y.balanceLbs === t.balanceLbs
    if (!same) await tx.floorYarn.update({ where: { id: y.id }, data: t })
  }
}

export async function yarnSnapshot() {
  const [yarn, movements, issuances] = await Promise.all([dbGetYarn(), dbGetYarnMovements(), dbGetYarnIssuances()])
  return { yarn, movements, issuances }
}

async function findYarn(tx: Tx, id: string) {
  const y = await tx.floorYarn.findUnique({ where: { id } })
  if (!y) throw new YarnError('Ye yarn list mein nahi mila (shayad delete ho chuka). Page refresh karein.', 404)
  return y
}

export async function yarnInward(p: {
  yarnId?: string | null
  yarnType: string
  bags: number
  weightKg: number
  date: string
  lotOrSupplier?: string | null
}) {
  await assertDateOpen(p.date)
  return inYarnTx(async (tx) => {
    let target = p.yarnId ? await tx.floorYarn.findUnique({ where: { id: p.yarnId } }) : null
    if (!target) {
      const all = await tx.floorYarn.findMany()
      target = all.find((y) => y.yarnType.trim().toLowerCase() === p.yarnType.trim().toLowerCase()) || null
    }
    if (!target) {
      target = await tx.floorYarn.create({ data: { id: newId('yarn'), yarnType: p.yarnType.trim() } })
    }
    await insertMovement(tx, {
      type: 'INWARD',
      yarnId: target.id,
      yarnType: target.yarnType,
      date: p.date,
      weightKg: p.weightKg,
      bags: p.bags,
      lotOrSupplier: p.lotOrSupplier?.trim() || 'Warehouse Inward',
    })
    await recomputeYarnTotals(tx, [target.id])
    return { yarnId: target.id }
  })
}

export async function yarnIssue(p: { yarnId: string; loomNumber: number; issuedKg: number; pick: number; date: string }) {
  await assertDateOpen(p.date)
  return inYarnTx(async (tx) => {
    const y = await findYarn(tx, p.yarnId)
    await tx.floorYarnIssuance.create({
      data: {
        id: newId('iss'),
        yarnId: y.id,
        yarnType: y.yarnType,
        loomNumber: p.loomNumber,
        issuedKg: p.issuedKg,
        pick: p.pick,
        date: p.date,
        createdAt: new Date().toISOString(),
      },
    })
    await insertMovement(tx, {
      type: 'OUTWARD',
      yarnId: y.id,
      yarnType: y.yarnType,
      date: p.date,
      weightKg: p.issuedKg,
      loomNumber: p.loomNumber,
      pick: p.pick,
    })
    await recomputeYarnTotals(tx, [y.id])
    return { yarnId: y.id }
  })
}

/** A total typed in the stock table becomes a correction movement of the difference. */
export async function yarnCorrect(p: { yarnId: string; receivedKg?: number; issuedKg?: number; bags?: number; date: string }) {
  await assertDateOpen(p.date)
  return inYarnTx(async (tx) => {
    const y = await findYarn(tx, p.yarnId)
    const movements = await tx.floorYarnMovement.findMany({
      where: { yarnId: y.id },
      select: { yarnId: true, type: true, weightKg: true, bags: true },
    })
    const now = deriveYarnTotals([y.id], movements).get(y.id)!
    const plan = planYarnCorrection(now, { receivedKg: p.receivedKg, issuedKg: p.issuedKg, bags: p.bags })
    for (const m of plan) {
      await insertMovement(tx, {
        type: m.type,
        yarnId: y.id,
        yarnType: y.yarnType,
        date: p.date,
        weightKg: m.weightKg,
        bags: m.type === 'INWARD' ? m.bags : null,
        lotOrSupplier: 'Stock correction',
        kind: 'CORRECTION',
      })
    }
    await recomputeYarnTotals(tx, [y.id])
    return { yarnId: y.id, movements: plan.length }
  })
}

export async function yarnAdd(p: { yarnType: string; bags?: number; receivedKg?: number; date: string }) {
  const opening = (p.receivedKg || 0) > 0 || (p.bags || 0) > 0
  if (opening) await assertDateOpen(p.date)
  return inYarnTx(async (tx) => {
    const y = await tx.floorYarn.create({ data: { id: newId('yarn'), yarnType: p.yarnType.trim() } })
    if (opening) {
      await insertMovement(tx, {
        type: 'INWARD',
        yarnId: y.id,
        yarnType: y.yarnType,
        date: p.date,
        weightKg: p.receivedKg || 0,
        bags: p.bags || 0,
        lotOrSupplier: 'Opening stock',
        kind: 'OPENING',
      })
    }
    await recomputeYarnTotals(tx, [y.id])
    return { yarnId: y.id }
  })
}

export async function yarnRename(p: { yarnId: string; yarnType: string }) {
  return inYarnTx(async (tx) => {
    await findYarn(tx, p.yarnId)
    await tx.floorYarn.update({ where: { id: p.yarnId }, data: { yarnType: p.yarnType.trim() } })
    return { yarnId: p.yarnId }
  })
}

/** Removes the yarn from the stock list. Its movements stay as history. */
export async function yarnDelete(p: { yarnId: string }) {
  return inYarnTx(async (tx) => {
    await tx.floorYarn.deleteMany({ where: { id: p.yarnId } })
    return { yarnId: p.yarnId }
  })
}

const MIGRATION = 'yarn-totals-from-movements'

/**
 * Once: where a yarn's stored totals differ from its movements (e.g. someone typed a
 * new total in the table), add an Opening / Correction movement for the difference so
 * every balance stays exactly what people see today. Then totals come from movements.
 */
export async function reconcileYarnOnce(): Promise<{ ran: boolean; fixed: string[] }> {
  const done = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`SELECT "name" FROM "floor_migrations" WHERE "name" = $1`, MIGRATION)
  if (done.length) return { ran: false, fixed: [] }
  const fixed: string[] = []
  await inYarnTx(async (tx) => {
    const again = await tx.$queryRawUnsafe<Array<{ name: string }>>(`SELECT "name" FROM "floor_migrations" WHERE "name" = $1`, MIGRATION)
    if (again.length) return
    const yarns = await tx.floorYarn.findMany()
    const movements = await tx.floorYarnMovement.findMany({ select: { yarnId: true, type: true, weightKg: true, bags: true } })
    const derived = deriveYarnTotals(
      yarns.map((y) => y.id),
      movements
    )
    const today = karachiToday()
    for (const y of yarns) {
      const now = derived.get(y.id)!
      const plan = planYarnCorrection(now, { receivedKg: y.receivedKg, issuedKg: y.issuedKg, bags: y.bags })
      if (plan.length === 0) continue
      const hasMovements = movements.some((m) => m.yarnId === y.id)
      for (const m of plan) {
        await insertMovement(tx, {
          type: m.type,
          yarnId: y.id,
          yarnType: y.yarnType,
          date: today,
          weightKg: m.weightKg,
          bags: m.type === 'INWARD' ? m.bags : null,
          lotOrSupplier: hasMovements ? 'Purane stock ka farq (system)' : 'Opening stock (system)',
          kind: hasMovements ? 'CORRECTION' : 'OPENING',
        })
      }
      fixed.push(`${y.yarnType}: ${plan.map((m) => `${m.type} ${m.weightKg} kg${m.bags ? `, ${m.bags} bags` : ''}`).join(' + ')}`)
    }
    await recomputeYarnTotals(tx)
    await tx.$executeRawUnsafe(
      `INSERT INTO "floor_migrations" ("name","summary") VALUES ($1,$2::jsonb)`,
      MIGRATION,
      JSON.stringify({ fixed, yarns: yarns.length })
    )
  })
  if (fixed.length) console.log('[floor] yarn totals now come from movements; differences carried over:', JSON.stringify(fixed))
  return { ran: true, fixed }
}
