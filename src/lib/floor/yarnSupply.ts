/**
 * Yarn Supply (browser side): the supplier's entries of yarn sent to the mill, and the mill's
 * check of them. Types are shared with the server (src/server/floor/yarnSupply.ts).
 */
import { setListFromServer, announceReload } from '@/services/production/floorSync'
import { KEY_YARN, KEY_YARN_ISSUANCE, KEY_YARN_MOVEMENTS } from '@/services/production/floorStore'
import { longDateFromYmd } from '@/lib/longDate'

/** PENDING / ISSUE / VERIFIED: lots to the mill. SENT: to Fazal Umer's own Sizing / Warping (record only). */
export type YarnDispatchStatus = 'PENDING' | 'ISSUE' | 'VERIFIED' | 'SENT'

/** Where a lot goes: Sara Textile mill (checked by the mill) or Fazal Umer's own departments. */
export type YarnDestination = 'MILL' | 'SIZING' | 'WARPING'
export const DESTINATION_LABEL: Record<YarnDestination, string> = { MILL: 'Sara Textile', SIZING: 'Sizing', WARPING: 'Sectional Warping' }

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
  /** MILL (default), SIZING or WARPING. */
  destination: YarnDestination
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
  /** MILL (default), SIZING or WARPING. */
  destination?: YarnDestination
}

/** Fazal Umer's store: yarn added to his inventory (dispatches take it out). */
export interface SupplierStockEntry {
  id: string
  yarnType: string
  date: string
  bags: number
  kg: number
  note: string
  /** The party Fazal Umer got this yarn from. */
  supplierName: string
  /** Each bag's kg (entries that came from Twisting); empty when only a total was entered. */
  bagKg: number[]
  createdBy: string
  createdAt: string
}

export type SupplierStockInput = {
  yarnType: string
  date: string
  bags: number
  kg: number
  note?: string
  supplierName?: string
  /** Adding to the Inventory: one weight for every bag (kg = bags × this). */
  bagWeightKg?: number
}

/**
 * Twisting: raw yarn comes in to Twisting first; when it is done it moves to the Inventory
 * as the twisted yarn (its own name and kg — the difference is the twisting loss).
 */
export interface SupplierTwisting {
  id: string
  /** IN_TWISTING until moved to the Inventory (DONE). */
  status: 'IN_TWISTING' | 'DONE'
  inYarnType: string
  inDate: string
  inBags: number
  inKg: number
  note: string
  /** The party the raw yarn came from. */
  supplierName: string
  outYarnType: string
  outDate: string | null
  outBags: number | null
  outKg: number | null
  /** Each bag's kg when it moved to the Inventory. */
  outBagKg: number[]
  createdBy: string
  movedBy: string
}

export type SupplierTwistingInput = { yarnType: string; date: string; bags: number; kg: number; note?: string; supplierName?: string }
/** Twisting done: the twisted yarn with each bag's kg (kg = their total). */
export type SupplierTwistingOut = { yarnType: string; date: string; bagKg: number[] }

/** Per yarn: added − sent (to the mill, Sizing and Warping). */
export interface SupplierStoreBalance {
  yarnType: string
  inKg: number
  inBags: number
  outKg: number
  outBags: number
  balanceKg: number
  balanceBags: number
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
  imageUrl: string | null
  requestedBy: string
  createdAt: string
  closedBy: string
  closeNote: string
  /** Lots sent against it (not deleted): count, bags sent, kg sent, kg the mill verified, verified/issue lot counts. */
  lots: number
  sentBags: number
  sentKg: number
  receivedKg: number
  verifiedLots: number
  issueLots: number
  log: YarnRequestLog[]
}

export type YarnRequestInput = {
  yarnType: string
  kg?: number
  bags?: number | null
  neededBy?: string | null
  note?: string
  imageUrl?: string | null
}

export type MillYarnStock = { id: string; yarnType: string; balanceKg: number }

export type YarnSupplyList = {
  dispatches: YarnDispatch[]
  requests: YarnRequest[]
  /** Fazal Umer's store (only for Yarn Supply users). */
  store: SupplierStoreBalance[]
  storeEntries: SupplierStockEntry[]
  twisting: SupplierTwisting[]
  /** Lots sent to Sizing / Warping. */
  deptDispatches: YarnDispatch[]
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
    store: d.store || [],
    storeEntries: d.storeEntries || [],
    twisting: d.twisting || [],
    deptDispatches: d.deptDispatches || [],
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
  | { action: 'stockAdd'; stock: SupplierStockInput }
  | { action: 'stockUpdate'; id: string; stock: SupplierStockInput }
  | { action: 'stockDelete'; id: string }
  | { action: 'twistAdd'; twist: SupplierTwistingInput }
  | { action: 'twistUpdate'; id: string; twist: SupplierTwistingInput }
  | { action: 'twistDelete'; id: string }
  | { action: 'twistDone'; id: string; out: SupplierTwistingOut }
  | { action: 'twistUndo'; id: string }

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
    q.kg > 0 ? `Quantity: ${fmtKg(q.kg)}${q.bags ? ` (${bagsText(q.bags)})` : ''}` : `Count: ${bagsText(q.bags)}`,
    q.neededBy ? `Needed by: ${longDateFromYmd(q.neededBy)}` : '',
    q.note ? `Note: ${q.note}` : '',
    q.sentKg > 0 ? `Sent so far: ${fmtKg(q.sentKg)}${q.kg > 0 ? ` · Remaining: ${fmtKg(requestRemainingKg(q))}` : ''}` : '',
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
    const extra = d.lotNo ? `Lot ${d.lotNo}` : ''
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
    d.lotNo ? `Lot #: ${d.lotNo}` : '',
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
    lines.push('Status: Waiting for Sara Textile to check')
  }
  return lines.filter(Boolean).join('\n')
}

export type TrackingPeriod = 'daily' | 'weekly' | 'monthly' | 'all'

export const TRACKING_PERIODS: Array<{ value: TrackingPeriod; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'all', label: 'All' },
]

export function matchesTrackingPeriod(ymd: string | null | undefined, period: TrackingPeriod, anchorYmd: string): boolean {
  if (period === 'all' || !ymd) return true
  const d = ymd.slice(0, 10)
  if (period === 'daily') return d === anchorYmd
  if (period === 'monthly') return d.slice(0, 7) === anchorYmd.slice(0, 7)
  const [ty, tm, td] = anchorYmd.split('-').map(Number)
  const end = new Date(Date.UTC(ty, tm - 1, td))
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 6)
  const startYmd = start.toISOString().slice(0, 10)
  return d >= startYmd && d <= anchorYmd
}

export function shiftTrackingDate(anchorYmd: string, period: TrackingPeriod, delta: -1 | 1): string {
  const [y, m, d] = anchorYmd.split('-').map(Number)
  if (period === 'monthly') {
    const dt = new Date(Date.UTC(y, m - 1 + delta, 1))
    return dt.toISOString().slice(0, 10)
  }
  const step = period === 'weekly' ? 7 * delta : delta
  const dt = new Date(Date.UTC(y, m - 1, d + step))
  return dt.toISOString().slice(0, 10)
}

export function formatTrackingPeriod(anchorYmd: string, period: TrackingPeriod): string {
  if (period === 'all') return 'All'
  if (period === 'daily') return longDateFromYmd(anchorYmd)
  const [y, m, d] = anchorYmd.split('-').map(Number)
  if (period === 'monthly') {
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(y, m - 1, 1))
    )
  }
  const end = new Date(Date.UTC(y, m - 1, d))
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 6)
  const fmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${fmt.format(start)} – ${fmt.format(end)} ${end.getUTCFullYear()}`
}

/**
 * Verified tab badge: lots Sara Textile verified after this device last opened the Verified tab.
 * Kept as the newest server "verifiedAt" already seen (server times only, so the PC clock does not matter).
 */
const VERIFIED_SEEN_KEY = 'sara:yarn-verified-seen-at'
export const VERIFIED_SEEN_EVENT = 'sara:yarn-verified-seen'

type VerifiedLike = { status: string; verifiedAt: string | null; destination?: string }

const verifiedTimes = (list: VerifiedLike[]) =>
  list
    .filter((d) => d.status === 'VERIFIED' && (d.destination ?? 'MILL') === 'MILL' && d.verifiedAt)
    .map((d) => Date.parse(d.verifiedAt as string))
    .filter((t) => Number.isFinite(t))

export function verifiedSeenAt(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const v = Number(window.localStorage.getItem(VERIFIED_SEEN_KEY))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

/** Remember the newest verified lot in `list` as seen (opening the Verified tab, or first visit on this device). */
export function markVerifiedSeen(list: VerifiedLike[]) {
  if (typeof window === 'undefined') return
  const newest = Math.max(1, ...verifiedTimes(list))
  const before = verifiedSeenAt()
  if (before != null && before >= newest) return
  try {
    window.localStorage.setItem(VERIFIED_SEEN_KEY, String(newest))
  } catch {
    return
  }
  window.dispatchEvent(new Event(VERIFIED_SEEN_EVENT))
}

/** Lots verified after the last one seen (0 until this device has a "seen" mark). */
export const newVerifiedCount = (list: VerifiedLike[], seenAt: number | null) =>
  seenAt == null ? 0 : verifiedTimes(list).filter((t) => t > seenAt).length
