'use client'

import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { payrollService, STORAGE_KEYS, formatPayrollMonthLabel } from '@/services/payrollService'
import { findDataProblems, type DataProblem } from '@/lib/payroll/dataCheck'

const KIND_LABEL: Record<DataProblem['kind'], string> = {
  'two-sheets': 'On two sheets in one month',
  duplicate: 'Twice in one period',
  namesake: 'Two people with the same name — row may belong to the other one',
  'outside-dates': 'Outside joining / resign date',
  'no-profile': 'Profile not found',
}
const ORDER: DataProblem['kind'][] = ['two-sheets', 'duplicate', 'namesake', 'outside-dates', 'no-profile']

/** Read-only list of old salary rows that look wrong — to fix by hand on the sheets. */
export default function PayrollDataCheckPage() {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const onSync = () => setVersion((v) => v + 1)
    window.addEventListener('payroll_synced', onSync)
    return () => window.removeEventListener('payroll_synced', onSync)
  }, [])
  const problems = useMemo(() => {
    void version
    const store = Object.fromEntries(Object.values(STORAGE_KEYS).map((k) => [k, payrollService.readStore(k, [])]))
    return findDataProblems(store)
  }, [version])

  return (
    <div className="space-y-4">
      <PageHeader title="Data Check" subtitle="Doubtful rows in old data — shown here only, nothing is changed." />
      {problems.length === 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">No problems found.</div>
      ) : (
        ORDER.filter((k) => problems.some((p) => p.kind === k)).map((kind) => {
          const list = problems.filter((p) => p.kind === kind)
          return (
            <section key={kind} className="rounded-lg border border-slate-200 bg-white">
              <h2 className="border-b border-slate-200 px-4 py-2 text-sm font-bold text-slate-800">
                {KIND_LABEL[kind]} <span className="font-normal text-slate-500">({list.length})</span>
              </h2>
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-1.5">Month</th>
                    <th className="px-3 py-1.5">Sheet</th>
                    <th className="px-3 py-1.5">Name</th>
                    <th className="px-3 py-1.5">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 whitespace-nowrap">{/^\d{4}-\d{2}$/.test(p.month) ? formatPayrollMonthLabel(p.month) : p.month}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{p.sheet}</td>
                      <td className="px-3 py-1.5 font-semibold">{p.person}</td>
                      <td className="px-3 py-1.5 text-slate-700">{p.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )
        })
      )}
    </div>
  )
}
