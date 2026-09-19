'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { UserRole } from '@/types/auth'

function HeaderContent() {
  const pathname = usePathname()
  const [timeStr, setTimeStr] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const menuRef = useRef<HTMLLIElement>(null)

  const {
    user,
    isAdmin,
    isEditModeEnabled,
    toggleEditMode,
    isLoggingOut,
    logout,
  } = useAuth()

  useEffect(() => {
    const updateTime = () => {
      setTimeStr(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      )
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    const fetchPendingCount = async () => {
      try {
        const res = await fetch('/api/admin/users?status=PENDING')
        const data = await res.json()
        if (data.success && data.counts) {
          setPendingCount(data.counts.pending || 0)
        }
      } catch {
        // ignore
      }
    }
    fetchPendingCount()
    const interval = setInterval(fetchPendingCount, 15000)
    return () => clearInterval(interval)
  }, [isAdmin])

  const roleLabel = (role?: UserRole) => {
    switch (role) {
      case 'admin':
        return 'Admin'
      case 'accountant':
        return 'Accountant'
      case 'quality_controller':
        return 'QC'
      default:
        return user?.roleLabel || 'Operator'
    }
  }

  return (
    <nav className="app-header navbar navbar-expand bg-white border-bottom-0">
      <div className="container-fluid">
        <ul className="navbar-nav">
          <li className="nav-item">
            <a className="nav-link" data-lte-toggle="sidebar" href="#" role="button">
              <i className="bi bi-list" />
            </a>
          </li>
          <li className="nav-item d-none d-md-block">
            <span className="nav-link text-body-secondary small">
              {pathname.startsWith('/admin')
                ? 'Administration'
                : pathname.startsWith('/accounts')
                  ? 'Accounts'
                  : pathname.startsWith('/payroll')
                    ? 'Salary & Wages'
                    : pathname.startsWith('/dashboard')
                      ? 'Dashboard'
                      : 'Floor Operations'}
            </span>
          </li>
        </ul>

        <ul className="navbar-nav ms-auto">
          <li className="nav-item d-flex align-items-center px-2">
            <div className="form-check form-switch mb-0" title={isEditModeEnabled ? 'Editing enabled' : 'Safe mode'}>
              <input
                className="form-check-input"
                type="checkbox"
                role="switch"
                id="headerEditModeToggle"
                checked={isEditModeEnabled}
                onChange={toggleEditMode}
              />
              <label
                className={`form-check-label small user-select-none ${isEditModeEnabled ? 'text-primary' : 'text-body-secondary'}`}
                htmlFor="headerEditModeToggle"
              >
                <i className={`bi ${isEditModeEnabled ? 'bi-pencil-square' : 'bi-lock'} me-1`} />
                <span className="d-none d-sm-inline">{isEditModeEnabled ? 'Edit' : 'Safe'}</span>
              </label>
            </div>
          </li>

          <li className="nav-item d-none d-sm-block">
            <span className="nav-link font-monospace small">
              <i className="bi bi-clock me-1" />
              {timeStr || '--:--:--'}
            </span>
          </li>

          <li className="nav-item dropdown user-menu" ref={menuRef}>
            <a
              href="#"
              className="nav-link dropdown-toggle"
              data-bs-toggle="dropdown"
              aria-expanded="false"
            >
              <span className="d-none d-md-inline">{user?.name || 'User'}</span>
              {pendingCount > 0 && isAdmin && (
                <span className="navbar-badge badge text-bg-warning">{pendingCount}</span>
              )}
            </a>
            <ul className="dropdown-menu dropdown-menu-lg dropdown-menu-end">
              <li className="user-header text-bg-primary">
                <p className="mb-0">
                  {user?.name}
                  <small className="d-block opacity-75">{roleLabel(user?.role)}</small>
                </p>
              </li>
              <li className="user-body">
                <p className="mb-0 small text-body-secondary text-truncate px-2">{user?.email}</p>
              </li>
              {isAdmin && (
                <li className="user-footer">
                  <Link href="/admin/approvals" className="btn btn-default btn-flat btn-sm">
                    Approvals
                    {pendingCount > 0 && (
                      <span className="badge text-bg-warning ms-1">{pendingCount}</span>
                    )}
                  </Link>
                  <Link href="/admin/roles" className="btn btn-default btn-flat btn-sm float-end">
                    Roles
                  </Link>
                </li>
              )}
              <li className="user-footer border-top">
                <button
                  type="button"
                  className="btn btn-default btn-flat btn-sm text-danger"
                  disabled={isLoggingOut}
                  onClick={() => logout('/login')}
                >
                  {isLoggingOut ? 'Signing Out...' : 'Sign Out'}
                </button>
                {isAdmin && (
                  <Link
                    href="/admin/permissions"
                    className="btn btn-default btn-flat btn-sm float-end"
                  >
                    Permissions
                  </Link>
                )}
              </li>
            </ul>
          </li>
        </ul>
      </div>
    </nav>
  )
}

export function Header() {
  return (
    <Suspense
      fallback={
        <nav className="app-header navbar navbar-expand bg-white border-bottom-0">
          <div className="container-fluid">
            <span className="navbar-text">Loading...</span>
          </div>
        </nav>
      }
    >
      <HeaderContent />
    </Suspense>
  )
}
