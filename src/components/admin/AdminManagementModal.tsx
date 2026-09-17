'use client'

import React, { useState, useEffect } from 'react'
import {
  ShieldCheck,
  UserCheck,
  UserX,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  Briefcase,
  Users,
  AlertCircle,
  Sparkles,
  RefreshCw,
  X,
  ChevronRight,
} from 'lucide-react'
import { RoleOption } from '@/types/auth'

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

interface AdminManagementModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AdminManagementModal({ isOpen, onClose }: AdminManagementModalProps) {
  const [activeTab, setActiveTab] = useState<'approvals' | 'roles'>('approvals')
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'ALL'>('PENDING')

  // Users State
  const [users, setUsers] = useState<AdminUser[]>([])
  const [counts, setCounts] = useState({ all: 0, pending: 0, approved: 0, rejected: 0 })
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  // Roles State
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [loadingRoles, setLoadingRoles] = useState(false)

  // New Role Form State
  const [newRoleLabel, setNewRoleLabel] = useState('')
  const [newRoleDept, setNewRoleDept] = useState('')
  const [newRoleDesc, setNewRoleDesc] = useState('')
  const [newRoleCanSignup, setNewRoleCanSignup] = useState(true)
  const [creatingRole, setCreatingRole] = useState(false)

  // Feedback Notification
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Fetch Users
  const fetchUsers = async () => {
    setLoadingUsers(true)
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      if (data.success) {
        setUsers(data.users)
        setCounts(data.counts)
      }
    } catch (err) {
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
    if (isOpen) {
      fetchUsers()
      fetchRoles()
      setBannerMessage(null)
    }
  }, [isOpen])

  // Approve or Reject User
  const handleUserAction = async (userId: string, action: 'APPROVE' | 'REJECT', newRoleKey?: string) => {
    setActionLoadingId(userId)
    setBannerMessage(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action, roleKey: newRoleKey }),
      })
      const data = await res.json()
      if (data.success) {
        setBannerMessage({ type: 'success', text: data.message })
        await fetchUsers()
      } else {
        setBannerMessage({ type: 'error', text: data.error || 'Action failed.' })
      }
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Server error.' })
    } finally {
      setActionLoadingId(null)
    }
  }

  // Add New Dynamic Role
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoleLabel.trim()) return

    setCreatingRole(true)
    setBannerMessage(null)
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
      if (data.success) {
        setBannerMessage({ type: 'success', text: data.message })
        setNewRoleLabel('')
        setNewRoleDept('')
        setNewRoleDesc('')
        await fetchRoles()
      } else {
        setBannerMessage({ type: 'error', text: data.error || 'Failed to create role.' })
      }
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Server error.' })
    } finally {
      setCreatingRole(false)
    }
  }

  if (!isOpen) return null

  const filteredUsers = users.filter((u) => {
    if (statusFilter === 'ALL') return true
    return u.status === statusFilter
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl border border-border bg-card text-foreground shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-[#0066cc] border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">Main Admin Management Console</h2>
                <span className="rounded bg-blue-50 text-[#0066cc] text-[10px] font-bold uppercase px-2 py-0.5 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                  Javed Sir Access
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Approve new staff registrations & configure mill roles dynamically.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center justify-between px-6 py-2 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('approvals')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'approvals'
                  ? 'bg-[#0066cc] text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Users className="size-4" />
              <span>Staff Approvals</span>
              {counts.pending > 0 && (
                <span className="rounded-full bg-amber-500 text-slate-950 font-bold text-[10px] px-2 py-0.2 animate-pulse">
                  {counts.pending} Pending
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('roles')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'roles'
                  ? 'bg-[#0066cc] text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Briefcase className="size-4" />
              <span>Dynamic Mill Roles ({roles.length})</span>
            </button>
          </div>

          <button
            onClick={() => {
              fetchUsers()
              fetchRoles()
            }}
            title="Refresh Data"
            className="flex size-8 items-center justify-center rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>

        {/* Notification Banner */}
        {bannerMessage && (
          <div
            className={`mx-6 mt-4 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              bannerMessage.type === 'success'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400'
            }`}
          >
            {bannerMessage.type === 'success' ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <AlertCircle className="size-4 shrink-0" />
            )}
            <span>{bannerMessage.text}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* TAB 1: STAFF APPROVALS */}
          {activeTab === 'approvals' && (
            <div className="space-y-4">
              {/* Filter Pills */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStatusFilter('PENDING')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    statusFilter === 'PENDING'
                      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40 font-black'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Pending Review ({counts.pending})
                </button>
                <button
                  onClick={() => setStatusFilter('APPROVED')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    statusFilter === 'APPROVED'
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 font-black'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Approved Staff ({counts.approved})
                </button>
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    statusFilter === 'ALL'
                      ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/40 font-black'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All Registrations ({counts.all})
                </button>
              </div>

              {/* Users List Table */}
              {loadingUsers ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Loading user registrations from PostgreSQL...
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-12 text-center rounded-2xl border border-dashed border-border bg-muted/20">
                  <Clock className="size-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-xs font-bold text-foreground">
                    {statusFilter === 'PENDING'
                      ? 'No pending staff registrations.'
                      : 'No users found matching this filter.'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    When new staff members sign up, their requests will appear here for 1-click approval.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredUsers.map((u) => {
                    const isPending = u.status === 'PENDING'
                    const isApproved = u.status === 'APPROVED'
                    const isRejected = u.status === 'REJECTED'
                    const isRootAdmin = u.email === 'javed@saratextile.com'

                    return (
                      <div
                        key={u.id}
                        className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          isPending
                            ? 'bg-amber-500/5 border-amber-500/30'
                            : isApproved
                            ? 'bg-card border-border'
                            : 'bg-rose-500/5 border-rose-500/20 opacity-70'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-foreground">{u.name}</span>
                            <span
                              className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                                isPending
                                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                  : isApproved
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                              }`}
                            >
                              {u.status}
                            </span>
                            <span className="text-xs text-muted-foreground">• {u.roleLabel}</span>
                          </div>

                          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span>Email: <strong className="text-foreground font-mono">{u.email}</strong></span>
                            <span>Dept: {u.department}</span>
                            <span>
                              Registered:{' '}
                              {new Date(u.createdAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        {!isRootAdmin && (
                          <div className="flex items-center gap-2 shrink-0">
                            {isPending && (
                              <>
                                <button
                                  onClick={() => handleUserAction(u.id, 'APPROVE')}
                                  disabled={actionLoadingId === u.id}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                                >
                                  <UserCheck className="size-3.5" />
                                  <span>Approve Access</span>
                                </button>

                                <button
                                  onClick={() => handleUserAction(u.id, 'REJECT')}
                                  disabled={actionLoadingId === u.id}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/10 hover:bg-rose-600 hover:text-white text-rose-600 text-xs font-bold border border-rose-600/30 transition-all cursor-pointer disabled:opacity-50"
                                >
                                  <UserX className="size-3.5" />
                                  <span>Reject</span>
                                </button>
                              </>
                            )}

                            {isApproved && (
                              <button
                                onClick={() => handleUserAction(u.id, 'REJECT')}
                                disabled={actionLoadingId === u.id}
                                className="px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-rose-600 hover:border-rose-500/40 text-xs font-semibold transition-all cursor-pointer"
                              >
                                Revoke
                              </button>
                            )}

                            {isRejected && (
                              <button
                                onClick={() => handleUserAction(u.id, 'APPROVE')}
                                disabled={actionLoadingId === u.id}
                                className="px-2.5 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-600 hover:bg-emerald-600 hover:text-white text-xs font-semibold transition-all cursor-pointer"
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

          {/* TAB 2: DYNAMIC ROLES */}
          {activeTab === 'roles' && (
            <div className="space-y-6">
              
              {/* Add Role Form */}
              <div className="p-5 rounded-2xl border border-border bg-muted/30 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-[#0066cc] text-white">
                    <Plus className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Add New Mill Role</h3>
                    <p className="text-xs text-muted-foreground">
                      Creating a role here immediately adds it to the public signup options.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleCreateRole} className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-4 space-y-1">
                    <label className="text-xs font-bold text-foreground">Role Title / Label</label>
                    <input
                      type="text"
                      value={newRoleLabel}
                      onChange={(e) => setNewRoleLabel(e.target.value)}
                      placeholder="e.g. Weaving Supervisor"
                      className="h-9 w-full rounded-xl border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
                      required
                    />
                  </div>

                  <div className="md:col-span-4 space-y-1">
                    <label className="text-xs font-bold text-foreground">Department</label>
                    <input
                      type="text"
                      value={newRoleDept}
                      onChange={(e) => setNewRoleDept(e.target.value)}
                      placeholder="e.g. Loom Maintenance & Floor"
                      className="h-9 w-full rounded-xl border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
                    />
                  </div>

                  <div className="md:col-span-4 space-y-1">
                    <label className="text-xs font-bold text-foreground">Description</label>
                    <input
                      type="text"
                      value={newRoleDesc}
                      onChange={(e) => setNewRoleDesc(e.target.value)}
                      placeholder="e.g. Oversees 34 loom shifts"
                      className="h-9 w-full rounded-xl border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
                    />
                  </div>

                  <div className="md:col-span-8 flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="canSignupCheck"
                      checked={newRoleCanSignup}
                      onChange={(e) => setNewRoleCanSignup(e.target.checked)}
                      className="size-4 rounded text-[#0066cc] focus:ring-[#0066cc] cursor-pointer"
                    />
                    <label htmlFor="canSignupCheck" className="text-xs font-semibold text-foreground cursor-pointer">
                      Allow new users to select this role on the Signup page
                    </label>
                  </div>

                  <div className="md:col-span-4 flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={creatingRole || !newRoleLabel.trim()}
                      className="w-full flex items-center justify-center gap-2 h-9 rounded-xl bg-[#0066cc] hover:bg-[#0052a3] text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="size-4" />
                      <span>{creatingRole ? 'Saving...' : 'Add & Publish Role'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Roles List */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                  Configured Roles in Mill Database
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {roles.map((r) => (
                    <div
                      key={r.id}
                      className="p-4 rounded-2xl border border-border bg-card flex flex-col justify-between space-y-2"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-foreground">{r.label}</span>
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                              r.canSignup
                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                                : 'bg-muted text-muted-foreground border-border'
                            }`}
                          >
                            {r.canSignup ? 'Available in Signup' : 'Internal Admin Only'}
                          </span>
                        </div>
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-mono font-bold">
                          Role Key: {r.key}
                        </p>
                        <p className="text-xs text-muted-foreground">{r.department || 'Sara Textile Mill'}</p>
                        {r.description && (
                          <p className="text-[11px] text-muted-foreground/80 italic">{r.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/40 flex items-center justify-between text-xs text-muted-foreground">
          <span>Sara Textile Mill • Main Admin Security Gate</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-border hover:bg-card text-foreground font-bold transition-all cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  )
}
