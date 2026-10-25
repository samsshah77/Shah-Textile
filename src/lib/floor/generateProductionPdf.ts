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

function modelOf(e: DailyLoomProductionEntry): LoomCategory {
  const c = (e.category || e.model || 'G6200') as LoomCategory
  return MODEL_ORDER.includes(c) ? c : 'G6200'
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
 * Works seamlessly in client-side Next.js as well as Node environments.
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

  const company = options?.companyName || 'SARA TEXTILE WEAVING MILL'
  const unit = options?.millUnit || 'Weaving Division • Loom Floor Operations'
  const summary = summarizeProductionDay(entries)
  const formattedDate = formatDisplayDate(sheetDate)
  const nowStamp = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  // 1. Top Header Brand Bar
  doc.setFillColor(15, 23, 42) // slate-900 / navy
  doc.rect(8, 7, 281, 19, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(company, 13, 14)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(203, 213, 225) // slate-300
  doc.text(unit, 13, 19.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text('DAILY LOOM PRODUCTION & EFFICIENCY REPORT', 282, 14, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(226, 232, 240) // slate-200
  doc.text(`Date: ${formattedDate}  |  Printed: ${nowStamp}`, 282, 19.5, { align: 'right' })

  // 2. KPI Summary Boxes (Across 281mm width: 6 equal cards of ~44mm each)
  const kpiY = 28
  const cardW = 44.5
  const cardH = 12
  const gap = 2.8

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
    const cardX = 8 + idx * (cardW + gap)
    // Box background
    doc.setFillColor(248, 250, 252) // slate-50
    doc.setDrawColor(226, 232, 240) // slate-200
    doc.roundedRect(cardX, kpiY, cardW, cardH, 1, 1, 'FD')

    // Left accent pill
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2])
    doc.rect(cardX, kpiY, 1.5, cardH, 'F')

    // Title
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.5)
    doc.setTextColor(100, 116, 139) // slate-500
    doc.text(kpi.title, cardX + 3.5, kpiY + 3.2)

    // Main Value
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(15, 23, 42) // slate-900
    doc.text(kpi.value, cardX + 3.5, kpiY + 7.5)

    // Subtitle
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.5)
    doc.setTextColor(100, 116, 139)
    doc.text(kpi.sub, cardX + 3.5, kpiY + 10.5)
  })

  // 3. Prepare Table Rows & Model Sections
  const tableHead = [
    [
      'L#',
      'Model',
      'Quality Name',
      'Type',
      'Warp',
      'Weft',
      'RPM',
      'Pick',
      'Roller',
      '100%',
      'Shift A',
      'Shift B',
      'Total',
      'Eff %',
      'Loss',
      '24h %',
      'Status / Remarks / Faults',
      'Lot',
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
  let grandCount = 0

  for (const model of MODEL_ORDER) {
    const rows = grouped.get(model) || []
    if (rows.length === 0) continue

    // Model Header Row
    const countLooms = new Set(rows.map((r) => r.loomNumber)).size
    tableBody.push([
      `--- ${model} SECTION (${countLooms} LOOMS) ---`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ])
    rowMeta.push({ type: 'model-head', model })

    for (const e of rows) {
      const seg = e.segmentIndex ?? 1
      const loomLabel = seg > 1 ? `L-${String(e.loomNumber).padStart(2, '0')} (P${seg})` : `L-${String(e.loomNumber).padStart(2, '0')}`
      const condition = resolveLoomCondition(e.status, e.remarks)
      const isProblem = condition !== 'RUNNING'
      const qualityEnded = isQualityEndedSheetRow(e)

      const faultNote = fabricFaultPreview(e).trim()
      let remarkCombined = e.remarks || ''
      if (qualityEnded) remarkCombined = 'Quality Ended'
      else if (isProblem && !remarkCombined) remarkCombined = LOOM_STATUS_LABEL[condition] || condition

      if (faultNote) {
        remarkCombined = remarkCombined ? `${remarkCombined} | Fault: ${faultNote}` : `Fault: ${faultNote}`
      }

      tableBody.push([
        loomLabel,
        model,
        (e.qualityName || '—').trim(),
        (e.fabricType || '—').trim(),
        (e.warpYarn || '—').trim(),
        (e.weftYarn || '—').trim(),
        e.rpm || '—',
        e.pick || '—',
        e.rollerHours != null ? e.rollerHours.toFixed(1) : '—',
        num(e.runningTheoretical),
        num(e.shiftAMeters),
        num(e.shiftBMeters),
        num(e.totalMeters),
        e.efficiencyPercentage != null ? `${Math.round(e.efficiencyPercentage)}%` : '—',
        num(e.stopLossMeters),
        e.efficiency24h != null ? `${Math.round(e.efficiency24h)}%` : '—',
        remarkCombined || (isProblem ? LOOM_STATUS_LABEL[condition] : 'RUNNING'),
        (e.lot || '—').trim(),
      ])
      rowMeta.push({ type: 'data', isProblem })
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
    grandCount += sub.count

    const subEff = sub.runningTheo > 0 ? `${Math.round((sub.ab / sub.runningTheo) * 100)}%` : '—'
    const subEff24 = sub.theo24 > 0 ? `${Math.round((sub.ab / sub.theo24) * 100)}%` : '—'

    tableBody.push([
      `Subtotal ${model}`,
      `${rows.length} rows`,
      '',
      '',
      '',
      '',
      Math.round(sub.rpm / Math.max(sub.count, 1)),
      Math.round(sub.pick / Math.max(sub.count, 1)),
      sub.roller.toFixed(1),
      num(sub.runningTheo),
      num(sub.a),
      num(sub.b),
      num(sub.ab),
      subEff,
      num(sub.lossRun),
      subEff24,
      '',
      '',
    ])
    rowMeta.push({ type: 'model-subtotal', model })
  }

  // Grand Total Row
  const grandEff = grandTheoRun > 0 ? `${Math.round((grandAB / grandTheoRun) * 100)}%` : '—'
  const grandEff24 = grandTheo24 > 0 ? `${Math.round((grandAB / grandTheo24) * 100)}%` : '—'

  tableBody.push([
    'FACTORY TOTAL / AVG',
    `${summary.looms} Looms`,
    '',
    '',
    '',
    '',
    Math.round(grandRpm / Math.max(grandCount, 1)),
    Math.round(grandPick / Math.max(grandCount, 1)),
    grandRoller.toFixed(1),
    num(grandTheoRun),
    num(grandA),
    num(grandB),
    num(grandAB),
    grandEff,
    num(grandLossRun),
    grandEff24,
    `${summary.running} Running | ${summary.stopped.length} Stopped`,
    '',
  ])
  rowMeta.push({ type: 'grand-total' })

  // 4. Render Table with autoTable
  autoTable(doc, {
    startY: 42,
    head: tableHead,
    body: tableBody,
    margin: { left: 8, right: 8, top: 12, bottom: 18 },
    theme: 'plain',
    tableWidth: 'auto',
    styles: {
      font: 'helvetica',
      fontSize: 6.2,
      cellPadding: { top: 1.2, bottom: 1.2, left: 1, right: 1 },
      lineWidth: 0.1,
      lineColor: [226, 232, 240], // slate-200
      textColor: [30, 41, 59], // slate-800
      overflow: 'ellipsize',
    },
    headStyles: {
      fillColor: [30, 41, 59], // slate-800
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.2,
      halign: 'center',
      cellPadding: { top: 1.8, bottom: 1.8, left: 1, right: 1 },
    },
    columnStyles: {
      0: { fontStyle: 'bold', halign: 'center' }, // Loom
      1: { halign: 'center' }, // Model
      2: { fontStyle: 'bold' }, // Quality
      3: { halign: 'center' }, // Type
      4: {}, // Warp
      5: {}, // Weft
      6: { halign: 'right' }, // RPM
      7: { halign: 'right' }, // Pick
      8: { halign: 'right' }, // Roller
      9: { halign: 'right' }, // 100% Theo
      10: { halign: 'right' }, // Shift A
      11: { halign: 'right' }, // Shift B
      12: { halign: 'right', fontStyle: 'bold' }, // Total
      13: { halign: 'right', fontStyle: 'bold' }, // Eff %
      14: { halign: 'right', textColor: [100, 116, 139] }, // Loss
      15: { halign: 'right' }, // 24h Eff %
      16: {}, // Remarks / Faults
      17: { halign: 'center' }, // Lot
    },
    didParseCell(data) {
      const rowIndex = data.row.index
      const meta = rowMeta[rowIndex]
      if (!meta) return

      if (meta.type === 'model-head') {
        data.cell.styles.fillColor = [241, 245, 249] // slate-100
        data.cell.styles.textColor = [30, 58, 138] // blue-900
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fontSize = 6.4
        if (data.column.index === 0) {
          data.cell.colSpan = 18
        }
      } else if (meta.type === 'model-subtotal') {
        data.cell.styles.fillColor = [248, 250, 252] // slate-50
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = [15, 23, 42]
        data.cell.styles.lineWidth = 0.2
        data.cell.styles.lineColor = [203, 213, 225]
      } else if (meta.type === 'grand-total') {
        data.cell.styles.fillColor = [15, 23, 42] // slate-900
        data.cell.styles.textColor = [255, 255, 255]
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fontSize = 6.8
      } else if (meta.type === 'data') {
        if (meta.isProblem) {
          // Soft tint for stopped / problem looms
          data.cell.styles.fillColor = [254, 242, 242] // red-50
          if (data.column.index === 16 || data.column.index === 0) {
            data.cell.styles.textColor = [185, 28, 28] // red-700
            data.cell.styles.fontStyle = 'bold'
          }
        }
      }
    },
  })

  // 5. Signatures & Verification Block (At bottom of page)
  const totalPages = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages()

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const pageH = 210

    // Footer divider line
    doc.setDrawColor(203, 213, 225)
    doc.setLineWidth(0.3)
    doc.line(8, pageH - 14, 289, pageH - 14)

    // Signatures
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(71, 85, 105)

    doc.text('Prepared By: ___________________ (Floor Incharge)', 10, pageH - 9)
    doc.text('Checked By: ___________________ (Shift Supervisor)', 90, pageH - 9)
    doc.text('Verified By: ___________________ (Fabric Inspector)', 170, pageH - 9)
    doc.text('Approved By: ___________________ (Factory Manager)', 240, pageH - 9)

    // Page number & disclaimer
    doc.setFontSize(6)
    doc.setTextColor(148, 163, 184)
    doc.text(
      `Sara Textile Weaving ERP • Confidential Floor Production Document • Page ${p} of ${totalPages}`,
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
