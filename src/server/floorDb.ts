import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import type {
  BeamMaster,
  LoomMaster,
  QualityMaster,
  YarnLoomIssuance,
  YarnMaster,
  YarnMovementRecord,
} from '@/services/productionMastersService'
import type { DailyLoomProductionEntry } from '@/types/production'

function asUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((u): u is string => typeof u === 'string')
  return []
}

export function loomRowToMaster(row: {
  loomNumber: number
  name: string
  model: string
  category: string
  year: number | null
  pictureDataUrl: string | null
  pictureDataUrls: Prisma.JsonValue
  defaultRpm: number
  shed: string | null
  isActive: boolean
  status: string
  statusSince: string | null
  qualityId: string | null
  weftYarnId: string | null
}): LoomMaster {
  const urls = asUrls(row.pictureDataUrls)
  const primary = row.pictureDataUrl || urls[0] || ''
  return {
    loomNumber: row.loomNumber,
    name: row.name,
    model: row.model as LoomMaster['model'],
    category: row.category as LoomMaster['category'],
    year: row.year ?? new Date().getFullYear(),
    pictureDataUrl: primary,
    pictureDataUrls: urls.length ? urls : primary ? [primary] : [],
    defaultRpm: row.defaultRpm,
    shed: row.shed || 'Main Floor',
    isActive: row.isActive,
    status: row.status as LoomMaster['status'],
    statusSince: row.statusSince,
    qualityId: row.qualityId,
    weftYarnId: row.weftYarnId,
  }
}

export function beamRowToMaster(row: {
  beamNo: string
  warp: string
  reed: number
  width: number
  totalThreads: number
  length: number
  loomType: string
  fillStatus: string
  usedInLoom: string | null
  location: string | null
  mountedOn: string | null
  beamEndedOn: string | null
  endedFromLoom: string | null
}): BeamMaster {
  const usedInLoom = row.usedInLoom
  const fillStatus = (row.fillStatus === 'EMPTY' ? 'EMPTY' : 'FULL') as BeamMaster['fillStatus']
  return {
    beamNo: row.beamNo,
    warp: row.warp,
    reed: row.reed,
    width: row.width,
    totalThreads: row.totalThreads,
    length: row.length,
    loomType: row.loomType,
    fillStatus,
    usedInLoom,
    status: usedInLoom ? 'MOUNTED' : fillStatus,
    location: row.location || (usedInLoom ? String(usedInLoom) : 'STORE'),
    mountedOn: row.mountedOn,
    beamEndedOn: row.beamEndedOn,
    endedFromLoom: row.endedFromLoom,
  }
}

export async function dbGetLooms(): Promise<LoomMaster[]> {
  const rows = await prisma.floorLoom.findMany({ orderBy: { loomNumber: 'asc' } })
  return rows.map(loomRowToMaster)
}

export async function dbSaveLooms(looms: LoomMaster[]): Promise<void> {
  const list = Array.isArray(looms) ? looms : []
  const existingCount = await prisma.floorLoom.count()
  const existingAssigned = await prisma.floorLoom.count({
    where: { qualityId: { not: null } },
  })
  const incomingAssigned = list.filter((l) => l.qualityId).length
  if (existingCount > 0 && list.length === 0) {
    throw new Error('Refusing to wipe floor_looms with an empty payload.')
  }
  if (existingCount >= 20 && list.length > 0 && list.length < existingCount * 0.5) {
    throw new Error(
      `Refusing loom overwrite: DB has ${existingCount} looms, payload has ${list.length}.`
    )
  }
  if (existingAssigned >= 10 && incomingAssigned === 0 && list.length > 0) {
    throw new Error(
      'Refusing loom overwrite that would clear all quality assignments.'
    )
  }
  await prisma.$transaction(async (tx) => {
    await tx.floorLoom.deleteMany()
    if (list.length === 0) return
    await tx.floorLoom.createMany({
      data: list.map((l) => ({
        loomNumber: l.loomNumber,
        name: l.name,
        model: l.model,
        category: l.category,
        year: l.year,
        pictureDataUrl: l.pictureDataUrl,
        pictureDataUrls: l.pictureDataUrls,
        defaultRpm: l.defaultRpm,
        shed: l.shed,
        isActive: l.isActive,
        status: l.status,
        statusSince: l.statusSince ?? null,
        qualityId: l.qualityId,
        weftYarnId: l.weftYarnId,
      })),
    })
  })
}

export async function dbGetBeams(): Promise<BeamMaster[]> {
  const rows = await prisma.floorBeam.findMany({ orderBy: { beamNo: 'asc' } })
  return rows.map(beamRowToMaster)
}

export async function dbSaveBeams(beams: BeamMaster[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.floorBeam.deleteMany()
    if (beams.length === 0) return
    await tx.floorBeam.createMany({
      data: beams.map((b) => ({
        beamNo: b.beamNo,
        warp: b.warp,
        reed: b.reed,
        width: b.width,
        totalThreads: b.totalThreads,
        length: b.length,
        loomType: b.loomType,
        fillStatus: b.fillStatus,
        usedInLoom: b.usedInLoom,
        location: b.location || 'STORE',
        mountedOn: b.mountedOn ?? null,
        beamEndedOn: b.beamEndedOn,
        endedFromLoom: b.endedFromLoom,
      })),
    })
  })
}

export async function dbGetYarn(): Promise<YarnMaster[]> {
  return prisma.floorYarn.findMany({ orderBy: { yarnType: 'asc' } })
}

export async function dbSaveYarn(yarn: YarnMaster[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.floorYarn.deleteMany()
    if (yarn.length === 0) return
    await tx.floorYarn.createMany({
      data: yarn.map((y) => ({
        id: y.id,
        yarnType: y.yarnType,
        bags: y.bags,
        receivedKg: y.receivedKg,
        issuedKg: y.issuedKg,
        balanceKg: y.balanceKg,
        receivedLbs: y.receivedLbs,
        issuedLbs: y.issuedLbs,
        balanceLbs: y.balanceLbs,
      })),
    })
  })
}

export async function dbGetYarnMovements(): Promise<YarnMovementRecord[]> {
  const rows = await prisma.floorYarnMovement.findMany({ orderBy: { createdAt: 'desc' } })
  return rows.map((r) => ({
    id: r.id,
    type: r.type as YarnMovementRecord['type'],
    yarnId: r.yarnId,
    yarnType: r.yarnType,
    date: r.date,
    weightKg: r.weightKg,
    weightLbs: r.weightLbs,
    bags: r.bags ?? undefined,
    loomNumber: r.loomNumber ?? undefined,
    pick: r.pick ?? undefined,
    lotOrSupplier: r.lotOrSupplier ?? undefined,
    createdAt: r.createdAt,
  }))
}

export async function dbSaveYarnMovements(list: YarnMovementRecord[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.floorYarnMovement.deleteMany()
    if (list.length === 0) return
    await tx.floorYarnMovement.createMany({
      data: list.map((m) => ({
        id: m.id,
        type: m.type,
        yarnId: m.yarnId,
        yarnType: m.yarnType,
        date: m.date,
        weightKg: m.weightKg,
        weightLbs: m.weightLbs,
        bags: m.bags ?? null,
        loomNumber: m.loomNumber ?? null,
        pick: m.pick ?? null,
        lotOrSupplier: m.lotOrSupplier ?? null,
        createdAt: m.createdAt,
      })),
    })
  })
}

export async function dbGetYarnIssuances(): Promise<YarnLoomIssuance[]> {
  return prisma.floorYarnIssuance.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function dbSaveYarnIssuances(list: YarnLoomIssuance[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.floorYarnIssuance.deleteMany()
    if (list.length === 0) return
    await tx.floorYarnIssuance.createMany({
      data: list.map((i) => ({
        id: i.id,
        yarnId: i.yarnId,
        yarnType: i.yarnType,
        loomNumber: i.loomNumber,
        issuedKg: i.issuedKg,
        pick: i.pick,
        date: i.date,
        createdAt: i.createdAt,
      })),
    })
  })
}

export async function dbGetQualities(): Promise<QualityMaster[]> {
  const rows = await prisma.floorQuality.findMany({ orderBy: { name: 'asc' } })
  return rows.map((q) => {
    const status =
      q.status === 'ENDED' ? 'ENDED' : q.status === 'HOLD' ? 'HOLD' : 'ACTIVE'
    return {
      id: q.id,
      name: q.name,
      fabricType: q.fabricType,
      weavePlan: (q as { weavePlan?: string | null }).weavePlan ?? '',
      warpYarn: q.warpYarn,
      weftYarn: q.weftYarn,
      reed: q.reed,
      pick: q.pick,
      widthInch: q.widthInch,
      gsm: q.gsm,
      status,
      createdOn: q.createdOn ? String(q.createdOn).slice(0, 10) : null,
      endedOn: status === 'ACTIVE' ? null : q.endedOn,
    }
  })
}

export async function dbSaveQualities(qualities: QualityMaster[]): Promise<void> {
  const list = Array.isArray(qualities) ? qualities : []
  const existingCount = await prisma.floorQuality.count()
  if (existingCount > 0 && list.length === 0) {
    throw new Error('Refusing to wipe floor_qualities with an empty payload.')
  }
  // Stale browser seed (3 rows) used to wipe the live Excel import (19+).
  if (existingCount >= 8 && list.length > 0 && list.length < Math.max(5, Math.floor(existingCount * 0.5))) {
    throw new Error(
      `Refusing quality overwrite: DB has ${existingCount} qualities, payload has ${list.length}.`
    )
  }
  await prisma.$transaction(async (tx) => {
    await tx.floorQuality.deleteMany()
    if (list.length === 0) return
    await tx.floorQuality.createMany({
      data: list.map((q) => ({
        id: q.id,
        name: q.name,
        fabricType: q.fabricType,
        weavePlan: q.weavePlan ?? '',
        warpYarn: q.warpYarn,
        weftYarn: q.weftYarn,
        reed: q.reed,
        pick: q.pick,
        widthInch: q.widthInch,
        gsm: q.gsm,
        status:
          q.status === 'ENDED' ? 'ENDED' : q.status === 'HOLD' ? 'HOLD' : 'ACTIVE',
        createdOn: q.createdOn ? String(q.createdOn).slice(0, 10) : null,
        endedOn:
          q.status === 'ENDED' || q.status === 'HOLD' ? q.endedOn ?? null : null,
      })),
    })
  })
}

/** Patch one quality status/endedOn — survives refresh without rewriting the whole table. */
export async function dbPatchQualityStatus(
  id: string,
  status: 'ACTIVE' | 'HOLD' | 'ENDED',
  endedOn: string | null
): Promise<void> {
  const normalized =
    status === 'ENDED' ? 'ENDED' : status === 'HOLD' ? 'HOLD' : 'ACTIVE'
  const data = {
    status: normalized,
    endedOn: normalized === 'ACTIVE' ? null : endedOn,
  }
  try {
    await prisma.floorQuality.update({ where: { id }, data })
  } catch {
    // Row missing (rare) — skip rather than failing the whole end action.
    console.error('[floorDb] patchQualityStatus: quality not found', id)
  }
}

export async function dbListAllSheets(): Promise<{ date: string; entries: DailyLoomProductionEntry[] }[]> {
  const rows = await prisma.floorDailySheet.findMany({
    orderBy: [{ date: 'asc' }, { loomNumber: 'asc' }],
  })
  const byDate = new Map<string, DailyLoomProductionEntry[]>()
  for (const row of rows) {
    const list = byDate.get(row.date) || []
    list.push(row.payload as unknown as DailyLoomProductionEntry)
    byDate.set(row.date, list)
  }
  return [...byDate.entries()].map(([date, entries]) => ({ date, entries }))
}

export async function dbGetSheet(dateStr: string): Promise<DailyLoomProductionEntry[] | null> {
  const rows = await prisma.floorDailySheet.findMany({
    where: { date: dateStr },
    orderBy: { loomNumber: 'asc' },
  })
  if (rows.length === 0) return null
  return rows.map((r) => r.payload as unknown as DailyLoomProductionEntry)
}

export async function dbUpdateLoomEntry(
  dateStr: string,
  loomNumber: number,
  entry: DailyLoomProductionEntry
): Promise<void> {
  await prisma.floorDailySheet.upsert({
    where: {
      date_loomNumber: {
        date: dateStr,
        loomNumber,
      },
    },
    update: {
      payload: entry as unknown as Prisma.InputJsonValue,
    },
    create: {
      date: dateStr,
      loomNumber,
      payload: entry as unknown as Prisma.InputJsonValue,
    },
  })
}

export async function dbSetSheetApproval(
  dateStr: string,
  status: 'DRAFT' | 'APPROVED',
  user: { name: string; role: string }
): Promise<DailyLoomProductionEntry[]> {
  const now = new Date().toISOString()
  const rows = await prisma.floorDailySheet.findMany({
    where: { date: dateStr },
    orderBy: { loomNumber: 'asc' },
  })
  if (rows.length === 0) return []

  const updatedEntries: DailyLoomProductionEntry[] = []

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const current = row.payload as unknown as DailyLoomProductionEntry
      const next: DailyLoomProductionEntry = {
        ...current,
        approvalStatus: status,
      }
      if (status === 'APPROVED') {
        next.approvedBy = user.name
        next.approvedAt = now
      } else {
        next.submittedBy = user.name
        next.submittedAt = now
      }
      updatedEntries.push(next)

      await tx.floorDailySheet.update({
        where: { id: row.id },
        data: {
          payload: next as unknown as Prisma.InputJsonValue,
        },
      })
    }
  })

  return updatedEntries
}

export async function dbSaveSheet(
  dateStr: string,
  entries: DailyLoomProductionEntry[]
): Promise<void> {
  const list = Array.isArray(entries) ? entries : []
  const existing = await prisma.floorDailySheet.count({ where: { date: dateStr } })
  if (existing > 0 && list.length === 0) {
    throw new Error(`Refusing to wipe sheet ${dateStr} with an empty payload.`)
  }
  if (existing >= 20 && list.length > 0 && list.length < existing * 0.5) {
    throw new Error(
      `Refusing sheet overwrite for ${dateStr}: DB has ${existing} rows, payload has ${list.length}.`
    )
  }
  if (list.length === 0) {
    return
  }
  await prisma.$transaction(async (tx) => {
    for (const e of list) {
      await tx.floorDailySheet.upsert({
        where: {
          date_loomNumber: {
            date: dateStr,
            loomNumber: e.loomNumber,
          },
        },
        update: {
          payload: e as unknown as Prisma.InputJsonValue,
        },
        create: {
          date: dateStr,
          loomNumber: e.loomNumber,
          payload: e as unknown as Prisma.InputJsonValue,
        },
      })
    }
  })
}

export async function dbDeleteSheet(dateStr: string): Promise<void> {
  await prisma.floorDailySheet.deleteMany({ where: { date: dateStr } })
}


export async function dbFloorIsEmpty(): Promise<boolean> {
  if (!prisma?.floorLoom) {
    throw new Error(
      'Prisma floorLoom model missing — restart `npm run dev` after `npx prisma generate` / `db push`.'
    )
  }
  const [looms, qualities, sheets] = await Promise.all([
    prisma.floorLoom.count(),
    prisma.floorQuality.count(),
    prisma.floorDailySheet.count(),
  ])
  // Seed only on a truly blank floor. Any live sheet/quality means do not reseed.
  return looms === 0 && qualities === 0 && sheets === 0
}
