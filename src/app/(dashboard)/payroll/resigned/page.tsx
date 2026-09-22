'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { payrollService } from '@/services/payrollService'
import { EmployeeProfile } from '@/types/payroll'
import { useAuth } from '@/context/AuthContext'
import { formatNumber } from '@/lib/utils'
import { PageHeader } from '@/components/shared/PageHeader'
import { UserX, ArrowLeft, RotateCcw } from 'lucide-react'

export default function ResignedEmployeesPage() {
  const { canEditAccounts } = useAuth()
  const [list, setList] = useState<EmployeeProfile[]>([])
  const [search, setSearch] = useState('')

  const reload = () => setList(payrollService.getResignedEmployees())

  useEffect(() => {
    reload()
    const onSync = () => reload()
    window.addEventListener('payroll_synced', onSync)
    return () => window.removeEventListener('payroll_synced', onSync)
  }, [])

  const filtered = list.filter((e) => {
    const q = search.toLowerCase()
    if (!q) return true
    return (
      (e.name || '').toLowerCase().includes(q) ||
      (e.designation || '').toLowerCase().includes(q) ||
      (e.cnic || '').toLowerCase().includes(q) ||
      (e.remarks || '').toLowerCase().includes(q)
    )
  })

  const reinstate = (emp: EmployeeProfile) => {
    if (!canEditAccounts) return
    if (!confirm(`Re-activate ${emp.name}? They will return to Profiles and future salary sheets.`)) return
    payrollService.updateEmployee(emp.id, { status: 'Active', resignedAt: undefined })
    reload()
  }

  return (
    <div className="space-y-4 pb-12">
      <PageHeader
        title="Resigned Employees"
        breadcrumbs={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Payroll', href: '/payroll/profiles' },
          { label: 'Resigned' },
        ]}
        actions={
          <Link href="/payroll/profiles" className="erp-btn-secondary text-xs flex items-center gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Profiles</span>
          </Link>
        }
      />

      <div className="erp-card p-3 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <p className="text-xs text-slate-600 mb-0">
          <UserX className="inline size-3.5 text-rose-600 me-1" />
          {list.length} resigned — Profiles / General Wages tables me nahi dikhte. Resign month ke baad salary sheets se bhi auto-drop.
        </p>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, CNIC, designation…"
          className="form-control form-control-sm"
          style={{ maxWidth: 280 }}
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 uppercase text-[11px] text-slate-600 font-semibold">
                <th className="py-2 px-2 border-r border-slate-200 w-12 text-center">#</th>
                <th className="py-2 px-3 border-r border-slate-200">Name</th>
                <th className="py-2 px-3 border-r border-slate-200">Designation</th>
                <th className="py-2 px-3 border-r border-slate-200">Category</th>
                <th className="py-2 px-3 border-r border-slate-200">CNIC</th>
                <th className="py-2 px-3 border-r border-slate-200 text-right">Last Salary</th>
                <th className="py-2 px-3 border-r border-slate-200">Resign Date</th>
                <th className="py-2 px-3 border-r border-slate-200">Remarks</th>
                <th className="py-2 px-2 text-center print:hidden">Act</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    No resigned employees found.
                  </td>
                </tr>
              ) : (
                filtered.map((e, idx) => (
                  <tr key={e.id} className="hover:bg-slate-50/80">
                    <td className="py-2 px-2 text-center border-r border-slate-100 text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-100 font-semibold text-slate-900">
                      {e.name}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-100 text-slate-600">{e.designation}</td>
                    <td className="py-2 px-3 border-r border-slate-100 text-slate-600">
                      {e.employeeCategory || 'Staff'}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-100 font-mono text-slate-600">
                      {e.cnic || '—'}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-100 text-right font-mono">
                      {formatNumber(e.salary || 0, 0)}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-100 font-mono text-rose-700">
                      {e.resignedAt || '—'}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-100 text-slate-500">{e.remarks || '—'}</td>
                    <td className="py-2 px-2 text-center print:hidden">
                      <button
                        type="button"
                        disabled={!canEditAccounts}
                        title="Re-activate"
                        onClick={() => reinstate(e)}
                        className="p-1 text-slate-400 hover:text-emerald-600 disabled:opacity-30"
                      >
                        <RotateCcw className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
