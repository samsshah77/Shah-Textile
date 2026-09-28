import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'

if (process.env.CONFIRM !== 'YES') {
  console.error('Manual DB script blocked. Run with CONFIRM=YES only when you intend to overwrite.')
  process.exit(1)
}

const DATE = '2026-09-28'
const INCH = 39.38
const DOUBLE = new Set([21, 23, 24, 25, 26])

const rows = JSON.parse(readFileSync('.tmp-sheet-2026-09-28.json', 'utf8'))

function metrics(r) {
  const rpm = Number(r.rpm) || 0
  const pick = Number(r.pick) || 60
  const hours = Number(r.rollerHours) || 0
  const a = Number(r.shiftAMeters) || 0
  const b = Number(r.shiftBMeters) || 0
  const total = a + b
  const div = DOUBLE.has(r.loomNumber) ? 2 : 1
  const runTheo = pick > 0 && hours ? ((rpm / pick) * (60 / INCH) * hours) / div : 0
  const theo24 = pick > 0 ? (rpm / pick) * (60 / INCH) * 24 : 0
  return {
    theoreticalMeters: Math.round(runTheo),
    theoretical24h: Math.round(theo24),
    totalMeters: Math.round(total),
    efficiencyPercentage: runTheo > 0 ? Math.round((total / runTheo) * 100) : 0,
    efficiency24h: theo24 > 0 ? Math.round((total / theo24) * 100) : 0,
    stopLossMeters: Math.round(runTheo - total),
    loss24h: Math.round(theo24 - total),
  }
}

function statusFromRemarks(remarks) {
  const t = String(remarks || '').trim().toLowerCase()
  if (!t) return 'RUNNING'
  if (t.includes('b/end') || t.includes('beam end')) return 'BEAM_END'
  if (t.includes('knot')) return 'KNOTTING'
  if (t.includes('break')) return 'BREAKDOWN'
  if (t.includes('stop')) return 'STOPPED'
  if (t.includes('cut')) return 'BEAM_CUT'
  return 'RUNNING'
}

const entries = rows
  .sort((a, b) => a.loomNumber - b.loomNumber)
  .map((r) => {
    const m = metrics(r)
    const status = statusFromRemarks(r.remarks)
    return {
      id: `PROD-${DATE}-${r.loomNumber}`,
      date: DATE,
      loomNumber: r.loomNumber,
      category: r.category,
      model: r.category,
      qualityName: r.qualityName,
      fabricType: r.fabricType || '—',
      warpYarn: r.warpYarn || '',
      weftYarn: r.weftYarn || '',
      rpm: Math.round(r.rpm),
      reed: Math.round(r.reed),
      pick: Math.round(r.pick),
      widthInch: r.widthInch,
      gsm: Number(Number(r.gsm).toFixed(2)),
      rollerHours: r.rollerHours,
      runningHours: r.rollerHours,
      runningTheoretical: m.theoreticalMeters,
      shiftAMeters: Math.round(r.shiftAMeters),
      shiftBMeters: Math.round(r.shiftBMeters),
      totalMeters: m.totalMeters,
      efficiencyPercentage: m.efficiencyPercentage,
      stopLossMeters: m.stopLossMeters,
      theoretical24h: m.theoretical24h,
      efficiency24h: m.efficiency24h,
      loss24h: m.loss24h,
      status,
      remarks: String(r.remarks || '').trim(),
      lot: String(r.lot || '').trim(),
      approvalStatus: 'DRAFT',
    }
  })

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@localhost:5433/sara_textile',
})
await client.connect()
await client.query('BEGIN')
try {
  await client.query('DELETE FROM floor_daily_sheets WHERE date = $1', [DATE])
  for (const e of entries) {
    await client.query(
      `INSERT INTO floor_daily_sheets (id, date, "loomNumber", payload, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())`,
      [randomUUID(), DATE, e.loomNumber, JSON.stringify(e)]
    )
  }
  await client.query('COMMIT')
  const total = entries.reduce((s, e) => s + e.totalMeters, 0)
  console.log(`Saved ${DATE}: ${entries.length} looms, total meters ${total}`)
  console.log('L1', entries.find((e) => e.loomNumber === 1))
  console.log('L21', entries.find((e) => e.loomNumber === 21))
} catch (err) {
  await client.query('ROLLBACK')
  throw err
} finally {
  await client.end()
}
