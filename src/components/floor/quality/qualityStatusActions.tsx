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
        title: 'Warning — aage ki production mit jayegi',
        message:
          `"${label}" ki production ${formatShortDate(endDate)} ke baad bhi darj hai:\n${lines}\n\n` +
          `${formatShortDate(endDate)} ko End karne se in dinon ke meter, pick, reed, width sab 0 ho jayenge ` +
          `aur "Quality Ended" likha aayega. Kul ${Math.round(later.meters).toLocaleString()} m hatenge. ` +
          `Phir in dinon par nayi quality laga sakte hain. Kya aap sure hain?`,
        type: 'warning',
        confirmText: 'Haan, End karo aur mitao',
        cancelText: 'Cancel',
        onConfirm: () => {
          onUpdate(q.id, { status: 'ENDED', endedOn: endDate, _allowWipe: true } as Partial<QualityMaster>)
          showSuccessSoon({
            title: 'Quality Ended',
            message: `"${label}" ${formatShortDate(endDate)} ko end. Baad ke dinon ki production 0 kar di gayi.`,
          })
        },
      })
      return
    }
    showConfirm({
      title: 'Quality End Karein?',
      message: `"${label}" ko ${formatShortDate(endDate)} pe end kar dein? Loom se bhi hata di jayegi.`,
      type: 'confirm',
      confirmText: 'End',
      cancelText: 'Cancel',
      onConfirm: () => {
        onUpdate(q.id, { status: 'ENDED', endedOn: endDate })
        showSuccessSoon({
          title: 'Quality Ended',
          message: `"${label}" Ends pe chali gayi.`,
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
        title: 'Hold sirf aaj (Today)',
        message: `Pichli date (${formatShortDate(holdDate)}) pe Hold nahi ho sakta. Us din ki production pehle se sheet pe hai — usko Hold se wipe / confuse nahi karna. Date picker se Today kholo, phir Hold karo.`,
      })
      return
    }
    showConfirm({
      title: 'Quality Hold Karein?',
      message: `"${label}" ko aaj Hold pe rakh dein? Loom se hata di jayegi; baad mein Resume se wapas Active kar sakte ho. Pichli dates ki production Same rehti hai.`,
      type: 'confirm',
      confirmText: 'Hold',
      cancelText: 'Cancel',
      onConfirm: () => {
        onUpdate(q.id, { status: 'HOLD', endedOn: holdDate })
        showSuccessSoon({
          title: 'Quality On Hold',
          message: `"${label}" aaj Hold pe chali gayi.`,
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
        title: 'Resume nahi ho sakta',
        message: `"${liveSame.name}" pehle se Active/Hold pe hai. Same naam do baar nahi chalega.`,
      })
      return
    }
    // Resume only on hold day or any later day — not from days before Hold (those are history-only).
    if (holdDate && resumeDate && resumeDate < holdDate) {
      showError({
        title: 'Resume hold se pehle nahi',
        message: `"${label}" Hold thi ${formatShortDate(holdDate)}. Pichle din (${formatShortDate(resumeDate)}) sirf history hain (H badge) — wahan se Resume nahi. Date picker pe Hold wali date ya uske baad koi din kholo, phir Resume.`,
      })
      return
    }
    // Busy looms are not stolen — Resume still goes Active; free looms restore from resumeDate.
    const conflicts = loomsBusyOnResumeToday(q, looms, qualities)
    const busyNote =
      conflicts.length > 0
        ? ` Busy looms skip: ${conflicts
            .map((c) => `L#${c.loomNumber} → "${c.qualityName}"`)
            .join('; ')}. Free loom assign / meters baad mein.`
        : ''
    showConfirm({
      title: 'Quality Resume?',
      message: `"${label}" ${formatShortDate(resumeDate)} se Active (aaj tak khali din). Hold thi: ${formatShortDate(holdDate)}. Busy din skip.${busyNote}`,
      type: 'confirm',
      confirmText: 'Resume',
      cancelText: 'Cancel',
      onConfirm: () => {
        const ok = onUpdate(q.id, { status: 'ACTIVE', endedOn: null })
        if (ok === false) {
          showError({
            title: 'Resume nahi hua',
            message: `"${label}" Active pe nahi aayi. Dobara try karo.`,
          })
          return
        }
        rememberQualityAssignFlash(q.id)
        flashRows(q.id, 'active')
        onStatusFilterChange?.('ACTIVE')
        showSuccessSoon({
          title: 'Quality Resumed',
          message: `"${label}" ${formatShortDate(resumeDate)} se Active. Hold thi ${formatShortDate(holdDate)}. Ab meters / loom assign kar sakte ho.${busyNote}`,
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
        title: 'Same name Active pe pehle se hai',
        message: `"${liveSame.name}" Active/Hold pe already hai. Same quality name do baar nahi ho sakta. Pehle usko End karo, ya sirf Continue use karo (purane meters). Reuse = naya run zero se — tabhi jab Active pe ye naam na ho.`,
      })
      return
    }
    showConfirm({
      title: 'Quality Reuse / Reassign?',
      message: `"${label}" ka naya Active run banega — meters zero se. Purana Ends record month hisab / PDF ke liye waisa hi rahega.`,
      type: 'confirm',
      confirmText: 'Reuse',
      cancelText: 'Cancel',
      onConfirm: () => {
        const newId = onReassignEnded(q.id, day) || null
        if (!newId) {
          showError({
            title: 'Reuse nahi hua',
            message: `Same naam Active pe pehle se maujood hai, ya Ends row reuse nahi ho sakti.`,
          })
          return
        }
        rememberQualityAssignFlash(newId)
        showSuccessSoon({
          title: 'Quality Reused',
          message: `"${label}" Active pe naya run — zero se. Quality Active pe jao — thodi der highlight dikhegi.`,
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
        title: 'Continue nahi ho sakta',
        message: `"${liveSame.name}" pehle se Active/Hold pe hai. Continue sirf tab jab galti se End hua ho aur Active pe same naam na ho. Agar zero se naya run chahiye to Reuse use karo.`,
      })
      return
    }
    const conflicts = loomsBusyOnResumeToday(q, looms, qualities)
    if (conflicts.length > 0) {
      const detail = conflicts
        .map((c) => `L#${c.loomNumber} → "${c.qualityName}"`)
        .join('; ')
      showError({
        title: 'Continue nahi ho sakta — loom busy',
        message: `Ye looms ab doosri quality pe hain: ${detail}. Pehle free karo, phir Continue.`,
      })
      return
    }
    showConfirm({
      title: 'Quality Continue?',
      message: `"${label}" galti se End hui thi? Active pe wapas — Ends se hat jayegi, purane meters same. Ended thi: ${formatShortDate(endDate)}.`,
      type: 'confirm',
      confirmText: 'Continue',
      cancelText: 'Cancel',
      onConfirm: () => {
        const ok = onUpdate(q.id, { status: 'ACTIVE', endedOn: null })
        if (ok === false) {
          showError({
            title: 'Continue nahi hua',
            message: `"${label}" Ends se nahi hati. Agar same naam Active pe hai to pehle usko End karo, ya Reuse (zero se) use karo.`,
          })
          return
        }
        rememberQualityAssignFlash(q.id)
        onStatusFilterChange?.('ACTIVE')
        showSuccessSoon({
          title: 'Quality Continued',
          message: `"${label}" Active pe aa gayi — purane meters same.`,
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
                  <i className="bi bi-arrow-repeat me-2" /> Reuse (zero se)
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
        title: 'Abhi Production Start Nahi Hui',
        message: `"${qualityDisplayName(q, qualities)}" pe abhi production start nahi hui. Jab meters aayein tab Track zero se shuru hoga.`,
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
