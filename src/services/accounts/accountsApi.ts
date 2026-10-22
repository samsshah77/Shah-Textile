'use client'

/**
 * Browser client for /api/accounts/*. Every save is one bill / entry, carries the
 * version the page last saw, and a refusal (old copy, locked month, no permission,
 * server down) raises the red "Not saved" banner — nothing fails silently.
 */
import type {
  Bill,
  CostInputs,
  CostStatement,
  MonthBook,
  MonthLock,
  Party,
  PartyKind,
  PartyLedger,
  PartySummary,
  Payment,
  PettyCashEntry,
  PettyCashKind,
  PettyCashStatement,
  PaymentMode,
  PaymentKind,
  PayAccount,
  PayablesReport,
  CostBucket,
} from '@/lib/accounts/types'
import type { MonthImportPreview, MonthImportResult } from '@/server/accounts/monthImport'
import type { ResetPreview, ResetResult } from '@/server/accounts/resetFromFiles'

export const ACCOUNTS_PROBLEM_EVENT = 'accounts:save-problem'
export const ACCOUNTS_CHANGED_EVENT = 'accounts:changed'

export class AccountsApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}

function announce(status: number, message: string) {
  try {
    window.dispatchEvent(new CustomEvent(ACCOUNTS_PROBLEM_EVENT, { detail: { status, message } }))
  } catch {
    // ignore
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    const msg = 'Server se raabta nahi hua — internet check karein, phir dobara karein.'
    if (method !== 'GET') announce(0, msg)
    throw new AccountsApiError(0, msg)
  }
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string } & T
  if (!res.ok || data.ok === false) {
    const msg = data.error || `Request failed (${res.status})`
    if (method !== 'GET') announce(res.status, msg)
    throw new AccountsApiError(res.status, msg, data.code)
  }
  if (method !== 'GET') {
    try {
      window.dispatchEvent(new CustomEvent(ACCOUNTS_CHANGED_EVENT))
    } catch {
      // ignore
    }
  }
  return data
}

const q = (params: Record<string, string | number | null | undefined>) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') s.set(k, String(v))
  const str = s.toString()
  return str ? `?${str}` : ''
}

export type LineDraft = { id?: string; description: string; machine: string; quantity: number; rate: number }

export const accountsApi = {
  months: () => call<{ months: string[]; current: string }>('GET', '/api/accounts/months'),
  book: (month: string) => call<{ book: MonthBook & { nextInwardNo: string } }>('GET', `/api/accounts/book${q({ month })}`).then((r) => r.book),

  createBill: (input: {
    month: string
    date: string
    billNo: string
    inwardNo: string
    partyId?: string
    partyName?: string
    partyKind?: PartyKind
    remarks?: string
    lines: LineDraft[]
    attachments?: string[]
    afterBillId?: string
  }) => call<{ bill: Bill }>('POST', '/api/accounts/bills', input).then((r) => r.bill),
  updateBill: (
    id: string,
    baseVersion: number,
    patch: Partial<{ date: string; month: string; billNo: string; inwardNo: string; partyId: string; remarks: string; lines: LineDraft[]; attachments: string[] }>
  ) => call<{ bill: Bill }>('PATCH', `/api/accounts/bills/${id}`, { baseVersion, ...patch }).then((r) => r.bill),
  deleteBill: (id: string, version: number) => call<{ deleted: string }>('DELETE', `/api/accounts/bills/${id}${q({ version })}`),
  addLine: (billId: string, baseVersion: number, line: LineDraft, afterLineId?: string) =>
    call<{ bill: Bill }>('POST', `/api/accounts/bills/${billId}/lines`, { baseVersion, line, afterLineId }).then((r) => r.bill),
  updateLine: (billId: string, lineId: string, baseVersion: number, patch: Partial<LineDraft>) =>
    call<{ bill: Bill }>('PATCH', `/api/accounts/bills/${billId}/lines/${lineId}`, { baseVersion, ...patch }).then((r) => r.bill),
  deleteLine: (billId: string, lineId: string, version: number) =>
    call<{ bill: Bill | null; deleted: string | null }>('DELETE', `/api/accounts/bills/${billId}/lines/${lineId}${q({ version })}`),

  directory: (kind: PartyKind | null, month: string | 'all') =>
    call<{ rows: PartySummary[] }>('GET', `/api/accounts/parties${q({ kind, month })}`).then((r) => r.rows),
  createParty: (input: { name: string; kind: PartyKind; category?: string; costBucket?: CostBucket; remarks?: string; account?: PayAccount }) =>
    call<{ party: Party }>('POST', '/api/accounts/parties', input).then((r) => r.party),
  updateParty: (id: string, baseVersion: number, patch: Partial<Pick<Party, 'name' | 'kind' | 'category' | 'costBucket' | 'remarks' | 'active' | 'account'>>) =>
    call<{ party: Party }>('PATCH', `/api/accounts/parties/${id}`, { baseVersion, ...patch }).then((r) => r.party),
  ledger: (idOrSlug: string, month: string | 'all') =>
    call<{ ledger: PartyLedger }>('GET', `/api/accounts/parties/${encodeURIComponent(idOrSlug)}${q({ month })}`).then((r) => r.ledger),

  createPayment: (input: {
    partyId: string
    date: string
    amount: number
    kind?: PaymentKind
    mode: PaymentMode
    paidFrom?: PayAccount
    reference?: string
    remarks?: string
    attachments?: string[]
  }) => call<{ payment: Payment }>('POST', '/api/accounts/payments', input).then((r) => r.payment),
  updatePayment: (id: string, baseVersion: number, patch: { date?: string; amount?: number; reference?: string; remarks?: string; attachments?: string[] }) =>
    call<{ payment: Payment }>('PATCH', `/api/accounts/payments/${id}`, { baseVersion, ...patch }).then((r) => r.payment),
  resetPreview: () => call<{ preview: ResetPreview }>('GET', '/api/accounts/reset').then((r) => r.preview),
  reset: () => call<{ result: ResetResult; snapshot: string }>('POST', '/api/accounts/reset', { confirm: 'RESET' }),
  monthImportPreview: (month: string) =>
    call<{ preview: MonthImportPreview }>('GET', `/api/accounts/import${q({ month })}`).then((r) => r.preview),
  monthImport: (month: string) => call<{ result: MonthImportResult }>('POST', '/api/accounts/import', { month }).then((r) => r.result),
  payables: (asOf: string) => call<{ report: PayablesReport }>('GET', `/api/accounts/payables${q({ asOf })}`).then((r) => r.report),
  deletePayment: (id: string, version: number) => call<{ deleted: string }>('DELETE', `/api/accounts/payments/${id}${q({ version })}`),

  petty: (month: string) => call<{ statement: PettyCashStatement }>('GET', `/api/accounts/petty-cash${q({ month })}`).then((r) => r.statement),
  pettySummary: () =>
    call<{ rows: Omit<PettyCashStatement, 'entries' | 'lock'>[] }>('GET', '/api/accounts/petty-cash?summary=1').then((r) => r.rows),
  createPetty: (input: { date: string; description: string; kind: PettyCashKind; amount: number }) =>
    call<{ entry: PettyCashEntry }>('POST', '/api/accounts/petty-cash', input).then((r) => r.entry),
  updatePetty: (id: string, baseVersion: number, patch: Partial<{ date: string; description: string; kind: PettyCashKind; amount: number }>) =>
    call<{ entry: PettyCashEntry }>('PATCH', `/api/accounts/petty-cash/${id}`, { baseVersion, ...patch }).then((r) => r.entry),
  deletePetty: (id: string, version: number) => call<{ deleted: string }>('DELETE', `/api/accounts/petty-cash/${id}${q({ version })}`),

  cost: (month: string) => call<{ statement: CostStatement }>('GET', `/api/accounts/cost-statement${q({ month })}`).then((r) => r.statement),
  saveCost: (month: string, baseVersion: number, inputs: CostInputs) =>
    call<{ statement: CostStatement }>('PUT', '/api/accounts/cost-statement', { month, baseVersion, inputs }).then((r) => r.statement),
  resetCost: (month: string, version: number) =>
    call<{ statement: CostStatement }>('DELETE', `/api/accounts/cost-statement${q({ month, version })}`).then((r) => r.statement),

  setLock: (month: string, locked: boolean) => call<{ lock: MonthLock }>('PUT', '/api/accounts/locks', { month, locked }).then((r) => r.lock),
  legacyUpload: (entries: Record<string, unknown>) =>
    call<{ added: string[] }>('POST', '/api/accounts/legacy', { entries }),
}
