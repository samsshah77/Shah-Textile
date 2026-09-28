import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

const excelPath = 'C:/Users/HP/Documents/sara-textile/Sara-textitle-docs/28 Sep 26.xlsm'
const outPath = path.resolve('C:/Users/HP/Documents/sara-textile/sara-textile/.tmp-sheet-2026-09-28.json')

const py = `
import openpyxl, json
path = r"${excelPath}"
wb = openpyxl.load_workbook(path, data_only=True, keep_vba=True)
ws = wb['Production']
rows = []
for r in range(5, ws.max_row + 1):
  loom = ws.cell(r, 1).value
  qname = ws.cell(r, 2).value
  if loom is None or qname is None:
    continue
  try:
    loom_n = int(loom)
  except Exception:
    continue
  qname = str(qname).strip()
  if not qname or qname == 'Quality Name':
    continue
  fabric = ws.cell(r, 3).value or ''
  warp = ws.cell(r, 4).value or ''
  weft = ws.cell(r, 5).value or ''
  rpm = ws.cell(r, 6).value or 0
  reed = ws.cell(r, 7).value or 60
  pick = ws.cell(r, 8).value or 60
  width = ws.cell(r, 9).value or 66
  gsm = ws.cell(r, 10).value or 0
  roller = ws.cell(r, 12).value or 0
  shift_a = ws.cell(r, 14).value or 0
  shift_b = ws.cell(r, 15).value or 0
  remarks = ws.cell(r, 22).value
  lot = ws.cell(r, 24).value
  if loom_n <= 20:
    category = 'G6200'
  elif loom_n <= 26:
    category = 'PU'
  else:
    category = 'G6300'
  rows.append({
    'loomNumber': loom_n,
    'category': category,
    'qualityName': qname,
    'fabricType': str(fabric).strip() if fabric else '',
    'warpYarn': str(warp).strip() if warp else '',
    'weftYarn': str(weft).strip() if weft else '',
    'rpm': float(rpm or 0),
    'reed': float(reed or 60),
    'pick': float(pick or 60),
    'widthInch': float(width or 66),
    'gsm': float(gsm or 0),
    'rollerHours': float(roller or 0),
    'shiftAMeters': float(shift_a or 0),
    'shiftBMeters': float(shift_b or 0),
    'remarks': str(remarks).strip() if remarks else '',
    'lot': str(lot).strip() if lot else '',
  })
print(json.dumps(rows))
`

const raw = execFileSync('python', ['-c', py], { encoding: 'utf8' })
const rows = JSON.parse(raw.trim().split('\n').pop())
writeFileSync(outPath, JSON.stringify(rows, null, 2))
console.log(`Extracted ${rows.length} looms -> ${outPath}`)
