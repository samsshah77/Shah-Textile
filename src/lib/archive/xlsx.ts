/**
 * Small, dependency-light .xlsx reader (zip via fflate, XML read directly).
 *
 * Reads what a sheet shows: every non-empty cell with its stored value (formulas → the
 * value Excel saved last time), the text Excel would display for it, bold, merged cells
 * and column widths. Nothing is recalculated or "cleaned" — the archive must keep the
 * workbook exactly as it was.
 */
import { unzipSync, strFromU8 } from 'fflate'

export type CellValue = string | number | boolean | null

export interface XlsxCell {
  r: number // 1-based row
  c: number // 1-based column
  v: CellValue // stored value
  text: string // as Excel displays it
  bold?: boolean
}

export interface XlsxSheet {
  name: string
  cells: XlsxCell[]
  merges: Array<{ r1: number; c1: number; r2: number; c2: number }>
  colWidths: Record<number, number>
  maxRow: number
  maxCol: number
}

const XML_ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
export function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) =>
    e[0] === '#'
      ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : XML_ENT[e]
  )
}

const attr = (tag: string, name: string): string | null => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`))
  return m ? unescapeXml(m[1]) : null
}

/** "AB12" → { r: 12, c: 28 } */
export function cellRef(ref: string): { r: number; c: number } {
  const m = ref.match(/^([A-Z]+)(\d+)$/)
  if (!m) throw new Error(`Bad cell ref ${ref}`)
  let c = 0
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64)
  return { r: Number(m[2]), c }
}

/** Text of an <si>/<is> element: plain <t> or the runs of rich text, joined. */
function richText(xml: string): string {
  let out = ''
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) out += unescapeXml(m[1] ?? '')
  return out
}

// Built-in number formats that these workbooks use or could use.
const DATE_FORMATS = new Set([14, 15, 16, 17, 22])
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Excel serial date (1900 system) → UTC Date. */
export function excelSerialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400 * 1000))
}

/** The text Excel shows for a number under a built-in format id. */
export function formatNumber(v: number, fmtId: number): string {
  if (DATE_FORMATS.has(fmtId)) {
    const d = excelSerialToDate(v)
    const day = d.getUTCDate()
    const mon = MONTHS[d.getUTCMonth()]
    const yy = String(d.getUTCFullYear()).slice(-2)
    if (fmtId === 16) return `${day}-${mon}`
    if (fmtId === 15) return `${day}-${mon}-${yy}`
    if (fmtId === 17) return `${mon}-${yy}`
    const md = `${d.getUTCMonth() + 1}/${day}/${d.getUTCFullYear()}`
    return fmtId === 22 ? `${md} ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}` : md
  }
  switch (fmtId) {
    case 1:
      return Math.round(v).toString()
    case 2:
      return v.toFixed(2)
    case 3:
      return Math.round(v).toLocaleString('en-US')
    case 4:
      return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    case 9:
      return `${Math.round(v * 100)}%`
    case 10:
      return `${(v * 100).toFixed(2)}%`
    default:
      // General: up to 11 significant digits, no trailing zeros (what Excel shows in a normal-width cell).
      return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(11)))
  }
}

export function readXlsx(data: Uint8Array): XlsxSheet[] {
  const files = unzipSync(data)
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : '')

  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => richText(m[1]))

  // Styles: per cell-xf index → number format id and bold.
  const styles = text('xl/styles.xml')
  const fonts = [...(styles.match(/<fonts[^>]*>([\s\S]*?)<\/fonts>/)?.[1] ?? '').matchAll(/<font>([\s\S]*?)<\/font>|<font\/>/g)].map(
    (m) => /<b\/>|<b val="(1|true)"\/>/.test(m[1] ?? '')
  )
  const xfs = [...(styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '').matchAll(/<xf\s[^>]*?(?:\/>|>)/g)].map((m) => ({
    fmt: Number(attr(m[0], 'numFmtId') ?? 0),
    bold: fonts[Number(attr(m[0], 'fontId') ?? 0)] ?? false,
  }))

  // Workbook order of sheets → their XML part.
  const rels = new Map(
    [...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\s[^>]*>/g)].map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')])
  )
  const sheets: XlsxSheet[] = []
  for (const m of text('xl/workbook.xml').matchAll(/<sheet\s[^>]*>/g)) {
    const name = attr(m[0], 'name') ?? ''
    const target = rels.get(attr(m[0], 'r:id')) ?? ''
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
    const xml = text(path)
    if (!xml) continue

    const cells: XlsxCell[] = []
    let maxRow = 0
    let maxCol = 0
    for (const cm of xml.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = `<c ${cm[1]}>`
      const inner = cm[2] ?? ''
      const ref = attr(tag, 'r')
      if (!ref) continue
      const t = attr(tag, 't') ?? 'n'
      const xf = xfs[Number(attr(tag, 's') ?? 0)] ?? { fmt: 0, bold: false }
      const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let v: CellValue = null
      let shown = ''
      if (t === 's') v = raw != null ? (shared[Number(raw)] ?? '') : null
      else if (t === 'inlineStr') v = richText(inner.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? '')
      else if (t === 'str' || t === 'e') v = raw != null ? unescapeXml(raw) : null
      else if (t === 'b') v = raw === '1'
      else if (raw != null && raw !== '') v = Number(raw)
      if (v === null || v === '') continue
      if (typeof v === 'number') shown = formatNumber(v, xf.fmt)
      else if (typeof v === 'boolean') shown = v ? 'TRUE' : 'FALSE'
      else shown = v
      const { r, c } = cellRef(ref)
      maxRow = Math.max(maxRow, r)
      maxCol = Math.max(maxCol, c)
      cells.push({ r, c, v, text: shown, ...(xf.bold ? { bold: true } : {}) })
    }

    const merges = [...xml.matchAll(/<mergeCell\s[^>]*ref="([A-Z]+\d+):([A-Z]+\d+)"/g)].map((mm) => {
      const a = cellRef(mm[1])
      const b = cellRef(mm[2])
      return { r1: a.r, c1: a.c, r2: b.r, c2: b.c }
    })
    const colWidths: Record<number, number> = {}
    for (const col of xml.matchAll(/<col\s[^>]*>/g)) {
      const min = Number(attr(col[0], 'min'))
      const max = Number(attr(col[0], 'max'))
      const w = Number(attr(col[0], 'width'))
      if (!w || !min) continue
      for (let c = min; c <= Math.min(max, min + 200); c++) colWidths[c] = w
    }
    sheets.push({ name, cells, merges, colWidths, maxRow, maxCol })
  }
  return sheets
}
