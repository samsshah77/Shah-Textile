import { describe, it, expect } from 'vitest'
import { buildProductionPdf, generateProductionPdfBase64 } from '@/lib/floor/generateProductionPdf'
import type { DailyLoomProductionEntry } from '@/types/production'

describe('generateProductionPdf', () => {
  const sampleEntries: DailyLoomProductionEntry[] = [
    {
      id: 'e1',
      date: '2026-10-26',
      loomNumber: 1,
      category: 'G6200',
      qualityName: '100% Cotton 30x30/68x68',
      fabricType: 'Plain',
      warpYarn: '30/1 PC',
      weftYarn: '30/1 PC',
      rpm: 450,
      reed: 68,
      pick: 68,
      widthInch: 63,
      gsm: 130,
      rollerHours: 24,
      runningHours: 24,
      runningTheoretical: 350,
      shiftAMeters: 150,
      shiftBMeters: 145,
      totalMeters: 295,
      efficiencyPercentage: 84.3,
      stopLossMeters: 55,
      theoretical24h: 350,
      efficiency24h: 84.3,
      loss24h: 55,
      status: 'RUNNING',
      lot: 'LOT-401',
    },
    {
      id: 'e2',
      date: '2026-10-26',
      loomNumber: 21,
      category: 'PU',
      qualityName: 'Twill 40x40/100x80',
      fabricType: 'Twill',
      warpYarn: '40/1 Cotton',
      weftYarn: '40/1 Cotton',
      rpm: 380,
      reed: 80,
      pick: 80,
      widthInch: 72,
      gsm: 160,
      rollerHours: 20,
      runningHours: 20,
      runningTheoretical: 260,
      shiftAMeters: 110,
      shiftBMeters: 100,
      totalMeters: 210,
      efficiencyPercentage: 80.8,
      stopLossMeters: 50,
      theoretical24h: 312,
      efficiency24h: 67.3,
      loss24h: 102,
      status: 'STOPPED',
      remarks: 'Beam End',
      lot: 'LOT-302',
    },
    {
      id: 'e3',
      date: '2026-10-26',
      loomNumber: 27,
      category: 'G6300',
      qualityName: 'Satin 50x50/120x90',
      fabricType: 'Satin',
      warpYarn: '50/1 Poly',
      weftYarn: '50/1 Poly',
      rpm: 520,
      reed: 90,
      pick: 90,
      widthInch: 80,
      gsm: 140,
      rollerHours: 24,
      runningHours: 24,
      runningTheoretical: 400,
      shiftAMeters: 180,
      shiftBMeters: 175,
      totalMeters: 355,
      efficiencyPercentage: 88.8,
      stopLossMeters: 45,
      theoretical24h: 400,
      efficiency24h: 88.8,
      loss24h: 45,
      status: 'RUNNING',
      fabricFault: 'Minor warp break in Shift A',
      lot: 'LOT-505',
    },
  ]

  it('builds a valid jsPDF instance for daily production', () => {
    const doc = buildProductionPdf(sampleEntries, '2026-10-26')
    expect(doc).toBeDefined()
    expect(doc.internal.pages.length).toBeGreaterThanOrEqual(1)
  })

  it('generates base64 data URI and filename ready for WhatsApp transmission', () => {
    const result = generateProductionPdfBase64(sampleEntries, '2026-10-26')
    expect(result.filename).toBe('Daily-Production-Sheet-2026-10-26.pdf')
    expect(result.base64).toMatch(/^data:application\/pdf;.*base64,/)
    expect(result.base64.length).toBeGreaterThan(1000)
  })

  it('handles empty entries gracefully', () => {
    const result = generateProductionPdfBase64([], '2026-10-26')
    expect(result.filename).toBe('Daily-Production-Sheet-2026-10-26.pdf')
    expect(result.base64).toMatch(/^data:application\/pdf;.*base64,/)
  })
})
