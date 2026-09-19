'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Clock,
  PanelLeft,
  PanelLeftClose,
  Factory,
  Calculator,
  DollarSign,
  LogOut,
  Loader2,
  ChevronDown,
  ShieldCheck,
  User as UserIcon,
  Users,
  Lock,
  Unlock,
  CheckCircle,
} from 'lucide-react'
import { useSidebar } from '@/context/SidebarContext'
import { useAuth } from '@/context/AuthContext'
import { UserRole } from '@/types/auth'
import { cn } from '@/lib/utils'

function HeaderContent() {
  const pathname = usePathname()
  const [timeStr, setTimeStr] = useState<string>('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState<number>(0)
  const menuRef = useRef<HTMLDivElement>(null)

  const { isCollapsed, toggleCollapse, toggleMobileSidebar } = useSidebar()
  const {
    user,
    isAdmin,
    isAccountant,
    isQualityController,
    canViewAccounts,
    isEditModeEnabled,
    toggleEditMode,
    isLoggingOut,
    logout,
  } = useAuth()

  const isProduction = pathname.startsWith('/floor') || pathname.startsWith('/production')
  const isAdminSection = pathname.startsWith('/admin')
  const isAccounts = pathname.startsWith('/accounts')
  const isPayroll = !isProduction && !isAdminSection && !isAccounts

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setTimeStr(
        now.toLocaleTimeString('en-US', {
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

  // Poll pending signups if user is Admin
  useEffect(() => {
    if (isAdmin) {
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
    }
  }, [isAdmin])

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getRoleBadgeColor = (role?: UserRole) => {
    switch (role) {
      case 'admin':
        return 'bg-blue-50 text-[#0066cc] dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800'
      case 'accountant':
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
      case 'quality_controller':
        return 'bg-blue-50 text-[#0066cc] dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800'
      default:
        return 'bg-muted text-muted-foreground border-border'
    }
  }

  return (
    <div className="sticky top-0 z-30 w-full flex flex-col bg-background/95 backdrop-blur-md">
      {/* 1. TOP MAIN HEADER BAR */}
      <header className="flex h-16 w-full items-center justify-between border-b border-border/80 px-3 sm:px-4 lg:px-6">
        {/* Left: Sidebar toggle button & Mill Logo */}
        <div className="flex items-center gap-2 sm:gap-3">
          {!isAdminSection && (
            <>
              {/* Mobile Hamburger Drawer Trigger */}
              <button
                onClick={toggleMobileSidebar}
                aria-label="Open mobile navigation"
                title="Open Menu"
                className="flex lg:hidden size-8 items-center justify-center rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <PanelLeft className="size-4.5 text-slate-600 dark:text-slate-300" />
              </button>

              {/* Desktop Collapse Trigger */}
              <button
                onClick={toggleCollapse}
                title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
                className="hidden lg:flex size-8 items-center justify-center rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                {isCollapsed ? <PanelLeft className="size-4 text-slate-600" /> : <PanelLeftClose className="size-4 text-slate-600" />}
              </button>
            </>
          )}

          {isAdminSection && (
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-md bg-white border border-slate-200 shadow-xs p-0.5">
                <img src="/saralogo.webp" alt="Sara Textile" className="size-full object-contain" />
              </div>
              <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                SARA TEXTILE
              </span>
              <span className="ml-1.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-semibold px-1.5 py-0.2 border border-blue-200 dark:border-blue-800 uppercase">
                Admin Portal
              </span>
            </div>
          )}
        </div>

        {/* Right: Enable Editing Toggle, Live Clock & User Profile */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Enable Editing Safety Toggle */}
          <button
            onClick={toggleEditMode}
            title={isEditModeEnabled ? 'Click to Lock (Protect from accidental edits)' : 'Click to Enable Editing'}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors cursor-pointer border',
              isEditModeEnabled
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 font-semibold shadow-xs'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 font-medium'
            )}
          >
            {isEditModeEnabled ? (
              <>
                <Unlock className="size-3.5 text-white" />
                <span className="hidden xs:inline sm:inline">Editing Active</span>
                <span className="rounded bg-white/20 text-white text-[9px] font-bold px-1.5 py-0.2 uppercase tracking-wide">
                  LIVE
                </span>
              </>
            ) : (
              <>
                <Lock className="size-3.5 text-slate-400" />
                <span className="hidden xs:inline sm:inline">Enable Editing</span>
                <span className="rounded bg-slate-100 text-slate-500 text-[9px] font-medium px-1.5 py-0.2">
                  Safe
                </span>
              </>
            )}
          </button>

          {/* Live Mill Clock */}
          <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-2.5 py-1">
            <Clock className="size-3.5 text-slate-500" />
            <span className="font-mono text-xs font-medium text-slate-600 dark:text-slate-400">
              {timeStr || '12:00:00 PM'}
            </span>
          </div>

          {/* User Profile Pill & Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 pr-2.5 hover:bg-slate-50 transition-colors cursor-pointer shadow-xs relative"
            >
              <div className="relative flex size-7 items-center justify-center rounded bg-[#0066cc] text-white font-bold text-xs shadow-xs">
                {user?.name?.charAt(0) || 'U'}
                {pendingCount > 0 && isAdmin && (
                  <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-amber-500 text-white font-bold text-[8px] shadow-xs">
                    {pendingCount}
                  </span>
                )}
              </div>
              <div className="text-left hidden md:block">
                <div className="text-xs font-semibold text-slate-900 dark:text-white leading-tight truncate max-w-[110px]">
                  {user?.name || 'User'}
                </div>
                <span
                  className={cn(
                    'inline-block text-[9px] font-medium uppercase px-1 py-0.2 rounded border',
                    getRoleBadgeColor(user?.role)
                  )}
                >
                  {user?.roleLabel || 'Operator'}
                </span>
              </div>
              <ChevronDown className="size-3 text-slate-400" />
            </button>

            {/* Profile Dropdown */}
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-border bg-card p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
                {/* User Header */}
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-xs font-black text-foreground truncate">{user?.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span
                      className={cn(
                        'text-[10px] font-black uppercase px-2 py-0.5 rounded border',
                        getRoleBadgeColor(user?.role)
                      )}
                    >
                      {user?.roleLabel}
                    </span>
                  </div>
                </div>

                {/* Admin Page Navigation */}
                {isAdmin && (
                  <div className="py-1">
                    <Link
                      href="/admin/approvals"
                      onClick={() => setMenuOpen(false)}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold text-[#0066cc] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="size-4 text-[#0066cc] dark:text-blue-400" />
                        <span>Admin Management Page</span>
                      </div>
                      {pendingCount > 0 && (
                        <span className="rounded-full bg-amber-400 text-slate-950 font-bold text-[10px] px-1.5 py-0.2">
                          {pendingCount}
                        </span>
                      )}
                    </Link>
                  </div>
                )}

                {/* Logout Button */}
                <div className="pt-1 border-t border-border">
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      logout('/login')
                    }}
                    disabled={isLoggingOut}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isLoggingOut ? (
                      <Loader2 className="size-4 animate-spin text-rose-600" />
                    ) : (
                      <LogOut className="size-4" />
                    )}
                    <span>{isLoggingOut ? 'Signing Out...' : 'Sign Out of ERP'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. SUB-HEADER BAR: Right-corner Role-Gated Module Switcher */}
      <div className="flex min-h-[42px] sm:h-11 w-full items-center justify-between border-b border-border/70 bg-card/80 px-2.5 sm:px-4 lg:px-6 gap-2 py-1 sm:py-0">
        {/* Subheader Left Title / Context (compact on mobile) */}
        <div className="hidden xs:flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 truncate shrink-0">
          <span className="size-2 rounded-full bg-[#0066cc] animate-pulse shrink-0" />
          <span className="hidden sm:inline">Module:</span>
          <span className="text-foreground font-bold truncate max-w-[130px] sm:max-w-none">
            {isAdminSection
              ? 'Administration'
              : isProduction
              ? 'Floor Operations'
              : isAccounts
              ? 'Accounts'
              : 'Salary & Wages'}
          </span>
        </div>

        {/* Subheader Right: Salary & Wages, Accounts & Production Tabs */}
        <div className="flex items-center rounded-lg border border-border bg-muted/60 p-0.5 shadow-xs overflow-x-auto no-scrollbar shrink-0 ml-auto">
          {/* Salary & Wages Tab: Visible to Admin and Accountant */}
          {canViewAccounts && (
            <Link
              href="/payroll/employees"
              className={cn(
                'flex items-center gap-1 sm:gap-1.5 rounded-md px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0',
                isPayroll
                  ? 'bg-[#0066cc] text-white shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card/60'
              )}
            >
              <DollarSign className="size-3 sm:size-3.5 shrink-0" />
              <span><span className="hidden sm:inline">Salary &amp; </span>Wages</span>
            </Link>
          )}

          {/* Accounts Tab: Visible to Admin and Accountant */}
          {canViewAccounts && (
            <Link
              href="/accounts/cost-statement"
              className={cn(
                'flex items-center gap-1 sm:gap-1.5 rounded-md px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0',
                isAccounts
                  ? 'bg-[#0066cc] text-white shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card/60'
              )}
            >
              <Calculator className="size-3 sm:size-3.5 shrink-0" />
              <span>Accounts</span>
            </Link>
          )}

          {/* Production Tab: Visible to All Roles */}
          <Link
            href="/floor/production"
            className={cn(
              'flex items-center gap-1 sm:gap-1.5 rounded-md px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0',
              isProduction
                ? 'bg-[#0066cc] text-white shadow-xs font-bold'
                : 'text-muted-foreground hover:text-foreground hover:bg-card/60'
            )}
          >
            <Factory className="size-3 sm:size-3.5 shrink-0" />
            <span>Production</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

export function Header() {
  return (
    <Suspense fallback={<div className="h-16 w-full bg-background border-b border-border/80" />}>
      <HeaderContent />
    </Suspense>
  )
}
