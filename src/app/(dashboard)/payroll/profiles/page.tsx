'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  payrollService,
  resolveResignedAt,
  inferEmployeeCategory,
  matchesHrCategoryFilter,
} from '@/services/payrollService'
import { EmployeeProfile, EmployeeStatus } from '@/types/payroll'
import { useAuth } from '@/context/AuthContext'
import { AlertModal } from '@/components/ui/AlertModal'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import {
  Users,
  IdCard,
  Phone,
  Building,
  DollarSign,
  Clock,
  Search,
  Plus,
  Trash2,
  Printer,
  CheckCircle2,
  FileSpreadsheet,
  LayoutGrid,
  Table as TableIcon,
  Calendar,
  Briefcase,
  UserX,
  UserPlus,
  Scissors,
  AlertCircle,
  X,
  Pencil,
  Loader2,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'

const HR_TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'STAFF', label: 'Staff' },
  { id: 'CONTRACT', label: 'Company Contract' },
  { id: 'WEAVER', label: 'Weaver' },
  { id: 'HELPER', label: 'Helper' },
  { id: 'CONTRACTOR', label: 'Contractor' },
  { id: 'RESIGNED', label: 'Resigned' },
]

const FORM_KINDS = [
  {
    id: 'salaried' as const,
    label: 'Staff / Company Contract',
    hint: 'General Wages — monthly salary',
  },
  {
    id: 'weaver' as const,
    label: 'Weaver',
    hint: 'Daily wage — Weavers sheet',
  },
  {
    id: 'helper' as const,
    label: 'Helper / Winder',
    hint: 'Daily wage — Helpers sheet',
  },
  {
    id: 'contractor' as const,
    label: 'Contractor',
    hint: 'Fortnightly — Contractors sheet',
  },
]

type FormKind = (typeof FORM_KINDS)[number]['id']

function formKindFromEmployee(emp: EmployeeProfile): FormKind {
  const cat = inferEmployeeCategory(emp)
  if (cat === 'Weaver') return 'weaver'
  if (cat === 'Helper') return 'helper'
  if (cat === 'Contractor') return 'contractor'
  return 'salaried'
}

function EmployeeProfilesContent() {
  const { canEditAccounts } = useAuth()
  const searchParams = useSearchParams()
  const initialSearch = searchParams.get('search') || ''
  const initialTab = (searchParams.get('tab') || 'ALL').toUpperCase()

  const [employees, setEmployees] = useState<EmployeeProfile[]>([])
  const [search, setSearch] = useState(initialSearch)
  const [filterCategory, setFilterCategory] = useState<string>(initialTab)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [statusNotice, setStatusNotice] = useState<string | null>(null)

  // Edit / Add Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<EmployeeProfile | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [successModal, setSuccessModal] = useState<{
    isOpen: boolean
    title: string
    employeeName: string
    designation: string
    salary: number
    isDaily: boolean
    dailyWage?: number
    message: string
  } | null>(null)

  // Form State
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
  const [doj, setDoj] = useState('')
  const [contractStatus, setContractStatus] = useState<string>('Company Contract')
  const [formKind, setFormKind] = useState<FormKind>('salaried')
  const [status, setStatus] = useState<EmployeeStatus>('Active')
  const [resignedAt, setResignedAt] = useState('')
  const [advanceEligible, setAdvanceEligible] = useState(false)
  const [remarks, setRemarks] = useState('')

  // Resign Modal State
  const [resignModal, setResignModal] = useState<{
    isOpen: boolean
    emp: EmployeeProfile | null
    resignedAt: string
    remarks: string
  }>({
    isOpen: false,
    emp: null,
    resignedAt: new Date().toISOString().split('T')[0],
    remarks: '',
  })

  // Re-join Modal State
  const [rejoinModal, setRejoinModal] = useState<{
    isOpen: boolean
    emp: EmployeeProfile | null
    newDoj: string
  }>({
    isOpen: false,
    emp: null,
    newDoj: new Date().toISOString().split('T')[0],
  })

  // Delete Confirmation Modal State
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    isOpen: boolean
    employeeId: string
    employeeName: string
  }>({
    isOpen: false,
    employeeId: '',
    employeeName: '',
  })

  const reload = () => {
    setEmployees(payrollService.getEmployees())
  }

  useEffect(() => {
    reload()
    const handleSync = () => reload()
    window.addEventListener('payroll_synced', handleSync)
    return () => window.removeEventListener('payroll_synced', handleSync)
  }, [])

  useEffect(() => {
    if (initialSearch) {
      setSearch(initialSearch)
    }
  }, [initialSearch])

  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam) {
      setFilterCategory(tabParam.toUpperCase())
    }
  }, [searchParams])

  const openAddModal = () => {
    setEditingEmployee(null)
    setFormKind('salaried')
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
    setDoj(new Date().toISOString().split('T')[0])
    setContractStatus('Company Contract')
    setStatus('Active')
    setResignedAt('')
    setAdvanceEligible(false)
    setRemarks('')
    setIsModalOpen(true)
  }

  const applyFormKind = (kind: FormKind) => {
    setFormKind(kind)
    if (kind === 'salaried') {
      setDepartment('Administration')
      setDutyHrs('9')
      setShiftFromTo('9 to 6')
      setContractStatus('Company Contract')
      setDailyWage('')
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
      }
      return
    }
    setDepartment('Contract Services')
    setDutyHrs('12')
    setShiftFromTo('8 to 8')
    setContractStatus('Contractor')
    setDailyWage('')
    if (!editingEmployee) {
      setDesignation('Contractor')
      setSalary('')
    }
  }

  const openEditModal = (emp: EmployeeProfile) => {
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
    setSalary(emp.salary || '')
    const isDaily = kind === 'weaver' || kind === 'helper'
    const resolvedDaily =
      emp.ratePerDay30 || emp.ratePerDay31 || (isDaily && emp.salary ? Math.round(emp.salary / 30) : '')
    setDailyWage(resolvedDaily || '')
    setDoj(emp.doj || '')
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
    setRemarks(emp.remarks || '')
    setIsModalOpen(true)
  }

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !designation) return

    const isDaily = formKind === 'weaver' || formKind === 'helper'
    const numDailyWage = parseFloat(dailyWage as string) || 0
    let numSalary = parseFloat(salary as string) || 0
    if (isDaily) {
      if (numDailyWage <= 0) return
      numSalary = numDailyWage * 30
    }
    if (!isDaily && numSalary <= 0) return

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
      doj,
      contractStatus: nextContract,
      status,
      resignedAt: status === 'Resigned' ? resignedAt || undefined : undefined,
      advanceEligible,
      advance: advanceEligible,
      remarks,
    }

    setIsSaving(true)
    try {
      if (editingEmployee) {
        payrollService.updateEmployee(editingEmployee.id, payload)
        setStatusNotice(`Profile for "${name}" updated successfully.`)
        setSuccessModal({
          isOpen: true,
          title: 'Profile & Salary Updated',
          employeeName: name,
          designation,
          salary: numSalary,
          isDaily,
          dailyWage: isDaily ? numDailyWage : undefined,
          message: `Salary (${isDaily ? `Daily Wage Rs. ${formatNumber(numDailyWage)}` : `Rs. ${formatNumber(numSalary)} / month`}) and profile details for "${name}" have been updated successfully and synced across all payroll sheets.`,
        })
      } else {
        payrollService.addEmployee({
          ...payload,
          doj: doj || new Date().toISOString().split('T')[0],
          remarks: remarks || undefined,
        })
        setStatusNotice(`Profile for "${name}" registered successfully.`)
        setSuccessModal({
          isOpen: true,
          title: 'New Employee Registered',
          employeeName: name,
          designation,
          salary: numSalary,
          isDaily,
          dailyWage: isDaily ? numDailyWage : undefined,
          message: `New employee "${name}" has been registered into the Sara Textile master roster.`,
        })
      }
      reload()
      setTimeout(() => setStatusNotice(null), 3500)
      setIsModalOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteConfirm = () => {
    if (deleteConfirmState.employeeId) {
      payrollService.deleteEmployee(deleteConfirmState.employeeId)
      reload()
      setStatusNotice(`Employee "${deleteConfirmState.employeeName}" removed from records.`)
      setTimeout(() => setStatusNotice(null), 3000)
      setDeleteConfirmState({ isOpen: false, employeeId: '', employeeName: '' })
    }
  }

  const openResignModal = (emp: EmployeeProfile) => {
    if (!canEditAccounts) return
    setResignModal({
      isOpen: true,
      emp,
      resignedAt: new Date().toISOString().split('T')[0],
      remarks: emp.remarks || '',
    })
  }

  const handleConfirmResign = (e: React.FormEvent) => {
    e.preventDefault()
    if (!resignModal.emp) return
    payrollService.resignEmployee(resignModal.emp.id, resignModal.resignedAt, resignModal.remarks)
    setStatusNotice(`Employee "${resignModal.emp.name}" marked as Resigned and moved to Resigned Staff tab.`)
    setTimeout(() => setStatusNotice(null), 4000)
    setResignModal({ isOpen: false, emp: null, resignedAt: '', remarks: '' })
    reload()
  }

  const openRejoinModal = (emp: EmployeeProfile) => {
    if (!canEditAccounts) return
    setRejoinModal({
      isOpen: true,
      emp,
      newDoj: new Date().toISOString().split('T')[0],
    })
  }

  const handleConfirmRejoin = (e: React.FormEvent) => {
    e.preventDefault()
    if (!rejoinModal.emp) return
    payrollService.rejoinEmployee(rejoinModal.emp.id, rejoinModal.newDoj)
    setStatusNotice(`Employee "${rejoinModal.emp.name}" re-joined with joining date ${rejoinModal.newDoj} and added to Active roster!`)
    setTimeout(() => setStatusNotice(null), 4500)
    setRejoinModal({ isOpen: false, emp: null, newDoj: '' })
    setFilterCategory('ALL')
    reload()
  }

  const activeEmployees = employees.filter((e) => (e.status || 'Active') !== 'Resigned')
  const resignedEmployees = employees.filter((e) => (e.status || 'Active') === 'Resigned')

  const getCategoryCount = (catId: string) => {
    if (catId === 'ALL') return activeEmployees.length
    if (catId === 'RESIGNED') return resignedEmployees.length
    return activeEmployees.filter((e) => matchesHrCategoryFilter(e, catId)).length
  }

  const filtered = employees.filter((e) => {
    const isResigned = (e.status || 'Active') === 'Resigned'

    const matchSearch =
      (e.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.fatherName || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.cnic || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.phone || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.designation || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.department || '').toLowerCase().includes(search.toLowerCase())

    if (!matchSearch) return false

    if (filterCategory === 'RESIGNED') {
      return isResigned
    }

    // Active tabs exclude all resigned personnel
    if (isResigned) return false

    if (filterCategory === 'ALL') return true

    return matchesHrCategoryFilter(e, filterCategory)
  })

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="Personnel Profiles"
        breadcrumbs={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Payroll', href: '/payroll/profiles' },
          { label: 'Profiles' },
        ]}
        actions={
          <>
            <Link href="/payroll/employees" className="erp-btn-secondary text-xs flex items-center gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>General Wages</span>
            </Link>
            {canEditAccounts && (
              <button
                type="button"
                onClick={openAddModal}
                className="erp-btn-primary text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Register New Profile</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="erp-btn-secondary text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5 text-slate-500" />
              <span>Print</span>
            </button>
            <ExportPdfButton filename="HR-Profiles" />
          </>
        }
      />

      {statusNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 rounded-lg flex items-center gap-2 text-xs font-semibold animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          {statusNotice}
        </div>
      )}


      {/* Search & Category Filter Controls */}
      <div className="erp-card p-3 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, CNIC, phone, designation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] dark:text-slate-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            {HR_TABS.map((tab) => {
              const count = getCategoryCount(tab.id)
              const isSelected = filterCategory === tab.id
              const isResignedTab = tab.id === 'RESIGNED'

              return (
                <button
                  key={tab.id}
                  onClick={() => setFilterCategory(tab.id)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5',
                    isSelected
                      ? isResignedTab
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-[#0066cc] dark:text-sky-400 shadow-xs'
                      : isResignedTab
                      ? 'text-rose-600 dark:text-rose-400 hover:text-rose-800'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  )}
                >
                  {isResignedTab && <UserX className="h-3 w-3" />}
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      'px-1.5 py-0.2 text-[10px] rounded-full font-mono',
                      isSelected
                        ? isResignedTab
                          ? 'bg-rose-700 text-white'
                          : 'bg-blue-100 text-[#0066cc] dark:bg-sky-950 dark:text-sky-300'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('grid')}
              title="Grid Card View"
              className={cn(
                'p-1.5 rounded-md transition-colors cursor-pointer',
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-800 text-[#0066cc] dark:text-sky-400 shadow-xs'
                  : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Table View"
              className={cn(
                'p-1.5 rounded-md transition-colors cursor-pointer',
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-800 text-[#0066cc] dark:text-sky-400 shadow-xs'
                  : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <TableIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {filterCategory === 'RESIGNED' && (
        <div className="p-3 bg-rose-50 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-800/50 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
          <div>
            <span className="font-semibold">Resigned Staff Archive:</span> Ye mulazmeen company chhor chuke hain.
            General Wages aur active sheets se inka naam hata diya gaya hai. Agar koi dobara join kare toh{' '}
            <strong>&quot;Re-Join / Active Karein&quot;</strong> button click karein.
          </div>
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400 text-sm">
              No employee profiles found matching current filters.
            </div>
          ) : (
            filtered.map((emp) => {
              const cat = inferEmployeeCategory(emp)
              const isResigned = (emp.status || 'Active') === 'Resigned'
              const resignedDate = resolveResignedAt(emp)

              return (
                <div
                  key={emp.id}
                  className={cn(
                    'bg-white dark:bg-slate-800 rounded-xl border p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between',
                    isResigned
                      ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/20'
                      : 'border-slate-200 dark:border-slate-700'
                  )}
                >
                  {/* Card Top */}
                  <div>
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'h-11 w-11 rounded-full flex items-center justify-center font-bold text-sm text-white shadow-xs shrink-0',
                          isResigned
                            ? 'bg-rose-700'
                            : cat === 'Admin'
                            ? 'bg-purple-600'
                            : cat === 'Staff'
                            ? 'bg-indigo-600'
                            : cat === 'Weaver'
                            ? 'bg-emerald-600'
                            : cat === 'Contract'
                            ? 'bg-amber-600'
                            : cat === 'Helper'
                            ? 'bg-cyan-700'
                            : cat === 'Contractor'
                            ? 'bg-rose-600'
                            : 'bg-indigo-600'
                        )}
                      >
                        {emp.name.charAt(0)}
                      </div>

                      <div className="min-w-0 flex-1 flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium pt-0.5">
                            {emp.designation}
                            <span className="text-slate-300 dark:text-slate-600"> · </span>
                            <span className="font-mono text-[10px] text-slate-400">#{emp.serialNo}</span>
                          </p>
                          <span className="inline-block mt-0.5 px-2 py-0.5 text-[9px] font-semibold rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            {cat}
                          </span>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span
                            className={cn(
                              'px-2 py-0.5 text-[10px] font-semibold rounded-full',
                              !isResigned
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                            )}
                          >
                            {emp.status || 'Active'}
                          </span>
                          {(emp.advanceEligible || emp.advance) && !isResigned && (
                            <span
                              className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                              title="Eligible for salary advance"
                            >
                              Advance
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-700/60 space-y-2 text-xs">
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug break-words">
                        {emp.name}
                      </h3>

                      {emp.fatherName && (
                        <p className="text-slate-500 dark:text-slate-400 text-xs">
                          S/O {emp.fatherName}
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400 pt-1">
                        <span className="flex items-center gap-1 truncate" title={emp.phone}>
                          <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                          {emp.phone || 'No Phone'}
                        </span>
                        <span className="flex items-center gap-1 truncate" title={emp.department}>
                          <Building className="h-3 w-3 text-slate-400 shrink-0" />
                          {emp.department || 'Administration'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                          D.O.J:
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {emp.doj || '—'}
                        </span>
                      </div>

                      {isResigned && (
                        <div className="flex items-center justify-between text-xs text-rose-700 dark:text-rose-400 font-medium bg-rose-100/60 dark:bg-rose-950/40 p-1.5 rounded-md">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            Resign Date:
                          </span>
                          <span className="font-mono font-bold">
                            {resignedDate || emp.remarks?.replace(/^Resignation\s*/i, '') || 'Recorded'}
                          </span>
                        </div>
                      )}

                      {emp.remarks && (
                        <p className="text-[11px] text-slate-500 italic bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded border border-slate-100 dark:border-slate-800">
                          &quot;{emp.remarks}&quot;
                        </p>
                      )}
                    </div>

                    {/* Duty & Compensation */}
                    <div className="mt-3 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700/50 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">
                          {emp.contractStatus === 'Daily Wage' || cat === 'Weaver' || cat === 'Helper'
                            ? 'Daily Wage Rate'
                            : 'Monthly Base'}
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                          {emp.contractStatus === 'Daily Wage' || cat === 'Weaver' || cat === 'Helper'
                            ? formatCurrency(emp.ratePerDay30 || emp.ratePerDay31 || (emp.salary ? emp.salary / 30 : 0)) + ' /day'
                            : formatCurrency(emp.salary)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block font-medium">Duty & Shift</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {emp.dutyHrs}h ({emp.shiftFromTo || '9 to 6'})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                    <div
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg max-w-[55%]"
                      title="National CNIC"
                    >
                      <IdCard className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                      <span className="font-mono truncate">{emp.cnic || 'CNIC not set'}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {isResigned && canEditAccounts ? (
                        <button
                          type="button"
                          onClick={() => openRejoinModal(emp)}
                          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-md shadow-xs flex items-center gap-1 cursor-pointer transition-colors"
                          title="Re-join Employee"
                        >
                          <UserPlus className="h-3 w-3" />
                          <span>Re-Join</span>
                        </button>
                      ) : !isResigned && canEditAccounts ? (
                        <button
                          type="button"
                          onClick={() => openResignModal(emp)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                          title="Mark as Resigned"
                        >
                          <UserX className="h-4 w-4" />
                        </button>
                      ) : null}

                      {canEditAccounts && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(emp)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer"
                            title="Edit Profile & Salary"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              setDeleteConfirmState({
                                isOpen: true,
                                employeeId: emp.id,
                                employeeName: emp.name,
                              })
                            }
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                            title="Delete Profile"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] relative">
            <table className="w-full text-left text-xs border-collapse font-sans">
              <thead className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-bold sticky top-0 z-20 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2.5 px-3 w-12 text-center">#</th>
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Father Name</th>
                  <th className="py-2.5 px-3">CNIC</th>
                  <th className="py-2.5 px-3">Phone</th>
                  <th className="py-2.5 px-3">Designation</th>
                  <th className="py-2.5 px-3">Department</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3 text-right">Wage / Salary</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3">D.O.J</th>
                  <th className="py-2.5 px-3">Resign Date</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {filtered.map((emp, idx) => {
                  const isResigned = (emp.status || 'Active') === 'Resigned'
                  const cat = inferEmployeeCategory(emp)
                  const isDaily = emp.contractStatus === 'Daily Wage' || cat === 'Weaver' || cat === 'Helper'

                  return (
                    <tr
                      key={emp.id}
                      className={cn(
                        'hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors',
                        isResigned && 'bg-rose-50/30 dark:bg-rose-950/20'
                      )}
                    >
                      <td className="py-2 px-3 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                        {emp.name}
                      </td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{emp.fatherName || '—'}</td>
                      <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">{emp.cnic || '—'}</td>
                      <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">{emp.phone || '—'}</td>
                      <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{emp.designation}</td>
                      <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{emp.department || 'Administration'}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          {cat}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {isDaily
                          ? formatCurrency(emp.ratePerDay30 || emp.ratePerDay31 || (emp.salary ? emp.salary / 30 : 0)) + '/d'
                          : formatCurrency(emp.salary)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={cn(
                            'px-2 py-0.5 text-[10px] font-semibold rounded',
                            !isResigned
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          )}
                        >
                          {emp.status || 'Active'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                        {emp.doj || '—'}
                      </td>
                      <td className="py-2 px-3 font-mono text-rose-700 dark:text-rose-400 text-[11px]">
                        {isResigned ? resolveResignedAt(emp) || 'Recorded' : '—'}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {isResigned && canEditAccounts ? (
                            <button
                              type="button"
                              onClick={() => openRejoinModal(emp)}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded shadow-xs flex items-center gap-1 cursor-pointer"
                              title="Re-Join Staff"
                            >
                              <UserPlus className="h-3 w-3" />
                              <span>Re-Join</span>
                            </button>
                          ) : !isResigned && canEditAccounts ? (
                            <button
                              type="button"
                              onClick={() => openResignModal(emp)}
                              title="Mark Resigned"
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <UserX className="h-3.5 w-3.5" />
                            </button>
                          ) : null}

                          {canEditAccounts && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(emp)}
                                title="Edit Profile & Salary"
                                className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() =>
                                  setDeleteConfirmState({
                                    isOpen: true,
                                    employeeId: emp.id,
                                    employeeName: emp.name,
                                  })
                                }
                                title="Delete"
                                className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Profile Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-indigo-600 p-4 text-white flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <IdCard className="h-5 w-5" />
                {editingEmployee ? `Edit Profile: ${editingEmployee.name}` : 'Register New Mill Employee'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded hover:bg-white/20 transition-colors text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form type: Staff+Contract vs Weaver / Helper / Contractor */}
            <div className="p-3 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1.5">
                {editingEmployee ? 'Form type' : 'Register as'}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {FORM_KINDS.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => applyFormKind(k.id)}
                    className={cn(
                      'px-2.5 py-1.5 text-[11px] font-medium rounded-md cursor-pointer transition-all border shadow-xs text-left',
                      formKind === k.id
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
                    )}
                  >
                    <span className="block font-semibold">{k.label}</span>
                    <span className={cn('block text-[10px]', formKind === k.id ? 'text-indigo-100' : 'text-slate-500')}>
                      {k.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSaveModal} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Muhammed Javed"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Father&apos;s Name
                  </label>
                  <input
                    type="text"
                    value={fatherName}
                    onChange={(e) => setFatherName(e.target.value)}
                    placeholder="e.g. Abdul Majeed"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    CNIC (National ID Card #)
                  </label>
                  <input
                    type="text"
                    value={cnic}
                    onChange={(e) => setCnic(e.target.value)}
                    placeholder="42101-1234567-1"
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Mobile / Phone Number
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0300-1234567"
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Residential Address
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. Sector 5-E, New Karachi / Mill Quarters"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Designation *
                  </label>
                  {formKind === 'weaver' ? (
                    <select
                      required
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
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="Weaver">Weaver</option>
                      <option value="Spare Weaver">Spare Weaver</option>
                    </select>
                  ) : formKind === 'helper' ? (
                    <select
                      required
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
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="Helper">Helper</option>
                      <option value="Winder">Winder</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      list={formKind === 'salaried' ? 'hr-salaried-designations' : 'hr-contractor-designations'}
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      placeholder={
                        formKind === 'contractor'
                          ? 'e.g. Knotting / Sarning / Chowkidar'
                          : 'e.g. Incharge / Technician / Quality Controller'
                      }
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Department
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
                </div>

                {/* Contract Status — Staff / Company Contract form only */}
                {formKind === 'salaried' && (
                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Wage Type
                    </label>
                    <select
                      value={contractStatus === 'Permanent' ? 'Permanent' : 'Company Contract'}
                      onChange={(e) => setContractStatus(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="Company Contract">Company Contract (Monthly)</option>
                      <option value="Permanent">Permanent (Monthly)</option>
                    </select>
                  </div>
                )}

                {/* Daily wage — Weaver / Helper only (no monthly salary field) */}
                {(formKind === 'weaver' || formKind === 'helper') && (
                  <div>
                    <label className="block font-medium text-emerald-700 dark:text-emerald-400 mb-1">
                      Daily Wage (PKR / Day) *
                    </label>
                    <input
                      type="number"
                      required
                      value={dailyWage}
                      onChange={(e) => {
                        const val = e.target.value
                        setDailyWage(val)
                        const num = parseFloat(val) || 0
                        setSalary(num * 30)
                      }}
                      placeholder={formKind === 'weaver' ? '1450 / 1800' : '1050 / 1150'}
                      className="w-full px-3 py-2 font-mono font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <p className="mt-0.5 text-[10px] text-emerald-600">
                      {formKind === 'weaver'
                        ? 'Weaver Rs. 1,450 · Spare Weaver Rs. 1,800'
                        : 'Helper Rs. 1,050 · Winder Rs. 1,150'}
                    </p>
                  </div>
                )}

                {/* Monthly salary — Staff / Contract / Contractor (not Weaver/Helper) */}
                {(formKind === 'salaried' || formKind === 'contractor') && (
                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {formKind === 'contractor' ? 'Contract Amount (PKR) *' : 'Monthly Base Salary (PKR) *'}
                    </label>
                    <input
                      type="number"
                      required
                      value={salary}
                      onChange={(e) => setSalary(e.target.value)}
                      placeholder={formKind === 'contractor' ? 'e.g. 30000' : 'e.g. 50000'}
                      className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Duty Hours
                  </label>
                  <select
                    value={dutyHrs}
                    onChange={(e) => setDutyHrs(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="8">8 Hours</option>
                    <option value="9">9 Hours (Standard Staff)</option>
                    <option value="10">10 Hours</option>
                    <option value="12">12 Hours (Weavers & Helpers Shift)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Shift Timings
                  </label>
                  <input
                    type="text"
                    value={shiftFromTo}
                    onChange={(e) => setShiftFromTo(e.target.value)}
                    placeholder="9 to 6, 8 to 8, 9 to 7"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Date of Joining (D.O.J)
                  </label>
                  <input
                    type="text"
                    value={doj}
                    onChange={(e) => setDoj(e.target.value)}
                    placeholder="e.g. 10-Aug-2008"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Employment Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => {
                      const next = e.target.value as EmployeeStatus
                      setStatus(next)
                      if (next === 'Resigned' && !resignedAt) {
                        setResignedAt(new Date().toISOString().slice(0, 10))
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="Active">Active</option>
                    <option value="Resigned">Resigned / Separated</option>
                    <option value="On Leave">On Leave</option>
                  </select>
                </div>

                {status === 'Resigned' && (
                  <div>
                    <label className="block font-medium text-rose-700 dark:text-rose-400 mb-1">
                      Resign Date *
                    </label>
                    <input
                      type="date"
                      value={resignedAt}
                      onChange={(e) => setResignedAt(e.target.value)}
                      className="w-full px-3 py-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-700 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Resign hone par automatically Resigned Staff archive me move ho jayega.
                    </p>
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={advanceEligible}
                      onChange={(e) => setAdvanceEligible(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0066cc] focus:ring-[#0066cc]"
                    />
                    <span>
                      <span className="block font-medium text-slate-800 dark:text-slate-100">
                        Advance Eligible (Peshgi)
                      </span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">
                        Enable karne se ye banda Advance form ki search list me aayega.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Remarks / Notes
                  </label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="e.g. Special notes, machine allotment, etc."
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="erp-btn-secondary text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="erp-btn-primary text-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving…</span>
                    </>
                  ) : (
                    <span>{editingEmployee ? 'Update Profile' : 'Register Profile'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success / Confirmation Modal */}
      {successModal && successModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-emerald-200 dark:border-emerald-800 w-full max-w-md overflow-hidden text-center p-6 animate-in zoom-in-95 duration-200">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 mb-4 shadow-inner">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {successModal.title}
            </h3>

            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {successModal.message}
            </p>

            {/* Key Personnel & Salary Details */}
            <div className="mt-4 p-3.5 bg-slate-50 dark:bg-slate-900/70 rounded-xl border border-slate-200 dark:border-slate-700 text-left space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                <span className="font-medium text-slate-500">Employee:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{successModal.employeeName}</span>
              </div>
              <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                <span className="font-medium text-slate-500">Designation:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{successModal.designation}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 font-mono">
                <span className="font-sans font-medium text-slate-500">
                  {successModal.isDaily ? 'Daily Wage (Rozana):' : 'Monthly Salary (Mahana):'}
                </span>
                <span className="font-bold text-sm">
                  {successModal.isDaily && successModal.dailyWage
                    ? `Rs. ${formatNumber(successModal.dailyWage)} / day`
                    : `Rs. ${formatNumber(successModal.salary)} / mo`}
                </span>
              </div>
            </div>

            <div className="mt-4 p-2 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-100 dark:border-blue-900/50 text-[11px] text-blue-800 dark:text-blue-300">
              ✓ General Wages, Staff/Contract, Advances & Efficiency tables automatically synchronized.
            </div>

            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => setSuccessModal(null)}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
              >
                Theek Hai / Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resign Modal */}
      {resignModal.isOpen && resignModal.emp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-rose-200 dark:border-rose-900 w-full max-w-md overflow-hidden">
            <div className="bg-rose-600 p-4 text-white flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <UserX className="h-5 w-5" />
                Mark Employee as Resigned
              </h3>
              <button
                onClick={() => setResignModal({ isOpen: false, emp: null, resignedAt: '', remarks: '' })}
                className="p-1 rounded hover:bg-white/20 transition-colors text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmResign} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-800">
                <p className="font-semibold text-rose-900 dark:text-rose-200 text-sm">
                  {resignModal.emp.name}
                </p>
                <p className="text-rose-700 dark:text-rose-300 text-xs mt-0.5">
                  {resignModal.emp.designation} · #{resignModal.emp.serialNo}
                </p>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Resignation Date *
                </label>
                <input
                  type="date"
                  required
                  value={resignModal.resignedAt}
                  onChange={(e) => setResignModal((prev) => ({ ...prev, resignedAt: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Remarks / Reason
                </label>
                <input
                  type="text"
                  value={resignModal.remarks}
                  onChange={(e) => setResignModal((prev) => ({ ...prev, remarks: e.target.value }))}
                  placeholder="e.g. Resigned voluntarily / relocated"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResignModal({ isOpen: false, emp: null, resignedAt: '', remarks: '' })}
                  className="erp-btn-secondary text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  Confirm Resignation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rejoin Modal */}
      {rejoinModal.isOpen && rejoinModal.emp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-emerald-200 dark:border-emerald-900 w-full max-w-md overflow-hidden">
            <div className="bg-emerald-600 p-4 text-white flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Re-Join Employee (Active Karein)
              </h3>
              <button
                onClick={() => setRejoinModal({ isOpen: false, emp: null, newDoj: '' })}
                className="p-1 rounded hover:bg-white/20 transition-colors text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmRejoin} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <p className="font-semibold text-emerald-900 dark:text-emerald-200 text-sm">
                  {rejoinModal.emp.name}
                </p>
                <p className="text-emerald-700 dark:text-emerald-300 text-xs mt-0.5">
                  {rejoinModal.emp.designation} · Previously Resigned
                </p>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  New Date of Joining (D.O.J) *
                </label>
                <input
                  type="date"
                  required
                  value={rejoinModal.newDoj}
                  onChange={(e) => setRejoinModal((prev) => ({ ...prev, newDoj: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Ye nayi joining date profile me set hogi aur status &quot;Active&quot; ho kar employee active list me aa jayega.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejoinModal({ isOpen: false, emp: null, newDoj: '' })}
                  className="erp-btn-secondary text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  Confirm Re-Join
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <AlertModal
        isOpen={deleteConfirmState.isOpen}
        onClose={() => setDeleteConfirmState({ isOpen: false, employeeId: '', employeeName: '' })}
        onConfirm={handleDeleteConfirm}
        title="Confirm Delete Profile"
        message={`Are you sure you want to delete "${deleteConfirmState.employeeName}"? This profile will be permanently removed from all payroll records.`}
        confirmText="Delete Profile"
        type="confirm"
      />
    </div>
  )
}

export default function EmployeeProfilesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Loading HR profiles...</div>}>
      <EmployeeProfilesContent />
    </Suspense>
  )
}
