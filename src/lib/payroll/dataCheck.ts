/**
 * Read-only check of the salary data, to find old rows that need fixing by hand.
 * Never changes anything.
 */
import type { EmployeeProfile } from '@/types/payroll'
import { PAYROLL_KEYS } from '@/lib/payroll/sync'
import { employeeBelongsInMonth, normalizeName } from '@/services/payroll/payrollCalculations'

export type DataProblem = {
  kind: 'duplicate' | 'two-sheets' | 'namesake' | 'no-profile' | 'outside-dates'
  month: string
  sheet: string
  person: string
  detail: string
}

const SHEETS: Array<{ key: string; label: string; fortnightly: boolean; nameField: 'employeeName' | 'name' }> = [
  { key: PAYROLL_KEYS.STAFF, label: 'Staff', fortnightly: false, nameField: 'employeeName' },
  { key: PAYROLL_KEYS.CONTRACT, label: 'Company Contract', fortnightly: false, nameField: 'employeeName' },
  { key: PAYROLL_KEYS.WEAVERS, label: 'Weavers', fortnightly: true, nameField: 'employeeName' },
  { key: PAYROLL_KEYS.HELPERS, label: 'Helpers', fortnightly: true, nameField: 'employeeName' },
  { key: PAYROLL_KEYS.CONTRACTORS, label: 'Contractors', fortnightly: true, nameField: 'name' },
  { key: PAYROLL_KEYS.EFFICIENCY, label: 'Efficiency', fortnightly: false, nameField: 'name' },
  { key: PAYROLL_KEYS.ADVANCES, label: 'Advances', fortnightly: false, nameField: 'employeeName' },
]
/** Sheets that pay a person; being on two of them in one month means paying twice. */
const PAY_SHEETS = new Set<string>([PAYROLL_KEYS.STAFF, PAYROLL_KEYS.CONTRACT, PAYROLL_KEYS.WEAVERS, PAYROLL_KEYS.HELPERS, PAYROLL_KEYS.CONTRACTORS])

type Row = Record<string, unknown> & { id?: string; month?: string; fortnight?: string; employeeId?: string }

export function findDataProblems(store: Record<string, unknown>): DataProblem[] {
  const people = (Array.isArray(store[PAYROLL_KEYS.EMPLOYEES]) ? store[PAYROLL_KEYS.EMPLOYEES] : []) as EmployeeProfile[]
  const byId = new Map(people.map((p) => [p.id, p]))
  const byName = new Map<string, EmployeeProfile[]>()
  for (const p of people) {
    const k = normalizeName(p.name)
    byName.set(k, [...(byName.get(k) || []), p])
  }
  const out: DataProblem[] = []
  const paySheetsByPersonMonth = new Map<string, Set<string>>()

  for (const s of SHEETS) {
    const rows = (Array.isArray(store[s.key]) ? store[s.key] : []) as Row[]
    const seen = new Map<string, number>()
    for (const r of rows) {
      const month = String(r.month || '')
      const rowName = String(r[s.nameField] || '')
      const emp = r.employeeId ? byId.get(r.employeeId) : undefined
      // Contractors: an old "16-31" row and a "1-31" row are both the month-end sheet.
      const fn =
        s.key === PAYROLL_KEYS.CONTRACTORS
          ? r.fortnight === '1-15' ? '1-15' : 'month end'
          : r.fortnight === '16-31' || r.fortnight === '1-31' ? r.fortnight : '1-15'
      const period = s.fortnightly ? `${month} ${fn}` : month
      if (r.employeeId && !emp) {
        out.push({ kind: 'no-profile', month, sheet: s.label, person: rowName, detail: 'Is row ka profile maujood nahi (shayad delete ho chuka).' })
        continue
      }
      if (!emp) continue
      // Advances may hold several entries per person; everything else is one row per period.
      if (s.key !== PAYROLL_KEYS.ADVANCES) {
        const k = `${period}|${emp.id}`
        seen.set(k, (seen.get(k) || 0) + 1)
        if (seen.get(k) === 2)
          out.push({ kind: 'duplicate', month, sheet: s.label, person: emp.name, detail: `${period} mein ye shakhs do dafa hai.` })
      }
      if (rowName && normalizeName(rowName) !== normalizeName(emp.name)) {
        const namesake = (byName.get(normalizeName(rowName)) || []).find((p) => p.id !== emp.id)
        if (namesake)
          out.push({
            kind: 'namesake',
            month,
            sheet: s.label,
            person: emp.name,
            detail: `Row par naam "${rowName}" hai jo ek doosre profile (${namesake.designation || namesake.employeeCategory}) ka naam hai — ho sakta hai ye row us ki ho.`,
          })
      }
      if (s.key !== PAYROLL_KEYS.ADVANCES && /^\d{4}-\d{2}$/.test(month) && !employeeBelongsInMonth(emp, month, s.fortnightly && r.fortnight !== '1-31' ? r.fortnight : undefined))
        out.push({ kind: 'outside-dates', month, sheet: s.label, person: emp.name, detail: `${period}: joining / resign date ke hisaab se is period mein nahi hona chahiye.` })
      if (PAY_SHEETS.has(s.key)) {
        const k = `${emp.id}|${month}`
        const set = paySheetsByPersonMonth.get(k) || new Set<string>()
        set.add(s.label)
        paySheetsByPersonMonth.set(k, set)
      }
    }
  }
  for (const [k, set] of paySheetsByPersonMonth) {
    if (set.size < 2) continue
    const [id, month] = k.split('|')
    out.push({ kind: 'two-sheets', month, sheet: [...set].join(' + '), person: byId.get(id)?.name || id, detail: `Ek hi mahine mein do sheets par (${[...set].join(', ')}) — do dafa payment ho sakti hai.` })
  }
  return out.sort((a, b) => a.month.localeCompare(b.month) || a.person.localeCompare(b.person))
}
