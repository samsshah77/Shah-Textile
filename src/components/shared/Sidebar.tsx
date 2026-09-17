'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard,
  Receipt,
  Building2,
  Factory,
  ChevronDown,
  ChevronRight,
  Calculator,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Users,
  FileSpreadsheet,
  Award,
  DollarSign,
  Truck,
  Wallet,
  Clock,
  Banknote,
  Layers,
  Package,
  BookOpen,
  IdCard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/context/SidebarContext'
import { useAuth } from '@/context/AuthContext'

interface NavItem {
  sheetNumber?: number
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  activeCheck: (pathname: string, searchParams: URLSearchParams) => boolean
}

interface NavGroup {
  sectionTitle: string
  badge?: string
  items: NavItem[]
}

const PRODUCTION_NAVIGATION_GROUPS: NavGroup[] = [
  {
    sectionTitle: 'Floor Operations',
    badge: '34 Looms',
    items: [
      {
        sheetNumber: 1,
        title: 'Daily Production',
        href: '/floor/production',
        icon: Factory,
        activeCheck: (p, sp) =>
          p === '/floor/production' && (!sp.get('tab') || sp.get('tab') === 'daily'),
      },
      {
        sheetNumber: 2,
        title: 'Loom Monthly Matrix',
        href: '/floor/production?tab=matrix',
        icon: FileSpreadsheet,
        activeCheck: (p, sp) => p === '/floor/production' && sp.get('tab') === 'matrix',
      },
      {
        sheetNumber: 7,
        title: 'Active Quality Register',
        href: '/floor/production?tab=qualities',
        icon: Receipt,
        activeCheck: (p, sp) => p === '/floor/production' && sp.get('tab') === 'qualities',
      },
    ],
  },
  {
    sectionTitle: 'Inventory & Floor Stock',
    badge: 'Yarn & Beams',
    items: [
      {
        sheetNumber: 4,
        title: 'Beam Stock on Floor',
        href: '/floor/production?tab=beam-stock',
        icon: Layers,
        activeCheck: (p, sp) => p === '/floor/production' && sp.get('tab') === 'beam-stock',
      },
      {
        sheetNumber: 5,
        title: 'Daily Weft Record',
        href: '/floor/production?tab=weft-stock',
        icon: Clock,
        activeCheck: (p, sp) => p === '/floor/production' && sp.get('tab') === 'weft-stock',
      },
    ],
  },
  {
    sectionTitle: 'Dispatch & Reports',
    badge: 'Dispatch',
    items: [
      {
        sheetNumber: 3,
        title: 'Delivery Challan #001414',
        href: '/floor/challan',
        icon: Truck,
        activeCheck: (p) => p.startsWith('/floor/challan'),
      },
      {
        sheetNumber: 6,
        title: 'Quality End Report',
        href: '/floor/production?tab=quality-end',
        icon: Award,
        activeCheck: (p, sp) => p === '/floor/production' && sp.get('tab') === 'quality-end',
      },
      {
        sheetNumber: 8,
        title: 'Fabric Fault Report',
        href: '/floor/production?tab=fabric-report',
        icon: Building2,
        activeCheck: (p, sp) => p === '/floor/production' && sp.get('tab') === 'fabric-report',
      },
    ],
  },
]

const ACCOUNTS_NAVIGATION_GROUPS: NavGroup[] = [
  {
    sectionTitle: 'Financial Statements & Ledgers',
    badge: 'August 2026',
    items: [
      {
        sheetNumber: 1,
        title: 'Cost Statement',
        href: '/accounts/cost-statement',
        icon: Calculator,
        activeCheck: (p) => p === '/accounts/cost-statement',
      },
      {
        sheetNumber: 2,
        title: 'Traders Synopsis',
        href: '/accounts/traders',
        icon: Building2,
        activeCheck: (p) => p.startsWith('/accounts/traders') || p.startsWith('/accounts/trader-ledger'),
      },
      {
        sheetNumber: 3,
        title: 'Daily Inward Expenses',
        href: '/accounts/daily-expense',
        icon: Receipt,
        activeCheck: (p) => p === '/accounts/daily-expense',
      },
      {
        sheetNumber: 4,
        title: 'Petty Cash Journal',
        href: '/accounts/petty-cash',
        icon: Wallet,
        activeCheck: (p) => p.startsWith('/accounts/petty-cash'),
      },
    ],
  },
  {
    sectionTitle: 'Store & Inventory Control',
    badge: '9 Months',
    items: [
      {
        sheetNumber: 5,
        title: 'Store Inventory Control',
        href: '/accounts/inventory-inward',
        icon: Package,
        activeCheck: (p) => p === '/accounts/inventory-inward',
      },
      {
        sheetNumber: 6,
        title: 'Monthly Purchases Trend',
        href: '/accounts/reports/monthly-purchases',
        icon: FileSpreadsheet,
        activeCheck: (p) => p.startsWith('/accounts/reports'),
      },
    ],
  },
]

const SALARY_NAVIGATION_GROUPS: NavGroup[] = [
  {
    sectionTitle: 'HR & Master Directory',
    badge: 'Personnel',
    items: [
      {
        title: 'HR & CNIC Profiles',
        href: '/payroll/profiles',
        icon: IdCard,
        activeCheck: (p) => p === '/payroll/profiles',
      },
      {
        sheetNumber: 1,
        title: 'General Wages',
        href: '/payroll/employees',
        icon: Users,
        activeCheck: (p) => p === '/payroll/employees',
      },
    ],
  },
  {
    sectionTitle: 'General & Contract Payroll',
    badge: 'General',
    items: [
      {
        sheetNumber: 2,
        title: 'Advance (Peshgi)',
        href: '/payroll/advances',
        icon: DollarSign,
        activeCheck: (p) => p === '/payroll/advances',
      },
      {
        sheetNumber: 3,
        title: 'Staff Salary & OT',
        href: '/payroll/staff',
        icon: Building2,
        activeCheck: (p) => p === '/payroll/staff',
      },
      {
        sheetNumber: 4,
        title: 'Contract Employees',
        href: '/payroll/contract?tab=employees',
        icon: Calculator,
        activeCheck: (p, sp) =>
          p === '/payroll/contract' && (!sp.get('tab') || sp.get('tab') === 'employees'),
      },
      {
        sheetNumber: 5,
        title: 'Contract OverTime',
        href: '/payroll/contract?tab=overtime',
        icon: Clock,
        activeCheck: (p, sp) => p === '/payroll/contract' && sp.get('tab') === 'overtime',
      },
      {
        sheetNumber: 6,
        title: 'Efficency Bonus',
        href: '/payroll/efficiency',
        icon: Award,
        activeCheck: (p) => p === '/payroll/efficiency',
      },
      {
        sheetNumber: 7,
        title: 'Net Payment Contract',
        href: '/payroll/contract?tab=net-payment',
        icon: Receipt,
        activeCheck: (p, sp) => p === '/payroll/contract' && sp.get('tab') === 'net-payment',
      },
    ],
  },
  {
    sectionTitle: '1st Half (01 to 15)',
    badge: '1-15',
    items: [
      {
        sheetNumber: 8,
        title: 'Weawers Wages (1-15)',
        href: '/payroll/weavers?tab=wages&fortnight=1-15',
        icon: Receipt,
        activeCheck: (p, sp) =>
          p === '/payroll/weavers' &&
          sp.get('fortnight') !== '16-31' &&
          (!sp.get('tab') || sp.get('tab') === 'wages'),
      },
      {
        sheetNumber: 9,
        title: 'Weawers OT (1-15)',
        href: '/payroll/weavers?tab=overtime&fortnight=1-15',
        icon: Clock,
        activeCheck: (p, sp) =>
          p === '/payroll/weavers' &&
          sp.get('fortnight') !== '16-31' &&
          sp.get('tab') === 'overtime',
      },
      {
        sheetNumber: 10,
        title: 'Net Payment Weawers (1-15)',
        href: '/payroll/weavers?tab=net-payment&fortnight=1-15',
        icon: Banknote,
        activeCheck: (p, sp) =>
          p === '/payroll/weavers' &&
          sp.get('fortnight') !== '16-31' &&
          sp.get('tab') === 'net-payment',
      },
      {
        sheetNumber: 11,
        title: 'Helper Wages (1-15)',
        href: '/payroll/helpers?fortnight=1-15',
        icon: Users,
        activeCheck: (p, sp) =>
          p === '/payroll/helpers' && sp.get('fortnight') !== '16-31',
      },
      {
        sheetNumber: 12,
        title: 'Contractor (1-15)',
        href: '/payroll/contractors?fortnight=1-15',
        icon: Truck,
        activeCheck: (p, sp) =>
          p === '/payroll/contractors' && sp.get('fortnight') !== '16-31',
      },
      {
        sheetNumber: 13,
        title: 'Petty Cash (1-15)',
        href: '/payroll/petty-cash?fortnight=1-15',
        icon: Wallet,
        activeCheck: (p, sp) =>
          p === '/payroll/petty-cash' && sp.get('fortnight') !== '16-31',
      },
      {
        sheetNumber: 14,
        title: 'Synopsis (1-15)',
        href: '/payroll/synopsis?fortnight=1-15',
        icon: FileSpreadsheet,
        activeCheck: (p, sp) =>
          p === '/payroll/synopsis' && sp.get('fortnight') === '1-15',
      },
    ],
  },
  {
    sectionTitle: '2nd Half (16 to 31)',
    badge: '16-31',
    items: [
      {
        sheetNumber: 15,
        title: 'Weawers Wages (16-31)',
        href: '/payroll/weavers?tab=wages&fortnight=16-31',
        icon: Receipt,
        activeCheck: (p, sp) =>
          p === '/payroll/weavers' &&
          sp.get('fortnight') === '16-31' &&
          (!sp.get('tab') || sp.get('tab') === 'wages'),
      },
      {
        sheetNumber: 16,
        title: 'Weawers OT (16-31)',
        href: '/payroll/weavers?tab=overtime&fortnight=16-31',
        icon: Clock,
        activeCheck: (p, sp) =>
          p === '/payroll/weavers' &&
          sp.get('fortnight') === '16-31' &&
          sp.get('tab') === 'overtime',
      },
      {
        sheetNumber: 17,
        title: 'Net Payment Weawers (16-31)',
        href: '/payroll/weavers?tab=net-payment&fortnight=16-31',
        icon: Banknote,
        activeCheck: (p, sp) =>
          p === '/payroll/weavers' &&
          sp.get('fortnight') === '16-31' &&
          sp.get('tab') === 'net-payment',
      },
      {
        sheetNumber: 18,
        title: 'Helper Wages (16-31)',
        href: '/payroll/helpers?fortnight=16-31',
        icon: Users,
        activeCheck: (p, sp) =>
          p === '/payroll/helpers' && sp.get('fortnight') === '16-31',
      },
      {
        sheetNumber: 19,
        title: 'Contracter (16-31)',
        href: '/payroll/contractors?fortnight=16-31',
        icon: Truck,
        activeCheck: (p, sp) =>
          p === '/payroll/contractors' && sp.get('fortnight') === '16-31',
      },
      {
        sheetNumber: 20,
        title: 'Petty Cash (16-31)',
        href: '/payroll/petty-cash?fortnight=16-31',
        icon: Wallet,
        activeCheck: (p, sp) =>
          p === '/payroll/petty-cash' && sp.get('fortnight') === '16-31',
      },
      {
        sheetNumber: 21,
        title: 'Synopsis (16-31)',
        href: '/payroll/synopsis?fortnight=16-31',
        icon: FileSpreadsheet,
        activeCheck: (p, sp) =>
          p === '/payroll/synopsis' && sp.get('fortnight') === '16-31',
      },
    ],
  },
  {
    sectionTitle: 'Executive Summary',
    badge: 'Monthly',
    items: [
      {
        sheetNumber: 22,
        title: 'Monthly Summery',
        href: '/',
        icon: LayoutDashboard,
        activeCheck: (p, sp) =>
          p === '/' || (p === '/payroll/synopsis' && sp.get('fortnight') === 'grand'),
      },
    ],
  },
]

function SidebarContent() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { isCollapsed, toggleCollapse, isMobileOpen, closeMobileSidebar } = useSidebar()
  const { user, isQualityController } = useAuth()

  // Close mobile sidebar on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileOpen) {
        closeMobileSidebar()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMobileOpen, closeMobileSidebar])

  // On Admin pages, hide the sidebar completely
  if (pathname.startsWith('/admin')) {
    return null
  }

  const isProduction = pathname.startsWith('/floor') || pathname.startsWith('/production')
  const isAccounts = pathname.startsWith('/accounts')

  const navigationGroups = isQualityController
    ? PRODUCTION_NAVIGATION_GROUPS
    : isProduction
    ? PRODUCTION_NAVIGATION_GROUPS
    : isAccounts
    ? ACCOUNTS_NAVIGATION_GROUPS
    : SALARY_NAVIGATION_GROUPS

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. MOBILE DRAWER SIDEBAR                                                  */}
      {/* ========================================================================= */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop Overlay */}
          <div
            onClick={closeMobileSidebar}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            aria-hidden="true"
          />

          {/* Drawer Sidebar */}
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl transition-transform animate-in slide-in-from-left duration-200">
            {/* Top Logo & Close Button */}
            <div className="flex h-16 items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 shadow-xs p-1">
                  <img src="/saralogo.webp" alt="Sara Textile Logo" className="size-full object-contain" />
                </div>
                <div>
                  <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                    SARA TEXTILE
                  </h1>
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                    Weaving Mill ERP
                  </p>
                </div>
              </div>

              <button
                onClick={closeMobileSidebar}
                title="Close Menu"
                className="flex size-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <ChevronLeft className="size-5" />
              </button>
            </div>

            {/* Navigation Groups for Mobile */}
            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
              {navigationGroups.map((group) => (
                <div key={group.sectionTitle} className="space-y-1">
                  <div className="flex items-center justify-between px-2 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <span>{group.sectionTitle}</span>
                    {group.badge && (
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-[#0066cc] dark:text-sky-300 border border-blue-200/60">
                        {group.badge}
                      </span>
                    )}
                  </div>

                  <nav className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const isActive = item.activeCheck(pathname, searchParams)

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={closeMobileSidebar}
                          className={cn(
                            'group flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all',
                            isActive
                              ? 'bg-[#0066cc] text-white shadow-xs font-semibold'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon
                              className={cn(
                                'size-4 shrink-0 transition-colors',
                                isActive
                                  ? 'text-white'
                                  : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200'
                              )}
                            />
                            <span className="truncate">{item.title}</span>
                          </div>
                        </Link>
                      )
                    })}
                  </nav>
                </div>
              ))}
            </div>

            {/* Mobile Footer Status */}
            <div className="border-t border-slate-200 dark:border-slate-800 p-3 text-xs bg-slate-50/70 dark:bg-slate-900/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {isQualityController || isProduction
                    ? 'Sara Floor (34 Looms)'
                    : isAccounts
                    ? 'Sara Accounts'
                    : 'Sara Payroll'}
                </span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DESKTOP PERMANENT SIDEBAR (Visible on screens >= lg)                  */}
      {/* ========================================================================= */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 transition-all duration-200 ease-in-out lg:flex',
          isCollapsed ? 'w-20' : 'w-64'
        )}
      >
        {/* Top Mill Logo & Collapse Toggle */}
        <div className="flex h-16 items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1 shadow-xs">
              <img src="/saralogo.webp" alt="Sara Textile Logo" className="size-full object-contain" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 transition-opacity duration-200">
                <h1 className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                  SARA TEXTILE
                </h1>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                  Weaving Mill ERP
                </p>
              </div>
            )}
          </div>

          <button
            onClick={toggleCollapse}
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer',
              isCollapsed && 'hidden'
            )}
          >
            <ChevronLeft className="size-4" />
          </button>
        </div>

        {/* Navigation Section */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-scrollbar">
          {navigationGroups.map((group, groupIdx) => (
            <div key={group.sectionTitle} className="space-y-1">
              {!isCollapsed ? (
                <div className="flex items-center justify-between px-2 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <span>{group.sectionTitle}</span>
                  {group.badge && (
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.2 text-[9px] font-medium',
                        isProduction
                          ? 'bg-blue-50 text-[#0066cc] dark:bg-sky-950/80 dark:text-sky-300 border border-blue-200 dark:border-sky-800/40'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      )}
                    >
                      {group.badge}
                    </span>
                  )}
                </div>
              ) : groupIdx > 0 ? (
                <div className="my-2 border-t border-slate-100 dark:border-slate-800" />
              ) : null}

              <nav className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = item.activeCheck(pathname, searchParams)

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={isCollapsed ? item.title : undefined}
                      className={cn(
                        'group flex items-center rounded-md px-2.5 py-2 text-xs font-medium transition-colors duration-150',
                        isCollapsed ? 'justify-center px-2' : 'justify-between',
                        isActive
                          ? 'bg-[#0066cc] text-white font-semibold shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={cn(
                            'size-4 shrink-0 transition-colors',
                            isActive
                              ? 'text-white'
                              : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200'
                          )}
                        />
                        {!isCollapsed && <span className="truncate">{item.title}</span>}
                      </div>
                    </Link>
                  )
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Footer Status and Quick Toggle */}
        <div className="border-t border-slate-200 dark:border-slate-800 p-3 text-xs bg-slate-50/70 dark:bg-slate-900/70">
          {!isCollapsed ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {isQualityController || isProduction
                    ? 'Sara Floor (34 Looms)'
                    : isAccounts
                    ? 'Sara Accounts'
                    : 'Sara Payroll'}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <button
                onClick={toggleCollapse}
                title="Expand Sidebar"
                className="flex size-7 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronRightIcon className="size-4" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

export function Sidebar() {
  return (
    <Suspense fallback={<aside className="w-64 border-r border-border bg-card hidden lg:block" />}>
      <SidebarContent />
    </Suspense>
  )
}
