import type { LoomStatus } from '@/types/loom'

/** Mill floor condition order (select + sheet coloring). */
export const LOOM_STATUSES: LoomStatus[] = [
  'RUNNING',
  'STOPPED',
  'BEAM_END',
  'KNOTTING',
  'SARNING',
  'REKNOT',
  'HKNOTTING',
  'MECH_FAULT',
  'ELEC_FAULT',
  'JACQUARD_FAULT',
  'RSARNING',
  'BEAM_CUT',
  'RESARNING',
  'BREAKDOWN',
]

export const LOOM_STATUS_LABEL: Record<LoomStatus, string> = {
  RUNNING: 'RUNNING',
  STOPPED: 'STOPPED',
  BEAM_END: 'B/End',
  KNOTTING: 'Knotting',
  SARNING: 'Sarning',
  REKNOT: 'ReKnot',
  HKNOTTING: 'HKntt',
  MECH_FAULT: 'Mech Fault',
  ELEC_FAULT: 'Elec Fault',
  JACQUARD_FAULT: 'Jacquard Fault',
  RSARNING: 'Rsarning',
  BEAM_CUT: 'B/Cut',
  RESARNING: 'ReSarning',
  BREAKDOWN: 'BREAKDOWN',
}

export const LOOM_STATUS_COLOR: Record<LoomStatus, string> = {
  RUNNING: '#198754',
  STOPPED: '#dc3545',
  BEAM_END: '#6f42c1',
  KNOTTING: '#0d6efd',
  SARNING: '#20c997',
  REKNOT: '#6610f2',
  HKNOTTING: '#0dcaf0',
  MECH_FAULT: '#fd7e14',
  ELEC_FAULT: '#ffc107',
  JACQUARD_FAULT: '#d63384',
  RSARNING: '#198754',
  BEAM_CUT: '#dc3545',
  RESARNING: '#6c757d',
  BREAKDOWN: '#fd7e14',
}

/** Soft row background — only when there IS a problem. RUNNING = normal (no tint). */
export const LOOM_STATUS_ROW_BG: Record<LoomStatus, string | undefined> = {
  RUNNING: undefined,
  STOPPED: '#f8d7da',
  BEAM_END: '#e2d9f3',
  KNOTTING: '#cfe2ff',
  SARNING: '#d0f4ec',
  REKNOT: '#e0cffc',
  HKNOTTING: '#cff4fc',
  MECH_FAULT: '#ffe5d0',
  ELEC_FAULT: '#fff3cd',
  JACQUARD_FAULT: '#f7d6e6',
  RSARNING: '#d1e7dd',
  BEAM_CUT: '#f5c2c7',
  RESARNING: '#e9ecef',
  BREAKDOWN: '#ffe5d0',
}

const REMARK_ALIASES: Array<{ match: RegExp; status: LoomStatus }> = [
  { match: /^b\s*[\/-]?\s*end$/i, status: 'BEAM_END' },
  { match: /^beam\s*end$/i, status: 'BEAM_END' },
  { match: /^knotting$/i, status: 'KNOTTING' },
  { match: /^sarning$/i, status: 'SARNING' },
  { match: /^reknot$/i, status: 'REKNOT' },
  { match: /^h\s*kntt$/i, status: 'HKNOTTING' },
  { match: /^h-?knotting$/i, status: 'HKNOTTING' },
  { match: /^mech(\.|anical)?\s*fault$/i, status: 'MECH_FAULT' },
  { match: /^elec(\.|trical)?\s*fault$/i, status: 'ELEC_FAULT' },
  { match: /^jacquard\s*fault$/i, status: 'JACQUARD_FAULT' },
  { match: /^r\s*sarning$/i, status: 'RSARNING' },
  { match: /^b\s*[\/-]?\s*cut$/i, status: 'BEAM_CUT' },
  { match: /^re\s*sarning$/i, status: 'RESARNING' },
  { match: /^breakdown$/i, status: 'BREAKDOWN' },
  { match: /^stopped$/i, status: 'STOPPED' },
  { match: /^running$/i, status: 'RUNNING' },
]

export function resolveLoomCondition(
  status?: string | null,
  remarks?: string | null
): LoomStatus {
  const remark = (remarks || '').trim()
  if (remark) {
    for (const { match, status: s } of REMARK_ALIASES) {
      if (match.test(remark)) return s
    }
    const byLabel = (Object.keys(LOOM_STATUS_LABEL) as LoomStatus[]).find(
      (k) => LOOM_STATUS_LABEL[k].toLowerCase() === remark.toLowerCase()
    )
    if (byLabel) return byLabel
  }

  if (status && (LOOM_STATUSES as string[]).includes(status)) {
    return status as LoomStatus
  }
  return 'RUNNING'
}

/** True when row should be highlighted (not normal running). */
export function isLoomProblemCondition(
  status?: string | null,
  remarks?: string | null
): boolean {
  return resolveLoomCondition(status, remarks) !== 'RUNNING'
}

/**
 * Production Sheet row style:
 * - No problem (RUNNING) → undefined (normal white/default)
 * - Problem condition → soft fill + left accent bar
 */
export function loomConditionRowStyle(
  status?: string | null,
  remarks?: string | null
): { backgroundColor: string; boxShadow: string } | undefined {
  const condition = resolveLoomCondition(status, remarks)
  if (condition === 'RUNNING') return undefined
  const bg = LOOM_STATUS_ROW_BG[condition]
  const accent = LOOM_STATUS_COLOR[condition]
  if (!bg) return undefined
  return {
    backgroundColor: bg,
    boxShadow: `inset 4px 0 0 ${accent}`,
  }
}
