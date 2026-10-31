/**
 * The access each person had before Administration → Permissions existed, from their role.
 * Used for anyone (and any area) Javed Sir has not changed. Pure, so it is unit-tested.
 */
import { AREA_KEYS, PRODUCTION_AREAS, type AccessLevel, type AccessMap } from '@/lib/access'

/** What we know about a person, for the access they had before this tab. */
export type AccessFacts = {
  roleKey: string
  isFaultInspector: boolean
  financeEdit: boolean
  financeView: boolean
  floorView: boolean
  floorUpdate: boolean
  floorCreate: boolean
}

/** The access each person had before the Permissions tab (same rules as the old code). */
export function defaultAccess(f: AccessFacts): AccessMap {
  const role = f.roleKey.toLowerCase()
  const finance: AccessLevel = f.financeEdit ? 'edit' : f.financeView ? 'view' : 'hide'
  const map = {} as AccessMap
  for (const area of AREA_KEYS) map[area] = 'hide'
  map.accounts = finance
  map.payroll = finance
  for (const area of PRODUCTION_AREAS) {
    if (f.isFaultInspector) map[area] = 'hide'
    else if (role === 'accountant') map[area] = area === 'prod_sheet' ? 'view' : 'hide'
    else map[area] = f.floorUpdate ? 'edit' : f.floorView ? 'view' : 'hide'
  }
  // Fabric Fault → Fault Add (the phone form): Kamran only. Ahmer / Javed Sir see and edit his
  // reports in the Fault Table (prod_fabric_fault); Javed Sir can still give anyone Fault Add.
  map.fault_reports = f.isFaultInspector ? 'edit' : 'hide'
  map.tracking = f.isFaultInspector || role === 'accountant' || !f.floorView ? 'hide' : 'view'
  map.quality_archive = role === 'admin' ? 'view' : 'hide'
  return map
}
