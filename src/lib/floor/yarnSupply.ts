/**
 * Yarn Supply (browser side): the supplier's entries of yarn sent to the mill, and the mill's
 * check of them. Types are shared with the server (src/server/floor/yarnSupply.ts).
 */
import { setListFromServer, announceReload } from '@/services/production/floorSync'
import { KEY_YARN, KEY_YARN_ISSUANCE, KEY_YARN_MOVEMENTS } from '@/services/production/floorStore'
import { longDateFromYmd } from '@/lib/longDate'

export type YarnDispatchStatus = 'PENDING' | 'ISSUE' | 'VERIFIED'

export type YarnDispatchLog = {
  at: string
  by: string
  action: 'SENT' | 'EDITED' | 'ISSUE' | 'VERIFIED' | 'CORRECTED'
  note?: string
}

export interface YarnDispatch {
  id: string
  status: YarnDispatchStatus
  yarnType: string
  sentDate: string
  bags: number
  bagKg: number[]
  weightKg: number
  challanNo: string
  lotNo: string
  vehicleNo: string
  remarks: string
  createdBy: string
  createdAt: string
  updatedAt: string
  issueNote: string
  issueBy: string
  receivedDate: string | null
  receivedBags: number | null
  receivedKg: number | null
  verifyNote: string
  verifiedBy: string
  verifiedAt: string | null
  /** The mill's request this lot was sent against (null = not linked). */
  requestId: string | null
  log: YarnDispatchLog[]
}

/** What the supplier sends (new entry or a correction). */
export type YarnDispatchInput = {
  yarnType: string
  sentDate: string
  bagKg: number[]
  challanNo?: string
  lotNo?: string
  vehicleNo?: string
  remarks?: string
  /** Sent against this request of the mill. */
  requestId?: string | null
}

/** What the mill received. */
export type YarnReceiveInput = {
  receivedDate: string
  receivedBags: number
  receivedKg: number
  note?: string
}

/**
 * The mill asks the supplier for yarn. OPEN until the mill closes or cancels it; shown as
 * COMPLETE once the lots sent against it reach the kg asked for.
 */
export type YarnRequestStatus = 'OPEN' | 'COMPLETE' | 'CLOSED' | 'CANCELLED'

export type YarnRequestLog = {
  at: string
  by: string
  action: 'REQUESTED' | 'EDITED' | 'CLOSED' | 'CANCELLED' | 'REOPENED'
  note?: string
}

export interface YarnRequest {
  id: string
  status: YarnRequestStatus
  yarnType: string
  kg: number
  bags: number | null
  neededBy: string | null
  note: string
  requestedBy: string
  createdAt: string
  closedBy: string
  closeNote: string
  /** Lots sent against it (not deleted): count, kg sent, kg the mill verified. */
  lots: number
  sentKg: number
  receivedKg: number
  log: YarnRequestLog[]
}

export type YarnRequestInput = {
  yarnType: string
  kg: number
  bags?: number | null
  neededBy?: string | null
  note?: string
}

export type MillYarnStock = { id: string; yarnType: string; balanceKg: number }

export type YarnSupplyList = {
  dispatches: YarnDispatch[]
  requests: YarnRequest[]
  stock: MillYarnStock[]
  /** May send / change entries (supplier). */
  canSend: boolean
  /** May verify / report (mill, Yarn Stock Edit). */
  canVerify: boolean
}

export async function fetchYarnSupply(): Promise<YarnSupplyList> {
  const r = await fetch('/api/floor/yarn-supply', { credentials: 'same-origin', cache: 'no-store' })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || !d?.ok) throw new Error(d?.error || 'Could not load the yarn supply list.')
  return {
    dispatches: d.dispatches || [],
    requests: d.requests || [],
    stock: d.stock || [],
    canSend: Boolean(d.canSend),
    canVerify: Boolean(d.canVerify),
  }
}

type ActionBody =
  | { action: 'create'; entry: YarnDispatchInput }
  | { action: 'update'; id: string; entry: YarnDispatchInput }
  | { action: 'delete'; id: string }
  | { action: 'issue'; id: string; note: string }
  | { action: 'verify'; id: string; receive: YarnReceiveInput }
  | { action: 'correct'; id: string; receive: YarnReceiveInput }

type RequestActionBody =
  | { action: 'requestCreate'; request: YarnRequestInput }
  | { action: 'requestUpdate'; id: string; request: YarnRequestInput }
  | { action: 'requestClose' | 'requestCancel' | 'requestReopen'; id: string; note?: string }

/** Mill: ask the supplier for yarn / change / close / cancel a request. Throws the server's message. */
export async function yarnRequestAction(body: RequestActionBody): Promise<YarnRequest | null> {
  const r = await fetch('/api/floor/yarn-supply', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || !d?.ok) throw new Error(d?.error || 'Could not save. Please try again.')
  return (d.request as YarnRequest) || null
}

/** kg still to send for a request (never below 0). */
export const requestRemainingKg = (q: YarnRequest) => Math.max(0, Math.round((q.kg - q.sentKg) * 100) / 100)

/** WhatsApp text: the mill's request to the supplier. */
export function yarnRequestShareText(q: YarnRequest): string {
  return [
    `*Sara Textile — Yarn request*`,
    ``,
    `Yarn: ${q.yarnType}`,
    `Quantity: ${fmtKg(q.kg)}${q.bags ? ` (${bagsText(q.bags)})` : ''}`,
    q.neededBy ? `Needed by: ${longDateFromYmd(q.neededBy)}` : '',
    q.note ? `Note: ${q.note}` : '',
    q.sentKg > 0 ? `Sent so far: ${fmtKg(q.sentKg)} · Remaining: ${fmtKg(requestRemainingKg(q))}` : '',
    q.requestedBy ? `Requested by: ${q.requestedBy}` : '',
  ]
    .filter((l, i) => l !== '' || i === 1)
    .join('\n')
}

/** One action. Verify / correct also refresh Yarn Stock on this screen. Throws the server's message. */
export async function yarnSupplyAction(body: ActionBody): Promise<YarnDispatch | null> {
  const r = await fetch('/api/floor/yarn-supply', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || !d?.ok) throw new Error(d?.error || 'Could not save. Please try again.')
  if (d.yarnState) {
    const st = d.yarnState as { yarn: unknown; movements: unknown; issuances: unknown }
    setListFromServer(KEY_YARN, st.yarn, undefined, { force: true })
    setListFromServer(KEY_YARN_MOVEMENTS, st.movements, undefined, { force: true })
    setListFromServer(KEY_YARN_ISSUANCE, st.issuances, undefined, { force: true })
    announceReload('yarn')
  }
  return (d.dispatch as YarnDispatch) || null
}

export const bagsText = (n: number | null | undefined) => `${n ?? 0} bag${Math.abs(n ?? 0) === 1 ? '' : 's'}`

/** "−2 bags, −1.50 kg" — only the parts that differ ('' when nothing differs). */
export function diffText(diff: { bags: number; kg: number }): string {
  const sign = (n: number) => (n > 0 ? '+' : '')
  return [
    diff.bags ? `${sign(diff.bags)}${bagsText(diff.bags)}` : '',
    diff.kg ? `${sign(diff.kg)}${fmtKg(diff.kg)}` : '',
  ]
    .filter(Boolean)
    .join(', ')
}

export const fmtKg = (n: number | null | undefined) =>
  `${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`

/** WhatsApp text: the yarn the mill received (verified) on one day. */
export function receivedDayText(date: string, list: YarnDispatch[], longDate: (d: string) => string): string {
  const rows = list.filter((d) => d.status === 'VERIFIED' && d.receivedDate === date)
  if (!rows.length) return `*Sara Textile — Yarn received ${longDate(date)}*\n\nNo yarn received.`
  const lines = rows.map((d, i) => {
    const diff = d.receivedKg != null && (d.receivedKg !== d.weightKg || d.receivedBags !== d.bags)
    const extra = [d.challanNo && `Challan ${d.challanNo}`, d.lotNo && `Lot ${d.lotNo}`].filter(Boolean).join(' · ')
    return [
      `${i + 1}. ${d.yarnType} — ${bagsText(d.receivedBags)}, ${fmtKg(d.receivedKg)}`,
      extra ? `   ${extra}` : '',
      diff ? `   (Sent: ${bagsText(d.bags)}, ${fmtKg(d.weightKg)})` : '',
      d.verifyNote ? `   Note: ${d.verifyNote}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  })
  const bags = rows.reduce((a, d) => a + (d.receivedBags || 0), 0)
  const kg = rows.reduce((a, d) => a + (d.receivedKg || 0), 0)
  return `*Sara Textile — Yarn received ${longDate(date)}*\n\n${lines.join('\n')}\n\nTotal: ${bagsText(bags)}, ${fmtKg(kg)}`
}

/** Received − sent (0 when the same). */
export function receivedDiff(d: YarnDispatch): { bags: number; kg: number } {
  if (d.status !== 'VERIFIED' || d.receivedKg == null) return { bags: 0, kg: 0 }
  return { bags: (d.receivedBags ?? 0) - d.bags, kg: Math.round(((d.receivedKg ?? 0) - d.weightKg) * 100) / 100 }
}

/** WhatsApp text after the mill checked an entry. */
export function yarnSupplyShareText(d: YarnDispatch): string {
  const diff = receivedDiff(d)
  const lines = [
    `*Sara Textile — Yarn received*`,
    `Yarn: ${d.yarnType}`,
    `Sent: ${longDateFromYmd(d.sentDate)} · ${bagsText(d.bags)} · ${fmtKg(d.weightKg)}`,
    d.challanNo ? `Challan #: ${d.challanNo}` : '',
    d.lotNo ? `Lot #: ${d.lotNo}` : '',
    d.vehicleNo ? `Vehicle #: ${d.vehicleNo}` : '',
  ]
  if (d.status === 'VERIFIED') {
    lines.push(
      `Received: ${d.receivedDate ? longDateFromYmd(d.receivedDate) : '—'} · ${bagsText(d.receivedBags)} · ${fmtKg(d.receivedKg)}`,
      diff.bags || diff.kg
        ? `Difference: ${diffText(diff)}`
        : 'Status: Verified — matches what was sent ✓',
      d.verifyNote ? `Note: ${d.verifyNote}` : '',
      d.verifiedBy ? `Checked by: ${d.verifiedBy}` : ''
    )
  } else if (d.status === 'ISSUE') {
    lines.push(`Status: Issue reported — ${d.issueNote}`, d.issueBy ? `By: ${d.issueBy}` : '')
  } else {
    lines.push('Status: Waiting for the mill to check')
  }
  return lines.filter(Boolean).join('\n')
}
