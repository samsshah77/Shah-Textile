'use client'

import { Suspense, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import {
  closeSidebar,
  ensureSidebarOverlay,
  isSidebarMobileViewport,
} from '@/lib/sidebarToggle'

interface NavLeaf {
  title: string
  href: string
  icon: string
  activeCheck: (pathname: string, searchParams: URLSearchParams) => boolean
}

interface NavTree {
  title: string
  icon: string
  items: NavLeaf[]
}

const FLOOR_ITEMS: NavLeaf[] = [
  {
    title: 'Daily Entry',
    href: '/floor/production?tab=entry',
    icon: 'bi-pencil-square',
    activeCheck: (p, sp) =>
      p === '/floor/production' &&
      (sp.get('tab') === 'entry' || sp.get('tab') === 'daily'),
  },
  {
    title: 'Production Sheet',
    href: '/floor/production',
    icon: 'bi-clipboard-data',
    activeCheck: (p, sp) =>
      p === '/floor/production' &&
      (!sp.get('tab') || sp.get('tab') === 'sheet'),
  },
  {
    title: 'Looms',
    href: '/floor/production?tab=looms',
    icon: 'bi-gear-wide-connected',
    activeCheck: (p, sp) => p === '/floor/production' && sp.get('tab') === 'looms',
  },
  {
    title: 'Beams',
    href: '/floor/production?tab=beams',
    icon: 'bi-layers',
    activeCheck: (p, sp) =>
      p === '/floor/production' &&
      (sp.get('tab') === 'beams' || sp.get('tab') === 'beam-stock'),
  },
  {
    title: 'Yarn Stock',
    href: '/floor/production?tab=yarn',
    icon: 'bi-box-seam',
    activeCheck: (p, sp) =>
      p === '/floor/production' &&
      (sp.get('tab') === 'yarn' || sp.get('tab') === 'weft-stock'),
  },
  {
    title: 'Quality',
    href: '/floor/production?tab=quality',
    icon: 'bi-tags',
    activeCheck: (p, sp) =>
      p === '/floor/production' &&
      (sp.get('tab') === 'quality' || sp.get('tab') === 'qualities'),
  },
  {
    title: 'Tracking',
    href: '/floor/reports/total',
    icon: 'bi-grid-3x3-gap',
    activeCheck: (p) => p.startsWith('/floor/reports'),
  },
]

const ACCOUNTS_ITEMS: NavLeaf[] = [
  {
    title: 'Cost Statement',
    href: '/accounts/cost-statement',
    icon: 'bi-file-earmark-bar-graph',
    activeCheck: (p) => p === '/accounts/cost-statement',
  },
  {
    title: 'Traders Synopsis',
    href: '/accounts/traders',
    icon: 'bi-shop',
    activeCheck: (p) => p.startsWith('/accounts/traders') || p.startsWith('/accounts/trader-ledger'),
  },
  {
    title: 'Daily Inward Expenses',
    href: '/accounts/daily-expense',
    icon: 'bi-receipt',
    activeCheck: (p) => p === '/accounts/daily-expense',
  },
  {
    title: 'Petty Cash Journal',
    href: '/accounts/petty-cash',
    icon: 'bi-wallet2',
    activeCheck: (p) => p.startsWith('/accounts/petty-cash'),
  },
  {
    title: 'Store Inventory Control',
    href: '/accounts/inventory-inward',
    icon: 'bi-box-seam',
    activeCheck: (p) => p === '/accounts/inventory-inward',
  },
  {
    title: 'Monthly Purchases',
    href: '/accounts/reports/monthly-purchases',
    icon: 'bi-graph-up-arrow',
    activeCheck: (p) => p.startsWith('/accounts/reports'),
  },
]

const PAYROLL_ITEMS: NavLeaf[] = [
  {
    title: 'HR & CNIC Profiles',
    href: '/payroll/profiles',
    icon: 'bi-person-vcard',
    activeCheck: (p) => p === '/payroll/profiles',
  },
  {
    title: 'General Wages',
    href: '/payroll/employees',
    icon: 'bi-people',
    activeCheck: (p) => p === '/payroll/employees',
  },
  {
    title: 'Advance (Peshgi)',
    href: '/payroll/advances',
    icon: 'bi-cash-coin',
    activeCheck: (p) => p === '/payroll/advances',
  },
  {
    title: 'Staff Salary & OT',
    href: '/payroll/staff',
    icon: 'bi-briefcase',
    activeCheck: (p) => p === '/payroll/staff',
  },
  {
    title: 'Contract Employees',
    href: '/payroll/contract?tab=employees',
    icon: 'bi-person-badge',
    activeCheck: (p, sp) =>
      p === '/payroll/contract' && (!sp.get('tab') || sp.get('tab') === 'employees'),
  },
  {
    title: 'Contract OverTime',
    href: '/payroll/contract?tab=overtime',
    icon: 'bi-clock-history',
    activeCheck: (p, sp) => p === '/payroll/contract' && sp.get('tab') === 'overtime',
  },
  {
    title: 'Efficency',
    href: '/payroll/efficiency',
    icon: 'bi-trophy',
    activeCheck: (p) => p === '/payroll/efficiency',
  },
  {
    title: 'Net Payment Contract 1 to 31',
    href: '/payroll/contract?tab=net-payment',
    icon: 'bi-cash-stack',
    activeCheck: (p, sp) => p === '/payroll/contract' && sp.get('tab') === 'net-payment',
  },
  {
    title: 'Weawers Wages 1 to 15',
    href: '/payroll/weavers?tab=wages&fortnight=1-15',
    icon: 'bi-scissors',
    activeCheck: (p, sp) =>
      p === '/payroll/weavers' &&
      sp.get('fortnight') !== '16-31' &&
      (!sp.get('tab') || sp.get('tab') === 'wages'),
  },
  {
    title: 'Weawers OT 1 to 15',
    href: '/payroll/weavers?tab=overtime&fortnight=1-15',
    icon: 'bi-clock',
    activeCheck: (p, sp) =>
      p === '/payroll/weavers' &&
      sp.get('fortnight') !== '16-31' &&
      sp.get('tab') === 'overtime',
  },
  {
    title: 'Net Payment Weawers 1 To 15',
    href: '/payroll/weavers?tab=net-payment&fortnight=1-15',
    icon: 'bi-cash',
    activeCheck: (p, sp) =>
      p === '/payroll/weavers' &&
      sp.get('fortnight') !== '16-31' &&
      sp.get('tab') === 'net-payment',
  },
  {
    title: 'Helper Wages 1 to 15',
    href: '/payroll/helpers?fortnight=1-15',
    icon: 'bi-person-plus',
    activeCheck: (p, sp) => p === '/payroll/helpers' && sp.get('fortnight') !== '16-31',
  },
  {
    title: 'Contractor 1 to 15',
    href: '/payroll/contractors?fortnight=1-15',
    icon: 'bi-hammer',
    activeCheck: (p, sp) => p === '/payroll/contractors' && sp.get('fortnight') !== '16-31',
  },
  {
    title: 'Petty Cash 1 to 15',
    href: '/payroll/petty-cash?fortnight=1-15',
    icon: 'bi-wallet',
    activeCheck: (p, sp) => p === '/payroll/petty-cash' && sp.get('fortnight') !== '16-31',
  },
  {
    title: 'Synopsis 1 to 15',
    href: '/payroll/synopsis?fortnight=1-15',
    icon: 'bi-file-earmark-spreadsheet',
    activeCheck: (p, sp) => p === '/payroll/synopsis' && sp.get('fortnight') === '1-15',
  },
  {
    title: 'Weawers Wages 16 to 31',
    href: '/payroll/weavers?tab=wages&fortnight=16-31',
    icon: 'bi-scissors',
    activeCheck: (p, sp) =>
      p === '/payroll/weavers' &&
      sp.get('fortnight') === '16-31' &&
      (!sp.get('tab') || sp.get('tab') === 'wages'),
  },
  {
    title: 'Weawers OT 16 to 31',
    href: '/payroll/weavers?tab=overtime&fortnight=16-31',
    icon: 'bi-clock',
    activeCheck: (p, sp) =>
      p === '/payroll/weavers' &&
      sp.get('fortnight') === '16-31' &&
      sp.get('tab') === 'overtime',
  },
  {
    title: 'Net Payment Weawers 16 to 31',
    href: '/payroll/weavers?tab=net-payment&fortnight=16-31',
    icon: 'bi-cash',
    activeCheck: (p, sp) =>
      p === '/payroll/weavers' &&
      sp.get('fortnight') === '16-31' &&
      sp.get('tab') === 'net-payment',
  },
  {
    title: 'Helper Wages 16 to 31',
    href: '/payroll/helpers?fortnight=16-31',
    icon: 'bi-person-plus',
    activeCheck: (p, sp) => p === '/payroll/helpers' && sp.get('fortnight') === '16-31',
  },
  {
    title: 'Contracter 16 to 31',
    href: '/payroll/contractors?fortnight=16-31',
    icon: 'bi-hammer',
    activeCheck: (p, sp) => p === '/payroll/contractors' && sp.get('fortnight') === '16-31',
  },
  {
    title: 'Petty Cash 16 to 31',
    href: '/payroll/petty-cash?fortnight=16-31',
    icon: 'bi-wallet',
    activeCheck: (p, sp) => p === '/payroll/petty-cash' && sp.get('fortnight') === '16-31',
  },
  {
    title: 'Synopsis 16 to 31',
    href: '/payroll/synopsis?fortnight=16-31',
    icon: 'bi-file-earmark-spreadsheet',
    activeCheck: (p, sp) => p === '/payroll/synopsis' && sp.get('fortnight') === '16-31',
  },
  {
    title: 'Monthly Summery',
    href: '/payroll/synopsis?fortnight=grand',
    icon: 'bi-calendar-month',
    activeCheck: (p, sp) => p === '/payroll/synopsis' && sp.get('fortnight') === 'grand',
  },
]

const ADMIN_ITEMS: NavLeaf[] = [
  {
    title: 'Approvals',
    href: '/admin/approvals',
    icon: 'bi-check2-square',
    activeCheck: (p) => p.startsWith('/admin/approvals'),
  },
  {
    title: 'Roles',
    href: '/admin/roles',
    icon: 'bi-person-gear',
    activeCheck: (p) => p.startsWith('/admin/roles'),
  },
  {
    title: 'Permissions',
    href: '/admin/permissions',
    icon: 'bi-key',
    activeCheck: (p) => p.startsWith('/admin/permissions'),
  },
]

function SidebarContent() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { isQualityController, canViewAccounts, isAdmin, isAccountant } = useAuth()

  useEffect(() => {
    ensureSidebarOverlay()
    // Start closed on mobile so content is usable
    if (isSidebarMobileViewport()) {
      closeSidebar()
    }
  }, [])

  useEffect(() => {
    if (isSidebarMobileViewport()) {
      closeSidebar()
    }
  }, [pathname, searchParams])

  const trees: NavTree[] = useMemo(() => {
    const floorItems = isAccountant
      ? FLOOR_ITEMS.filter((item) => item.title === 'Production Sheet')
      : FLOOR_ITEMS

    const list: NavTree[] = [
      {
        title: 'Production',
        icon: 'bi-buildings',
        items: floorItems,
      },
    ]
    if (!isQualityController && canViewAccounts) {
      list.push(
        {
          title: 'Accounts',
          icon: 'bi-calculator',
          items: ACCOUNTS_ITEMS,
        },
        {
          title: 'Salary & Wages',
          icon: 'bi-cash-stack',
          items: PAYROLL_ITEMS,
        }
      )
    }
    if (isAdmin) {
      list.push({
        title: 'Administration',
        icon: 'bi-shield-lock',
        items: ADMIN_ITEMS,
      })
    }
    return list
  }, [isQualityController, canViewAccounts, isAdmin, isAccountant])

  const isDashboard = pathname === '/dashboard' || pathname.startsWith('/dashboard/')

  return (
    <aside className="app-sidebar bg-body-secondary shadow" data-bs-theme="dark">
      <div className="sidebar-brand d-flex align-items-center justify-content-between pe-2">
        <Link href="/dashboard" className="brand-link flex-grow-1">
          <img
            src="/saralogo.webp"
            alt="Sara Textile"
            className="brand-image opacity-75 shadow"
            style={{ maxHeight: 33, objectFit: 'contain' }}
          />
          <span className="brand-text fw-light">Sara Textile</span>
        </Link>
        <button
          type="button"
          className="btn btn-link text-white text-decoration-none d-lg-none p-2 ms-1"
          aria-label="Close sidebar"
          title="Close menu"
          onClick={() => closeSidebar()}
        >
          <i className="bi bi-chevron-double-left fs-5" />
        </button>
      </div>

      <div className="sidebar-wrapper">
        <nav className="mt-2">
          <ul
            className="nav sidebar-menu flex-column"
            data-lte-toggle="treeview"
            role="navigation"
            data-accordion="false"
          >
            <li className="nav-header">MAIN</li>
            <li className="nav-item">
              <Link
                href="/dashboard"
                className={cn('nav-link', isDashboard && 'active')}
                onClick={() => {
                  if (isSidebarMobileViewport()) closeSidebar()
                }}
              >
                <i className="nav-icon bi bi-speedometer2" />
                <p>Dashboard</p>
              </Link>
            </li>

            {trees.map((tree) => {
              const groupActive = tree.items.some((item) =>
                item.activeCheck(pathname, searchParams)
              )
              return (
                <li
                  key={tree.title}
                  className={cn('nav-item', groupActive && 'menu-open')}
                >
                  <a
                    href="#"
                    className={cn('nav-link', groupActive && 'active')}
                    onClick={(e) => e.preventDefault()}
                  >
                    <i className={cn('nav-icon bi', tree.icon)} />
                    <p>
                      {tree.title}
                      <i className="nav-arrow bi bi-chevron-right" />
                    </p>
                  </a>
                  <ul className="nav nav-treeview">
                    {tree.items.map((item) => {
                      const active = item.activeCheck(pathname, searchParams)
                      return (
                        <li className="nav-item" key={item.href}>
                          <Link
                            href={item.href}
                            className={cn('nav-link', active && 'active')}
                            onClick={() => {
                              if (isSidebarMobileViewport()) closeSidebar()
                            }}
                          >
                            <i className={cn('nav-icon bi', item.icon)} />
                            <p>{item.title}</p>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </aside>
  )
}

export function Sidebar() {
  return (
    <Suspense
      fallback={
        <aside className="app-sidebar bg-body-secondary shadow" data-bs-theme="dark">
          <div className="sidebar-brand">
            <span className="brand-link">
              <span className="brand-text fw-light">Sara Textile</span>
            </span>
          </div>
        </aside>
      }
    >
      <SidebarContent />
    </Suspense>
  )
}
