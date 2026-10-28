/**
 * Quality lines found in an archived "All Summer Quality" sheet — only for search and
 * filters. The sheet itself (every cell, exactly as in Excel) is the record; these lines
 * point back to their cell, so a result can always be checked against the sheet.
 *
 * A quality line is any row where a name is followed by warp, weft and then three numbers
 * (reed, pick, production) — the layout every block of these workbooks uses, wherever the
 * block sits on the sheet.
 */
import type { XlsxCell, XlsxSheet } from '@/lib/archive/xlsx'

export interface QualityRow {
  row: number
  col: number
  name: string
  warp: string
  weft: string
  reed: number
  pick: number
  production: number
  /** The block heading above it in the sheet (warp / weft / reed-pick line), as written. */
  group: string
}

const isNum = (c?: XlsxCell) => c != null && typeof c.v === 'number'
const isText = (c?: XlsxCell) => c != null && typeof c.v === 'string' && c.v.trim() !== ''
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
const HEADER_WORDS = new Set(['name', 'warp', 'weft', 'reed', 'pick', 'production'])

export function qualityRows(sheet: XlsxSheet): QualityRow[] {
  const at = new Map<string, XlsxCell>()
  for (const c of sheet.cells) at.set(`${c.r}:${c.c}`, c)
  const get = (r: number, c: number) => at.get(`${r}:${c}`)
  const isQualityRow = (r: number, c: number) => {
    const name = get(r, c)
    return (
      isText(name) &&
      !/^total\b/i.test(String(name!.v).trim()) &&
      isNum(get(r, c + 3)) &&
      isNum(get(r, c + 4)) &&
      isNum(get(r, c + 5))
    )
  }

  /** Nearest heading above (r, c): a text line that is not a quality line, a "Name" header or a total. */
  const headingAbove = (r: number, c: number): string => {
    for (let rr = r - 1; rr >= 1; rr--) {
      const cell = get(rr, c)
      if (!isText(cell)) continue
      const t = String(cell!.v).trim().toLowerCase()
      if (HEADER_WORDS.has(t) || isQualityRow(rr, c)) continue
      if (/^total\b/.test(t)) return ''
      const parts: string[] = []
      for (let k = 0; k < 7; k++) {
        const x = get(rr, c + k)
        if (x && String(x.text).trim()) parts.push(String(x.text))
      }
      return squash(parts.join(' '))
    }
    return ''
  }

  const out: QualityRow[] = []
  for (const cell of sheet.cells) {
    if (!isQualityRow(cell.r, cell.c)) continue
    // Exactly the cell text (no tidying) — this is a record.
    const txt = (k: number) => String(get(cell.r, cell.c + k)?.text ?? '')
    out.push({
      row: cell.r,
      col: cell.c,
      name: String(cell.v),
      warp: txt(1),
      weft: txt(2),
      reed: get(cell.r, cell.c + 3)!.v as number,
      pick: get(cell.r, cell.c + 4)!.v as number,
      production: get(cell.r, cell.c + 5)!.v as number,
      group: headingAbove(cell.r, cell.c),
    })
  }
  return out.sort((a, b) => a.col - b.col || a.row - b.row)
}

/** "A1"-style label for a cell. */
export function cellLabel(row: number, col: number): string {
  let s = ''
  for (let c = col; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s
  return `${s}${row}`
}
