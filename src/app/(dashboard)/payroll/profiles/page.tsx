'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { payrollService } from '@/services/payrollService'
import { EmployeeProfile, EmployeeCategory, EmployeeStatus } from '@/types/payroll'
import { useAuth } from '@/context/AuthContext'
import { AlertModal } from '@/components/ui/AlertModal'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import {
  Users,
  IdCard,
  Phone,
  MapPin,
  Building,
  DollarSign,
  Clock,
  Search,
  Plus,
  Trash2,
  Save,
  X,
  Printer,
  ShieldCheck,
  UserCheck,
  CheckCircle2,
  Filter,
  FileSpreadsheet,
  ArrowRight,
  Eye,
  LayoutGrid,
  Table as TableIcon,
  Calendar,
  Briefcase,
  Layers,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'

function EmployeeProfilesContent() {
  const { canEditAccounts, isEditModeEnabled } = useAuth()
  const searchParams = useSearchParams()
  const initialSearch = searchParams.get('search') || ''

  const [employees, setEmployees] = useState<EmployeeProfile[]>([])
  const [search, setSearch] = useState(initialSearch)
  const [filterCategory, setFilterCategory] = useState<string>('ALL')
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Selected Profile for ID Card / Detailed View Modal
  const [idCardProfile, setIdCardProfile] = useState<EmployeeProfile | null>(null)

  // Edit / Add Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<EmployeeProfile | null>(null)

  // Form State
  const [name, setName] = useState('')
  const [fatherName, setFatherName] = useState('')
  const [cnic, setCnic] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [designation, setDesignation] = useState('')
  const [department, setDepartment] = useState('Administration')
  const [employeeCategory, setEmployeeCategory] = useState<EmployeeCategory>('Staff')
  const [dutyHrs, setDutyHrs] = useState<number | string>('9')
  const [shiftFromTo, setShiftFromTo] = useState('9 to 6')
  const [salary, setSalary] = useState<number | string>('')
  const [doj, setDoj] = useState('')
  const [contractStatus, setContractStatus] = useState<string>('Company Contract')
  const [status, setStatus] = useState<EmployeeStatus>('Active')
  const [remarks, setRemarks] = useState('')

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

  const openAddModal = () => {
    setEditingEmployee(null)
    setName('')
    setFatherName('')
    setCnic('')
    setPhone('')
    setAddress('')
    setDesignation('')
    setDepartment('Administration')
    setEmployeeCategory('Staff')
    setDutyHrs('9')
    setShiftFromTo('9 to 6')
    setSalary('')
    setDoj(new Date().toISOString().split('T')[0])
    setContractStatus('Company Contract')
    setStatus('Active')
    setRemarks('')
    setIsModalOpen(true)
  }

  const openEditModal = (emp: EmployeeProfile) => {
    setEditingEmployee(emp)
    setName(emp.name || '')
    setFatherName(emp.fatherName || '')
    setCnic(emp.cnic || '')
    setPhone(emp.phone || '')
    setAddress(emp.address || '')
    setDesignation(emp.designation || '')
    setDepartment(emp.department || 'Administration')
    setEmployeeCategory(emp.employeeCategory || 'Staff')
    setDutyHrs(emp.dutyHrs || 9)
    setShiftFromTo(emp.shiftFromTo || '9 to 6')
    setSalary(emp.salary || '')
    setDoj(emp.doj || '')
    setContractStatus(emp.contractStatus || 'Company Contract')
    setStatus(emp.status || 'Active')
    setRemarks(emp.remarks || '')
    setIsModalOpen(true)
  }

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault()
    const numSalary = parseFloat(salary as string) || 0
    const numDuty = parseFloat(dutyHrs as string) || 9
    if (!name || !designation) return

    if (editingEmployee) {
      payrollService.updateEmployee(editingEmployee.id, {
        name,
        fatherName,
        cnic,
        phone,
        address,
        designation,
        department,
        employeeCategory,
        dutyHrs: numDuty,
        shiftFromTo,
        salary: numSalary,
        doj,
        contractStatus,
        status,
        remarks,
      })
    } else {
      payrollService.addEmployee({
        name,
        fatherName,
        cnic,
        phone,
        address,
        designation,
        department,
        employeeCategory,
        dutyHrs: numDuty,
        shiftFromTo,
        salary: numSalary,
        doj: doj || new Date().toISOString().split('T')[0],
        contractStatus,
        status,
        remarks: remarks || undefined,
      })
    }
    reload()
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2500)
    setIsModalOpen(false)
  }

  const handleDeleteConfirm = () => {
    if (deleteConfirmState.employeeId) {
      payrollService.deleteEmployee(deleteConfirmState.employeeId)
      reload()
      setDeleteConfirmState({ isOpen: false, employeeId: '', employeeName: '' })
    }
  }

  // Filter Logic
  const filtered = employees.filter((e) => {
    const matchSearch =
      (e.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.fatherName || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.cnic || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.phone || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.designation || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.department || '').toLowerCase().includes(search.toLowerCase())

    const matchCategory =
      filterCategory === 'ALL' || (e.employeeCategory || 'Staff').toUpperCase() === filterCategory.toUpperCase()

    const matchStatus =
      filterStatus === 'ALL' || (e.status || 'Active').toUpperCase() === filterStatus.toUpperCase()

    return matchSearch && matchCategory && matchStatus
  })

  const totalMonthlyBase = employees.reduce((s, e) => s + (e.salary || 0), 0)
  const activeCount = employees.filter((e) => (e.status || 'Active') === 'Active').length
  const weaversCount = employees.filter((e) => e.employeeCategory === 'Weaver').length
  const staffCount = employees.filter((e) => e.employeeCategory === 'Staff' || e.employeeCategory === 'Admin').length
  const helpersCount = employees.filter((e) => e.employeeCategory === 'Helper').length

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
              <button type="button" onClick={openAddModal} className="erp-btn-primary text-xs flex items-center gap-1.5 cursor-pointer">
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
          </>
        }
      />

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 rounded-lg flex items-center gap-2 text-xs font-semibold">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          Employee profile saved! Changes automatically synced across all payroll sheets and General Wages.
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="erp-card p-3 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, CNIC (42101...), phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] dark:text-slate-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            {['ALL', 'STAFF', 'WEAVER', 'HELPER', 'CONTRACT'].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={cn(
                  'erp-filter-tab',
                  filterCategory === cat
                    ? 'bg-white dark:bg-slate-800 text-[#0066cc] dark:text-sky-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                )}
              >
                {cat === 'ALL' ? `All (${employees.length})` : cat}
              </button>
            ))}
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-sm px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-[#0066cc] cursor-pointer"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active Only</option>
            <option value="RESIGNED">Resigned / Inactive</option>
          </select>

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

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((emp) => {
            const isSpecial =
              emp.name.toLowerCase().includes('javed') || emp.name.toLowerCase().includes('tufail')
            return (
              <div
                key={emp.id}
                className={cn(
                  'bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between',
                  isSpecial && 'border-indigo-300 dark:border-indigo-700 ring-1 ring-indigo-400/20'
                )}
              >
                {/* Card Top: Avatar, Name, Designation */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'h-11 w-11 rounded-full flex items-center justify-center font-bold text-sm text-white shadow-xs shrink-0',
                          emp.employeeCategory === 'Admin' && 'bg-purple-600',
                          emp.employeeCategory === 'Staff' && 'bg-indigo-600',
                          emp.employeeCategory === 'Weaver' && 'bg-emerald-600',
                          emp.employeeCategory === 'Contract' && 'bg-amber-600',
                          emp.employeeCategory === 'Helper' && 'bg-slate-600',
                          emp.employeeCategory === 'Contractor' && 'bg-rose-600'
                        )}
                      >
                        {emp.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-tight">
                            {emp.name}
                          </h3>
                          <span className="text-[10px] text-slate-400 font-mono">#{emp.serialNo}</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {emp.designation}
                        </p>
                      </div>
                    </div>

                    <span
                      className={cn(
                        'px-2 py-0.5 text-[10px] font-semibold rounded-full shrink-0',
                        (emp.status || 'Active') === 'Active'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                      )}
                    >
                      {emp.status || 'Active'}
                    </span>
                  </div>

                  {/* Personal & CNIC Details */}
                  <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-700/60 space-y-2 text-xs">
                    {/* Father Name */}
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span className="text-slate-400">Father Name:</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {emp.fatherName ? `S/O ${emp.fatherName}` : 'Not recorded'}
                      </span>
                    </div>

                    {/* CNIC */}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1">
                        <IdCard className="h-3.5 w-3.5 text-indigo-500" />
                        CNIC:
                      </span>
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-900/80 px-2 py-0.5 rounded text-[11px]">
                        {emp.cnic || '—'}
                      </span>
                    </div>

                    {/* Phone */}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5 text-emerald-500" />
                        Mobile:
                      </span>
                      {emp.phone ? (
                        <a
                          href={`tel:${emp.phone}`}
                          className="font-mono text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                        >
                          {emp.phone}
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </div>

                    {/* Address */}
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-slate-400 flex items-center gap-1 shrink-0">
                        <MapPin className="h-3.5 w-3.5 text-rose-500" />
                        Address:
                      </span>
                      <span className="text-right text-slate-700 dark:text-slate-300 truncate max-w-[180px]">
                        {emp.address || 'Industrial Area, Karachi'}
                      </span>
                    </div>
                  </div>

                  {/* Duty & Compensation Pill */}
                  <div className="mt-3 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700/50 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Monthly Base</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        {formatCurrency(emp.salary)}
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

                {/* Card Actions Footer */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setIdCardProfile(emp)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 dark:text-indigo-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    <IdCard className="h-3.5 w-3.5" />
                    ID Card
                  </button>

                  <div className="flex items-center gap-1">
                    {canEditAccounts && (
                      <button
                        onClick={() => openEditModal(emp)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                        title="Edit Full Profile"
                      >
                        <Briefcase className="h-4 w-4" />
                      </button>
                    )}
                    {canEditAccounts && (
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
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] relative">
            <table className="w-full text-left text-xs border-collapse font-sans">
              <thead className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-bold sticky top-0 z-20 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2 px-3 text-center">Sr #</th>
                  <th className="py-2 px-3">Full Name</th>
                  <th className="py-2 px-3">Father Name</th>
                  <th className="py-2 px-3">CNIC Number</th>
                  <th className="py-2 px-3">Phone</th>
                  <th className="py-2 px-3">Designation</th>
                  <th className="py-2 px-3">Department</th>
                  <th className="py-2 px-3">Category</th>
                  <th className="py-2 px-3 text-right">Salary (PKR)</th>
                  <th className="py-2 px-3 text-center">Status</th>
                  <th className="py-2 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                {filtered.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="py-2 px-3 text-center font-mono text-slate-400 text-xs">{emp.serialNo}</td>
                    <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">{emp.name}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{emp.fatherName || '—'}</td>
                    <td className="py-2 px-3 font-mono font-medium text-slate-800 dark:text-slate-200">{emp.cnic || '—'}</td>
                    <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">{emp.phone || '—'}</td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{emp.designation}</td>
                    <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{emp.department || 'Administration'}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        {emp.employeeCategory || 'Staff'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatNumber(emp.salary)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className={cn(
                          'px-2 py-0.5 text-[10px] font-semibold rounded',
                          (emp.status || 'Active') === 'Active'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                        )}
                      >
                        {emp.status || 'Active'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setIdCardProfile(emp)}
                          title="View Official ID Card"
                          className="p-1 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        >
                          <IdCard className="h-3.5 w-3.5" />
                        </button>
                        {canEditAccounts && (
                          <button
                            onClick={() => openEditModal(emp)}
                            title="Edit Profile"
                            className="p-1 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                          >
                            <Briefcase className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canEditAccounts && (
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
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Official Sara Textile Mills ID Card Modal */}
      {idCardProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden">
            {/* Modal Header */}
            <div className="bg-slate-900 p-3 text-white flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Official Employee Identity Card
              </span>
              <button
                onClick={() => setIdCardProfile(null)}
                className="p-1 rounded hover:bg-white/20 transition-colors text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* ID Card Graphic Container */}
            <div className="p-6 bg-slate-100 dark:bg-slate-900/50 flex justify-center">
              <div
                id="printable-id-card"
                className="w-80 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-xl overflow-hidden shadow-lg"
              >
                {/* Mill Header Banner */}
                <div className="bg-[#0066cc] text-white p-3 text-center">
                  <h2 className="text-sm font-bold uppercase tracking-widest leading-tight">
                    SARA TEXTILE MILLS
                  </h2>
                  <p className="text-[10px] text-slate-300 font-medium tracking-wide">
                    Plot # C-14, Sector 15, Korangi Industrial Area, Karachi
                  </p>
                </div>

                {/* Photo & Name */}
                <div className="p-4 text-center">
                  <div className="inline-block relative">
                    <div className="h-20 w-20 mx-auto rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-indigo-600 flex items-center justify-center text-2xl font-black text-slate-700 dark:text-slate-200 shadow-inner">
                      {idCardProfile.name.charAt(0)}
                    </div>
                    <span className="absolute bottom-0 right-0 bg-emerald-500 h-4 w-4 rounded-full border-2 border-white dark:border-slate-800" />
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-2">
                    {idCardProfile.name}
                  </h3>
                  <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    {idCardProfile.designation}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {idCardProfile.department || 'Production & Operations'}
                  </p>
                </div>

                {/* Key Particulars */}
                <div className="px-4 pb-3 space-y-1.5 text-[11px] border-t border-b border-slate-200 dark:border-slate-700 py-3 bg-slate-50/60 dark:bg-slate-850">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Card / Emp ID:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      STM-{String(idCardProfile.serialNo).padStart(3, '0')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Father Name:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {idCardProfile.fatherName || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">CNIC No:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 px-1 rounded border border-slate-200 dark:border-slate-700">
                      {idCardProfile.cnic || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Emergency Phone:</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {idCardProfile.phone || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Joining Date:</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {idCardProfile.doj || '—'}
                    </span>
                  </div>
                </div>

                {/* Card Bottom: Signatures */}
                <div className="p-3 bg-white dark:bg-slate-800 flex items-end justify-between text-[9px] text-slate-400">
                  <div className="text-center">
                    <div className="w-16 border-b border-slate-400 dark:border-slate-600 mb-1" />
                    <span>Card Holder</span>
                  </div>
                  <div className="text-center">
                    <div className="w-16 border-b border-slate-400 dark:border-slate-600 mb-1" />
                    <span className="font-bold text-slate-700 dark:text-slate-300">Authorized Sign</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
              <button
                onClick={() => setIdCardProfile(null)}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
                Print ID Card
              </button>
            </div>
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
                  <input
                    type="text"
                    required
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Incharge / Weaver / Electrician"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
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
                    <option value="Weaving Production">Weaving Production</option>
                    <option value="Electrical & Power">Electrical & Power</option>
                    <option value="Maintenance & Mechanical">Maintenance & Mechanical</option>
                    <option value="Quality Control">Quality Control</option>
                    <option value="Folding & Packing">Folding & Packing</option>
                    <option value="Floor Support & Janitorial">Floor Support & Janitorial</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={employeeCategory}
                    onChange={(e) => setEmployeeCategory(e.target.value as EmployeeCategory)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="Admin">Admin / Management</option>
                    <option value="Staff">Staff & Office</option>
                    <option value="Contract">Contract Technicians</option>
                    <option value="Weaver">Weaver</option>
                    <option value="Helper">Helper / Cleaner</option>
                    <option value="Contractor">Contractor</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Base Salary (PKR) *
                  </label>
                  <input
                    type="number"
                    required
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

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
                    <option value="9">9 Hours (Standard)</option>
                    <option value="10">10 Hours</option>
                    <option value="12">12 Hours (Shift)</option>
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
                    Contract Status
                  </label>
                  <select
                    value={contractStatus}
                    onChange={(e) => setContractStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="Company Contract">Company Contract</option>
                    <option value="Permanent">Permanent</option>
                    <option value="Daily Wage">Daily Wage</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Employment Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="Active">Active</option>
                    <option value="Resigned">Resigned / Inactive</option>
                    <option value="On Leave">On Leave</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Remarks / Notes
                  </label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="e.g. Rejoining 08 Jun-21 or Special skills"
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
                  className="erp-btn-primary text-xs cursor-pointer"
                >
                  {editingEmployee ? 'Update Profile' : 'Register Profile'}
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
        message={`Are you sure you want to delete "${deleteConfirmState.employeeName}"? This profile will be removed from all payroll records and General Wages.`}
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
