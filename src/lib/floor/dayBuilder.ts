/**
 * Builds one production day from the masters (looms, qualities, beams), the rows already
 * saved for that day and each loom's row of the day before. Pure: the same function runs in
 * the browser (Daily Entry) and on the server, so both always build a day the same way.
 * (Moved here unchanged from productionMastersService.buildSheetForDate.)
 */
import type { LoomStatus } from '@/types/loom'
import { calculateProductionMetrics, type DailyLoomProductionEntry } from '@/types/production'
import { LOOM_STATUS_LABEL, resolveLoomCondition } from '@/constants/loomConditions'
import { beamDailyEntryLot } from '@/services/beamTrack'
import { beamOnLoom, getMountedBeamsOnLoom } from '@/services/production/loomBeamHelpers'
import type { BeamMaster, LoomMaster, QualityMaster, YarnLoomIssuance, YarnMaster } from '@/services/production/masterTypes'
import { normalizeQualityStatus } from '@/services/production/masterTypes'
import {
  normalizeSheetEntry,
  sheetSegmentIndex,
  sortSheetEntries,
  sheetRowKey,
  isQualityEndedSheetRow,
  namedQualityOnRow,
  qualityRunThatOwnsSheetEntry,
  qualityNameKey,
  QUALITY_ENDED_REMARK,
  qualityPoseEndedBeforeDay,
  sheetEntryId,
  yarnRecipeForDate,
} from '@/services/production/qualityRuns'

/** A loom still allotted to an ENDED quality is cleared (post-end days show zeros + E). */
export function clearEndedLoomQualities(looms: LoomMaster[], catalog: QualityMaster[]): { looms: LoomMaster[]; changed: boolean } {
  const ended = (l: LoomMaster) => {
    if (!l.qualityId) return false
    const q = catalog.find((item) => item.id === l.qualityId)
    return Boolean(q && normalizeQualityStatus(q.status) === 'ENDED')
  }
  if (!looms.some(ended)) return { looms, changed: false }
  return { looms: looms.map((l) => (ended(l) ? { ...l, qualityId: null } : l)), changed: true }
}

/** Quality recipe as it is right now on the loom (the day being edited or a brand-new day). */
export function loomRecipe(
  loom: LoomMaster,
  dateStr: string,
  m: { catalog: QualityMaster[]; beams: BeamMaster[]; yarns: YarnMaster[]; issuances: YarnLoomIssuance[] }
): Partial<DailyLoomProductionEntry> {
  const quality = m.catalog.find((q) => q.id === loom.qualityId) || null
  const beam = m.beams.find((b) => beamOnLoom(b, loom.loomNumber))
  const loomIss = m.issuances.find((iss) => iss.loomNumber === loom.loomNumber)
  const weft =
    (loomIss ? m.yarns.find((y) => y.id === loomIss.yarnId) : null) || m.yarns.find((y) => y.id === loom.weftYarnId)
  const yarnRecipe = yarnRecipeForDate(quality, dateStr)
  return {
    qualityName: quality?.name || '—',
    fabricType: quality?.fabricType || '',
    warpYarn: yarnRecipe?.warpYarn || beam?.warp || '',
    weftYarn: yarnRecipe?.weftYarn || weft?.yarnType || '',
    rpm: loom.defaultRpm,
    reed: quality?.reed || beam?.reed || 60,
    pick: quality?.pick || loomIss?.pick || 60,
    widthInch: quality?.widthInch || beam?.width || 66,
    gsm: quality?.gsm ?? 0,
  }
}

export interface DayBuildInput {
  dateStr: string
  /** The mill's today (Asia/Karachi). */
  today: string
  looms: LoomMaster[]
  catalog: QualityMaster[]
  beams: BeamMaster[]
  /** Rows saved for this day (or the Excel history of a past day), normalized. */
  loaded: DailyLoomProductionEntry[]
  /** The loom's main row on the last saved day before this one. */
  prior: (loomNumber: number) => DailyLoomProductionEntry | null
  /** The quality recipe on the loom right now. */
  recipe: (loom: LoomMaster) => Partial<DailyLoomProductionEntry>
}

export function buildDayRows(input: DayBuildInput): DailyLoomProductionEntry[] {
  const { dateStr, today, looms, catalog, beams, loaded } = input
  const prevByKey = new Map(loaded.map((e) => [sheetRowKey(e.loomNumber, sheetSegmentIndex(e)), e]))

  const primaryEntries = looms.map((loom) => {
    const prev = prevByKey.get(sheetRowKey(loom.loomNumber, 1))
    const beam = beams.find((b) => beamOnLoom(b, loom.loomNumber))
    const live = input.recipe(loom)
    const prior = input.prior(loom.loomNumber)
    const isPastDay = dateStr !== today
    const loomQ = loom.qualityId
      ? catalog.find((q) => q.id === loom.qualityId)
      : undefined
    const loomQStatus = loomQ ? normalizeQualityStatus(loomQ.status) : null
    // Only ACTIVE/HOLD counts as a live pose — stale ENDED id must not keep meters.
    const loomHasLivePose = Boolean(
      loomQ && (loomQStatus === 'ACTIVE' || loomQStatus === 'HOLD')
    )
    // After Quality End (no new quality on loom): keep ended name for E badge,
    // but force zeros — never carry pick/meters from end-day / stale seed.
    const prevNamed = Boolean(prev && namedQualityOnRow(prev.qualityName))
    const rowLooksEnded =
      isQualityEndedSheetRow(prev) ||
      qualityPoseEndedBeforeDay(prev, catalog, dateStr) ||
      (!prevNamed && qualityPoseEndedBeforeDay(prior, catalog, dateStr)) ||
      // Stale seed: same quality name as ended prior day, loom has no live pose.
      (prevNamed &&
        prior &&
        qualityNameKey(prev!.qualityName) === qualityNameKey(prior.qualityName || '') &&
        qualityPoseEndedBeforeDay(prior, catalog, dateStr))
    // On a past day the loom's *current* quality does not apply (it starts on the day it
    // was assigned and is written forward from there), so an End before this day wins.
    // A saved row that already has production is never blanked by a rebuild: the stored
    // meters win (an explicit End writes its zeros itself). Otherwise a quality ended "before"
    // this day would wipe real entries just by opening the sheet.
    const prevHasProduction = Boolean(
      prev && (Number(prev.shiftAMeters) || 0) + (Number(prev.shiftBMeters) || 0) > 0
    )
    const poseEnded = rowLooksEnded && (!loomHasLivePose || isPastDay) && !prevHasProduction
    // Quality Ended *on this day*: the day itself still belongs to it (entry allowed),
    // even though the loom master was already cleared by the End.
    const priorOwner = prior
      ? qualityRunThatOwnsSheetEntry({ ...prior, date: dateStr }, catalog, dateStr)
      : null
    const priorEndsToday = Boolean(
      priorOwner &&
        normalizeQualityStatus(priorOwner.status) === 'ENDED' &&
        String(priorOwner.endedOn || '').slice(0, 10) === dateStr
    )
    // Carry yesterday's quality forward only while that quality is still running.
    const priorStillRuns = Boolean(
      prior && namedQualityOnRow(prior.qualityName) && !qualityPoseEndedBeforeDay(prior, catalog, dateStr)
    )
    const endedLabelSrc = poseEnded
      ? prev && (namedQualityOnRow(prev.qualityName) || isQualityEndedSheetRow(prev))
        ? prev
        : prior && namedQualityOnRow(prior.qualityName)
          ? prior
          : null
      : null
    // A saved row keeps the quality stored on that date, including a deliberate clear.
    // Past days must NOT fall back to today's live loom master — factory backfill
    // starts empty / from prior day only (e.g. set up 2 Oct without copying 3 Oct).
    // After Quality End, loom.qualityId is null — do NOT carry prior day's pick/quality
    // onto the next day (show empty / B/End only until a new quality is assigned).
    const cleared = prev ? !namedQualityOnRow(prev.qualityName) && !poseEnded : false
    // Only revive after a real "Quality Ended" stub + new live assign.
    // Do NOT treat Part1≠loom.qualityId as revive — that is normal dual quality (P1/P2)
    // and overwriting P1 with live destroyed live Part 1/2 rows after deploy.
    const reviveFromLive =
      Boolean(loomHasLivePose && namedQualityOnRow(live.qualityName)) &&
      isQualityEndedSheetRow(prev)
    const identity = poseEnded
      ? null
      : cleared
        ? null
        : reviveFromLive
          ? live
          : prev
            ? prev
            : priorStillRuns && (loomHasLivePose || priorEndsToday)
              ? prior
              : !isPastDay && loomHasLivePose && namedQualityOnRow(live.qualityName)
                ? live
                : null
    const hasPose = Boolean(identity && namedQualityOnRow(identity.qualityName))
    const pick = hasPose
      ? identity?.pick || (!isPastDay ? live.pick : undefined) || 60
      : 0
    const reed = hasPose
      ? identity?.reed || (!isPastDay ? live.reed : undefined) || 60
      : 0
    const rpm =
      identity?.rpm ||
      (hasPose && !isPastDay ? live.rpm : undefined) ||
      (prev || prior ? undefined : loom.defaultRpm) ||
      loom.defaultRpm
    const masterStatus = (loom.status || 'RUNNING') as LoomStatus
    // Day-wise status: saved row for this date → else prior day (auto carry) → else master.
    // Ignore "Quality Ended" as a condition source once a live quality is on the loom.
    const statusSource =
      loomHasLivePose && isQualityEndedSheetRow(prev)
        ? prior && !isQualityEndedSheetRow(prior)
          ? prior
          : null
        : prev || prior
    const status = statusSource
      ? resolveLoomCondition(statusSource.status, statusSource.remarks)
      : masterStatus
    const statusLabel =
      status === 'RUNNING' ? '' : LOOM_STATUS_LABEL[status] || status
    const prevRemarks = (statusSource?.remarks || '').trim()
    const prevIsStatusLabel =
      !prevRemarks ||
      (Object.values(LOOM_STATUS_LABEL) as string[]).some(
        (label) => label.toLowerCase() === prevRemarks.toLowerCase()
      )
    // Grey + "Quality Ended" only while loom has no new quality; clear once attached.
    const remarks = poseEnded
      ? QUALITY_ENDED_REMARK
      : loomHasLivePose && isQualityEndedSheetRow(prev)
        ? statusLabel
        : statusSource
          ? prevIsStatusLabel
            ? statusLabel
            : statusSource.remarks || ''
          : statusLabel

    const rollerHours = poseEnded
      ? 0
      : prev?.rollerHours != null
        ? prev.rollerHours
        : status === 'BEAM_END' || status === 'STOPPED' || dateStr >= today
          ? 0
          : 24
    const shiftA = poseEnded ? 0 : (prev?.shiftAMeters ?? 0)
    const shiftB = poseEnded ? 0 : (prev?.shiftBMeters ?? 0)

    const metrics = calculateProductionMetrics({
      rpm,
      runningHours: rollerHours,
      pick,
      shiftAMeters: shiftA,
      shiftBMeters: shiftB,
      loomNumber: loom.loomNumber,
    })
    const mountedBeams = getMountedBeamsOnLoom(beams, loom.loomNumber)
    const fromBeam = mountedBeams.map((b) => beamDailyEntryLot(b)).filter(Boolean).join(' + ')
    // Mounted beam owns SW # (read-only in Daily Entry). Beam Identity is never the lot.
    const lot = fromBeam || (beam ? beamDailyEntryLot(beam) : '')

    const built: DailyLoomProductionEntry = {
      id: sheetEntryId(dateStr, loom.loomNumber, 1),
      date: dateStr,
      loomNumber: loom.loomNumber,
      segmentIndex: 1,
      category: prev?.category || loom.category,
      model: prev?.model || loom.model,
      qualityName: poseEnded
        ? endedLabelSrc?.qualityName || '—'
        : identity?.qualityName || '—',
      fabricType: poseEnded
        ? endedLabelSrc?.fabricType || ''
        : hasPose
          ? identity?.fabricType || ''
          : '',
      warpYarn: hasPose ? identity?.warpYarn || '' : '',
      weftYarn: hasPose ? identity?.weftYarn || '' : '',
      rpm,
      reed,
      pick,
      widthInch: hasPose
        ? identity?.widthInch || (!isPastDay ? live.widthInch : undefined) || 66
        : 0,
      gsm: hasPose
        ? identity?.gsm ?? (!isPastDay ? live.gsm : undefined) ?? 0
        : 0,
      rollerHours,
      runningHours: rollerHours,
      runningTheoretical: metrics.theoreticalMeters,
      shiftAMeters: shiftA,
      shiftBMeters: shiftB,
      totalMeters: metrics.totalMeters,
      efficiencyPercentage: metrics.efficiencyPercentage,
      stopLossMeters: metrics.stopLossMeters,
      theoretical24h: metrics.theoretical24h,
      efficiency24h: metrics.efficiency24h,
      loss24h: metrics.loss24h,
      status,
      remarks,
      fabricFault: prev?.fabricFault || '',
      // Same-day values typed on Daily Entry — keep them when the day is rebuilt.
      ...(prev?.fabricFaultA != null ? { fabricFaultA: prev.fabricFaultA } : {}),
      ...(prev?.fabricFaultB != null ? { fabricFaultB: prev.fabricFaultB } : {}),
      ...(!poseEnded && prev?.weightKg != null ? { weightKg: prev.weightKg } : {}),
      // Server-stamped quality run id — kept while the row keeps the same quality.
      ...(hasPose && identity?.qualityId ? { qualityId: identity.qualityId } : {}),
      lot,
    }
    // Guard: never demote a saved named primary to "—" on rebuild (dual-quality wipe).
    // Skip when quality ended before this day — zeros + E remark must stick.
    if (
      !poseEnded &&
      prev &&
      namedQualityOnRow(prev.qualityName) &&
      !namedQualityOnRow(built.qualityName)
    ) {
      built.qualityName = prev.qualityName
      built.fabricType = prev.fabricType || built.fabricType
      built.warpYarn = prev.warpYarn || built.warpYarn
      built.weftYarn = prev.weftYarn || built.weftYarn
      built.reed = prev.reed || built.reed
      built.pick = prev.pick || built.pick
      built.widthInch = prev.widthInch || built.widthInch
      built.gsm = prev.gsm ?? built.gsm
    }
    return built
  })

  // Preserve same-day dual-quality segments (2+) — never drop on rebuild.
  const extraSegments = loaded
    .filter((e) => sheetSegmentIndex(e) > 1)
    .map((prev) => {
      const loom =
        looms.find((l) => l.loomNumber === prev.loomNumber) ||
        ({
          loomNumber: prev.loomNumber,
          category: prev.category,
          model: prev.model,
          defaultRpm: prev.rpm,
          status: prev.status,
        } as LoomMaster)
      const rollerHours = prev.rollerHours ?? prev.runningHours ?? 0
      const shiftA = prev.shiftAMeters ?? 0
      const shiftB = prev.shiftBMeters ?? 0
      const metrics = calculateProductionMetrics({
        rpm: prev.rpm || loom.defaultRpm || 340,
        runningHours: rollerHours,
        pick: prev.pick || 60,
        shiftAMeters: shiftA,
        shiftBMeters: shiftB,
        loomNumber: prev.loomNumber,
      })
      const seg = sheetSegmentIndex(prev)
      return normalizeSheetEntry({
        ...prev,
        id: sheetEntryId(dateStr, prev.loomNumber, seg),
        date: dateStr,
        segmentIndex: seg,
        rollerHours,
        runningHours: rollerHours,
        runningTheoretical: metrics.theoreticalMeters,
        shiftAMeters: shiftA,
        shiftBMeters: shiftB,
        totalMeters: metrics.totalMeters,
        efficiencyPercentage: metrics.efficiencyPercentage,
        stopLossMeters: metrics.stopLossMeters,
        theoretical24h: metrics.theoretical24h,
        efficiency24h: metrics.efficiency24h,
        loss24h: metrics.loss24h,
      })
    })

  return sortSheetEntries([...primaryEntries, ...extraSegments])
}
