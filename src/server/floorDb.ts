import { prisma } from '@/lib/prisma'
import { Prisma, type Prisma as PrismaTypes } from '@prisma/client'
import type {
  BeamMaster,
  LoomMaster,
  QualityMaster,
  QualitySpecChange,
  QualityYarnChange,
  QualityLoomEnd,
  YarnLoomIssuance,
  YarnMaster,
  YarnMovementRecord,
} from '@/services/productionMastersService'
import type { DailyLoomProductionEntry } from '@/types/production'

function asUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((u): u is string => typeof u === 'string')
  return []
}

/** JSONB is returned as an array by Prisma; accept legacy text defensively as well. */
function jsonArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export function loomRowToMaster(row: {
  loomNumber: number
  name: string
  model: string
  category: string
  year: number | null
  pictureDataUrl: string | null
  pictureDataUrls: PrismaTypes.JsonValue
  defaultRpm: number
  shed: string | null
  isActive: boolean
  status: string
  statusSince: string | null
  qualityId: string | null
  weftYarnId: string | null
  isTwinBeam?: boolean | null
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
    qualityAssignedOn: (row as { qualityAssignedOn?: string | null }).qualityAssignedOn ?? null,
    qualityId: row.qualityId,
    weftYarnId: row.weftYarnId,
    isTwinBeam: Boolean((row as { isTwinBeam?: boolean | null }).isTwinBeam),
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
  beamRepeat?: string | null
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
    beamRepeat: row.beamRepeat ?? null,
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
        qualityAssignedOn: l.qualityAssignedOn ?? null,
        qualityId: l.qualityId,
        weftYarnId: l.weftYarnId,
        isTwinBeam: Boolean(l.isTwinBeam),
      })),
    })
  })
}

export async function dbGetBeams(): Promise<BeamMaster[]> {
  const rows = await prisma.floorBeam.findMany({ orderBy: { beamNo: 'asc' } })
  return rows.map(beamRowToMaster)
}

function beamWriteData(b: BeamMaster, prev?: { swLot: string | null; qualityId: string | null; beamRepeat: string | null } | null) {
  const swLotIncoming =
    b.swLot != null && String(b.swLot).trim() !== '' ? String(b.swLot).trim() : undefined
  const qualityIdIncoming =
    b.qualityId != null && String(b.qualityId).trim() !== ''
      ? String(b.qualityId).trim()
      : undefined
  const beamRepeatIncoming =
    b.beamRepeat != null && String(b.beamRepeat).trim() !== ''
      ? String(b.beamRepeat).trim()
      : undefined
  const base = {
    warp: b.warp || '',
    reed: b.reed ?? 60,
    width: b.width ?? 66,
    totalThreads: Math.round(Number(b.totalThreads) || 0),
    length: b.length ?? 0,
    loomType: b.loomType || 'G6200',
    fillStatus: b.fillStatus === 'EMPTY' ? 'EMPTY' : 'FULL',
    usedInLoom: b.usedInLoom ?? null,
    location: b.location || 'STORE',
    mountedOn: b.mountedOn ?? null,
    beamEndedOn: b.beamEndedOn ?? null,
    endedFromLoom: b.endedFromLoom ?? null,
    swLot: swLotIncoming ?? prev?.swLot ?? null,
    qualityId: qualityIdIncoming ?? prev?.qualityId ?? null,
    beamRepeat: beamRepeatIncoming ?? prev?.beamRepeat ?? null,
  }
  return base
}

/** Upsert one beam — never deletes siblings (safe for Add Beam). */
export async function dbUpsertBeam(beam: BeamMaster): Promise<BeamMaster> {
  if (!beam?.beamNo) throw new Error('beamNo required')
  const prev = await prisma.floorBeam.findUnique({
    where: { beamNo: beam.beamNo },
    select: { swLot: true, qualityId: true, beamRepeat: true },
  })
  const data = beamWriteData(beam, prev)
  try {
    const row = await prisma.floorBeam.upsert({
      where: { beamNo: beam.beamNo },
      create: { beamNo: beam.beamNo, ...data },
      update: data,
    })
    return beamRowToMaster(row)
  } catch (err) {
    // Older Prisma client / lagging column: retry without beamRepeat.
    console.warn('[floorDb] upsertBeam retry without beamRepeat', err)
    const { beamRepeat: _drop, ...rest } = data
    const row = await prisma.floorBeam.upsert({
      where: { beamNo: beam.beamNo },
      create: { beamNo: beam.beamNo, ...rest },
      update: rest,
    })
    return beamRowToMaster(row)
  }
}

export async function dbDeleteBeam(beamNo: string): Promise<void> {
  if (!beamNo) return
  await prisma.floorBeam.deleteMany({ where: { beamNo } })
}

export async function dbSaveBeams(beams: BeamMaster[]): Promise<void> {
  if (!Array.isArray(beams)) throw new Error('beams must be an array')

  let existing: Array<{
    beamNo: string
    swLot: string | null
    qualityId: string | null
    beamRepeat: string | null
  }>
  try {
    existing = await prisma.floorBeam.findMany({
      select: { beamNo: true, swLot: true, qualityId: true, beamRepeat: true },
    })
  } catch {
    const rows = await prisma.floorBeam.findMany({
      select: { beamNo: true, swLot: true, qualityId: true },
    })
    existing = rows.map((r) => ({ ...r, beamRepeat: null }))
  }

  const prevByNo = new Map(existing.map((r) => [r.beamNo, r]))
  const incomingNos = new Set(beams.map((b) => b.beamNo).filter(Boolean))
  const canDeleteStale = incomingNos.size > 0

  const run = async (withBeamRepeat: boolean) => {
    await prisma.$transaction(async (tx) => {
      if (canDeleteStale) {
        const stale = existing.map((r) => r.beamNo).filter((no) => !incomingNos.has(no))
        if (stale.length > 0) {
          await tx.floorBeam.deleteMany({ where: { beamNo: { in: stale } } })
        }
      }
      for (const b of beams) {
        if (!b?.beamNo) continue
        const full = beamWriteData(b, prevByNo.get(b.beamNo))
        const data = withBeamRepeat
          ? full
          : (() => {
              const { beamRepeat: _d, ...rest } = full
              return rest
            })()
        await tx.floorBeam.upsert({
          where: { beamNo: b.beamNo },
          create: { beamNo: b.beamNo, ...data },
          update: data,
        })
      }
    })
  }

  try {
    await run(true)
  } catch (err) {
    console.warn('[floorDb] saveBeams retry without beamRepeat', err)
    await run(false)
  }
}

/** Patch one beam (Sw# etc.) without rewriting the whole inventory. */
export async function dbPatchBeam(
  beamNo: string,
  patch: Partial<
    Pick<
      BeamMaster,
      'swLot' | 'qualityId' | 'beamRepeat' | 'warp' | 'reed' | 'width' | 'length' | 'loomType' | 'totalThreads'
    >
  >
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
  if (patch.beamRepeat !== undefined) {
    data.beamRepeat =
      patch.beamRepeat != null && String(patch.beamRepeat).trim() !== ''
        ? String(patch.beamRepeat).trim()
        : null
  }
  if (patch.warp !== undefined) data.warp = patch.warp
  if (patch.reed !== undefined) data.reed = patch.reed
  if (patch.width !== undefined) data.width = patch.width
  if (patch.length !== undefined) data.length = patch.length
  if (patch.loomType !== undefined) data.loomType = patch.loomType
  if (patch.totalThreads !== undefined) {
    data.totalThreads = Math.round(Number(patch.totalThreads) || 0)
  }
  if (Object.keys(data).length === 0) {
    const row = await prisma.floorBeam.findUnique({ where: { beamNo } })
    return row ? beamRowToMaster(row) : null
  }
  try {
    const existing = await prisma.floorBeam.findUnique({ where: { beamNo } })
    if (!existing) {
      const reed = typeof data.reed === 'number' ? data.reed : 60
      const width = typeof data.width === 'number' ? data.width : 66
      const row = await prisma.floorBeam.create({
        data: {
          beamNo,
          warp: typeof data.warp === 'string' ? data.warp : '',
          reed,
          width,
          totalThreads:
            typeof data.totalThreads === 'number'
              ? data.totalThreads
              : Math.round(reed * width * 0.95),
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
      weftPlan: (q as { weftPlan?: string | null }).weftPlan ?? '',
      warpYarn: q.warpYarn,
      weftYarn: q.weftYarn,
      reed: q.reed,
      pick: q.pick,
      widthInch: q.widthInch,
      gsm: q.gsm,
      status,
      createdOn: q.createdOn ? String(q.createdOn).slice(0, 10) : null,
      endedOn: status === 'ACTIVE' ? null : q.endedOn,
      specHistory: jsonArray<QualitySpecChange>((q as { specHistory?: unknown }).specHistory),
      yarnHistory: jsonArray<QualityYarnChange>((q as { yarnHistory?: unknown }).yarnHistory),
      loomEnds: jsonArray<QualityLoomEnd>((q as { loomEnds?: unknown }).loomEnds),
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
        weftPlan: q.weftPlan ?? '',
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
        specHistory: jsonArray<QualitySpecChange>(q.specHistory) as unknown as Prisma.InputJsonValue,
        yarnHistory: jsonArray<QualityYarnChange>(q.yarnHistory) as unknown as Prisma.InputJsonValue,
        loomEnds: jsonArray<QualityLoomEnd>(q.loomEnds) as unknown as Prisma.InputJsonValue,
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
  const specHistory = jsonArray<QualitySpecChange>(q.specHistory)
  const yarnHistory = jsonArray<QualityYarnChange>(q.yarnHistory)
  const loomEnds = jsonArray<QualityLoomEnd>(q.loomEnds)
  const data = {
    name: q.name,
    fabricType: q.fabricType || 'Suiting',
    weavePlan: q.weavePlan ?? '',
    weftPlan: q.weftPlan ?? '',
    warpYarn: q.warpYarn || '',
    weftYarn: q.weftYarn || '',
    reed: Number(q.reed) || 0,
    pick: Number(q.pick) || 0,
    widthInch: Number(q.widthInch) || 0,
    gsm: Number(q.gsm) || 0,
    status,
    createdOn: q.createdOn ? String(q.createdOn).slice(0, 10) : null,
    endedOn: status === 'ACTIVE' ? null : q.endedOn ?? null,
    specHistory: specHistory as unknown as Prisma.InputJsonValue,
    yarnHistory: yarnHistory as unknown as Prisma.InputJsonValue,
    loomEnds: loomEnds as unknown as Prisma.InputJsonValue,
  }
  try {
    await prisma.floorQuality.upsert({
      where: { id: q.id },
      create: { id: q.id, ...data },
      update: data,
    })
  } catch (err) {
    console.warn('[floorDb] upsertQuality retry without history columns', err)
    const { specHistory: _dropSpec, yarnHistory: _dropYarn, loomEnds: _dropEnds, ...rest } = data
    void _dropSpec
    void _dropYarn
    void _dropEnds
    await prisma.floorQuality.upsert({
      where: { id: q.id },
      create: { id: q.id, ...rest },
      update: rest,
    })
  }
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
    weftPlan:
      incoming?.weftPlan != null
        ? String(incoming.weftPlan)
        : ((row as { weftPlan?: string | null }).weftPlan ?? ''),
    warpYarn: incoming?.warpYarn ?? row.warpYarn ?? '',
    weftYarn: incoming?.weftYarn ?? row.weftYarn ?? '',
    reed: Number(incoming?.reed ?? row.reed) || 0,
    pick: Number(incoming?.pick ?? row.pick) || 0,
    widthInch: Number(incoming?.widthInch ?? row.widthInch) || 0,
    gsm: Number(incoming?.gsm ?? row.gsm) || 0,
    status: 'ACTIVE',
    createdOn,
    endedOn: null,
    specHistory: [
      {
        from: createdOn,
        pick: Number(incoming?.pick ?? row.pick) || 0,
        reed: Number(incoming?.reed ?? row.reed) || 0,
        widthInch: Number(incoming?.widthInch ?? row.widthInch) || 0,
        gsm: Number(incoming?.gsm ?? row.gsm) || 0,
        warpYarn: incoming?.warpYarn ?? row.warpYarn ?? '',
        weftYarn: incoming?.weftYarn ?? row.weftYarn ?? '',
        weavePlan:
          incoming?.weavePlan != null
            ? String(incoming.weavePlan)
            : ((row as { weavePlan?: string | null }).weavePlan ?? ''),
      },
    ],
  }

  await dbUpsertQuality(activePayload)

  const ended: QualityMaster = {
    id: endedId,
    name: row.name,
    fabricType: row.fabricType,
    weavePlan: (row as { weavePlan?: string | null }).weavePlan ?? '',
    weftPlan: (row as { weftPlan?: string | null }).weftPlan ?? '',
    warpYarn: row.warpYarn,
    weftYarn: row.weftYarn,
    reed: row.reed,
    pick: row.pick,
    widthInch: row.widthInch,
    gsm: row.gsm,
    status: 'ENDED',
    createdOn: row.createdOn ? String(row.createdOn).slice(0, 10) : null,
    endedOn,
    specHistory: jsonArray<QualitySpecChange>((row as { specHistory?: unknown }).specHistory),
    yarnHistory: jsonArray<QualityYarnChange>((row as { yarnHistory?: unknown }).yarnHistory),
    loomEnds: jsonArray<QualityLoomEnd>((row as { loomEnds?: unknown }).loomEnds),
  }

  return { ended, active: activePayload }
}

function sheetSegmentFromRow(row: {
  segmentIndex?: number | null
  payload?: unknown
}): number {
  const fromCol = Number(row.segmentIndex)
  if (Number.isFinite(fromCol) && fromCol >= 1) return Math.floor(fromCol)
  const payload = row.payload as { segmentIndex?: number } | null
  const fromPayload = Number(payload?.segmentIndex)
  if (Number.isFinite(fromPayload) && fromPayload >= 1) return Math.floor(fromPayload)
  return 1
}

function sheetEntryFromDbRow(row: {
  date: string
  loomNumber: number
  segmentIndex?: number | null
  payload: unknown
}): DailyLoomProductionEntry {
  const segmentIndex = sheetSegmentFromRow(row)
  const payload = (row.payload || {}) as DailyLoomProductionEntry
  return {
    ...payload,
    date: payload.date || row.date,
    loomNumber: payload.loomNumber || row.loomNumber,
    segmentIndex,
  }
}

const DUMMY_QUALITIES_SET = new Set(['silver-shine', 'eiffel tower', 'parcopv', 'design-2x1'])

export function isDummyQualityName(name?: string | null): boolean {
  if (!name) return false
  return DUMMY_QUALITIES_SET.has(name.trim().toLowerCase())
}

export async function dbListAllSheets(): Promise<{ date: string; entries: DailyLoomProductionEntry[] }[]> {
  const rows = await prisma.floorDailySheet.findMany({
    orderBy: [{ date: 'asc' }, { loomNumber: 'asc' }, { segmentIndex: 'asc' }],
  })
  const byDate = new Map<string, DailyLoomProductionEntry[]>()
  for (const row of rows) {
    const entry = sheetEntryFromDbRow(row)
    if (row.date >= '2026-10-01' && isDummyQualityName(entry.qualityName)) {
      continue
    }
    const list = byDate.get(row.date) || []
    list.push(entry)
    byDate.set(row.date, list)
  }
  return [...byDate.entries()].map(([date, entries]) => ({ date, entries }))
}

/** Targeted single-month query: loads only sheets belonging to the given month (e.g. '2026-10'). */
export async function dbGetMonthSheets(
  monthStr: string
): Promise<{ date: string; entries: DailyLoomProductionEntry[] }[]> {
  const cleanMonth = String(monthStr || '').trim()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(cleanMonth)) return []
  const rows = await prisma.floorDailySheet.findMany({
    where: {
      date: {
        startsWith: cleanMonth,
      },
    },
    orderBy: [{ date: 'asc' }, { loomNumber: 'asc' }, { segmentIndex: 'asc' }],
  })
  const byDate = new Map<string, DailyLoomProductionEntry[]>()
  for (const row of rows) {
    const entry = sheetEntryFromDbRow(row)
    if (row.date >= '2026-10-01' && isDummyQualityName(entry.qualityName)) {
      continue
    }
    const list = byDate.get(row.date) || []
    list.push(entry)
    byDate.set(row.date, list)
  }
  return [...byDate.entries()].map(([date, entries]) => ({ date, entries }))
}

/** Targeted beam query: returns only entries associated with a specific beam lot across all dates. */
export async function dbGetBeamSheets(beamNo: string): Promise<DailyLoomProductionEntry[]> {
  const trimmed = String(beamNo || '').trim()
  if (!trimmed) return []
  const beam = await prisma.floorBeam.findUnique({
    where: { beamNo: trimmed },
    select: { swLot: true },
  })
  const sourceLot = String(beam?.swLot || trimmed).trim()
  const compactLot = sourceLot.toLowerCase().replace(/[^a-z0-9]/g, '')
  const digits = sourceLot.replace(/\D/g, '')
  const lotKeys = [...new Set([compactLot, digits].filter(Boolean))]
  if (lotKeys.length === 0) return []
  try {
    const rows = await prisma.$queryRaw<
      Array<{ date: string; loomNumber: number; segmentIndex: number; payload: unknown }>
    >`
      SELECT date, "loomNumber", "segmentIndex", payload
      FROM floor_daily_sheets
      WHERE regexp_replace(lower(COALESCE(payload->>'lot', '')), '[^a-z0-9]', '', 'g') IN (${Prisma.join(lotKeys)})
         OR regexp_replace(lower(COALESCE(payload->>'swLot', '')), '[^a-z0-9]', '', 'g') IN (${Prisma.join(lotKeys)})
      ORDER BY date ASC, "loomNumber" ASC, "segmentIndex" ASC
    `
    return rows.map((r) => sheetEntryFromDbRow(r))
  } catch (err) {
    console.warn('[floorDb] dbGetBeamSheets raw query fallback to findMany', err)
    const all = await prisma.floorDailySheet.findMany({
      orderBy: [{ date: 'asc' }, { loomNumber: 'asc' }, { segmentIndex: 'asc' }],
    })
    return all
      .map((r) => sheetEntryFromDbRow(r))
      .filter((e) => {
        const lot = String(e.lot || '').toLowerCase().replace(/[^a-z0-9]/g, '')
        const swLot = String(e.swLot || '').toLowerCase().replace(/[^a-z0-9]/g, '')
        return lotKeys.includes(lot) || lotKeys.includes(swLot)
      })
  }
}

export interface MonthSummaryResult {
  month: string
  grandTotalMeters: number
  shiftATotalMeters: number
  shiftBTotalMeters: number
  avgPerDay: number
  daysWithProduction: number
  totalDaysRecorded: number
  loomTotals: Record<number, number>
  dayTotals: Array<{
    date: string
    day: number
    totalMeters: number
    shiftAMeters: number
    shiftBMeters: number
    activeLooms: number
  }>
  qualityTotals: Record<string, number>
}

/** Server-side monthly aggregation without loading full row payloads to client. */
export async function dbGetMonthSummary(
  monthStr: string,
  qualityId?: string
): Promise<MonthSummaryResult> {
  const cleanMonth = String(monthStr || '').trim()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(cleanMonth)) {
    throw new Error('month must be YYYY-MM')
  }
  const [year, month] = cleanMonth.split('-').map(Number)
  const from = `${cleanMonth}-01`
  const to = `${year + (month === 12 ? 1 : 0)}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`
  const qualityFilter = qualityId
    ? Prisma.sql`AND payload->>'qualityId' = ${qualityId}`
    : Prisma.empty

  // Aggregate in PostgreSQL: only compact totals cross the DB boundary, not each JSON payload.
  // The numeric guards keep imported/legacy text payloads from breaking a report query.
  const rows = await prisma.$queryRaw<
    Array<{
      date: string
      loomNumber: number
      qualityName: string
      totalMeters: number
      shiftAMeters: number
      shiftBMeters: number
      activeRows: number
    }>
  >`
    SELECT
      date,
      "loomNumber" AS "loomNumber",
      COALESCE(NULLIF(payload->>'qualityName', ''), 'Unknown') AS "qualityName",
      SUM(CASE WHEN payload->>'totalMeters' ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN (payload->>'totalMeters')::double precision
        ELSE COALESCE(CASE WHEN payload->>'shiftAMeters' ~ '^-?[0-9]+(\.[0-9]+)?$'
          THEN (payload->>'shiftAMeters')::double precision ELSE 0 END, 0)
          + COALESCE(CASE WHEN payload->>'shiftBMeters' ~ '^-?[0-9]+(\.[0-9]+)?$'
            THEN (payload->>'shiftBMeters')::double precision ELSE 0 END, 0)
        END) AS "totalMeters",
      SUM(CASE WHEN payload->>'shiftAMeters' ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN (payload->>'shiftAMeters')::double precision ELSE 0 END) AS "shiftAMeters",
      SUM(CASE WHEN payload->>'shiftBMeters' ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN (payload->>'shiftBMeters')::double precision ELSE 0 END) AS "shiftBMeters",
      COUNT(*) FILTER (WHERE COALESCE(payload->>'status', '') IN ('', 'RUNNING'))::integer AS "activeRows"
    FROM floor_daily_sheets
    WHERE date >= ${from} AND date < ${to}
      AND NOT (date >= '2026-10-01' AND lower(COALESCE(payload->>'qualityName', '')) IN ('silver-shine', 'eiffel tower', 'parcopv', 'design-2x1'))
      ${qualityFilter}
    GROUP BY date, "loomNumber", COALESCE(NULLIF(payload->>'qualityName', ''), 'Unknown')
    ORDER BY date ASC, "loomNumber" ASC
  `

  let grandTotal = 0
  let shiftATotal = 0
  let shiftBTotal = 0
  const loomTotals: Record<number, number> = {}
  const qualityTotals: Record<string, number> = {}
  const byDate = new Map<string, MonthSummaryResult['dayTotals'][number]>()

  for (const row of rows) {
    const meters = Number(row.totalMeters) || 0
    const shiftA = Number(row.shiftAMeters) || 0
    const shiftB = Number(row.shiftBMeters) || 0
    grandTotal += meters
    shiftATotal += shiftA
    shiftBTotal += shiftB
    loomTotals[row.loomNumber] = (loomTotals[row.loomNumber] || 0) + meters
    qualityTotals[row.qualityName] = (qualityTotals[row.qualityName] || 0) + meters

    const day = byDate.get(row.date) || {
      date: row.date,
      day: Number(row.date.slice(8, 10)) || 0,
      totalMeters: 0,
      shiftAMeters: 0,
      shiftBMeters: 0,
      activeLooms: 0,
    }
    day.totalMeters += meters
    day.shiftAMeters += shiftA
    day.shiftBMeters += shiftB
    day.activeLooms += Number(row.activeRows) || 0
    byDate.set(row.date, day)
  }

  const dayTotals = [...byDate.values()].map((day) => ({
    ...day,
    totalMeters: Math.round(day.totalMeters),
    shiftAMeters: Math.round(day.shiftAMeters),
    shiftBMeters: Math.round(day.shiftBMeters),
  }))
  const daysWithProd = dayTotals.filter((day) => day.totalMeters > 0).length

  const avgPerDay = daysWithProd > 0 ? Math.round(grandTotal / daysWithProd) : 0

  return {
    month: cleanMonth,
    grandTotalMeters: Math.round(grandTotal),
    shiftATotalMeters: Math.round(shiftATotal),
    shiftBTotalMeters: Math.round(shiftBTotal),
    avgPerDay,
    daysWithProduction: daysWithProd,
    totalDaysRecorded: dayTotals.length,
    loomTotals,
    dayTotals,
    qualityTotals,
  }
}

export async function dbGetSheet(dateStr: string): Promise<DailyLoomProductionEntry[] | null> {
  const rows = await prisma.floorDailySheet.findMany({
    where: { date: dateStr },
    orderBy: [{ loomNumber: 'asc' }, { segmentIndex: 'asc' }],
  })
  if (rows.length === 0) return null
  const entries = rows
    .map((r) => sheetEntryFromDbRow(r))
    .filter((entry) => dateStr < '2026-10-01' || !isDummyQualityName(entry.qualityName))
  return entries.length > 0 ? entries : null
}

export async function dbUpdateLoomEntry(
  dateStr: string,
  loomNumber: number,
  entry: DailyLoomProductionEntry
): Promise<void> {
  const segmentIndex = sheetSegmentFromRow({ segmentIndex: entry.segmentIndex, payload: entry })
  let stamped: DailyLoomProductionEntry = { ...entry, segmentIndex }

  // Guard accidental dual-quality wipe from sheet rebuild: do not replace a named
  // segment with "—" unless the client marks an intentional Hold/End clear.
  const forceClear = Boolean(
    (entry as DailyLoomProductionEntry & { _clearQuality?: boolean })._clearQuality
  )
  const incomingName = String(stamped.qualityName || '').trim()
  const incomingCleared = !incomingName || incomingName === '—' || incomingName === '-'
  if (incomingCleared && !forceClear) {
    const existing = await prisma.floorDailySheet.findUnique({
      where: {
        date_loomNumber_segmentIndex: {
          date: dateStr,
          loomNumber,
          segmentIndex,
        },
      },
    })
    if (existing) {
      const prev = sheetEntryFromDbRow(existing)
      const prevName = String(prev.qualityName || '').trim()
      const prevNamed = Boolean(prevName && prevName !== '—' && prevName !== '-')
      if (prevNamed) {
        stamped = {
          ...stamped,
          qualityName: prev.qualityName,
          fabricType: stamped.fabricType || prev.fabricType,
          warpYarn: stamped.warpYarn || prev.warpYarn,
          weftYarn: stamped.weftYarn || prev.weftYarn,
          reed: stamped.reed || prev.reed,
          pick: stamped.pick || prev.pick,
          widthInch: stamped.widthInch || prev.widthInch,
          gsm: stamped.gsm ?? prev.gsm,
        }
      }
    }
  }
  // Never persist the internal flag.
  delete (stamped as { _clearQuality?: boolean })._clearQuality

  await prisma.floorDailySheet.upsert({
    where: {
      date_loomNumber_segmentIndex: {
        date: dateStr,
        loomNumber,
        segmentIndex,
      },
    },
    update: {
      payload: stamped as unknown as Prisma.InputJsonValue,
      segmentIndex,
    },
    create: {
      date: dateStr,
      loomNumber,
      segmentIndex,
      payload: stamped as unknown as Prisma.InputJsonValue,
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
    orderBy: [{ loomNumber: 'asc' }, { segmentIndex: 'asc' }],
  })
  if (rows.length === 0) return []

  const updatedEntries: DailyLoomProductionEntry[] = []

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const current = sheetEntryFromDbRow(row)
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
      const segmentIndex = sheetSegmentFromRow({ segmentIndex: e.segmentIndex, payload: e })
      const stamped: DailyLoomProductionEntry = { ...e, segmentIndex }
      await tx.floorDailySheet.upsert({
        where: {
          date_loomNumber_segmentIndex: {
            date: dateStr,
            loomNumber: e.loomNumber,
            segmentIndex,
          },
        },
        update: {
          payload: stamped as unknown as Prisma.InputJsonValue,
          segmentIndex,
        },
        create: {
          date: dateStr,
          loomNumber: e.loomNumber,
          segmentIndex,
          payload: stamped as unknown as Prisma.InputJsonValue,
        },
      })
    }
  })
}

export async function dbDeleteSheet(dateStr: string): Promise<void> {
  await prisma.floorDailySheet.deleteMany({ where: { date: dateStr } })
}

/** Delete a same-day Part 2+ sheet row. Part 1 cannot be deleted this way. */
export async function dbDeleteLoomSegment(
  dateStr: string,
  loomNumber: number,
  segmentIndex: number
): Promise<boolean> {
  const seg = Math.max(1, Math.floor(Number(segmentIndex) || 1))
  if (seg <= 1) return false
  const result = await prisma.floorDailySheet.deleteMany({
    where: { date: dateStr, loomNumber, segmentIndex: seg },
  })
  return result.count > 0
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
