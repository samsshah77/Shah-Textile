import { describe, it, expect } from 'vitest'
import {
  theoreticalMeters,
  calculateProductionMetrics,
} from '@/types/production'
import {
  kgToLbs,
  lbsToKg,
  calcTotalThreads,
} from '@/services/production/yarnBeamHelpers'

describe('Production & Meter Calculations', () => {
  describe('Theoretical Meters Formula', () => {
    it('calculates theoretical meters accurately according to textile engineering formula', () => {
      // Formula: (rpm / pick) * (60 / 39.3701) * hours
      // RPM = 340, Pick = 60, Hours = 24
      // (340 / 60) * (60 / 39.3701) * 24 = (340 / 39.3701) * 24 ≈ 207.26388
      const meters = theoreticalMeters(340, 60, 24)
      expect(meters).toBeCloseTo(207.26, 1)
    })

    it('returns zero for invalid pick or zero hours', () => {
      expect(theoreticalMeters(340, 0, 24)).toBe(0)
      expect(theoreticalMeters(340, -5, 24)).toBe(0)
      expect(theoreticalMeters(340, 60, 0)).toBe(0)
    })
  })

  describe('Daily Production Metrics & Efficiency', () => {
    it('computes total meters as sum of Shift A + Shift B', () => {
      const metrics = calculateProductionMetrics({
        rpm: 340,
        runningHours: 24,
        pick: 60,
        shiftAMeters: 90,
        shiftBMeters: 95,
        loomNumber: 1,
      })

      expect(metrics.totalMeters).toBe(185)
    })

    it('computes efficiency percentage correctly', () => {
      // Running Theo is ~207m. Total meters = 185m.
      // Efficiency = (185 / 207.26) * 100 ≈ 89.25% -> rounded to 89%
      const metrics = calculateProductionMetrics({
        rpm: 340,
        runningHours: 24,
        pick: 60,
        shiftAMeters: 90,
        shiftBMeters: 95,
        loomNumber: 1,
      })

      expect(metrics.theoreticalMeters).toBe(207)
      expect(metrics.efficiencyPercentage).toBe(89)
      expect(metrics.stopLossMeters).toBe(207 - 185) // 22
    })

    it('awards bonus percentage when running efficiency is >= 70%', () => {
      // Efficiency 89% -> bonus = Math.round(89 - 60) = 29%
      const metrics = calculateProductionMetrics({
        rpm: 340,
        runningHours: 24,
        pick: 60,
        shiftAMeters: 90,
        shiftBMeters: 95,
        loomNumber: 1,
      })

      expect(metrics.bonusPercentage).toBe(29)
    })

    it('gives 0 bonus when efficiency is below 70%', () => {
      // 100m on 207m theo ≈ 48% efficiency
      const metrics = calculateProductionMetrics({
        rpm: 340,
        runningHours: 24,
        pick: 60,
        shiftAMeters: 50,
        shiftBMeters: 50,
        loomNumber: 1,
      })

      expect(metrics.efficiencyPercentage).toBeLessThan(70)
      expect(metrics.bonusPercentage).toBe(0)
    })
  })

  describe('Yarn & Beam Conversions', () => {
    it('converts between kg and lbs bidirectionally', () => {
      const kg = 100
      const lbs = kgToLbs(kg)
      expect(lbs).toBeCloseTo(220.462, 2)
      expect(lbsToKg(lbs)).toBeCloseTo(100, 2)
    })

    it('computes total threads from reed and width', () => {
      // Reed = 60, Width = 66 -> 60 * 66 = 3960 threads
      expect(calcTotalThreads(60, 66)).toBe(3960)
    })
  })

  describe('Historical Quality Resolution on Looms', () => {
    it('strictly matches quality by exact cleaned name and does not allow cross-quality hijacking', async () => {
      const { qualityRunThatOwnsSheetEntry, loomHasQualityOnDate } = await import(
        '@/services/production/qualityHelpers'
      )

      const catalog: any[] = [
        {
          id: 'q-pakeeza',
          name: 'PAKEEZA',
          pick: 95,
          status: 'ACTIVE',
          createdOn: '2026-09-01',
          endedOn: null,
        },
        {
          id: 'q-demo-qual-a',
          name: 'QUAL-A',
          pick: 60,
          status: 'ENDED',
          createdOn: '2026-10-02',
          endedOn: '2026-10-13',
        },
        {
          id: 'q-capri',
          name: 'CAPRI',
          pick: 58,
          status: 'ACTIVE',
          createdOn: '2026-10-01',
          endedOn: null,
        },
      ]

      // PAKEEZA entry on 2026-10-05 must match PAKEEZA, never QUAL-A or CAPRI
      const matched = qualityRunThatOwnsSheetEntry(
        { qualityName: 'PAKEEZA', pick: 95, date: '2026-10-05', loomNumber: 1 },
        catalog,
        '2026-10-05'
      )
      expect(matched?.id).toBe('q-pakeeza')
      expect(matched?.name).toBe('PAKEEZA')

      // Loom has PAKEEZA on past date 2026-10-05
      const loom: any = { loomNumber: 1, qualityId: 'q-pakeeza' }
      const dayRows: any[] = [{ loomNumber: 1, qualityName: 'PAKEEZA', pick: 95, date: '2026-10-05' }]

      expect(loomHasQualityOnDate(loom, 'q-pakeeza', catalog, dayRows, '2026-10-05')).toBe(true)
      expect(loomHasQualityOnDate(loom, 'q-demo-qual-a', catalog, dayRows, '2026-10-05')).toBe(false)
      expect(loomHasQualityOnDate(loom, 'q-capri', catalog, dayRows, '2026-10-05')).toBe(false)
    })
  })
})

