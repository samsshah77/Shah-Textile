'use client'

import { contractorBasis, contractorPaidMidMonth } from '@/services/payroll/contractorPlan'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  payrollService,
  resolveResignedAt,
  inferEmployeeCategory,
  formatPayrollMonthLabel,
  parseDojToIso,
  hydratePayrollFromDb,
} from '@/services/payrollService'
import { EmployeeProfile, EmployeeStatus } from '@/types/payroll'
import { useAuth } from '@/context/AuthContext'
import { AlertModal } from '@/components/ui/AlertModal'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import { ArrowLeft, Clock, Loader2, Pencil, Trash2, UserPlus, UserX, X, History } from 'lucide-react'
import { ProfileAvatar } from '@/components/payroll/ProfileAvatar'
import { PayrollMonthSelect } from '@/components/payroll/PayrollMonthSelect'
import { EmployeeSalaryHistoryModal } from '@/components/payroll/EmployeeSalaryHistoryModal'

const DOJ_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function toDojDisplay(value: string): string {
  const iso = parseDojToIso(value)
  if (!iso) return value
  const [y, m, d] = iso.split('-')
  const mon = DOJ_MONTHS[Number(m) - 1]
  return mon ? `${d}-${mon}-${y}` : iso
}

export const FORM_KINDS = [
  { id: 'salaried' as const, label: 'Staff / Company Contract', hint: 'Monthly salary' },
  { id: 'weaver' as const, label: 'Weaver', hint: 'Daily wage' },
  { id: 'helper' as const, label: 'Helper / Winder', hint: 'Daily wage' },
  { id: 'contractor' as const, label: 'Contractor', hint: 'Bill ya Fix Salary' },
]

export type FormKind = (typeof FORM_KINDS)[number]['id']

export function formKindFromEmployee(emp: EmployeeProfile): FormKind {
  const cat = inferEmployeeCategory(emp)
  if (cat === 'Weaver') return 'weaver'
  if (cat === 'Helper') return 'helper'
  if (cat === 'Contractor') return 'contractor'
  return 'salaried'
}

const inputClass =
  'w-full min-h-[38px] rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40'

type Props = {
  mode: 'create' | 'edit'
  employeeId?: string
  onSaved?: (employeeId?: string) => void
  onCancelHref?: string
}

export function EmployeeProfileForm({
  mode,
  employeeId,
  onSaved,
  onCancelHref = '/payroll/profiles',
}: Props) {
  const { canEditAccounts } = useAuth()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<EmployeeProfile | null>(null)
  const [activeMonth, setActiveMonth] = useState('2026-09')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [showResignConfirm, setShowResignConfirm] = useState(false)
  const [resignDate, setResignDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [resignRemarks, setResignRemarks] = useState('')
  const [showRejoinConfirm, setShowRejoinConfirm] = useState(false)
  const [rejoinDoj, setRejoinDoj] = useState(() => new Date().toISOString().slice(0, 10))
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showSalaryHistory, setShowSalaryHistory] = useState(false)
  /** Edit mode page starts locked until user clicks corner Edit. Register starts open. */
  const [isFormEditing, setIsFormEditing] = useState(mode === 'create')

  const [name, setName] = useState('')
  const [fatherName, setFatherName] = useState('')
  const [cnic, setCnic] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [designation, setDesignation] = useState('')
  const [department, setDepartment] = useState('Administration')
  const [dutyHrs, setDutyHrs] = useState<number | string>('9')
  const [shiftFromTo, setShiftFromTo] = useState('9 to 6')
  const [salary, setSalary] = useState<number | string>('')
  const [dailyWage, setDailyWage] = useState<number | string>('')
  const [overtimeRate, setOvertimeRate] = useState<number | string>('')
  const [overtimeShifts, setOvertimeShifts] = useState<number | string>('0')
  const [doj, setDoj] = useState('')
  const [contractStatus, setContractStatus] = useState('Company Contract')
  const [formKind, setFormKind] = useState<FormKind>('salaried')
  const [status, setStatus] = useState<EmployeeStatus>('Active')
  const [resignedAt, setResignedAt] = useState('')
  const [advanceEligible, setAdvanceEligible] = useState(false)
  const [contractorBasisValue, setContractorBasisValue] = useState<'BILL' | 'SALARY'>('SALARY')
  const [paidMidMonth, setPaidMidMonth] = useState(false)
  const [remarks, setRemarks] = useState('')

  const loadCreateDefaults = () => {
    setEditingEmployee(null)
    setFormKind('salaried')
    setContractorBasisValue('SALARY')
    setPaidMidMonth(false)
    setName('')
    setFatherName('')
    setCnic('')
    setPhone('')
    setAddress('')
    setDesignation('')
    setDepartment('Administration')
    setDutyHrs('9')
    setShiftFromTo('9 to 6')
    setSalary('')
    setDailyWage('')
    setOvertimeRate('')
    setOvertimeShifts('0')
    setDoj(new Date().toISOString().split('T')[0])
    setContractStatus('Company Contract')
    setStatus('Active')
    setResignedAt('')
    setAdvanceEligible(false)
    setRemarks('')
  }

  const loadEmployee = (emp: EmployeeProfile, month: string) => {
    setEditingEmployee(emp)
    const kind = formKindFromEmployee(emp)
    setFormKind(kind)
    setName(emp.name || '')
    setFatherName(emp.fatherName || '')
    setCnic(emp.cnic || '')
    setPhone(emp.phone || '')
    setAddress(emp.address || '')
    setDesignation(emp.designation || '')
    setDepartment(emp.department || 'Administration')
    setDutyHrs(emp.dutyHrs || (kind === 'salaried' ? 9 : 12))
    setShiftFromTo(emp.shiftFromTo || (kind === 'salaried' ? '9 to 6' : '8 to 8'))
    const comp = payrollService.getEmployeeCompensationForMonth(emp, month)
    setSalary(comp.salary || emp.salary || '')
    const isDaily = kind === 'weaver' || kind === 'helper'
    const resolvedDaily =
      comp.ratePerDay ||
      emp.ratePerDay30 ||
      emp.ratePerDay31 ||
      (isDaily && comp.salary ? Math.round(comp.salary / 30) : '')
    setDailyWage(resolvedDaily || '')
    const defaultOt =
      kind === 'weaver'
        ? (emp.designation || '').toLowerCase().includes('spare')
          ? 2100
          : 1750
        : (emp.designation || '').toLowerCase().includes('winder')
          ? 1400
          : 1200
    setOvertimeRate(comp.overtimeRate ?? emp.overtimeRate ?? (isDaily ? defaultOt : ''))
    setOvertimeShifts(comp.overtimeShifts ?? emp.overtimeShifts ?? '0')
    setDoj(parseDojToIso(emp.doj) || '')
    setContractStatus(
      kind === 'weaver' || kind === 'helper'
        ? 'Daily Wage'
        : kind === 'contractor'
          ? 'Contractor'
          : emp.contractStatus || 'Company Contract'
    )
    setStatus(emp.status || 'Active')
    setResignedAt(resolveResignedAt(emp) || '')
    setAdvanceEligible(Boolean(emp.advanceEligible || emp.advance))
    setContractorBasisValue(contractorBasis(emp))
    setPaidMidMonth(contractorPaidMidMonth(emp))
    setRemarks(emp.remarks || '')
  }

  useEffect(() => {
    let active = true
    const init = async () => {
      await hydratePayrollFromDb()
      if (!active) return
      const month = payrollService.getActiveSalariedMonth()
      setActiveMonth(month)
      if (mode === 'edit' && employeeId) {
        const emp = payrollService.getEmployees().find((e) => e.id === employeeId)
        if (!emp) {
          setNotFound(true)
        } else {
          loadEmployee(emp, month)
        }
      } else {
        loadCreateDefaults()
      }
      setReady(true)
    }
    void init()
    return () => {
      active = false
    }
  }, [mode, employeeId])

  const applyFormKind = (kind: FormKind) => {
    setFormKind(kind)
    if (kind === 'salaried') {
      setDepartment('Administration')
      setDutyHrs('9')
      setShiftFromTo('9 to 6')
      setContractStatus('Company Contract')
      setDailyWage('')
      setOvertimeRate('')
      setOvertimeShifts('0')
      if (!editingEmployee) {
        setDesignation('')
        setSalary('')
      }
      return
    }
    if (kind === 'weaver') {
      setDepartment('Weaving Floor')
      setDutyHrs('12')
      setShiftFromTo('8 to 8')
      setContractStatus('Daily Wage')
      if (!editingEmployee) {
        setDesignation('Weaver')
        setDailyWage(1450)
        setSalary(1450 * 30)
        setOvertimeRate(1750)
        setOvertimeShifts('0')
      }
      return
    }
    if (kind === 'helper') {
      setDepartment('Weaving Floor')
      setDutyHrs('12')
      setShiftFromTo('8 to 8')
      setContractStatus('Daily Wage')
      if (!editingEmployee) {
        setDesignation('Helper')
        setDailyWage(1050)
        setSalary(1050 * 30)
        setOvertimeRate(1200)
        setOvertimeShifts('0')
      }
      return
    }
    setDepartment('Contract Services')
    setDutyHrs('12')
    setShiftFromTo('8 to 8')
    setContractStatus('Contractor')
    setDailyWage('')
    setOvertimeRate('')
    setOvertimeShifts('0')
    if (!editingEmployee) {
      setDesignation('Contractor')
      setSalary('')
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    if (!canEditAccounts) {
      setError('Enable editing to save profiles.')
      return
    }
    if (!name || !designation) {
      setError('Name and designation are required.')
      return
    }

    const isDaily = formKind === 'weaver' || formKind === 'helper'
    const numDailyWage = parseFloat(dailyWage as string) || 0
    let numSalary = parseFloat(salary as string) || 0
    if (isDaily) {
      if (numDailyWage <= 0) {
        setError('Daily wage is required.')
        return
      }
      numSalary = numDailyWage * 30
    }
    if (!isDaily && numSalary <= 0) {
      setError('Salary amount is required.')
      return
    }

    const numDuty = parseFloat(dutyHrs as string) || (isDaily || formKind === 'contractor' ? 12 : 9)
    const nextContract =
      formKind === 'weaver' || formKind === 'helper'
        ? 'Daily Wage'
        : formKind === 'contractor'
          ? 'Contractor'
          : contractStatus === 'Permanent'
            ? 'Permanent'
            : 'Company Contract'

    const resolvedCategory = inferEmployeeCategory({
      designation,
      contractStatus: nextContract,
      employeeCategory:
        formKind === 'weaver'
          ? 'Weaver'
          : formKind === 'helper'
            ? 'Helper'
            : formKind === 'contractor'
              ? 'Contractor'
              : editingEmployee?.employeeCategory,
    })

    const numOtRate =
      parseFloat(overtimeRate as string) ||
      (formKind === 'weaver'
        ? designation === 'Spare Weaver'
          ? 2100
          : 1750
        : designation === 'Winder'
          ? 1400
          : 1200)
    const numOtShifts = parseFloat(overtimeShifts as string) || 0

    const payload = {
      name,
      fatherName,
      cnic,
      phone,
      address,
      designation,
      department,
      employeeCategory: resolvedCategory,
      dutyHrs: numDuty,
      shiftFromTo,
      salary: numSalary,
      ratePerDay30: isDaily ? numDailyWage : undefined,
      ratePerDay31: isDaily ? numDailyWage : undefined,
      ratePerDay28: isDaily ? numDailyWage : undefined,
      overtimeRate: isDaily ? numOtRate : undefined,
      overtimeShifts: isDaily ? numOtShifts : undefined,
      doj: doj ? toDojDisplay(doj) : '',
      contractStatus: nextContract,
      status,
      resignedAt: status === 'Resigned' ? resignedAt || undefined : undefined,
      advanceEligible,
      advance: advanceEligible,
      contractorBasis: formKind === 'contractor' ? contractorBasisValue : undefined,
      paidMidMonth: formKind === 'contractor' ? paidMidMonth : undefined,
      // Kept in step for anything still reading the old field.
      payCycle: formKind === 'contractor' ? (paidMidMonth ? ('FORTNIGHTLY' as const) : ('MONTHLY' as const)) : undefined,
      remarks,
    }

    setIsSaving(true)
    try {
      const targetMonth = activeMonth || payrollService.getActiveSalariedMonth()
      if (mode === 'edit' && editingEmployee) {
        await payrollService.updateEmployeeAsync(editingEmployee.id, payload, targetMonth)
        const dojLabel = doj ? toDojDisplay(doj) : ''
        const dojNote = dojLabel
          ? ` DOJ ${dojLabel}: earlier months se tables update.`
          : ''
        setMessage(
          `Saved. ${isDaily ? `Daily wage Rs. ${formatNumber(numDailyWage)}` : formatCurrency(numSalary)} for ${formatPayrollMonthLabel(targetMonth)}.${dojNote}`
        )
        const refreshed = payrollService.getEmployees().find((e) => e.id === editingEmployee.id)
        if (refreshed) {
          loadEmployee(refreshed, targetMonth)
          setEditingEmployee(refreshed)
        }
        setIsFormEditing(false)
        onSaved?.(editingEmployee.id)
      } else {
        const created = await payrollService.addEmployeeAsync(
          {
            ...payload,
            doj: doj ? toDojDisplay(doj) : `${targetMonth}-01`,
            remarks: remarks || undefined,
          },
          undefined,
          targetMonth
        )
        setMessage(`Registered for ${formatPayrollMonthLabel(targetMonth)}.`)
        onSaved?.(created.id)
      }
    } catch {
      setError('Could not save profile.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!ready) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-12">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="space-y-3 py-8">
        <p className="text-sm text-slate-700">Profile not found.</p>
        <Link href="/payroll/profiles" className="erp-btn-secondary text-xs inline-flex items-center gap-1.5">
          <ArrowLeft className="size-3.5" />
          Back to Profiles
        </Link>
      </div>
    )
  }

  const readOnly = !canEditAccounts || (mode === 'edit' && !isFormEditing)

  const avatarCategory =
    formKind === 'weaver'
      ? 'Weaver'
      : formKind === 'helper'
        ? 'Helper'
        : formKind === 'contractor'
          ? 'Contractor'
          : inferEmployeeCategory({
              designation,
              contractStatus,
              employeeCategory: editingEmployee?.employeeCategory,
            })

  return (
    <div className="w-full space-y-5 pt-6 sm:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={onCancelHref} className="erp-btn-secondary text-xs !text-slate-800">
          <ArrowLeft className="size-3.5" />
          Profiles
        </Link>
        <div className="flex items-center gap-2">
          <PayrollMonthSelect
            value={activeMonth}
            onChange={async (m) => {
              if (canEditAccounts) {
                await payrollService.setActiveSalariedMonthAsync(m)
              }
              setActiveMonth(m)
              if (editingEmployee) loadEmployee(editingEmployee, m)
            }}
          />
          {mode === 'edit' && editingEmployee && (
            <button
              type="button"
              onClick={() => setShowSalaryHistory(true)}
              className="erp-btn-secondary text-xs !text-slate-800"
            >
              <History className="size-3.5 text-[#0066cc]" />
              Salary History & Slips
            </button>
          )}
          {mode === 'edit' && canEditAccounts && !isFormEditing && (
            <button
              type="button"
              onClick={() => {
                setIsFormEditing(true)
                setMessage('')
                setError('')
              }}
              className="erp-btn-primary text-xs"
            >
              <Pencil className="size-3.5" />
              Edit
            </button>
          )}
          {mode === 'edit' && canEditAccounts && isFormEditing && (
            <button
              type="button"
              onClick={() => {
                if (editingEmployee) loadEmployee(editingEmployee, activeMonth)
                setIsFormEditing(false)
                setError('')
                setMessage('')
              }}
              className="erp-btn-secondary text-xs !text-slate-800"
            >
              Cancel edit
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>
      )}
      {message && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
        {/* Left: big avatar + identity */}
        <aside className="flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-6 text-center lg:sticky lg:top-20">
          <ProfileAvatar
            name={name || editingEmployee?.name}
            photoUrl={editingEmployee?.photoUrl}
            category={avatarCategory}
            size="xl"
          />
          <p className="mt-4 w-full truncate text-base font-semibold text-slate-900">
            {name || (mode === 'edit' ? 'Profile' : 'New employee')}
          </p>
          <p className="mt-0.5 w-full truncate text-xs text-slate-600">{designation || '—'}</p>
          <p className="mt-1 text-[11px] font-medium text-slate-500">{avatarCategory}</p>
          {status && (
            <span
              className={cn(
                'mt-3 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                status === 'Resigned'
                  ? 'bg-rose-100 text-rose-700'
                  : status === 'On Leave'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
              )}
            >
              {status}
            </span>
          )}
          {mode === 'edit' && !isFormEditing && canEditAccounts && (
            <p className="mt-3 text-[11px] text-slate-500">View only — top pe Edit dabao</p>
          )}
          {phone && <p className="mt-2 font-mono text-[11px] text-slate-600">{phone}</p>}
          {doj && <p className="mt-1 text-[11px] text-slate-600">DOJ {toDojDisplay(doj)}</p>}
        </aside>

        {/* Right: form fills remaining width */}
        <div className="min-w-0 space-y-4">
      <label className="block max-w-md space-y-1">
        <span className="text-xs font-semibold text-slate-700">Contract type</span>
        <select
          className={inputClass}
          disabled={readOnly}
          value={formKind}
          onChange={(e) => applyFormKind(e.target.value as FormKind)}
        >
          {FORM_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label} ({k.hint})
            </option>
          ))}
        </select>
      </label>

      <form onSubmit={handleSave} className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">Full Name *</span>
            <input
              className={inputClass}
              required
              disabled={readOnly}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Muhammed Javed"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">Father&apos;s Name</span>
            <input
              className={inputClass}
              disabled={readOnly}
              value={fatherName}
              onChange={(e) => setFatherName(e.target.value)}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">CNIC</span>
            <input
              className={cn(inputClass, 'font-mono')}
              disabled={readOnly}
              value={cnic}
              onChange={(e) => setCnic(e.target.value)}
              placeholder="42101-1234567-1"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">Phone</span>
            <input
              className={cn(inputClass, 'font-mono')}
              disabled={readOnly}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>

          <label className="block space-y-1 sm:col-span-2 xl:col-span-3">
            <span className="text-xs font-semibold text-slate-700">Address</span>
            <input
              className={inputClass}
              disabled={readOnly}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">Designation *</span>
            {formKind === 'weaver' ? (
              <select
                className={inputClass}
                required
                disabled={readOnly}
                value={designation}
                onChange={(e) => {
                  const val = e.target.value
                  setDesignation(val)
                  if (val === 'Spare Weaver') {
                    setDailyWage(1800)
                    setSalary(1800 * 30)
                  } else {
                    setDailyWage(1450)
                    setSalary(1450 * 30)
                  }
                }}
              >
                <option value="Weaver">Weaver</option>
                <option value="Spare Weaver">Spare Weaver</option>
              </select>
            ) : formKind === 'helper' ? (
              <select
                className={inputClass}
                required
                disabled={readOnly}
                value={designation}
                onChange={(e) => {
                  const val = e.target.value
                  setDesignation(val)
                  if (val === 'Winder') {
                    setDailyWage(1150)
                    setSalary(1150 * 30)
                  } else {
                    setDailyWage(1050)
                    setSalary(1050 * 30)
                  }
                }}
              >
                <option value="Helper">Helper</option>
                <option value="Winder">Winder</option>
              </select>
            ) : (
              <input
                className={inputClass}
                required
                disabled={readOnly}
                list={formKind === 'salaried' ? 'hr-salaried-designations' : 'hr-contractor-designations'}
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
              />
            )}
            <datalist id="hr-salaried-designations">
              <option value="Incharge" />
              <option value="Supervisor" />
              <option value="Accountant" />
              <option value="Technician" />
              <option value="Quality Controller" />
              <option value="Electrician" />
              <option value="Oil Man" />
              <option value="Time Keeper" />
              <option value="Folding" />
              <option value="Sweeper" />
            </datalist>
            <datalist id="hr-contractor-designations">
              <option value="Contractor" />
              <option value="Knotting" />
              <option value="Sarning" />
              <option value="Chowkidar" />
              <option value="Gitta" />
            </datalist>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">Department</span>
            <select
              className={inputClass}
              disabled={readOnly}
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="Administration">Administration</option>
              <option value="Accounts & Payroll">Accounts & Payroll</option>
              <option value="Weaving Floor">Weaving Floor</option>
              <option value="Electrical & Power">Electrical & Power</option>
              <option value="Maintenance & Mechanical">Maintenance & Mechanical</option>
              <option value="Quality Control">Quality Control</option>
              <option value="Folding & Packing">Folding & Packing</option>
              <option value="Contract Services">Contract Services</option>
            </select>
          </label>

          {formKind === 'salaried' && (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-700">Wage Type</span>
              <select
                className={inputClass}
                disabled={readOnly}
                value={contractStatus === 'Permanent' ? 'Permanent' : 'Company Contract'}
                onChange={(e) => setContractStatus(e.target.value)}
              >
                <option value="Company Contract">Company Contract (Monthly)</option>
                <option value="Permanent">Permanent (Monthly)</option>
              </select>
            </label>
          )}

          {(formKind === 'weaver' || formKind === 'helper') && (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-700">Daily Wage (PKR) *</span>
              <input
                type="number"
                className={cn(inputClass, 'font-mono')}
                required
                disabled={readOnly}
                value={dailyWage}
                onChange={(e) => {
                  const val = e.target.value
                  setDailyWage(val)
                  setSalary((parseFloat(val) || 0) * 30)
                }}
              />
            </label>
          )}

          {(formKind === 'weaver' || formKind === 'helper') && (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Clock className="size-3.5 text-amber-600" />
                <span>Overtime Rate / Shift (PKR)</span>
              </span>
              <input
                type="number"
                className={cn(inputClass, 'font-mono')}
                disabled={readOnly}
                value={overtimeRate}
                onChange={(e) => setOvertimeRate(e.target.value)}
                placeholder={formKind === 'weaver' ? '1750 (Spare: 2100)' : '1200 (Winder: 1400)'}
              />
            </label>
          )}

          {(formKind === 'salaried' || formKind === 'contractor') && (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-700">
                {formKind === 'contractor' ? 'Contract amount (PKR) *' : 'Monthly salary (PKR) *'}
              </span>
              <input
                type="number"
                className={cn(inputClass, 'font-mono')}
                required
                disabled={readOnly}
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
              />
            </label>
          )}

          {formKind === 'contractor' && (
            <div className="block space-y-1">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-700">Payment type *</span>
                <select
                  className={inputClass}
                  disabled={readOnly}
                  value={contractorBasisValue}
                  onChange={(e) => setContractorBasisValue(e.target.value === 'BILL' ? 'BILL' : 'SALARY')}
                >
                  <option value="SALARY">Fix Salary — 1–30/31</option>
                  <option value="BILL">Bill — amount bill ke mutabiq</option>
                </select>
              </label>
              <label className="flex items-center gap-2 pt-1 text-xs text-slate-700">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={paidMidMonth}
                  onChange={(e) => setPaidMidMonth(e.target.checked)}
                />
                1–15 mein bhi payment (1–15 sheet par bhi aaye ga)
              </label>
              <span className="block text-[11px] text-slate-500">
                Har contractor 1–30/31 (month end) sheet par aata hai.
              </span>
            </div>
          )}

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">Duty Hours</span>
            <select
              className={inputClass}
              disabled={readOnly}
              value={dutyHrs}
              onChange={(e) => setDutyHrs(e.target.value)}
            >
              <option value="8">8 Hours</option>
              <option value="9">9 Hours</option>
              <option value="10">10 Hours</option>
              <option value="12">12 Hours</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">Shift Timings</span>
            <input
              className={inputClass}
              disabled={readOnly}
              value={shiftFromTo}
              onChange={(e) => setShiftFromTo(e.target.value)}
              placeholder="9 to 6"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">Date of Joining</span>
            <input
              type="date"
              className={inputClass}
              disabled={readOnly}
              value={doj}
              onChange={(e) => setDoj(e.target.value)}
            />
            <span className="block text-[11px] text-slate-500 mt-0.5">
              Save ke baad DOJ se pehle ke months se hat jayega. Agar joining 15 ke baad ho to sirf Weaver/Helper/Contractor ki 1-15 fortnight sheet se hatayega — Staff/Contract monthly pe nahi.
            </span>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">Status</span>
            <select
              className={inputClass}
              disabled={readOnly}
              value={status}
              onChange={(e) => {
                const next = e.target.value as EmployeeStatus
                setStatus(next)
                if (next === 'Resigned' && !resignedAt) {
                  setResignedAt(new Date().toISOString().slice(0, 10))
                }
              }}
            >
              <option value="Active">Active</option>
              <option value="Resigned">Resigned / Separated</option>
              <option value="On Leave">On Leave</option>
            </select>
          </label>

          {status === 'Resigned' && (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-rose-700">Resign Date *</span>
              <input
                type="date"
                className={cn(inputClass, 'border-rose-300 bg-rose-50')}
                disabled={readOnly}
                value={resignedAt}
                onChange={(e) => setResignedAt(e.target.value)}
              />
              <span className="block text-[11px] text-slate-500 mt-0.5">
                Agar resign date 1–15 hai to us mahine ki Weaver/Helper/Contractor 16–31 sheet se automatic hat jayega.
              </span>
            </label>
          )}

          <label className="sm:col-span-2 xl:col-span-3 flex items-start gap-2.5 rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={advanceEligible}
              onChange={(e) => setAdvanceEligible(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0066cc]"
            />
            <span>
              <span className="block text-xs font-semibold text-slate-800">Advance Eligible (Peshgi)</span>
              <span className="block text-[11px] text-slate-500">Advance form search list me dikhega.</span>
            </span>
          </label>

          <label className="block space-y-1 sm:col-span-2 xl:col-span-3">
            <span className="text-xs font-semibold text-slate-700">Remarks</span>
            <input
              className={inputClass}
              disabled={readOnly}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </label>

          {!readOnly && (
            <div className="col-span-full flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
              <button
                type="submit"
                disabled={isSaving}
                className="erp-btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Saving…
                  </>
                ) : mode === 'edit' ? (
                  'Save changes'
                ) : (
                  'Register'
                )}
              </button>
              {mode === 'edit' ? (
                <button
                  type="button"
                  onClick={() => {
                    if (editingEmployee) loadEmployee(editingEmployee, activeMonth)
                    setIsFormEditing(false)
                  }}
                  className="erp-btn-secondary text-xs"
                >
                  Cancel
                </button>
              ) : (
                <Link href={onCancelHref} className="erp-btn-secondary text-xs">
                  Cancel
                </Link>
              )}
            </div>
          )}
        </form>

      {mode === 'edit' && editingEmployee && canEditAccounts && isFormEditing && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
          {(editingEmployee.status || 'Active') !== 'Resigned' ? (
            <button
              type="button"
              onClick={() => {
                setResignDate(new Date().toISOString().slice(0, 10))
                setResignRemarks(editingEmployee.remarks || '')
                setShowResignConfirm(true)
              }}
              className="erp-btn-secondary text-xs !text-rose-700 !border-rose-200 hover:!bg-rose-50"
            >
              <UserX className="size-3.5" />
              Resign
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setRejoinDoj(new Date().toISOString().slice(0, 10))
                  setShowRejoinConfirm(true)
                }}
                className="erp-btn-secondary text-xs !text-emerald-700 !border-emerald-200 hover:!bg-emerald-50"
              >
                <UserPlus className="size-3.5" />
                Re-Join
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="erp-btn-secondary text-xs !text-rose-700 !border-rose-200 hover:!bg-rose-50"
              >
                <Trash2 className="size-3.5" />
                Delete
              </button>
            </>
          )}
        </div>
      )}
        </div>
      </div>

      {showResignConfirm && editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl border border-rose-200 w-full max-w-md shadow-xl overflow-hidden">
            <div className="bg-rose-600 px-4 py-3 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <UserX className="size-4" />
                Confirm resignation
              </h3>
              <button
                type="button"
                onClick={() => setShowResignConfirm(false)}
                className="p-1 rounded hover:bg-white/20 cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
            <form
              className="p-4 space-y-3 text-sm"
              onSubmit={(e) => {
                e.preventDefault()
                payrollService.resignEmployee(editingEmployee.id, resignDate, resignRemarks)
                setShowResignConfirm(false)
                setMessage(`"${editingEmployee.name}" marked Resigned.`)
                setStatus('Resigned')
                setResignedAt(resignDate)
                setEditingEmployee({
                  ...editingEmployee,
                  status: 'Resigned',
                  resignedAt: resignDate,
                  remarks: resignRemarks,
                })
              }}
            >
              <p className="font-semibold text-slate-900">{editingEmployee.name}</p>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-700">Resignation date *</span>
                <input
                  type="date"
                  required
                  value={resignDate}
                  onChange={(e) => setResignDate(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-700">Remarks</span>
                <input
                  type="text"
                  value={resignRemarks}
                  onChange={(e) => setResignRemarks(e.target.value)}
                  className={inputClass}
                />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="erp-btn-secondary text-xs" onClick={() => setShowResignConfirm(false)}>
                  Cancel
                </button>
                <button type="submit" className="erp-btn-primary text-xs !bg-rose-600 !border-rose-600">
                  Confirm resign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRejoinConfirm && editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl border border-emerald-200 w-full max-w-md shadow-xl overflow-hidden">
            <div className="bg-emerald-600 px-4 py-3 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <UserPlus className="size-4" />
                Confirm re-join
              </h3>
              <button
                type="button"
                onClick={() => setShowRejoinConfirm(false)}
                className="p-1 rounded hover:bg-white/20 cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
            <form
              className="p-4 space-y-3 text-sm"
              onSubmit={(e) => {
                e.preventDefault()
                const updated = payrollService.rejoinEmployee(editingEmployee.id, rejoinDoj)
                setShowRejoinConfirm(false)
                setMessage(`"${editingEmployee.name}" re-joined.`)
                if (updated) {
                  loadEmployee(updated, activeMonth)
                } else {
                  setStatus('Active')
                  setDoj(rejoinDoj)
                }
              }}
            >
              <p className="font-semibold text-slate-900">{editingEmployee.name}</p>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-700">New DOJ *</span>
                <input
                  type="date"
                  required
                  value={rejoinDoj}
                  onChange={(e) => setRejoinDoj(e.target.value)}
                  className={inputClass}
                />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="erp-btn-secondary text-xs" onClick={() => setShowRejoinConfirm(false)}>
                  Cancel
                </button>
                <button type="submit" className="erp-btn-primary text-xs !bg-emerald-600 !border-emerald-600">
                  Confirm re-join
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={async () => {
          if (!editingEmployee) return
          try {
            await payrollService.deleteEmployeeAsync(editingEmployee.id)
            setShowDeleteConfirm(false)
            router.push('/payroll/profiles?tab=RESIGNED')
          } catch (err) {
            setShowDeleteConfirm(false)
            setError(err instanceof Error ? err.message : 'Delete failed.')
          }
        }}
        title="Confirm delete profile"
        message={`Permanently delete resigned profile "${editingEmployee?.name || 'this employee'}"? Ye seed se wapas nahi aayega.`}
        confirmText="Delete profile"
        type="confirm"
        danger
      />

      {showSalaryHistory && editingEmployee && (
        <EmployeeSalaryHistoryModal
          employee={editingEmployee}
          onClose={() => setShowSalaryHistory(false)}
        />
      )}
    </div>
  )
}
