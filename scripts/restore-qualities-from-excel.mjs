import { Client } from 'pg'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

if (process.env.CONFIRM !== 'YES') {
  console.error('Manual DB script blocked. Run with CONFIRM=YES only when you intend to overwrite.')
  process.exit(1)
}

const excelPath = path.resolve(
  'C:/Users/HP/Documents/sara-textile/Sara-textitle-docs/28 Sep 26.xlsm'
)

const py = `
import openpyxl, json
from collections import OrderedDict
path = r"${excelPath.replace(/\\/g, '/')}"
wb = openpyxl.load_workbook(path, data_only=True, keep_vba=True)
ws = wb['Production']
qualities = OrderedDict()
assignments = []
for r in range(5, ws.max_row+1):
  loom = ws.cell(r,1).value
  qname = ws.cell(r,2).value
  if loom is None or qname is None: continue
  try: loom_n = int(loom)
  except Exception: continue
  qname = str(qname).strip()
  if not qname or qname in ('Quality Name','L#'): continue
  fabric = ws.cell(r,3).value or ''
  warp = ws.cell(r,4).value or ''
  weft = ws.cell(r,5).value or ''
  rpm = ws.cell(r,6).value
  reed = ws.cell(r,7).value
  pick = ws.cell(r,8).value
  width = ws.cell(r,9).value
  gsm = ws.cell(r,10).value
  key = (qname.lower().replace(' ',''), int(pick or 0))
  if key not in qualities:
    qualities[key] = {
      'name': qname,
      'fabricType': str(fabric).strip() if fabric else 'Suiting',
      'warpYarn': str(warp).strip() if warp else '',
      'weftYarn': str(weft).strip() if weft else '',
      'reed': int(reed or 60),
      'pick': int(pick or 60),
      'widthInch': float(width or 66),
      'gsm': float(gsm or 0),
    }
  assignments.append({'loomNumber': loom_n, 'qualityName': qname, 'pick': int(pick or 0), 'rpm': int(rpm or 0)})
print(json.dumps({'qualities': list(qualities.values()), 'assignments': assignments}))
`

const raw = execFileSync('python', ['-c', py], { encoding: 'utf8' })
const data = JSON.parse(raw.trim().split('\n').pop())

function slug(name, pick) {
  const base = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `q-${base}-p${pick}`
}

const qualities = data.qualities.map((q) => ({
  id: slug(q.name, q.pick),
  name: q.name,
  fabricType: q.fabricType || 'Suiting',
  warpYarn: q.warpYarn || '',
  weftYarn: q.weftYarn || '',
  reed: q.reed || 60,
  pick: q.pick || 60,
  widthInch: q.widthInch || 66,
  gsm: q.gsm || 0,
  status: 'ACTIVE',
  endedOn: null,
}))

const byNamePick = new Map(qualities.map((q) => [`${q.name.toLowerCase()}|${q.pick}`, q]))

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@localhost:5433/sara_textile',
})
await client.connect()
await client.query('BEGIN')
try {
  await client.query('DELETE FROM floor_qualities')
  for (const q of qualities) {
    await client.query(
      `INSERT INTO floor_qualities
        (id, name, "fabricType", "warpYarn", "weftYarn", reed, pick, "widthInch", gsm, status, "endedOn", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW(), NOW())`,
      [
        q.id,
        q.name,
        q.fabricType,
        q.warpYarn,
        q.weftYarn,
        q.reed,
        q.pick,
        q.widthInch,
        q.gsm,
        'ACTIVE',
        null,
      ]
    )
  }

  await client.query('UPDATE floor_looms SET "qualityId" = NULL')
  for (const a of data.assignments) {
    const q = byNamePick.get(`${a.qualityName.toLowerCase()}|${a.pick}`)
    if (!q) continue
    await client.query(
      `UPDATE floor_looms SET "qualityId" = $1, "defaultRpm" = $2 WHERE "loomNumber" = $3`,
      [q.id, a.rpm || 340, a.loomNumber]
    )
  }

  await client.query('COMMIT')
  console.log(`Restored ${qualities.length} qualities and ${data.assignments.length} loom assignments from Excel.`)
} catch (e) {
  await client.query('ROLLBACK')
  throw e
} finally {
  await client.end()
}

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.tmp-excel-qualities.json')
writeFileSync(out, JSON.stringify({ qualities, assignments: data.assignments }, null, 2))
console.log('Wrote', out)
