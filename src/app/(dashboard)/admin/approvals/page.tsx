'use client'

import React, { useState, useEffect } from 'react'
import {
  ShieldCheck,
  UserCheck,
  UserX,
  Clock,
  CheckCircle2,
  XCircle,
  Briefcase,
  Users,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  Check,
  Building2,
  Calendar,
  Lock,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { RoleOption } from '@/types/auth'
import { AlertModal, ModalType } from '@/components/ui/AlertModal'
import { PageHeader } from '@/components/shared/PageHeader'

interface AdminUser {
  id: string
  name: string
  email: string
  roleKey: string
  roleLabel: string
  department: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  isActive: boolean
  approvedAt?: string | null
  approvedBy?: string | null
  createdAt: string
}

export default function AdminApprovalsPage() {
  const { user, isAdmin, isLoading: authLoading } = useAuth()

  const [activeTab, setActiveTab] = useState<'approvals' | 'roles'>('approvals')
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'ALL'>('PENDING')
  const [searchQuery, setSearchQuery] = useState('')

  // Users State
  const [users, setUsers] = useState<AdminUser[]>([])
  const [counts, setCounts] = useState({ all: 0, pending: 0, approved: 0, rejected: 0 })
  const [loadingUsers, setLoadingUsers] = useState(true)

  // Roles State
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [loadingRoles, setLoadingRoles] = useState(true)

  // New Role Form State
  const [newRoleLabel, setNewRoleLabel] = useState('')
  const [newRoleDept, setNewRoleDept] = useState('')
  const [newRoleDesc, setNewRoleDesc] = useState('')
  const [newRoleCanSignup, setNewRoleCanSignup] = useState(true)
  const [creatingRole, setCreatingRole] = useState(false)

  // Custom Alert Modal State
  const [modalState, setModalState] = useState<{
    isOpen: boolean
    type: ModalType
    title: string
    message: string
    confirmText?: string
    onConfirm?: () => void
    loading?: boolean
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
  })

  // Open Alert Modal Helper
  const showAlert = (type: ModalType, title: string, message: string) => {
    setModalState({
      isOpen: true,
      type,
      title,
      message,
      confirmText: 'OK',
      onConfirm: () => setModalState((prev) => ({ ...prev, isOpen: false })),
    })
  }

  // Fetch Users
  const fetchUsers = async () => {
    setLoadingUsers(true)
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      if (data.success) {
        setUsers(data.users)
        setCounts(data.counts)
      } else {
        showAlert('error', 'Failed to Load Users', data.error || 'Could not fetch user registrations.')
      }
    } catch (err: any) {
      console.error('Failed to fetch admin users:', err)
    } finally {
      setLoadingUsers(false)
    }
  }

  // Fetch Roles
  const fetchRoles = async () => {
    setLoadingRoles(true)
    try {
      const res = await fetch('/api/roles')
      const data = await res.json()
      if (data.success) {
        setRoles(data.roles)
      }
    } catch (err) {
      console.error('Failed to fetch roles:', err)
    } finally {
      setLoadingRoles(false)
    }
  }

  useEffect(() => {
    fetchUsers()
    fetchRoles()
  }, [])

  // Confirm and Execute User Approval / Rejection
  const confirmUserAction = (targetUser: AdminUser, action: 'APPROVE' | 'REJECT') => {
    const isApprove = action === 'APPROVE'
    setModalState({
      isOpen: true,
      type: isApprove ? 'confirm' : 'warning',
      title: isApprove ? `Approve ${targetUser.name}?` : `Revoke Access for ${targetUser.name}?`,
      message: isApprove
        ? `This will authorize ${targetUser.name} (${targetUser.email}) to sign in to Sara Textile ERP with the "${targetUser.roleLabel}" role immediately.`
        : `Are you sure you want to block or revoke login access for ${targetUser.name}?`,
      confirmText: isApprove ? 'Yes, Approve Access' : 'Yes, Revoke Access',
      onConfirm: () => executeUserAction(targetUser.id, action, targetUser.name),
    })
  }

  const executeUserAction = async (userId: string, action: 'APPROVE' | 'REJECT', userName: string) => {
    setModalState((prev) => ({ ...prev, loading: true }))
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      })
      const data = await res.json()
      if (data.success) {
        await fetchUsers()
        showAlert(
          'success',
          action === 'APPROVE' ? 'Staff Approved Successfully!' : 'Access Revoked',
          `User "${userName}" has been successfully ${action === 'APPROVE' ? 'approved' : 'revoked'}.`
        )
      } else {
        showAlert('error', 'Action Failed', data.error || 'Could not update user status.')
      }
    } catch (err: any) {
      showAlert('error', 'Server Error', err.message || 'An error occurred.')
    }
  }

  // Create New Dynamic Role
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoleLabel.trim()) {
      showAlert('warning', 'Role Title Required', 'Please provide a title/label for the new role.')
      return
    }

    setCreatingRole(true)
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newRoleLabel,
          department: newRoleDept,
          description: newRoleDesc,
          canSignup: newRoleCanSignup,
        }),
      })
      const data = await res.json()
      setCreatingRole(false)

      if (data.success) {
        setNewRoleLabel('')
        setNewRoleDept('')
        setNewRoleDesc('')
        await fetchRoles()
        showAlert('success', 'New Role Published!', data.message)
      } else {
        showAlert('error', 'Failed to Create Role', data.error || 'Could not save the new role.')
      }
    } catch (err: any) {
      setCreatingRole(false)
      showAlert('error', 'Server Error', err.message || 'An error occurred while creating role.')
    }
  }

  // Filtered list based on search and status
  const filteredUsers = users.filter((u) => {
    const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.roleLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.department.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesStatus && matchesSearch
  })

  return (
    <div className="space-y-6 pb-16">
      
      <PageHeader
        title="Staff Approvals"
        breadcrumbs={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Administration', href: '/admin/approvals' },
          { label: 'Approvals' },
        ]}
        actions={
          <button
            type="button"
            onClick={() => {
              fetchUsers()
              fetchRoles()
            }}
            className="erp-btn-secondary"
          >
            <RefreshCw className="size-3.5" />
            <span>Refresh</span>
          </button>
        }
      />

      {/* Metrics Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Pending Approvals */}
        <div
          onClick={() => {
            setActiveTab('approvals')
            setStatusFilter('PENDING')
          }}
          className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'PENDING' && activeTab === 'approvals'
              ? 'bg-blue-50/60 border-[#0066cc]/40 ring-2 ring-[#0066cc]/15'
              : 'bg-white border-slate-200 hover:border-[#0066cc]/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Approvals</span>
            <div className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-[#0066cc]">
              <Clock className="size-4.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{counts.pending}</span>
            <span className="text-xs text-[#0066cc] font-semibold">Requires Review</span>
          </div>
        </div>

        {/* Metric 2: Approved Staff */}
        <div
          onClick={() => {
            setActiveTab('approvals')
            setStatusFilter('APPROVED')
          }}
          className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'APPROVED' && activeTab === 'approvals'
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/20'
              : 'bg-white border-slate-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Staff</span>
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <UserCheck className="size-4.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{counts.approved}</span>
            <span className="text-xs text-emerald-600 font-semibold">Authorized Users</span>
          </div>
        </div>

        {/* Metric 3: Total Registrations */}
        <div
          onClick={() => {
            setActiveTab('approvals')
            setStatusFilter('ALL')
          }}
          className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'ALL' && activeTab === 'approvals'
              ? 'bg-blue-50/60 border-[#0066cc]/40 ring-2 ring-[#0066cc]/15'
              : 'bg-white border-slate-200 hover:border-[#0066cc]/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Accounts</span>
            <div className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-[#0066cc]">
              <Users className="size-4.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{counts.all}</span>
            <span className="text-xs text-slate-500 font-semibold">In Mill Database</span>
          </div>
        </div>

        {/* Metric 4: Dynamic Roles */}
        <div
          onClick={() => setActiveTab('roles')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            activeTab === 'roles'
              ? 'bg-blue-50/60 border-[#0066cc]/40 ring-2 ring-[#0066cc]/15'
              : 'bg-white border-slate-200 hover:border-[#0066cc]/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Mill Roles</span>
            <div className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-[#0066cc]">
              <Briefcase className="size-4.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{roles.length}</span>
            <span className="text-xs text-[#0066cc] font-semibold">Configured Roles</span>
          </div>
        </div>
      </div>

      {/* Main Content Area: Tabs */}
      <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-6">
        
        {/* Tab Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 border-b border-slate-200 pb-4">
          <button
            onClick={() => setActiveTab('approvals')}
            className={`flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'approvals'
                ? 'bg-[#0066cc] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Users className="size-4" />
            <span>Staff Registrations & Approvals</span>
            {counts.pending > 0 && (
              <span className="rounded-full bg-amber-400 text-slate-950 font-bold text-[10px] px-2 py-0.2 animate-pulse">
                {counts.pending}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('roles')}
            className={`flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'roles'
                ? 'bg-[#0066cc] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Briefcase className="size-4" />
            <span>Dynamic Mill Roles ({roles.length})</span>
          </button>
        </div>

        {/* TAB 1: STAFF APPROVALS */}
        {activeTab === 'approvals' && (
          <div className="space-y-4">
            {/* Search & Filter Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <button
                  onClick={() => setStatusFilter('PENDING')}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    statusFilter === 'PENDING'
                      ? 'bg-blue-50 text-[#0066cc] border-blue-200 shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Pending ({counts.pending})
                </button>
                <button
                  onClick={() => setStatusFilter('APPROVED')}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    statusFilter === 'APPROVED'
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300 shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Approved ({counts.approved})
                </button>
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    statusFilter === 'ALL'
                      ? 'bg-blue-50 text-[#0066cc] border-blue-200 shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  All ({counts.all})
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search staff by name or email..."
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#0066cc] focus:outline-none focus:ring-2 focus:ring-[#0066cc]/15 transition-all"
                />
              </div>
            </div>

            {/* Users List */}
            {loadingUsers ? (
              <div className="py-16 text-center text-xs text-slate-500 font-medium">
                Loading staff records from PostgreSQL...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-16 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60">
                <Clock className="size-10 mx-auto text-slate-400 mb-2" />
                <p className="text-sm font-bold text-slate-800">
                  {statusFilter === 'PENDING'
                    ? 'No pending staff registrations.'
                    : 'No users found matching your search.'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  When new employees sign up, their accounts will appear here for 1-click approval.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden">
                {filteredUsers.map((u) => {
                  const isPending = u.status === 'PENDING'
                  const isApproved = u.status === 'APPROVED'
                  const isRejected = u.status === 'REJECTED'
                  const isRootAdmin = u.email === 'javed@saratextile.com'

                  return (
                    <div
                      key={u.id}
                      className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                        isPending ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'bg-white hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-bold text-slate-900">{u.name}</span>
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                              isPending
                                ? 'bg-blue-50 text-[#0066cc] border-blue-200'
                                : isApproved
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : 'bg-rose-100 text-rose-800 border-rose-200'
                            }`}
                          >
                            {u.status}
                          </span>
                          <span className="text-xs font-semibold text-[#0066cc] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {u.roleLabel}
                          </span>
                        </div>

                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span>
                            Email: <strong className="text-slate-800 font-mono">{u.email}</strong>
                          </span>
                          <span>Dept: <strong className="text-slate-700">{u.department}</strong></span>
                          <span>
                            Registered:{' '}
                            {new Date(u.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                          {u.approvedBy && (
                            <span>Approved By: <strong className="text-emerald-700">{u.approvedBy}</strong></span>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      {!isRootAdmin && (
                        <div className="flex items-center gap-2 shrink-0">
                          {isPending && (
                            <>
                              <button
                                onClick={() => confirmUserAction(u, 'APPROVE')}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs transition-all cursor-pointer"
                              >
                                <UserCheck className="size-4" />
                                <span>Approve Access</span>
                              </button>

                              <button
                                onClick={() => confirmUserAction(u, 'REJECT')}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-all cursor-pointer"
                              >
                                <UserX className="size-4" />
                                <span>Reject</span>
                              </button>
                            </>
                          )}

                          {isApproved && (
                            <button
                              onClick={() => confirmUserAction(u, 'REJECT')}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 text-xs font-semibold transition-all cursor-pointer"
                            >
                              Revoke Access
                            </button>
                          )}

                          {isRejected && (
                            <button
                              onClick={() => confirmUserAction(u, 'APPROVE')}
                              className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white text-xs font-bold transition-all cursor-pointer"
                            >
                              Re-Approve
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DYNAMIC MILL ROLES */}
        {activeTab === 'roles' && (
          <div className="space-y-6">
            
            {/* Create Role Box */}
            <div className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white space-y-4">
              <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center">
                <h3 className="h6 mb-0 fw-semibold">Add Mill Role</h3>
              </div>

              <form onSubmit={handleCreateRole} className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-4 space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Role Title</label>
                  <input
                    type="text"
                    value={newRoleLabel}
                    onChange={(e) => setNewRoleLabel(e.target.value)}
                    placeholder="e.g. Weaving Supervisor"
                    className="form-control form-control-sm"
                    required
                  />
                </div>

                <div className="md:col-span-4 space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Department</label>
                  <input
                    type="text"
                    value={newRoleDept}
                    onChange={(e) => setNewRoleDept(e.target.value)}
                    placeholder="e.g. Loom Floor"
                    className="form-control form-control-sm"
                  />
                </div>

                <div className="md:col-span-4 space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Description</label>
                  <input
                    type="text"
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                    placeholder="e.g. Floor shifts"
                    className="form-control form-control-sm"
                  />
                </div>

                <div className="md:col-span-8 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="canSignupCheck"
                    checked={newRoleCanSignup}
                    onChange={(e) => setNewRoleCanSignup(e.target.checked)}
                    className="form-check-input m-0"
                  />
                  <label htmlFor="canSignupCheck" className="text-xs font-medium text-slate-700 mb-0 cursor-pointer">
                    Show in signup dropdown
                  </label>
                </div>

                <div className="md:col-span-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={creatingRole || !newRoleLabel.trim()}
                    className="erp-btn-primary w-100 w-md-auto justify-content-center"
                  >
                    <span>{creatingRole ? 'Saving…' : 'Add Role'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* List of Roles */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Active Roles in Sara Textile PostgreSQL Database
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {roles.map((r) => (
                  <div
                    key={r.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-2 flex flex-col justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900">{r.label}</span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                            r.canSignup
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {r.canSignup ? 'Available in Signup' : 'Admin Only'}
                        </span>
                      </div>
                      <p className="text-xs text-[#0066cc] font-mono font-bold">Key: {r.key}</p>
                      <p className="text-xs text-slate-500">{r.department || 'Sara Textile Mill'}</p>
                      {r.description && (
                        <p className="text-[11px] text-slate-600 italic mt-1">{r.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>

      {/* Reusable Custom Alert Modal */}
      <AlertModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={modalState.onConfirm}
        type={modalState.type}
        title={modalState.title}
        message={modalState.message}
        confirmText={modalState.confirmText}
        loading={modalState.loading}
      />
    </div>
  )
}
