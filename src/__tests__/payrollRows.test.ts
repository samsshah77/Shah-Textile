import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client as PgClient } from 'pg'
import { META_SHEET, diffSheet, sheetStateFrom } from '@/lib/payroll/sync'
import { PayrollError, applyChangeSet, loadPayrollState, storeToRows, type Db } from '@/server/payroll/rows'

/**
 * Runs the real salary storage SQL against Postgres when TEST_DATABASE_URL is set.
 * Everything happens inside a throw-away schema that is dropped afterwards.
 * Never point this at the live database.
 */
const url = process.env.TEST_DATABASE_URL
const W = 'sara_payroll_weavers_v6'
const S = 'sara_payroll_staff_v6'

describe.skipIf(!url)('Salary storage SQL (Postgres)', () => {
  let client: PgClient
  let db: Db
  const schema = `payroll_test_${Date.now()}`

  beforeAll(async () => {
    const { Client } = await import('pg')
    client = new Client({ connectionString: url })
    await client.connect()
    await client.query(`CREATE SCHEMA ${schema}`)
    await client.query(`SET search_path TO ${schema}`)
    await client.query(`CREATE TABLE payroll_rows ("sheet" TEXT NOT NULL, "id" TEXT NOT NULL, "month" TEXT,
      "position" DOUBLE PRECISION NOT NULL DEFAULT 0, "payload" JSONB NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedBy" TEXT, PRIMARY KEY ("sheet","id"))`)
    db = {
      $queryRawUnsafe: (async (sql: string, ...p: unknown[]) => (await client.query(sql, p)).rows) as Db['$queryRawUnsafe'],
      $executeRawUnsafe: (async (sql: string, ...p: unknown[]) => (await client.query(sql, p)).rowCount ?? 0) as Db['$executeRawUnsafe'],
    }
    const store = {
      [W]: [
        { id: 'w1', month: '2026-10', fortnight: '1-15', netPay: 100 },
        { id: 'w2', month: '2026-10', fortnight: '1-15', netPay: 200 },
      ],
      [S]: [{ id: 's9', month: '2026-09', netCashAmount: 900 }],
      [META_SHEET]: { monthLocks: { '2026-09': { locked: true } }, activeSalariedMonth: '2026-10' },
    }
    const { rows } = storeToRows(store)
    for (const r of rows) {
      await client.query(
        `INSERT INTO payroll_rows ("sheet","id","month","position","payload") VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [r.sheet, r.id, r.month, r.position, JSON.stringify(r.payload)]
      )
    }
  })

  afterAll(async () => {
    if (!client) return
    await client.query(`DROP SCHEMA ${schema} CASCADE`)
    await client.end()
  })

  const tx = async <T>(fn: () => Promise<T>) => {
    await client.query('BEGIN')
    try {
      const out = await fn()
      await client.query('COMMIT')
      return out
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }
  }

  it('the copied data reads back exactly, in the same order', async () => {
    const { store } = await loadPayrollState(db)
    expect((store[W] as Array<{ id: string }>).map((r) => r.id)).toEqual(['w1', 'w2'])
    expect((store[META_SHEET] as Record<string, unknown>).activeSalariedMonth).toBe('2026-10')
  })

  it('a change based on the current version saves; the same change again conflicts', async () => {
    const st = await loadPayrollState(db)
    const next = structuredClone(st.store[W]) as Array<Record<string, unknown>>
    next[0].netPay = 150
    const cs = diffSheet(W, sheetStateFrom(W, st.store[W], st.versions[W]), next)
    const res = await tx(() => applyChangeSet(db, cs, 'test'))
    expect(res.versions[W].w1).toBe(2)
    await expect(tx(() => applyChangeSet(db, cs, 'test'))).rejects.toMatchObject({ status: 409 })
    await expect(tx(() => applyChangeSet(db, cs, 'test'))).rejects.toBeInstanceOf(PayrollError)
  })

  it('rows of a locked month are kept as stored', async () => {
    const st = await loadPayrollState(db)
    const cs = diffSheet(S, sheetStateFrom(S, st.store[S], st.versions[S]), [])
    const res = await tx(() => applyChangeSet(db, cs, 'test'))
    expect(res.keptMonths).toEqual(['2026-09'])
    expect(((await loadPayrollState(db)).store[S] as unknown[]).length).toBe(1)
  })

  it('new rows go to the end; a new order is stored', async () => {
    let st = await loadPayrollState(db)
    const rows = [...(st.store[W] as Array<Record<string, unknown>>), { id: 'w3', month: '2026-10', netPay: 1 }]
    await tx(() => applyChangeSet(db, diffSheet(W, sheetStateFrom(W, st.store[W], st.versions[W]), rows), 'test'))
    st = await loadPayrollState(db)
    expect((st.store[W] as Array<{ id: string }>).map((r) => r.id)).toEqual(['w1', 'w2', 'w3'])
    const reordered = [rows[2], rows[0], rows[1]]
    await tx(() => applyChangeSet(db, diffSheet(W, sheetStateFrom(W, st.store[W], st.versions[W]), reordered), 'test'))
    expect(((await loadPayrollState(db)).store[W] as Array<{ id: string }>).map((r) => r.id)).toEqual(['w3', 'w1', 'w2'])
  })
})
