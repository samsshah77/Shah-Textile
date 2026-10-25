import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { DailyLoomProductionEntry } from '@/types/production'
import type { LoomCategory } from '@/types/loom'
import { summarizeProductionDay } from '@/lib/floor/daySummary'
import { resolveLoomCondition, LOOM_STATUS_LABEL } from '@/constants/loomConditions'
import { isQualityEndedSheetRow } from '@/services/production/qualityRuns'
import { fabricFaultPreview } from '@/components/floor/FabricFaultShiftDialog'

const MODEL_ORDER: LoomCategory[] = ['G6200', 'PU', 'G6300']

function num(n: number | undefined | null, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatDisplayDate(dateStr: string): string {
  try {
    const d = new Date(`${dateStr}T12:00:00`)
    return d.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatShortDate(dateStr: string): string {
  try {
    const d = new Date(`${dateStr}T12:00:00`)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
    return `${dd}/${mm}/${yyyy}  ${weekday}`
  } catch {
    return dateStr
  }
}

function modelOf(e: DailyLoomProductionEntry): LoomCategory {
  const c = (e.category || e.model || 'G6200') as LoomCategory
  return MODEL_ORDER.includes(c) ? c : 'G6200'
}

function efficiencyFromMeters(actual: number, target: number): string {
  if (!target) return '0%'
  return `${Math.round((actual / target) * 100)}%`
}

interface SectionSum {
  rpm: number
  pick: number
  roller: number
  runningTheo: number
  a: number
  b: number
  ab: number
  lossRun: number
  theo24: number
  loss24: number
  count: number
}

function sumSection(rows: DailyLoomProductionEntry[]): SectionSum {
  return rows.reduce(
    (acc, e) => {
      acc.rpm += e.rpm || 0
      acc.pick += e.pick || 0
      acc.roller += e.rollerHours || 0
      acc.runningTheo += e.runningTheoretical || 0
      acc.a += e.shiftAMeters || 0
      acc.b += e.shiftBMeters || 0
      acc.ab += e.totalMeters || 0
      acc.lossRun += e.stopLossMeters || 0
      acc.theo24 += e.theoretical24h || 0
      acc.loss24 += e.loss24h || 0
      acc.count += 1
      return acc
    },
    {
      rpm: 0,
      pick: 0,
      roller: 0,
      runningTheo: 0,
      a: 0,
      b: 0,
      ab: 0,
      lossRun: 0,
      theo24: 0,
      loss24: 0,
      count: 0,
    }
  )
}

export interface GeneratePdfOptions {
  companyName?: string
  millUnit?: string
}

/**
 * Generates an executive, print-ready landscape A4 PDF of the Daily Loom Production Sheet.
 * Perfectly reflects all 24 columns from the live Production Sheet table.
 */
export function buildProductionPdf(
  entries: DailyLoomProductionEntry[],
  sheetDate: string,
  options?: GeneratePdfOptions
): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const company = options?.companyName || 'SARA TEXTILE'
  const summary = summarizeProductionDay(entries)
  const shortDateHeader = formatShortDate(sheetDate)
  const formattedDate = formatDisplayDate(sheetDate)
  const nowStamp = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  // 1. Clean Company Header (No heavy dark background box — clean white paper aesthetic)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(15, 23, 42) // slate-900
  doc.text(company, 148.5, 11.5, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(71, 85, 105) // slate-600
  doc.text('DAILY LOOM PRODUCTION SHEET', 148.5, 16, { align: 'center' })

  // Left side: Date & Day
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(30, 41, 59)
  doc.text(shortDateHeader, 6, 15.5)

  // Right side: Generation metadata
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(100, 116, 139)
  doc.text(`Printed: ${nowStamp}`, 291, 15.5, { align: 'right' })

  // Subtle clean divider line
  doc.setDrawColor(203, 213, 225) // slate-300
  doc.setLineWidth(0.35)
  doc.line(6, 18, 291, 18)

  // 2. KPI Summary Boxes (Across 285mm width: 6 equal cards of 45mm each, 3mm gap)
  const kpiY = 20.5
  const cardW = 45
  const cardH = 11
  const gap = 3

  const kpis = [
    {
      title: 'TOTAL PRODUCTION',
      value: `${num(summary.meters)} m`,
      sub: `A: ${num(summary.shiftA)} | B: ${num(summary.shiftB)}`,
      color: [14, 165, 233], // sky-500
    },
    {
      title: 'RUNNING EFFICIENCY',
      value: `${summary.efficiency.toFixed(1)}%`,
      sub: `Target 100%: ${num(summary.runningTheo)} m`,
      color: summary.efficiency >= 85 ? [34, 197, 94] : summary.efficiency >= 70 ? [245, 158, 11] : [239, 68, 68],
    },
    {
      title: '24-HOUR EFFICIENCY',
      value: `${summary.efficiency24.toFixed(1)}%`,
      sub: `Theo 24h: ${num(summary.theo24)} m`,
      color: [99, 102, 241], // indigo-500
    },
    {
      title: 'LOOM UTILIZATION',
      value: `${summary.running} / ${summary.looms}`,
      sub: `${summary.running} Active Looms Running`,
      color: [16, 185, 129], // emerald-500
    },
    {
      title: 'STOPPED / ISSUES',
      value: `${summary.stopped.length} Looms`,
      sub: summary.stopped.length === 0 ? 'All Looms Operational' : summary.stopped.map(s => `L-${s.loom}`).slice(0, 3).join(', ') + (summary.stopped.length > 3 ? '...' : ''),
      color: summary.stopped.length > 0 ? [239, 68, 68] : [100, 116, 139],
    },
    {
      title: 'WEIGHT / FAULTS',
      value: summary.weightKg > 0 ? `${num(summary.weightKg)} kg` : '0 kg',
      sub: summary.faultLooms > 0 ? `${summary.faultLooms} Looms with Faults` : 'Zero Faults Logged',
      color: [217, 119, 6], // amber-600
    },
  ]

  kpis.forEach((kpi, idx) => {
    const cardX = 6 + idx * (cardW + gap)
    // Box background: clean white with subtle light grey border
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(226, 232, 240) // slate-200
    doc.roundedRect(cardX, kpiY, cardW, cardH, 1, 1, 'FD')

    // Title
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.3)
    doc.setTextColor(100, 116, 139) // slate-500
    doc.text(kpi.title, cardX + 3, kpiY + 3.2)

    // Main Value
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(15, 23, 42) // slate-900
    doc.text(kpi.value, cardX + 3, kpiY + 7)

    // Subtitle
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.2)
    doc.setTextColor(100, 116, 139)
    doc.text(kpi.sub, cardX + 3, kpiY + 9.8)
  })

  // 3. Prepare All 24 Table Columns Matching the Production Sheet Table
  const tableHead = [
    [
      'L#',
      'Quality Name',
      'Type',
      'Warp',
      'Weft',
      'Rpm',
      'Reed',
      'Pick',
      'Width',
      'Gsm',
      'L#',
      'Hours\nRoller',
      'Running\n100%',
      'Actual\nShift A',
      'Actual\nShift B',
      'Total\nA + B',
      'Running H\nEfficiency',
      'Running\nLoss',
      '24 Hours\n100%',
      '24 Hours\nEfficiency',
      '24 Hours\nLoss',
      'Remarks',
      'L#',
      'SW #',
    ],
  ]

  // Group entries by model order
  const grouped = new Map<LoomCategory, DailyLoomProductionEntry[]>()
  for (const m of MODEL_ORDER) grouped.set(m, [])

  for (const e of entries) {
    const m = modelOf(e)
    const list = grouped.get(m) || []
    list.push(e)
    grouped.set(m, list)
  }

  // Sort each group by loom number, then segmentIndex
  for (const [m, rows] of grouped.entries()) {
    rows.sort((a, b) => {
      if (a.loomNumber !== b.loomNumber) return a.loomNumber - b.loomNumber
      return (a.segmentIndex ?? 1) - (b.segmentIndex ?? 1)
    })
    grouped.set(m, rows)
  }

  type RowType = 'data' | 'model-head' | 'model-subtotal' | 'grand-total'

  interface TableRowMeta {
    type: RowType
    isProblem?: boolean
    isQualityEnded?: boolean
    model?: LoomCategory
  }

  const tableBody: (string | number)[][] = []
  const rowMeta: TableRowMeta[] = []

  let grandRpm = 0
  let grandPick = 0
  let grandRoller = 0
  let grandTheoRun = 0
  let grandA = 0
  let grandB = 0
  let grandAB = 0
  let grandLossRun = 0
  let grandTheo24 = 0
  let grandLoss24 = 0
  let grandCount = 0

  for (const model of MODEL_ORDER) {
    const rows = grouped.get(model) || []
    if (rows.length === 0) continue

    // Model Header Row
    const countLooms = new Set(rows.map((r) => r.loomNumber)).size
    tableBody.push([
      `--- ${model} SECTION (${countLooms} LOOMS) ---`,
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
    ])
    rowMeta.push({ type: 'model-head', model })

    for (const e of rows) {
      const seg = Math.max(1, Math.floor(Number(e.segmentIndex) || 1))
      const loomLabel = seg > 1 ? `${e.loomNumber}·${seg}` : String(e.loomNumber)
      const condition = resolveLoomCondition(e.status, e.remarks)
      const isProblem = condition !== 'RUNNING'
      const qualityEnded = isQualityEndedSheetRow(e)

      const faultNote = fabricFaultPreview(e).trim()
      let remarkCombined = e.remarks?.trim() || ''
      if (qualityEnded) {
        remarkCombined = 'Quality Ended'
      } else if (isProblem && !remarkCombined) {
        remarkCombined = LOOM_STATUS_LABEL[condition] || condition
      } else if (!remarkCombined) {
        remarkCombined = '—'
      }

      if (faultNote && !qualityEnded) {
        remarkCombined = remarkCombined !== '—' ? `${remarkCombined} | Fault: ${faultNote}` : `Fault: ${faultNote}`
      }

      const gsmStr = typeof e.gsm === 'number' && e.gsm > 0 ? e.gsm.toFixed(2) : (e.gsm || '—')
      const rollerStr = e.rollerHours != null ? Number(e.rollerHours).toFixed(2) : '0.00'
      const effRunStr = num(e.efficiencyPercentage, 0)
      const eff24Str = num(e.efficiency24h, 0)

      tableBody.push([
        loomLabel,
        (e.qualityName || '—').trim(),
        (e.fabricType || '—').trim(),
        (e.warpYarn || '—').trim(),
        (e.weftYarn || '—').trim(),
        e.rpm ?? '—',
        e.reed ?? '—',
        e.pick ?? '—',
        e.widthInch ?? '—',
        gsmStr,
        loomLabel,
        rollerStr,
        num(e.runningTheoretical),
        num(e.shiftAMeters),
        num(e.shiftBMeters),
        num(e.totalMeters),
        effRunStr,
        num(e.stopLossMeters),
        num(e.theoretical24h),
        eff24Str,
        num(e.loss24h),
        remarkCombined,
        loomLabel,
        (e.lot || '—').trim(),
      ])
      rowMeta.push({ type: 'data', isProblem, isQualityEnded: qualityEnded })
    }

    // Subtotal Row for Model
    const sub = sumSection(rows)
    grandRpm += sub.rpm
    grandPick += sub.pick
    grandRoller += sub.roller
    grandTheoRun += sub.runningTheo
    grandA += sub.a
    grandB += sub.b
    grandAB += sub.ab
    grandLossRun += sub.lossRun
    grandTheo24 += sub.theo24
    grandLoss24 += sub.loss24
    grandCount += sub.count

    tableBody.push([
      `Subtotal ${model}`,
      `${rows.length} entries`,
      '',
      '',
      '',
      num(sub.rpm),
      '',
      num(sub.pick),
      '',
      '',
      '',
      num(sub.roller, 2),
      num(sub.runningTheo),
      num(sub.a),
      num(sub.b),
      num(sub.ab),
      efficiencyFromMeters(sub.ab, sub.runningTheo),
      num(sub.lossRun),
      num(sub.theo24),
      efficiencyFromMeters(sub.ab, sub.theo24),
      num(sub.loss24),
      '',
      '',
      '',
    ])
    rowMeta.push({ type: 'model-subtotal', model })
  }

  // Factory Total / Average Row
  tableBody.push([
    'Total / Average',
    `${summary.looms} Looms Total`,
    '',
    '',
    '',
    num(grandRpm),
    '',
    num(grandPick),
    '',
    '',
    '',
    num(grandRoller, 2),
    num(grandTheoRun),
    num(grandA),
    num(grandB),
    num(grandAB),
    efficiencyFromMeters(grandAB, grandTheoRun),
    num(grandLossRun),
    num(grandTheo24),
    efficiencyFromMeters(grandAB, grandTheo24),
    num(grandLoss24),
    `${summary.running} Running | ${summary.stopped.length} Stopped`,
    '',
    '',
  ])
  rowMeta.push({ type: 'grand-total' })

  // 4. Render Table with autoTable (Exact 285mm printable width matching A4 landscape)
  autoTable(doc, {
    startY: 34,
    head: tableHead,
    body: tableBody,
    margin: { left: 6, right: 6, top: 10, bottom: 10 },
    theme: 'plain',
    tableWidth: 285,
    styles: {
      font: 'helvetica',
      fontSize: 5.1,
      cellPadding: { top: 1.0, bottom: 1.0, left: 0.6, right: 0.6 },
      lineWidth: 0.1,
      lineColor: [203, 213, 225], // slate-300
      textColor: [30, 41, 59], // slate-800
      overflow: 'ellipsize',
    },
    headStyles: {
      fillColor: [241, 245, 249], // slate-100
      textColor: [15, 23, 42], // slate-900
      fontStyle: 'bold',
      fontSize: 5.1,
      halign: 'center',
      valign: 'middle',
      cellPadding: { top: 1.6, bottom: 1.6, left: 0.6, right: 0.6 },
      lineWidth: 0.15,
      lineColor: [148, 163, 184], // slate-400
    },
    columnStyles: {
      0: { cellWidth: 7.5, fontStyle: 'bold', halign: 'center' }, // L#
      1: { cellWidth: 25, fontStyle: 'bold' }, // Quality Name
      2: { cellWidth: 12, halign: 'center' }, // Type
      3: { cellWidth: 18.5 }, // Warp
      4: { cellWidth: 18.5 }, // Weft
      5: { cellWidth: 8, halign: 'right' }, // Rpm
      6: { cellWidth: 8, halign: 'right' }, // Reed
      7: { cellWidth: 8, halign: 'right' }, // Pick
      8: { cellWidth: 8, halign: 'right' }, // Width
      9: { cellWidth: 9.5, halign: 'right' }, // Gsm
      10: { cellWidth: 6.5, fontStyle: 'bold', halign: 'center', fillColor: [238, 242, 255] }, // L# mid
      11: { cellWidth: 9.5, halign: 'right' }, // Hours Roller
      12: { cellWidth: 11, halign: 'right' }, // Running 100%
      13: { cellWidth: 10, halign: 'right' }, // Shift A
      14: { cellWidth: 10, halign: 'right' }, // Shift B
      15: { cellWidth: 11, halign: 'right', fontStyle: 'bold' }, // Total A+B
      16: { cellWidth: 10, halign: 'right' }, // Running Eff
      17: { cellWidth: 10, halign: 'right', textColor: [100, 116, 139] }, // Running Loss
      18: { cellWidth: 11, halign: 'right' }, // 24 Hours 100%
      19: { cellWidth: 10, halign: 'right' }, // 24 Hours Eff
      20: { cellWidth: 10, halign: 'right', textColor: [100, 116, 139] }, // 24 Hours Loss
      21: { cellWidth: 22 }, // Remarks
      22: { cellWidth: 6.5, fontStyle: 'bold', halign: 'center', fillColor: [238, 242, 255] }, // L# end
      23: { cellWidth: 18.5, halign: 'center' }, // SW #
    },
    didParseCell(data) {
      const rowIndex = data.row.index
      const meta = rowMeta[rowIndex]
      if (!meta) return

      if (meta.type === 'model-head') {
        data.cell.styles.fillColor = [226, 232, 240] // slate-200
        data.cell.styles.textColor = [30, 58, 138] // blue-900
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fontSize = 5.8
        if (data.column.index === 0) {
          data.cell.colSpan = 24
        }
      } else if (meta.type === 'model-subtotal') {
        data.cell.styles.fillColor = [248, 250, 252] // slate-50
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = [15, 23, 42]
        data.cell.styles.lineWidth = 0.2
        data.cell.styles.lineColor = [148, 163, 184]
      } else if (meta.type === 'grand-total') {
        data.cell.styles.fillColor = [15, 23, 42] // slate-900
        data.cell.styles.textColor = [255, 255, 255]
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fontSize = 5.8
      } else if (meta.type === 'data') {
        if (meta.isQualityEnded) {
          data.cell.styles.fillColor = [241, 245, 249] // muted slate
          data.cell.styles.textColor = [100, 116, 139]
        } else if (meta.isProblem) {
          data.cell.styles.fillColor = [254, 242, 242] // soft red-50
          if (data.column.index === 21 || data.column.index === 0) {
            data.cell.styles.textColor = [185, 28, 28] // red-700
            data.cell.styles.fontStyle = 'bold'
          }
        }
      }
    },
  })

  // 5. Minimal Footer (Page number & confidentiality — signature lines completely removed)
  const totalPages = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages()

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const pageH = 210

    // Footer divider line
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.25)
    doc.line(6, pageH - 7, 291, pageH - 7)

    // Footer Note & Page Number
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(148, 163, 184)
    doc.text(
      `Sara Textile ERP • Daily Loom Production Sheet • ${formattedDate} • Page ${p} of ${totalPages}`,
      148.5,
      pageH - 4,
      { align: 'center' }
    )
  }

  return doc
}

/**
 * Returns clean base64 data URI string and filename for direct transmission via Evolution API.
 */
export function generateProductionPdfBase64(
  entries: DailyLoomProductionEntry[],
  sheetDate: string,
  options?: GeneratePdfOptions
): { base64: string; filename: string } {
  const doc = buildProductionPdf(entries, sheetDate, options)
  const filename = `Daily-Production-Sheet-${sheetDate}.pdf`
  const dataUri = doc.output('datauristring')
  return {
    base64: dataUri,
    filename,
  }
}

/**
 * Direct browser download of the crisp PDF file.
 */
export function downloadProductionPdf(
  entries: DailyLoomProductionEntry[],
  sheetDate: string,
  options?: GeneratePdfOptions
) {
  const doc = buildProductionPdf(entries, sheetDate, options)
  const filename = `Daily-Production-Sheet-${sheetDate}.pdf`
  doc.save(filename)
}
