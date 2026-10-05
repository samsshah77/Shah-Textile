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
  qualityId?: string | null
  swLot?: string | null
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
    qualityId: row.qualityId ?? null,
    swLot: row.swLot ?? null,
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
  const existing = await prisma.floorBeam.findMany({
    select: { beamNo: true, swLot: true, qualityId: true },
  })
  const prevByNo = new Map(existing.map((r) => [r.beamNo, r]))
  const incomingNos = new Set(beams.map((b) => b.beamNo))

  await prisma.$transaction(async (tx) => {
    // Remove beams deleted from the client inventory
    const stale = existing.map((r) => r.beamNo).filter((no) => !incomingNos.has(no))
    if (stale.length > 0) {
      await tx.floorBeam.deleteMany({ where: { beamNo: { in: stale } } })
    }

    for (const b of beams) {
      const prev = prevByNo.get(b.beamNo)
      const swLotIncoming =
        b.swLot != null && String(b.swLot).trim() !== ''
          ? String(b.swLot).trim()
          : undefined
      const qualityIdIncoming =
        b.qualityId != null && String(b.qualityId).trim() !== ''
          ? String(b.qualityId).trim()
          : undefined
      const base = {
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
      }
      // Create needs values; update must NOT null-out swLot/qualityId when client payload is stale/empty
      // (race with patchBeam was wiping Sw# on refresh).
      await tx.floorBeam.upsert({
        where: { beamNo: b.beamNo },
        create: {
          beamNo: b.beamNo,
          ...base,
          swLot: swLotIncoming ?? prev?.swLot ?? null,
          qualityId: qualityIdIncoming ?? prev?.qualityId ?? null,
        },
        update: {
          ...base,
          ...(swLotIncoming !== undefined ? { swLot: swLotIncoming } : {}),
          ...(qualityIdIncoming !== undefined ? { qualityId: qualityIdIncoming } : {}),
        },
      })
    }
  })
}

/** Patch one beam (Sw# etc.) without rewriting the whole inventory. */
export async function dbPatchBeam(
  beamNo: string,
  patch: Partial<Pick<BeamMaster, 'swLot' | 'qualityId' | 'warp' | 'reed' | 'width' | 'length' | 'loomType'>>
): Promise<BeamMaster | null> {
  if (!beamNo) return null
  const data: Record<string, unknown> = {}
  if (patch.swLot !== undefined) {
    data.swLot =
      patch.swLot != null && String(patch.swLot).trim() !== ''
        ? String(patch.swLot).trim()
        : null
  }
  if (patch.qualityId !== undefined) {
    data.qualityId =
      patch.qualityId != null && String(patch.qualityId).trim() !== ''
        ? String(patch.qualityId).trim()
        : null
  }
  if (patch.warp !== undefined) data.warp = patch.warp
  if (patch.reed !== undefined) data.reed = patch.reed
  if (patch.width !== undefined) data.width = patch.width
  if (patch.length !== undefined) data.length = patch.length
  if (patch.loomType !== undefined) data.loomType = patch.loomType
  if (Object.keys(data).length === 0) {
    const row = await prisma.floorBeam.findUnique({ where: { beamNo } })
    return row ? beamRowToMaster(row) : null
  }
  try {
    const existing = await prisma.floorBeam.findUnique({ where: { beamNo } })
    if (!existing) {
      const row = await prisma.floorBeam.create({
        data: {
          beamNo,
          warp: typeof data.warp === 'string' ? data.warp : '',
          reed: typeof data.reed === 'number' ? data.reed : 60,
          width: typeof data.width === 'number' ? data.width : 66,
          length: typeof data.length === 'number' ? data.length : 0,
          loomType: typeof data.loomType === 'string' ? data.loomType : 'G6200',
          fillStatus: 'FULL',
          location: 'STORE',
          swLot: (data.swLot as string | null) ?? null,
          qualityId: (data.qualityId as string | null) ?? null,
        },
      })
      return beamRowToMaster(row)
    }
    const row = await prisma.floorBeam.update({ where: { beamNo }, data })
    return beamRowToMaster(row)
  } catch (err) {
    console.error('[floorDb] patchBeam failed', beamNo, err)
    return null
  }
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

  // First seed only — empty table gets a full insert.
  if (existingCount === 0) {
    if (list.length === 0) return
    await prisma.floorQuality.createMany({
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
    return
  }

  // MERGE upsert — never deleteMany. Stale full PUTs used to wipe reused Active forks.
  for (const q of list) {
    await dbUpsertQuality(q)
  }
}

export async function dbDeleteQuality(id: string): Promise<void> {
  if (!id) return
  try {
    await prisma.floorQuality.delete({ where: { id } })
  } catch {
    // Already gone — ok.
  }
  // Clear beam → quality links (no FK; soft unlink).
  try {
    await prisma.floorBeam.updateMany({
      where: { qualityId: id },
      data: { qualityId: null },
    })
  } catch {
    // Column may not exist until ensureFloorPayrollTables runs.
  }
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

/** Insert or update one quality — needed when reuse forks a new Active run. */
export async function dbUpsertQuality(q: QualityMaster): Promise<void> {
  const status =
    q.status === 'ENDED' ? 'ENDED' : q.status === 'HOLD' ? 'HOLD' : 'ACTIVE'
  const data = {
    name: q.name,
    fabricType: q.fabricType || 'Suiting',
    weavePlan: q.weavePlan ?? '',
    warpYarn: q.warpYarn || '',
    weftYarn: q.weftYarn || '',
    reed: Number(q.reed) || 0,
    pick: Number(q.pick) || 0,
    widthInch: Number(q.widthInch) || 0,
    gsm: Number(q.gsm) || 0,
    status,
    createdOn: q.createdOn ? String(q.createdOn).slice(0, 10) : null,
    endedOn: status === 'ACTIVE' ? null : q.endedOn ?? null,
  }
  await prisma.floorQuality.upsert({
    where: { id: q.id },
    create: { id: q.id, ...data },
    update: data,
  })
}

/**
 * Atomic reuse: keep ENDED row, insert/update new Active run from zero.
 * One server call — survives refresh without client race.
 */
export async function dbReuseQuality(params: {
  endedId: string
  createdOn: string
  newQuality?: QualityMaster | null
}): Promise<{ ended: QualityMaster; active: QualityMaster }> {
  const endedId = String(params.endedId || '')
  const createdOn = String(params.createdOn || '').slice(0, 10)
  if (!endedId || !createdOn) {
    throw new Error('endedId and createdOn required')
  }

  const row = await prisma.floorQuality.findUnique({ where: { id: endedId } })
  if (!row) throw new Error(`Quality not found: ${endedId}`)

  const endedOn =
    row.endedOn && String(row.endedOn).slice(0, 10)
      ? String(row.endedOn).slice(0, 10)
      : createdOn

  // Force original to stay ENDED for Ends tab / month PDF.
  await prisma.floorQuality.update({
    where: { id: endedId },
    data: {
      status: 'ENDED',
      endedOn,
    },
  })

  const incoming = params.newQuality
  const activeId =
    incoming?.id && String(incoming.id) !== endedId
      ? String(incoming.id)
      : `q-${Date.now()}`

  const activePayload: QualityMaster = {
    id: activeId,
    name: incoming?.name || row.name,
    fabricType: incoming?.fabricType || row.fabricType || 'Suiting',
    weavePlan:
      incoming?.weavePlan != null
        ? String(incoming.weavePlan)
        : ((row as { weavePlan?: string | null }).weavePlan ?? ''),
    warpYarn: incoming?.warpYarn ?? row.warpYarn ?? '',
    weftYarn: incoming?.weftYarn ?? row.weftYarn ?? '',
    reed: Number(incoming?.reed ?? row.reed) || 0,
    pick: Number(incoming?.pick ?? row.pick) || 0,
    widthInch: Number(incoming?.widthInch ?? row.widthInch) || 0,
    gsm: Number(incoming?.gsm ?? row.gsm) || 0,
    status: 'ACTIVE',
    createdOn,
    endedOn: null,
  }

  await dbUpsertQuality(activePayload)

  const ended: QualityMaster = {
    id: endedId,
    name: row.name,
    fabricType: row.fabricType,
    weavePlan: (row as { weavePlan?: string | null }).weavePlan ?? '',
    warpYarn: row.warpYarn,
    weftYarn: row.weftYarn,
    reed: row.reed,
    pick: row.pick,
    widthInch: row.widthInch,
    gsm: row.gsm,
    status: 'ENDED',
    createdOn: row.createdOn ? String(row.createdOn).slice(0, 10) : null,
    endedOn,
  }

  return { ended, active: activePayload }
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
