'use client'

import { useState, useEffect, Suspense, useRef, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useFloorDateLabel } from '@/context/FloorDateContext'
import { UserRole } from '@/types/auth'
import { toggleSidebar } from '@/lib/sidebarToggle'
import { getCalendarToday } from '@/constants/productionCalendar'

function formatHeaderDate(dateStr: string) {
  try {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function HeaderContent() {
  const pathname = usePathname()
  const [timeStr, setTimeStr] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const menuRef = useRef<HTMLLIElement>(null)
  const { dateLabel: floorDateLabel } = useFloorDateLabel()

  const {
    user,
    isAdmin,
    isLoggingOut,
    logout,
  } = useAuth()

  const headerDateLabel = useMemo(
    () => floorDateLabel || formatHeaderDate(getCalendarToday()),
    [floorDateLabel]
  )

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
            <button
              type="button"
              className="nav-link border-0 bg-transparent"
              aria-label="Toggle sidebar"
              title="Menu"
              onClick={(e) => {
                e.preventDefault()
                toggleSidebar()
              }}
            >
              <i className="bi bi-list" />
            </button>
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

        <ul className="navbar-nav ms-auto align-items-center">
          <li className="nav-item d-none d-sm-flex align-items-center me-2">
            <span
              className="badge text-bg-secondary fw-semibold"
              title="Floor date"
              style={{ fontSize: '0.78rem', letterSpacing: '0.01em' }}
            >
              {headerDateLabel}
            </span>
          </li>

          <li className="nav-item d-none d-sm-flex align-items-center me-2">
            <span
              className="d-inline-flex align-items-center gap-2 px-2.5 py-1 rounded-pill border"
              style={{
                background: 'linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)',
                borderColor: '#d7dee8',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
                lineHeight: 1.2,
              }}
              title="Local time"
            >
              <span
                className="d-inline-flex align-items-center justify-content-center rounded-circle"
                style={{
                  width: 22,
                  height: 22,
                  background: 'rgba(13, 110, 253, 0.12)',
                  color: '#0d6efd',
                  flexShrink: 0,
                }}
              >
                <i className="bi bi-clock" style={{ fontSize: '0.78rem' }} />
              </span>
              <span
                className="fw-semibold text-body"
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: '0.82rem',
                  letterSpacing: '0.03em',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: '7.6ch',
                }}
              >
                {timeStr || '--:--:--'}
              </span>
            </span>
          </li>

          <li className="nav-item dropdown user-menu" ref={menuRef}>
            <a
              href="#"
              className="nav-link dropdown-toggle d-flex align-items-center gap-1 pe-2"
              data-bs-toggle="dropdown"
              aria-expanded="false"
            >
              <span
                className="fw-semibold text-body text-truncate"
                style={{ maxWidth: '9rem' }}
                title={user?.name || 'User'}
              >
                {user?.name || 'User'}
              </span>
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
