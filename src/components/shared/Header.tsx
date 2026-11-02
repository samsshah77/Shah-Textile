'use client'

import { useState, useEffect, Suspense, useRef, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useFloorDateLabel } from '@/context/FloorDateContext'
import { UserRole } from '@/types/auth'
import { toggleSidebar } from '@/lib/sidebarToggle'
import { getCalendarToday } from '@/constants/productionCalendar'
import { HeaderDatePicker } from '@/components/shared/HeaderDatePicker'
import { hydratePayrollFromDb, payrollService } from '@/services/payrollService'
import { handleSessionExpired, isSessionExpired } from '@/lib/authGuard'

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

function resolvePayrollPage(pathname: string, sp: URLSearchParams): string | null {
  if (pathname === '/payroll/profiles') return 'HR Profiles'
  if (pathname === '/payroll/profiles/new') return 'Register'
  if (pathname.startsWith('/payroll/profiles/')) return null // loaded async
  if (pathname === '/payroll/employees') return 'General Wages Register'
  if (pathname === '/payroll/advances') return 'Advance (Peshgi)'
  if (pathname === '/payroll/staff') return 'Staff Salary & OT'
  if (pathname === '/payroll/efficiency') return 'Efficiency'
  if (pathname === '/payroll/helpers') return 'Helpers'
  if (pathname === '/payroll/contractors') return 'Contractors'
  if (pathname === '/payroll/petty-cash') return 'Petty Cash'
  if (pathname === '/payroll/synopsis') {
    const fn = sp.get('fortnight')
    if (fn === '1-15') return 'Synopsis 1–15'
    if (fn === '16-31') return 'Synopsis 16–End'
    if (fn === 'grand') return 'Synopsis Monthly'
    return 'Synopsis'
  }
  if (pathname === '/payroll/contract') {
    const tab = sp.get('tab')
    if (tab === 'overtime') return 'Contract OverTime'
    if (tab === 'net-payment') return 'Net Payment Contract'
    return 'Contract Employees'
  }
  if (pathname === '/payroll/weavers') {
    const tab = sp.get('tab')
    if (tab === 'overtime') return 'Weavers OT'
    if (tab === 'net-payment') return 'Weavers Net Payment'
    return 'Weavers'
  }
  return 'Payroll'
}

function resolveAccountsPage(pathname: string): string {
  if (pathname.startsWith('/accounts/trader-ledger') || pathname.match(/^\/accounts\/traders\/.+/)) {
    return 'Trader Ledger'
  }
  if (pathname.startsWith('/accounts/traders')) return 'Traders Synopsis'
  if (pathname === '/accounts/daily-expense' || pathname === '/accounts/inventory-inward') return 'Daily Inward & Expenses'
  if (pathname.startsWith('/accounts/payables')) return 'Payables (A/P Synopsis)'
  if (pathname.startsWith('/accounts/petty-cash')) return 'Petty Cash Journal'
  return 'Accounts'
}

function resolveFloorPage(pathname: string, sp: URLSearchParams): string {
  if (pathname.startsWith('/floor/reports/total')) return 'Monthly Tracking'
  if (pathname.startsWith('/floor/reports')) return 'Reports'
  if (pathname.startsWith('/floor/challan')) return 'Challan'
  if (pathname.startsWith('/floor/fault-reports')) return 'Fabric Fault'
  if (pathname === '/floor/production' || pathname.startsWith('/floor/production')) {
    const tab = sp.get('tab')
    if (tab === 'looms') return 'Looms'
    if (tab === 'beams') return 'Beams'
    if (tab === 'yarn') return 'Yarn'
    if (tab === 'quality') return 'Quality'
    if (tab === 'quality-ends') return 'Quality Ends'
    if (tab === 'entry') return 'Production Entry'
    if (tab === 'fabric-fault') return 'Fabric Fault'
    return 'Production'
  }
  return 'Floor'
}

function resolveAdminPage(pathname: string): string {
  if (pathname.startsWith('/admin/users')) return 'Users'
  if (pathname.startsWith('/admin/system')) return 'System'
  if (pathname.startsWith('/admin/audit')) return 'Audit log'
  if (pathname.startsWith('/admin/quality-archive')) return 'Quality Archive'
  if (pathname.startsWith('/admin/access')) return 'Permissions'
  if (pathname.startsWith('/admin/approvals')) return 'Approvals'
  if (pathname.startsWith('/admin/roles')) return 'Roles'
  if (pathname.startsWith('/admin/permissions')) return 'Permissions'
  return 'Admin'
}

function HeaderContent() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [timeStr, setTimeStr] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [profilePageLabel, setProfilePageLabel] = useState<string | null>(null)
  const menuRef = useRef<HTMLLIElement>(null)
  const { dateLabel: floorDateLabel, picker: floorPicker } = useFloorDateLabel()

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
    if (!pathname.startsWith('/payroll/profiles/') || pathname === '/payroll/profiles/new') {
      setProfilePageLabel(null)
      return
    }
    const id = pathname.replace(/^\/payroll\/profiles\//, '').split('/')[0]
    if (!id) {
      setProfilePageLabel(null)
      return
    }
    let active = true
    void (async () => {
      await hydratePayrollFromDb()
      if (!active) return
      const emp = payrollService.getEmployees().find((e) => e.id === id)
      setProfilePageLabel(emp?.name || 'Profile')
    })()
    return () => {
      active = false
    }
  }, [pathname])

  const headerTrail = useMemo(() => {
    if (pathname.startsWith('/payroll')) {
      const page =
        pathname.startsWith('/payroll/profiles/') && pathname !== '/payroll/profiles/new'
          ? profilePageLabel || 'Profile'
          : resolvePayrollPage(pathname, searchParams)
      return { section: 'Salary & Wages', page }
    }
    if (pathname.startsWith('/accounts')) {
      return { section: 'Accounts', page: resolveAccountsPage(pathname) }
    }
    if (pathname.startsWith('/admin')) {
      return { section: 'Administration', page: resolveAdminPage(pathname) }
    }
    if (pathname.startsWith('/quality-archive')) {
      return { section: 'Administration', page: 'Quality Archive' }
    }
    if (pathname.startsWith('/dashboard')) {
      return { section: 'Dashboard', page: null as string | null }
    }
    if (pathname.startsWith('/floor')) {
      return { section: 'Floor Operations', page: resolveFloorPage(pathname, searchParams) }
    }
    return { section: 'Shah Textile', page: null as string | null }
  }, [pathname, searchParams, profilePageLabel])

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
    let active = true
    let interval: NodeJS.Timeout | null = null

    const stop = () => {
      active = false
      if (interval) clearInterval(interval)
    }

    const onExpired = () => stop()
    window.addEventListener('auth:session-expired', onExpired)

    const fetchPendingCount = async () => {
      if (!active || isSessionExpired()) {
        stop()
        return
      }
      try {
        const res = await fetch('/api/admin/users?status=PENDING')
        if (res.status === 401 || (res.redirected && res.url.includes('/login'))) {
          stop()
          handleSessionExpired()
          return
        }
        const data = await res.json()
        if (data.success && data.counts) {
          setPendingCount(data.counts.pending || 0)
        }
      } catch {
        // ignore
      }
    }

    fetchPendingCount()
    interval = setInterval(fetchPendingCount, 15000)
    return () => {
      stop()
      window.removeEventListener('auth:session-expired', onExpired)
    }
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

  const clockTime = (
    <>
      <span className="sara-clock__dot" aria-hidden="true" />
      {timeStr ? (
        <>
          {timeStr.slice(0, 5)}
          <span className="sara-clock__sec">:{timeStr.slice(6, 8)}</span>
          <span className="sara-clock__ampm">{timeStr.slice(9)}</span>
        </>
      ) : (
        '--:--'
      )}
    </>
  )

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
            <span className="nav-link small d-inline-flex align-items-center flex-wrap gap-1">
              <span className="text-body-secondary">{headerTrail.section}</span>
              {headerTrail.page ? (
                <>
                  <span className="text-body-secondary opacity-50">/</span>
                  <span className="text-body fw-semibold">{headerTrail.page}</span>
                </>
              ) : null}
            </span>
          </li>
        </ul>

        <ul className="navbar-nav ms-auto align-items-center">
          {floorPicker ? (
            // Production pages: the chip is the day picker (also on phones).
            <li className="nav-item d-flex align-items-center me-2">
              <HeaderDatePicker picker={floorPicker} time={clockTime} />
            </li>
          ) : (
            <li className="nav-item d-none d-sm-flex align-items-center me-2">
              <span className="sara-clock" title="Floor date · local time">
                <span className="sara-clock__date">
                  <i className="bi bi-calendar3" aria-hidden="true" />
                  {headerDateLabel}
                </span>
                <span className="sara-clock__sep" aria-hidden="true" />
                <span className="sara-clock__time">{clockTime}</span>
              </span>
            </li>
          )}

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
                  <Link href="/admin/users" className="btn btn-default btn-flat btn-sm">
                    Users
                    {pendingCount > 0 && (
                      <span className="badge text-bg-warning ms-1">{pendingCount}</span>
                    )}
                  </Link>
                  <Link href="/admin/system" className="btn btn-default btn-flat btn-sm float-end">
                    System
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
