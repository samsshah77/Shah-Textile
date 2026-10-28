import { describe, it, expect } from 'vitest'
import { defaultAccess, type AccessFacts } from '@/lib/accessDefaults'
import { allows, allowsAny, clampLevel, levelsFor, PRODUCTION_AREAS } from '@/lib/access'

const facts = (f: Partial<AccessFacts>): AccessFacts => ({
  roleKey: '',
  isFaultInspector: false,
  financeEdit: false,
  financeView: false,
  floorView: true,
  floorUpdate: false,
  floorCreate: false,
  ...f,
})

describe('Permissions — default access is what each person had before the tab', () => {
  it('Javed (admin): production edit, accounts + salary view, archive + tracking view', () => {
    const a = defaultAccess(facts({ roleKey: 'admin', financeView: true, floorUpdate: true, floorCreate: true }))
    expect(a.accounts).toBe('view')
    expect(a.payroll).toBe('view')
    for (const area of PRODUCTION_AREAS) expect(a[area]).toBe('edit')
    expect(a.fault_reports).toBe('edit')
    expect(a.tracking).toBe('view')
    expect(a.quality_archive).toBe('view')
  })

  it('Tufail (accountant): accounts + salary edit, only the production sheet to view', () => {
    const a = defaultAccess(facts({ roleKey: 'accountant', financeEdit: true, financeView: true }))
    expect(a.accounts).toBe('edit')
    expect(a.payroll).toBe('edit')
    expect(a.prod_sheet).toBe('view')
    expect(a.prod_entry).toBe('hide')
    expect(a.tracking).toBe('hide')
    expect(a.quality_archive).toBe('hide')
  })

  it('Ahmer (quality controller): production edit, no accounts / salary', () => {
    const a = defaultAccess(facts({ roleKey: 'quality_controller', floorUpdate: true, floorCreate: true }))
    expect(a.accounts).toBe('hide')
    expect(a.payroll).toBe('hide')
    expect(a.prod_beams).toBe('edit')
    expect(a.fault_reports).toBe('edit')
  })

  it('Kamran (fault): only the fault page', () => {
    const a = defaultAccess(facts({ roleKey: 'fault', isFaultInspector: true, floorCreate: true }))
    for (const area of PRODUCTION_AREAS) expect(a[area]).toBe('hide')
    expect(a.fault_reports).toBe('edit')
    expect(a.tracking).toBe('hide')
  })

  it('levels and checks', () => {
    expect(levelsFor('tracking')).toEqual(['hide', 'view'])
    expect(clampLevel('tracking', 'edit')).toBe('view')
    expect(allows({ payroll: 'view' }, 'payroll', 'edit')).toBe(false)
    expect(allows({ payroll: 'edit' }, 'payroll', 'view')).toBe(true)
    expect(allowsAny({ prod_beams: 'edit' }, PRODUCTION_AREAS, 'edit')).toBe(true)
    expect(allows(null, 'accounts', 'view')).toBe(false)
  })
})
