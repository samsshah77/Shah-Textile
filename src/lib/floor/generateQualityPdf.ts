import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { longDateFromYmd, longDateTime, longDayDateFromYmd } from '@/lib/longDate'
import { loadPdfLogo } from '@/lib/floor/generateProductionPdf'
import type { QualityShareData } from '@/lib/floor/qualityShare'

const n = (v: number) => Math.round(v || 0).toLocaleString('en-US')

/** Landscape A4 PDF of the Active / Hold quality list — same header as the Production Sheet PDF. */
export function buildQualityPdf(data: QualityShareData, logo: string | null): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  let textX = 6
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', 6, 4.5, 11, 11)
      textX = 19
    } catch {
      textX = 6
    }
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(15, 23, 42)
  doc.text('SARA TEXTILES', textX, 10)
  doc.setFontSize(8)
  doc.setTextColor(51, 65, 85)
  doc.text(`${data.title.toUpperCase()}  ·  ${longDayDateFromYmd(data.date)}`, textX, 15)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(100, 116, 139)
  doc.text('PRINTED', 291, 9.5, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(15, 23, 42)
  doc.text(longDateTime(new Date()), 291, 14.5, { align: 'right' })

  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.35)
  doc.line(6, 18, 291, 18)

  const totalLooms = new Set(data.rows.flatMap((r) => r.looms)).size
  const totalProd = data.rows.reduce((s, r) => s + (r.production || 0), 0)

  const body = data.rows.map((r, i) => [
    String(i + 1),
    r.looms.length ? r.looms.map((l) => `L#${l}`).join(', ') : 'not assigned',
    r.name,
    r.fabricType || '—',
    r.warpYarn || '—',
    r.weftYarn || '—',
    r.weavePlan || '—',
    r.reed ? String(r.reed) : '—',
    r.pick ? String(r.pick) : '—',
    r.widthInch ? `${r.widthInch}"` : '—',
    r.gsm ? Number(r.gsm).toFixed(2) : '—',
    r.start ? longDateFromYmd(r.start) : '—',
    `${n(r.production)} m`,
  ])
  body.push(['', `${totalLooms} looms`, `${data.rows.length} qualities`, '', '', '', '', '', '', '', '', 'Total', `${n(totalProd)} m`])

  autoTable(doc, {
    startY: 21,
    head: [['#', 'L#', 'Quality Name', 'Fabric Type', 'Warp Yarn', 'Weft Yarn', 'Weave Plan', 'Reed', 'Pick', 'Width', 'GSM', 'Start', 'Production']],
    body,
    margin: { left: 6, right: 6, top: 10, bottom: 10 },
    theme: 'plain',
    tableWidth: 285,
    styles: {
      font: 'helvetica',
      fontSize: 7,
      cellPadding: { top: 1.4, bottom: 1.4, left: 1, right: 1 },
      lineWidth: 0.1,
      lineColor: [203, 213, 225],
      textColor: [30, 41, 59],
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      halign: 'center',
      lineWidth: 0.15,
      lineColor: [148, 163, 184],
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 34, fontStyle: 'bold' },
      2: { cellWidth: 40, fontStyle: 'bold' },
      3: { cellWidth: 17 },
      4: { cellWidth: 30 },
      5: { cellWidth: 30 },
      6: { cellWidth: 20 },
      7: { cellWidth: 11, halign: 'right' },
      8: { cellWidth: 11, halign: 'right' },
      9: { cellWidth: 12, halign: 'right' },
      10: { cellWidth: 12, halign: 'right' },
      11: { cellWidth: 32 },
      12: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell(cell) {
      if (cell.section === 'body' && cell.row.index === body.length - 1) {
        cell.cell.styles.fillColor = [15, 23, 42]
        cell.cell.styles.textColor = [255, 255, 255]
        cell.cell.styles.fontStyle = 'bold'
      }
    },
  })

  const pages = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.25)
    doc.line(6, 203, 291, 203)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(148, 163, 184)
    doc.text(`Sara Textile ERP • ${data.title} • ${longDayDateFromYmd(data.date)} • Page ${p} of ${pages}`, 148.5, 206, {
      align: 'center',
    })
  }
  return doc
}

const fileName = (data: QualityShareData) => `${data.title.replace(/\s+/g, '-')}-${data.date}.pdf`

export async function generateQualityPdfBase64(data: QualityShareData): Promise<{ base64: string; filename: string }> {
  const doc = buildQualityPdf(data, await loadPdfLogo())
  return { base64: doc.output('datauristring'), filename: fileName(data) }
}

export async function downloadQualityPdf(data: QualityShareData): Promise<void> {
  buildQualityPdf(data, await loadPdfLogo()).save(fileName(data))
}
