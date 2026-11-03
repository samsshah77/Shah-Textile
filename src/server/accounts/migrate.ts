/**
 * One-time copy of the old Accounts data into the new tables.
 *
 * Reads exactly what the old pages showed: each `accounts_store` key, or — when a key was
 * never saved — the Excel seed the old pages fell back to. Nothing in `accounts_store`
 * is changed or deleted; it stays as a backup.
 *
 * Safe to run again: every source is logged with a hash in `acc_import_log`, and a bill
 * that already exists (same party, bill no., item, amount) is never added twice.
 */
import { createHash, randomUUID } from 'crypto'
import { accountsData } from '@/data/accountsData'
import { ACCOUNTS_KEYS } from '@/lib/accountsKeys'
import type { CostInputs, PartyKind, PettyCashKind } from '@/lib/accounts/types'
import { isDate, lineAmount, monthOfDate, slugifyPartyName } from '@/lib/accounts/util'
import { EXCEL_AUG_2026_INPUTS, RECURRING_COST_FIELDS } from '@/server/accounts/reports'
import {
  type Db,
  createBill,
  createPayment,
  createPetty,
  defaultCostBucket,
  getParty,
  listBills,
  listPetty,
  saveCostInputs,
  getCostInputs,
} from '@/server/accounts/repo'

// ---------------------------------------------------------------- plan (pure)

export interface PlannedLine {
  description: string
  machine: string
  quantity: number
  rate: number
}
export interface PlannedBill {
  /** Which old store key (or seed) this came from — see ImportPlan.sources. */
  origin: string
  source: string
  month: string
  date: string
  billNo: string
  inwardNo: string
  partyName: string
  partyKind: PartyKind
  lines: PlannedLine[]
}
export interface PlannedParty {
  origin: string
  name: string
  kind: PartyKind
  category: string
  remarks: string
  active: boolean
}
export interface PlannedPetty {
  origin: string
  date: string
  description: string
  kind: PettyCashKind
  amount: number
  /** Balance the old sheet showed after this row (for the check report). */
  oldBalance?: number
}
export interface ImportPlan {
  sources: { source: string; hash: string }[]
  parties: PlannedParty[]
  bills: PlannedBill[]
  payments: { origin: string; partyName: string; partyKind: PartyKind; date: string; amount: number; remarks: string }[]
  petty: PlannedPetty[]
  costInputs: { origin: string; month: string; inputs: CostInputs }[]
  notes: string[]
}

const MONTHS: Record<string, string> = {
  january: '01', february: '02', febraury: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
}

/** Old inventory sheet key ("September", "Febraury", "March 2027") → "YYYY-MM". */
export function sheetKeyToMonth(key: string): string | null {
  const m = key.trim().toLowerCase().match(/^([a-z]+)(?:\s+(\d{4}))?$/)
  if (!m || !MONTHS[m[1]]) return null
  return `${m[2] || '2026'}-${MONTHS[m[1]]}`
}

function hashOf(v: unknown): string {
  return createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 32)
}

const WORKSHOP_WORDS = /engineering|workshop|repair|lathe|rewind/
function seedWorkshopSlugs(): Set<string> {
  const s = new Set<string>()
  for (const w of accountsData.workshops.synopsis) s.add(slugifyPartyName(w.workshopName))
  for (const l of accountsData.workshops.ledgers || []) s.add(slugifyPartyName(l.workshopName || l.slug))
  return s
}

/**
 * Old rule for "is this party a workshop", kept for the copy only. After the copy each
 * party has its own Trader / Workshop setting that the accountant can change.
 */
export function oldLooksLikeWorkshop(name: string, workshopSlugs: Set<string>): boolean {
  return WORKSHOP_WORDS.test(name.toLowerCase()) || workshopSlugs.has(slugifyPartyName(name))
}

function oldTraderType(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('petroleum') || n.includes('oil')) return 'Petroleum & Oil'
  if (n.includes('smd') || n.includes('electronic') || n.includes('textile engineering')) return 'Electronics'
  if (n.includes('fire')) return 'Safety / Fire'
  return 'Trader'
}
function oldWorkshopType(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('lathe') || n.includes('turning')) return 'Lathe / Turning'
  if (n.includes('weld')) return 'Welding'
  if (n.includes('motor') || n.includes('rewind')) return 'Motor Rewinding'
  return 'Workshop / Engineering'
}

type AnyItem = Record<string, unknown>
/** Old blobs were written by many page versions: keep only plain object rows. */
const arr = (v: unknown): AnyItem[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) as AnyItem[]) : []
const str = (v: unknown) => (v == null ? '' : String(v)).trim()
const num = (v: unknown) => Number(v) || 0

/** Rows saved after the Trader/Workshop switcher carry an explicit partyType; it beats the name guess. */
function explicitKind(it: AnyItem): PartyKind | null {
  const t = str(it.partyType).toLowerCase()
  return t === 'workshop' ? 'WORKSHOP' : t === 'trader' ? 'TRADER' : null
}

/** Group consecutive rows of one bill (same date, bill no., inward no., party). */
function groupRows(
  rows: AnyItem[],
  ctx: { origin: string; source: string; month: string | null; defaultDate: string; kindOf: (party: string) => PartyKind }
): PlannedBill[] {
  const out: PlannedBill[] = []
  let lastDate = ctx.defaultDate
  let cur: PlannedBill | null = null
  for (const it of rows) {
    const party = str(it.companyName) || str(it.partyName) || '(Unknown party)'
    const rawDate = str(it.date).slice(0, 10)
    const date = isDate(rawDate) ? rawDate : lastDate
    lastDate = date
    const billNo = str(it.billNo)
    const inwardNo = str(it.inwardNo)
    const month = ctx.month || monthOfDate(date)
    const line: PlannedLine = {
      description: str(it.itemDescription) || str(it.itemName) || str(it.description),
      machine: str(it.machineName) || str(it.machineCategory) || 'G-6200',
      quantity: num(it.quantity),
      rate: num(it.costPerItem) || num(it.rate),
    }
    // When qty × rate does not give the bill's written total (missing qty or rate, typo),
    // the written total wins: keep qty (or 1) and derive the rate from it.
    const total = num(it.totalPrice) || num(it.totalAmount) || num(it.amount)
    if (total > 0 && lineAmount(line.quantity, line.rate) !== Math.round(total)) {
      line.quantity = line.quantity > 0 ? line.quantity : 1
      line.rate = total / line.quantity
    }
    const same =
      cur &&
      billNo &&
      cur.billNo.toLowerCase() === billNo.toLowerCase() &&
      cur.inwardNo.toLowerCase() === inwardNo.toLowerCase() &&
      slugifyPartyName(cur.partyName) === slugifyPartyName(party) &&
      cur.date === date &&
      cur.month === month
    if (same && cur) {
      cur.lines.push(line)
    } else {
      cur = { origin: ctx.origin, source: ctx.source, month, date, billNo, inwardNo, partyName: party, partyKind: explicitKind(it) ?? ctx.kindOf(party), lines: [line] }
      out.push(cur)
    }
  }
  return out
}

export function planImport(store: Record<string, unknown>): ImportPlan {
  const plan: ImportPlan = { sources: [], parties: [], bills: [], payments: [], petty: [], costInputs: [], notes: [] }
  const wsSlugs = seedWorkshopSlugs()
  const kindOf = (name: string): PartyKind => (oldLooksLikeWorkshop(name, wsSlugs) ? 'WORKSHOP' : 'TRADER')
  const pickSource = (source: string, key: string, seed: unknown): [unknown, string] => {
    const has = Object.prototype.hasOwnProperty.call(store, key) && store[key] != null
    const value = has ? store[key] : seed
    const origin = has ? `store:${key}` : `seed:${source}`
    plan.sources.push({ source: origin, hash: hashOf(value) })
    return [value, origin]
  }

  // Parties from the two synopsis lists (old directory pages).
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  const deletedTraders = new Set(
    [...strs(store[ACCOUNTS_KEYS.DELETED_TRADERS]), ...strs(store['sara_deleted_traders_v1'])].map(slugifyPartyName)
  )
  const deletedWorkshops = new Set(
    [...strs(store[ACCOUNTS_KEYS.DELETED_WORKSHOPS]), ...strs(store['sara_deleted_workshops_v1'])].map(slugifyPartyName)
  )
  const [tradersRaw, tradersOrigin] = pickSource('traders', ACCOUNTS_KEYS.TRADERS_STORE, accountsData.traders.synopsis)
  const traders = arr(tradersRaw)
  for (const t of traders) {
    const name = str(t.traderName)
    if (!name) continue
    const slug = slugifyPartyName(name)
    plan.parties.push({ origin: tradersOrigin, name, kind: 'TRADER', category: oldTraderType(name), remarks: str(t.remarks), active: !deletedTraders.has(slug) })
    if (num(t.foiPayable) > 0)
      plan.payments.push({ origin: tradersOrigin, partyName: name, partyKind: 'TRADER', date: '2026-08-31', amount: num(t.foiPayable), remarks: 'FOI paid (copied from old synopsis)' })
  }
  const [workshopsRaw, workshopsOrigin] = pickSource('workshops', ACCOUNTS_KEYS.WORKSHOPS_STORE, accountsData.workshops.synopsis)
  const workshops = arr(workshopsRaw)
  for (const w of workshops) {
    const name = str(w.workshopName)
    if (!name) continue
    const slug = slugifyPartyName(name)
    plan.parties.push({ origin: workshopsOrigin, name, kind: 'WORKSHOP', category: oldWorkshopType(name), remarks: str(w.remarks), active: !deletedWorkshops.has(slug) })
    if (num(w.foiPayable) > 0)
      plan.payments.push({ origin: workshopsOrigin, partyName: name, partyKind: 'WORKSHOP', date: '2026-08-31', amount: num(w.foiPayable), remarks: 'FOI paid (copied from old synopsis)' })
  }

  // 1) Daily Inward sheet — the main book, in sheet order.
  const [inventoryRaw, inventoryOrigin] = pickSource('inventory', ACCOUNTS_KEYS.INVENTORY_CONTROL, accountsData.inventoryControl.months)
  const inventory =
    inventoryRaw && typeof inventoryRaw === 'object' && !Array.isArray(inventoryRaw)
      ? (inventoryRaw as Record<string, { items?: unknown }>)
      : {}
  const sheetMonths = Object.keys(inventory)
    .map((k) => ({ k, m: sheetKeyToMonth(k) }))
    .filter((x) => {
      if (!x.m) plan.notes.push(`Skipped inventory sheet "${x.k}" (month name not understood).`)
      return Boolean(x.m)
    })
    .sort((a, b) => (a.m! < b.m! ? -1 : 1))
  for (const { k, m } of sheetMonths) {
    const items = arr(inventory[k]?.items)
    plan.bills.push(...groupRows(items, { origin: inventoryOrigin, source: `inventory:${k}`, month: m, defaultDate: `${m}-01`, kindOf }))
  }

  // 2) Per-party ledgers saved by the old Traders / Workshops pages.
  const ledgerParty = (slug: string, list: AnyItem[], kind: PartyKind) => {
    const syn = (kind === 'TRADER' ? traders : workshops).find(
      (t) => slugifyPartyName(str(kind === 'TRADER' ? t.traderName : t.workshopName)) === slug
    )
    return str(syn?.[kind === 'TRADER' ? 'traderName' : 'workshopName']) || str(list[0]?.partyName) || slug
  }
  for (const [key, value] of Object.entries(store)) {
    for (const [prefix, kind] of [
      [ACCOUNTS_KEYS.TRADER_PREFIX, 'TRADER'],
      [ACCOUNTS_KEYS.WORKSHOP_PREFIX, 'WORKSHOP'],
    ] as const) {
      if (!key.startsWith(prefix) || !Array.isArray(value) || !value.length) continue
      const slug = key.slice(prefix.length)
      const name = ledgerParty(slug, value as AnyItem[], kind)
      plan.sources.push({ source: `store:${key}`, hash: hashOf(value) })
      const rows = arr(value).map((e) => ({ ...e, partyName: name, companyName: name }))
      plan.bills.push(...groupRows(rows, { origin: `store:${key}`, source: `ledger:${slug}`, month: null, defaultDate: '2026-08-01', kindOf: () => kind }))
    }
  }

  // 3) Seed ledgers the old pages showed for parties without their own saved ledger.
  for (const [ledgers, kind, prefix] of [
    [accountsData.traders.ledgers, 'TRADER', ACCOUNTS_KEYS.TRADER_PREFIX],
    [accountsData.workshops.ledgers, 'WORKSHOP', ACCOUNTS_KEYS.WORKSHOP_PREFIX],
  ] as const) {
    for (const l of (ledgers || []) as unknown as Array<{ slug: string; partyName?: string; workshopName?: string; items: AnyItem[] }>) {
      const name = l.partyName || l.workshopName || l.slug
      const slug = l.slug || slugifyPartyName(name)
      if (store[`${prefix}${slug}`] != null) continue
      const rows = (l.items || []).map((it) => ({ ...it, partyName: name, companyName: name }))
      plan.bills.push(...groupRows(rows, { origin: 'seed:ledgers', source: `seed-ledger:${slug}`, month: null, defaultDate: '2026-08-01', kindOf: () => kind }))
    }
  }
  plan.sources.push({ source: 'seed:ledgers', hash: hashOf([accountsData.traders.ledgers, accountsData.workshops.ledgers]) })

  // 4) Old side lists (only if something was actually saved there).
  for (const key of [ACCOUNTS_KEYS.DAILY_INWARD, ACCOUNTS_KEYS.INVENTORY_PURCHASE]) {
    const v = store[key]
    if (!Array.isArray(v) || !v.length) continue
    plan.sources.push({ source: `store:${key}`, hash: hashOf(v) })
    plan.bills.push(...groupRows(arr(v), { origin: `store:${key}`, source: key, month: null, defaultDate: '2026-08-01', kindOf }))
  }

  // Petty cash journal.
  const [pettyRaw, pettyOrigin] = pickSource('petty', ACCOUNTS_KEYS.PETTY_CASH, accountsData.dailyExpense.pettyCash)
  const petty = arr(pettyRaw)
  petty.forEach((e, i) => {
    const date = isDate(str(e.date).slice(0, 10)) ? str(e.date).slice(0, 10) : '2026-08-01'
    const debit = num(e.debitAmount) || num(e.debit)
    const credit = num(e.creditAmount) || num(e.credit)
    const description = str(e.description) || '(no description)'
    const bal = e.balance == null ? undefined : num(e.balance)
    if (i === 0 && !debit && !credit && bal) {
      plan.petty.push({ origin: pettyOrigin, date, description: description || 'Balance b/f', kind: 'OPENING', amount: bal, oldBalance: bal })
      return
    }
    if (debit) plan.petty.push({ origin: pettyOrigin, date, description, kind: 'CASH_IN', amount: debit, oldBalance: credit ? undefined : bal })
    if (credit) {
      const kind: PettyCashKind = description.toLowerCase().includes('paid salaries') ? 'SALARY' : 'EXPENSE'
      plan.petty.push({ origin: pettyOrigin, date, description, kind, amount: credit, oldBalance: bal })
    }
  })

  // Cost statement manual lines.
  const overridePrefix = `${ACCOUNTS_KEYS.COST_OVERRIDES_PREFIX.slice(0, -1)}_`
  const saved = new Map<string, Record<string, unknown>>()
  for (const [key, value] of Object.entries(store)) {
    if (!key.startsWith(overridePrefix) || !value || typeof value !== 'object') continue
    const month = key.slice(overridePrefix.length).replace(/^_/, '')
    if (!/^\d{4}-\d{2}$/.test(month)) continue
    saved.set(month, value as Record<string, unknown>)
    plan.sources.push({ source: `store:${overridePrefix}${month}`, hash: hashOf(value) })
  }
  if (!saved.has('2026-08')) {
    plan.sources.push({ source: 'seed:cost-2026-08', hash: hashOf(EXCEL_AUG_2026_INPUTS) })
    plan.costInputs.push({ origin: 'seed:cost-2026-08', month: '2026-08', inputs: EXCEL_AUG_2026_INPUTS })
  }
  for (const [month, o] of saved) {
    const base: CostInputs = month === '2026-08' ? { ...EXCEL_AUG_2026_INPUTS } : {}
    const inputs: CostInputs = { ...base }
    for (const f of RECURRING_COST_FIELDS) if (o[f] !== undefined) (inputs as Record<string, unknown>)[f] = o[f]
    if (typeof o.period === 'string') inputs.period = o.period
    if (Array.isArray(o.storeInventory))
      inputs.storeInventory = arr(o.storeInventory).map((s) => ({ name: str(s.item) || str(s.name), amount: num(s.amount) }))
    for (const f of RECURRING_COST_FIELDS) {
      const v = (inputs as Record<string, unknown>)[f]
      if (f !== 'adminExpenses' && v !== undefined && !Number.isFinite(Number(v))) delete (inputs as Record<string, unknown>)[f]
    }
    const meters = num(o.monthlyProductionMeters)
    // The old page saved Aug 2026's 104,183 m into every month; that is not a real reading.
    if (meters && !(month !== '2026-08' && meters === 104183)) inputs.monthlyProductionMeters = meters
    plan.costInputs.push({ origin: `store:${overridePrefix}${month}`, month, inputs })
  }

  return plan
}

/** Same bill in two places (old copies) → one. Key: party, bill no., item, amount. */
export function billFingerprints(partySlug: string, billNo: string, lines: PlannedLine[] | { description: string; quantity: number; rate: number }[]): string[] {
  return lines.map((l) =>
    [partySlug, billNo.trim().toLowerCase(), l.description.trim().toLowerCase().replace(/\s+/g, ' '), lineAmount(l.quantity, l.rate)].join('|')
  )
}

// ---------------------------------------------------------------- apply

export interface ImportResult {
  ran: boolean
  parties: number
  bills: number
  lines: number
  skippedDuplicateLines: number
  payments: number
  petty: number
  costMonths: number
  notes: string[]
}

export async function applyImport(dbc: Db, plan: ImportPlan): Promise<ImportResult> {
  const res: ImportResult = { ran: false, parties: 0, bills: 0, lines: 0, skippedDuplicateLines: 0, payments: 0, petty: 0, costMonths: 0, notes: [...plan.notes] }
  const logged = new Map(
    (await dbc.$queryRawUnsafe<{ source: string; hash: string }[]>(`SELECT "source","hash" FROM "acc_import_log"`)).map((r) => [r.source, r.hash])
  )
  // A source is copied once. Later changes to an old key (e.g. an old browser tab) are
  // ignored, otherwise bills deleted in the new system would come back.
  const todo = plan.sources.filter((s) => !logged.has(s.source))
  if (!todo.length) return res
  const fresh = new Set(todo.map((s) => s.source))
  res.ran = true

  // Parties (create or keep; never rename an existing one).
  const partyIds = new Map<string, string>()
  const ensureParty = async (name: string, kind: PartyKind, extra?: Partial<PlannedParty>) => {
    const slug = slugifyPartyName(name) || 'unknown-party'
    const known = partyIds.get(slug)
    if (known) return known
    const found = await getParty(dbc, slug)
    if (found) {
      partyIds.set(slug, found.id)
      return found.id
    }
    const id = randomUUID()
    const category = extra?.category ?? (kind === 'TRADER' ? oldTraderType(name) : oldWorkshopType(name))
    await dbc.$executeRawUnsafe(
      `INSERT INTO "acc_parties" ("id","name","slug","kind","category","costBucket","remarks","active") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      id,
      name,
      slug,
      kind,
      category,
      defaultCostBucket(name, kind, category),
      extra?.remarks || '',
      extra?.active ?? true
    )
    res.parties += 1
    partyIds.set(slug, id)
    return id
  }
  for (const p of plan.parties) if (fresh.has(p.origin)) await ensureParty(p.name, p.kind, p)

  // Bills, skipping lines already present (same party / bill no. / item / amount).
  const seen = new Set<string>()
  const existingParties = new Map<string, string>()
  const allParties = await dbc.$queryRawUnsafe<{ id: string; slug: string }[]>(`SELECT "id", "slug" FROM "acc_parties"`)
  for (const p of allParties) existingParties.set(p.id, p.slug)
  for (const b of await listBills(dbc, {})) {
    const slug = existingParties.get(b.partyId) || ''
    for (const f of billFingerprints(slug, b.billNo, b.lines)) seen.add(f)
  }
  for (const b of plan.bills) {
    if (!fresh.has(b.origin)) continue
    const slug = slugifyPartyName(b.partyName) || 'unknown-party'
    const prints = billFingerprints(slug, b.billNo, b.lines)
    const keep = b.lines.filter((_, i) => !seen.has(prints[i]))
    res.skippedDuplicateLines += b.lines.length - keep.length
    if (!keep.length) continue
    prints.forEach((p) => seen.add(p))
    const partyId = await ensureParty(b.partyName, b.partyKind)
    const lockRows = await dbc.$queryRawUnsafe<{ locked: boolean }[]>(`SELECT "locked" FROM "acc_month_locks" WHERE "month" = $1`, b.month)
    if (lockRows[0]?.locked) {
      res.notes.push(`Skipped ${b.lines.length} line(s) of bill ${b.billNo || '-'} — ${b.month} is locked.`)
      continue
    }
    await createBill(dbc, {
      month: b.month,
      date: b.date,
      billNo: b.billNo,
      inwardNo: b.inwardNo,
      partyId,
      remarks: '',
      lines: keep,
      createdBy: 'import',
    })
    res.bills += 1
    res.lines += keep.length
  }

  // Payments and petty cash have no natural key: copied only with their own source.
  {
    for (const p of plan.payments) {
      if (!fresh.has(p.origin)) continue
      const partyId = await ensureParty(p.partyName, p.partyKind)
      // The old synopsis kept only a running "FOI paid" total: date it on the party's last bill.
      const slug = slugifyPartyName(p.partyName)
      const lastBill = plan.bills
        .filter((b) => slugifyPartyName(b.partyName) === slug)
        .reduce((d, b) => (b.date > d ? b.date : d), '')
      await createPayment(dbc, { partyId, date: lastBill || p.date, amount: p.amount, mode: 'OTHER', reference: '', remarks: p.remarks })
      res.payments += 1
    }
    if ((await listPetty(dbc)).length === 0) {
      let order = 0
      let lastMonth = ''
      for (const e of plan.petty.filter((x) => fresh.has(x.origin))) {
        const month = monthOfDate(e.date)
        if (month !== lastMonth) {
          order = 0
          lastMonth = month
        }
        await createPetty(dbc, { date: e.date, description: e.description, kind: e.kind, amount: e.amount, sortOrder: ++order })
        res.petty += 1
      }
    }
  }
  for (const c of plan.costInputs) {
    if (!fresh.has(c.origin) || (await getCostInputs(dbc, c.month))) continue
    await saveCostInputs(dbc, c.month, 0, c.inputs, 'import')
    res.costMonths += 1
  }

  for (const s of todo) {
    await dbc.$executeRawUnsafe(
      `INSERT INTO "acc_import_log" ("source","hash","summary") VALUES ($1,$2,$3::jsonb)
       ON CONFLICT ("source") DO NOTHING`,
      s.source,
      s.hash,
      JSON.stringify(res)
    )
  }
  return res
}
