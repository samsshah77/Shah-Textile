import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { longDateTime, longDayDateFromYmd } from '@/lib/longDate'
import { loadPdfLogo } from '@/lib/floor/generateProductionPdf'
import type { YarnMaster } from '@/services/production/masterTypes'

const fmt = (v: number) =>
  (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Portrait A4 PDF of the Yarn Stock (Weft) table — same header/footer as Production Sheet PDF. */
export function buildYarnPdf(yarn: YarnMaster[], date: string, logo: string | null): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  let textX = 8
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', 8, 5, 11, 11)
      textX = 21
    } catch {
      textX = 8
    }
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(15, 23, 42)
  doc.text('SARA TEXTILES', textX, 10.5)
  doc.setFontSize(8)
  doc.setTextColor(51, 65, 85)
  doc.text(`YARN STOCK (WEFT)  ·  ${longDayDateFromYmd(date)}`, textX, 15.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(100, 116, 139)
  doc.text('PRINTED', 202, 10, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(15, 23, 42)
  doc.text(longDateTime(new Date()), 202, 15, { align: 'right' })

  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.35)
  doc.line(8, 18.5, 202, 18.5)

  const totalBags = yarn.reduce((s, y) => s + (y.bags || 0), 0)
  const totalIn = yarn.reduce((s, y) => s + (y.receivedKg || 0), 0)
  const totalOut = yarn.reduce((s, y) => s + (y.issuedKg || 0), 0)
  const totalBal = yarn.reduce((s, y) => s + (y.balanceKg || 0), 0)

  const body = yarn.map((y, i) => [
    String(i + 1),
    y.yarnType,
    String(y.bags || 0),
    fmt(y.receivedKg),
    fmt(y.issuedKg),
    fmt(y.balanceKg),
  ])
  body.push(['', `Total (${yarn.length} items)`, String(totalBags), fmt(totalIn), fmt(totalOut), fmt(totalBal)])

  autoTable(doc, {
    startY: 22,
    head: [['#', 'Yarn Type', 'Bags', 'Inward (kg)', 'Outward (kg)', 'Balance (kg)']],
    body,
    margin: { left: 8, right: 8, top: 10, bottom: 12 },
    theme: 'plain',
    tableWidth: 194,
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      lineWidth: 0.1,
      lineColor: [203, 213, 225],
      textColor: [30, 41, 59],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      lineWidth: 0.15,
      lineColor: [148, 163, 184],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 74, fontStyle: 'bold' },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
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
    doc.line(8, 287, 202, 287)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(148, 163, 184)
    doc.text(`Sara Textile ERP • Yarn Stock • ${longDayDateFromYmd(date)} • Page ${p} of ${pages}`, 105, 291, {
      align: 'center',
    })
  }
  return doc
}

const fileName = (date: string) => `Yarn-Stock-${date}.pdf`

export async function generateYarnPdfBase64(
  yarn: YarnMaster[],
  date: string
): Promise<{ base64: string; filename: string }> {
  const doc = buildYarnPdf(yarn, date, await loadPdfLogo())
  return { base64: doc.output('datauristring'), filename: fileName(date) }
}

export async function downloadYarnPdf(yarn: YarnMaster[], date: string): Promise<void> {
  buildYarnPdf(yarn, date, await loadPdfLogo()).save(fileName(date))
}

