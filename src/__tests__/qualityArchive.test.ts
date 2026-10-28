import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { readXlsx, formatNumber, cellRef } from '@/lib/archive/xlsx'
import { qualityRows, cellLabel } from '@/lib/archive/qualityRows'
import { looksLikeXlsx } from '@/server/archive/qualityArchive'

/** A tiny workbook laid out like the yearly "All Summer Quality" files. */
function workbook(): Uint8Array {
  const strings = [
    'SARA TEXTILE',
    ' Quality  01 Nov 2020 To  2 Mar  2021  ( Complete Lot )',
    '     Warp    36/1 Pv 90/10      Weft 36/1 Pv 90/10      100/66',
    'Name', 'Warp ', 'Weft ', 'Reed ', 'Pick', 'Production',
    'Sara  Arcade shiritng', '36/1 Pv 90:10 sp', '36/1 Pv sp',
    'Sara Spot Light Shirting', 'TOTAL', 'Q/E', 'Tom &amp; Co <b>',
  ]
  const sst = `<sst xmlns="x" count="${strings.length}">${strings
    .map((s, i) => (i === 15 ? `<si><r><t>Tom &amp; </t></r><r><rPr><b/></rPr><t>Co</t></r></si>` : `<si><t xml:space="preserve">${s}</t></si>`))
    .join('')}</sst>`
  const c = (ref: string, v: string | number, t?: 's', s = 0) =>
    `<c r="${ref}"${s ? ` s="${s}"` : ''}${t ? ` t="${t}"` : ''}><v>${v}</v></c>`
  const sheet = `<worksheet><cols><col min="1" max="1" width="51.28" customWidth="1"/></cols><sheetData>
    <row r="1">${c('A1', 0, 's', 1)}</row>
    <row r="2">${c('A2', 1, 's')}</row>
    <row r="3">${c('A3', 2, 's', 1)}</row>
    <row r="4">${[3, 4, 5, 6, 7, 8].map((s, i) => c(`${'ABCDEF'[i]}4`, s, 's', 1)).join('')}</row>
    <row r="5">${c('A5', 9, 's')}${c('B5', 10, 's')}${c('C5', 11, 's')}${c('D5', 100)}${c('E5', 65)}${c('F5', 2011, undefined, 2)}</row>
    <row r="6">${c('A6', 12, 's')}${c('B6', 10, 's')}${c('C6', 11, 's')}${c('D6', 100)}${c('E6', 65)}<c r="F6" s="2"><f>F5-712</f><v>1299</v></c></row>
    <row r="7">${c('A7', 13, 's', 1)}${c('F7', 3310)}${c('G7', 14, 's')}<c r="H7"/></row>
    <row r="8">${c('A8', 15, 's')}<c r="B8" t="inlineStr"><is><t>inline</t></is></c><c r="C8" t="b"><v>1</v></c><c r="D8" s="3"><v>44257</v></c></row>
  </sheetData><mergeCells count="1"><mergeCell ref="A3:F3"/></mergeCells></worksheet>`
  const styles = `<styleSheet><fonts count="2"><font><sz val="11"/></font><font><b/><sz val="11"/></font></fonts>
    <cellXfs count="4"><xf numFmtId="0" fontId="0"/><xf numFmtId="0" fontId="1" applyFont="1"/><xf numFmtId="1" fontId="0"/><xf numFmtId="16" fontId="0"/></cellXfs></styleSheet>`
  return zipSync({
    'xl/workbook.xml': strToU8(`<workbook><sheets><sheet name="Shirting " sheetId="45" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
    'xl/sharedStrings.xml': strToU8(sst),
    'xl/styles.xml': strToU8(styles),
  })
}

describe('archive xlsx reader — cells exactly as Excel shows them', () => {
  const [sheet] = readXlsx(workbook())
  const cell = (ref: string) => {
    const { r, c } = cellRef(ref)
    return sheet.cells.find((x) => x.r === r && x.c === c)
  }

  it('keeps the sheet name and text exactly (spaces included)', () => {
    expect(sheet.name).toBe('Shirting ')
    expect(cell('A2')?.v).toBe(' Quality  01 Nov 2020 To  2 Mar  2021  ( Complete Lot )')
    expect(cell('A5')?.v).toBe('Sara  Arcade shiritng')
  })

  it('formulas give the value Excel saved; numbers, booleans, inline and rich text', () => {
    expect(cell('F6')?.v).toBe(1299)
    expect(cell('F5')?.text).toBe('2011')
    expect(cell('C8')?.text).toBe('TRUE')
    expect(cell('B8')?.v).toBe('inline')
    expect(cell('A8')?.v).toBe('Tom & Co')
    expect(cell('D8')?.text).toBe('2-Mar') // built-in d-mmm date format
  })

  it('bold, merges, widths and empty cells', () => {
    expect(cell('A1')?.bold).toBe(true)
    expect(cell('A5')?.bold).toBeUndefined()
    expect(sheet.merges).toEqual([{ r1: 3, c1: 1, r2: 3, c2: 6 }])
    expect(sheet.colWidths[1]).toBeCloseTo(51.28)
    expect(cell('H7')).toBeUndefined()
    expect(sheet.maxRow).toBe(8)
  })

  it('finds the quality lines with their heading and cell', () => {
    const rows = qualityRows(sheet)
    expect(rows.map((r) => [r.name, r.reed, r.pick, r.production, cellLabel(r.row, r.col)])).toEqual([
      ['Sara  Arcade shiritng', 100, 65, 2011, 'A5'],
      ['Sara Spot Light Shirting', 100, 65, 1299, 'A6'],
    ])
    expect(rows[0].group).toBe('Warp 36/1 Pv 90/10 Weft 36/1 Pv 90/10 100/66')
    expect(rows[0].warp).toBe('36/1 Pv 90:10 sp')
  })

  it('number formats and helpers', () => {
    expect(formatNumber(1148.5, 1)).toBe('1149')
    expect(formatNumber(12345.678, 3)).toBe('12,346')
    expect(formatNumber(0.1 + 0.2, 0)).toBe('0.3')
    expect(cellLabel(10, 28)).toBe('AB10')
    expect(cellRef('AB10')).toEqual({ r: 10, c: 28 })
    expect(looksLikeXlsx(workbook())).toBe(true)
    expect(looksLikeXlsx(new TextEncoder().encode('<html>'))).toBe(false)
  })
})
