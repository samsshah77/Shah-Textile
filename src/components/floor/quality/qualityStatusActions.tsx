'use client'

import { QualityMaster, qualityDisplayName, qualityHistoryOnActivePastDay, findLiveQualityByName, productionMastersService } from '@/services/productionMastersService'
import { getProductionToday } from '@/constants/productionCalendar'
import { rememberQualityAssignFlash } from '@/lib/qualityAssignFlash'
import { formatShortDate, loomsBusyOnResumeToday } from '@/components/floor/quality/qualityMasterParts'
import type { QualityCore } from './useQualityCore'

/** End / Hold / Resume / Reuse / Continue of a quality, and the row menus that call them. */
export function qualityStatusActions(core: QualityCore) {
  const { onUpdate, onReassignEnded, looms, onStatusFilterChange, sheetDate, qualities, showConfirm, showSuccessSoon, showInfo, showError, isEndedView, isHoldView, productionByQuality, canOps, canArchiveOps, flashRows } = core
  const handleEnd = (q: QualityMaster) => {
    if (!canOps) return
    if ((q.status ?? 'ACTIVE') === 'ENDED') return
    const endDate = String(sheetDate || '').slice(0, 10)
    const label = qualityDisplayName(q, qualities)
    // Production already entered after the End date → warn, list it, and wipe only on confirm.
    const later = productionMastersService.productionAfterEnd(q.id, endDate)
    if (later.meters > 0) {
      const lines = later.days
        .map((d) => `• ${formatShortDate(d.date)}: ${Math.round(d.meters).toLocaleString()} m (Loom ${d.looms.join(', ')})`)
        .join('\n')
      showConfirm({
        title: 'Warning — later production will be cleared',
        message:
          `"${label}" has production entered after ${formatShortDate(endDate)}:\n${lines}\n\n` +
          `Ending it on ${formatShortDate(endDate)} sets meters, pick, reed and width to 0 on those days ` +
          `and marks them "Quality Ended". A total of ${Math.round(later.meters).toLocaleString()} m will be removed. ` +
          `You can then put a new quality on those days. Are you sure?`,
        type: 'warning',
        confirmText: 'Yes, end and clear',
        cancelText: 'Cancel',
        onConfirm: () => {
          onUpdate(q.id, { status: 'ENDED', endedOn: endDate, _allowWipe: true } as Partial<QualityMaster>)
          showSuccessSoon({
            title: 'Quality Ended',
            message: `"${label}" ended on ${formatShortDate(endDate)}. Production on later days was set to 0.`,
          })
        },
      })
      return
    }
    showConfirm({
      title: 'End quality?',
      message: `End "${label}" on ${formatShortDate(endDate)}? It will also be removed from the loom.`,
      type: 'confirm',
      confirmText: 'End',
      cancelText: 'Cancel',
      onConfirm: () => {
        onUpdate(q.id, { status: 'ENDED', endedOn: endDate })
        showSuccessSoon({
          title: 'Quality Ended',
          message: `"${label}" moved to Ends.`,
        })
      },
    })
  }

  const handleHold = (q: QualityMaster) => {
    if (!canOps) return
    if ((q.status ?? 'ACTIVE') !== 'ACTIVE') return
    const holdDate = String(sheetDate || '').slice(0, 10)
    const today = getProductionToday()
    const label = qualityDisplayName(q, qualities)
    // Natural flow: past date Hold nahi — us din ki production / Track confuse ho jati.
    if (holdDate !== today) {
      showError({
        title: 'Hold only on today',
        message: `A quality cannot be put on Hold on a past date (${formatShortDate(holdDate)}). That day's production is already on the sheet. Open Today in the date picker, then press Hold.`,
      })
      return
    }
    showConfirm({
      title: 'Put quality on Hold?',
      message: `Put "${label}" on Hold today? It will be removed from the loom; use Resume later to make it Active again. Production on past dates stays the same.`,
      type: 'confirm',
      confirmText: 'Hold',
      cancelText: 'Cancel',
      onConfirm: () => {
        onUpdate(q.id, { status: 'HOLD', endedOn: holdDate })
        showSuccessSoon({
          title: 'Quality On Hold',
          message: `"${label}" is on Hold from today.`,
        })
      },
    })
  }

  const handleResume = (q: QualityMaster) => {
    if (!canArchiveOps) return
    const label = qualityDisplayName(q, qualities)
    const resumeDate = String(sheetDate || '').slice(0, 10)
    const holdDate = q.endedOn ? String(q.endedOn).slice(0, 10) : ''
    const liveSame = findLiveQualityByName(qualities, q.name, q.id)
    if (liveSame) {
      showError({
        title: 'Cannot resume',
        message: `"${liveSame.name}" is already in Active / Hold. The same name cannot run twice.`,
      })
      return
    }
    // Resume only on hold day or any later day — not from days before Hold (those are history-only).
    if (holdDate && resumeDate && resumeDate < holdDate) {
      showError({
        title: 'Cannot resume before the hold date',
        message: `"${label}" was put on Hold on ${formatShortDate(holdDate)}. Earlier days (${formatShortDate(resumeDate)}) are history only (H badge) and cannot be resumed from. Open the hold date or a later day in the date picker, then press Resume.`,
      })
      return
    }
    // Busy looms are not stolen — Resume still goes Active; free looms restore from resumeDate.
    const conflicts = loomsBusyOnResumeToday(q, looms, qualities)
    const busyNote =
      conflicts.length > 0
        ? ` Busy looms skip: ${conflicts
            .map((c) => `L#${c.loomNumber} → "${c.qualityName}"`)
            .join('; ')}. Assign free looms / meters afterwards.`
        : ''
    showConfirm({
      title: 'Quality Resume?',
      message: `"${label}" becomes Active from ${formatShortDate(resumeDate)} (empty days up to today). On hold since: ${formatShortDate(holdDate)}. Busy days are skipped.${busyNote}`,
      type: 'confirm',
      confirmText: 'Resume',
      cancelText: 'Cancel',
      onConfirm: () => {
        const ok = onUpdate(q.id, { status: 'ACTIVE', endedOn: null })
        if (ok === false) {
          showError({
            title: 'Resume failed',
            message: `"${label}" did not move to Active. Please try again.`,
          })
          return
        }
        rememberQualityAssignFlash(q.id)
        flashRows(q.id, 'active')
        onStatusFilterChange?.('ACTIVE')
        showSuccessSoon({
          title: 'Quality Resumed',
          message: `"${label}" is Active from ${formatShortDate(resumeDate)} (was on Hold since ${formatShortDate(holdDate)}). You can now assign meters / looms.${busyNote}`,
        })
      },
    })
  }

  const handleReassign = (q: QualityMaster) => {
    if (!canArchiveOps) return
    const day = String(sheetDate || '').slice(0, 10)
    const label = qualityDisplayName(q, qualities)
    const liveSame = findLiveQualityByName(qualities, q.name, q.id)
    if (liveSame) {
      showError({
        title: 'The same name is already Active',
        message: `"${liveSame.name}" is already in Active / Hold. A quality name cannot be used twice. End it first, or use Continue (keeps the old meters). Reuse starts a new run from zero and only works when this name is not Active.`,
      })
      return
    }
    showConfirm({
      title: 'Quality Reuse / Reassign?',
      message: `A new Active run of "${label}" will start with meters from zero. The old Ends record stays as it is for monthly totals / PDF.`,
      type: 'confirm',
      confirmText: 'Reuse',
      cancelText: 'Cancel',
      onConfirm: () => {
        const newId = onReassignEnded(q.id, day) || null
        if (!newId) {
          showError({
            title: 'Reuse failed',
            message: `The same name is already Active, or this Ends row cannot be reused.`,
          })
          return
        }
        rememberQualityAssignFlash(newId)
        showSuccessSoon({
          title: 'Quality Reused',
          message: `"${label}" has a new Active run from zero. Go to Active Qualities; it is highlighted for a moment.`,
        })
      },
    })
  }

  /** Accidental End undo — same id / createdOn, Track zero nahi hota. */
  const handleContinue = (q: QualityMaster) => {
    if (!canArchiveOps) return
    const label = qualityDisplayName(q, qualities)
    const endDate = q.endedOn ? String(q.endedOn).slice(0, 10) : ''
    const liveSame = findLiveQualityByName(qualities, q.name, q.id)
    if (liveSame) {
      showError({
        title: 'Cannot continue',
        message: `"${liveSame.name}" is already in Active / Hold. Continue is only for a quality ended by mistake when the same name is not Active. For a new run from zero, use Reuse.`,
      })
      return
    }
    const conflicts = loomsBusyOnResumeToday(q, looms, qualities)
    if (conflicts.length > 0) {
      const detail = conflicts
        .map((c) => `L#${c.loomNumber} → "${c.qualityName}"`)
        .join('; ')
      showError({
        title: 'Cannot continue — loom busy',
        message: `These looms are now on another quality: ${detail}. Free them first, then press Continue.`,
      })
      return
    }
    showConfirm({
      title: 'Quality Continue?',
      message: `Was "${label}" ended by mistake? It goes back to Active and leaves Ends, keeping its old meters. Ended on: ${formatShortDate(endDate)}.`,
      type: 'confirm',
      confirmText: 'Continue',
      cancelText: 'Cancel',
      onConfirm: () => {
        const ok = onUpdate(q.id, { status: 'ACTIVE', endedOn: null })
        if (ok === false) {
          showError({
            title: 'Continue failed',
            message: `"${label}" did not leave Ends. If the same name is Active, end that one first, or use Reuse (from zero).`,
          })
          return
        }
        rememberQualityAssignFlash(q.id)
        onStatusFilterChange?.('ACTIVE')
        showSuccessSoon({
          title: 'Quality Continued',
          message: `"${label}" is back in Active with its old meters.`,
        })
      },
    })
  }

  const rowMenu = (q: QualityMaster, compact?: boolean) => {
    if (!canOps) return null
    // Past-day HOLD/ENDED history is read-only on Active.
    if (qualityHistoryOnActivePastDay(q, sheetDate)) return null
    return (
      <div className="dropdown">
        <button
          type="button"
          className={`btn btn-sm btn-outline-secondary ${compact ? 'py-0 px-1' : ''}`}
          style={compact ? { fontSize: '0.85rem', lineHeight: 1 } : undefined}
          data-bs-toggle="dropdown"
          aria-expanded="false"
          title="More actions"
        >
          <i className="bi bi-three-dots-vertical" />
        </button>
        <ul className="dropdown-menu dropdown-menu-end">
          <li>
            <button type="button" className="dropdown-item" onClick={() => handleHold(q)}>
              <i className="bi bi-pause-circle me-2" /> Hold
            </button>
          </li>
          <li>
            <button type="button" className="dropdown-item text-danger" onClick={() => handleEnd(q)}>
              <i className="bi bi-stop-circle me-2" /> End
            </button>
          </li>
        </ul>
      </div>
    )
  }

  const archiveAction = (q: QualityMaster, compact?: boolean) => {
    if (!canArchiveOps) return null
    if (!isHoldView && !isEndedView) return null
    return (
      <div className="dropdown">
        <button
          type="button"
          className={`btn btn-sm btn-outline-secondary ${compact ? 'py-0 px-1' : ''}`}
          style={compact ? { fontSize: '0.85rem', lineHeight: 1 } : undefined}
          data-bs-toggle="dropdown"
          aria-expanded="false"
          title="More actions"
        >
          <i className="bi bi-three-dots-vertical" />
        </button>
        <ul className="dropdown-menu dropdown-menu-end">
          {isHoldView && (
            <li>
              <button type="button" className="dropdown-item" onClick={() => handleResume(q)}>
                <i className="bi bi-play-circle me-2" /> Resume
              </button>
            </li>
          )}
          {isEndedView && (
            <>
              <li>
                <button type="button" className="dropdown-item" onClick={() => handleReassign(q)}>
                  <i className="bi bi-arrow-repeat me-2" /> Reuse (from zero)
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="dropdown-item text-success"
                  onClick={() => handleContinue(q)}
                >
                  <i className="bi bi-play-circle me-2" /> Continue (same meters)
                </button>
              </li>
            </>
          )}
        </ul>
      </div>
    )
  }

  const openTrack = (q: QualityMaster) => {
    const overall = Number(productionByQuality[q.id] || 0)
    // Re-add / reassign run with no meters yet → dialog only, never open Track page.
    if (!(overall > 0)) {
      showInfo({
        title: 'No production yet',
        message: `"${qualityDisplayName(q, qualities)}" has no production yet. Track starts from zero once meters are entered.`,
      })
      return
    }
    const from = q.createdOn ? String(q.createdOn).slice(0, 10) : ''
    const qs = new URLSearchParams({
      quality: q.id,
      name: q.name,
    })
    if (from) qs.set('from', from)
    window.location.assign(`/floor/reports/total?${qs.toString()}`)
  }

  return {
    handleEnd,
    handleHold,
    handleResume,
    handleReassign,
    handleContinue,
    rowMenu,
    archiveAction,
    openTrack,
  }
}
