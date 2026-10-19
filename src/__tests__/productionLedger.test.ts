import { describe, it, expect } from 'vitest'
import { LEDGER_DDL, ledgerInsertSql } from '@/server/productionLedger'

/**
 * Runs the real ledger SQL against a Postgres copy when TEST_DATABASE_URL is set
 * (a DB containing floor_daily_sheets + floor_qualities, e.g. a restored floor dump).
 * Never point this at the live database: it rebuilds floor_production.
 */
const url = process.env.TEST_DATABASE_URL

describe('Production ledger SQL', () => {
  it('only reads ISO-dated rows and never casts bad numbers', () => {
    const sql = ledgerInsertSql()
    expect(sql).toContain(`s."date" ~ '^\\d{4}-\\d{2}-\\d{2}$'`)
    expect(sql).toContain(`~ '^-?[0-9]+(\\.[0-9]+)?$'`)
    expect(sql).not.toMatch(/DELETE|DROP|UPDATE\s+"floor_daily_sheets"/)
  })

  it.skipIf(!url)('rebuild matches raw sheet totals exactly', async () => {
    const { Client } = await import('pg')
    const db = new Client({ connectionString: url })
    await db.connect()
    try {
      for (const s of LEDGER_DDL) await db.query(s)
      await db.query('DELETE FROM floor_production')
      await db.query(ledgerInsertSql())
      const raw = await db.query(`SELECT count(*)::int AS n, sum(CASE WHEN (payload->>'totalMeters')::numeric > 0
        THEN (payload->>'totalMeters')::numeric ELSE (payload->>'shiftAMeters')::numeric + (payload->>'shiftBMeters')::numeric END)::float AS m
        FROM floor_daily_sheets`)
      const led = await db.query(`SELECT count(*)::int AS n, sum("totalMeters")::float AS m FROM floor_production`)
      expect(led.rows[0]).toEqual(raw.rows[0])
    } finally {
      await db.end()
    }
  })
})
