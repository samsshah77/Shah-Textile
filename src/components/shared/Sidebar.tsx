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
  /** A sub-menu inside a group (Administration → Salary / Accounts for the admin). */
  children?: NavLeaf[]
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
    activeCheck: (p) => p.startsWith('/floor/reports') && !p.startsWith('/floor/reports/check'),
  },
  {
    title: 'Data Check',
    href: '/floor/reports/check',
    icon: 'bi-clipboard-check',
    activeCheck: (p) => p.startsWith('/floor/reports/check'),
  },
  {
    title: 'Fabric Fault',
    href: '/floor/production?tab=fabric-fault',
    icon: 'bi-exclamation-diamond',
    activeCheck: (p, sp) =>
      p === '/floor/production' && sp.get('tab') === 'fabric-fault',
  },
  {
    title: 'Kamran Fault',
    href: '/floor/fault-reports',
    icon: 'bi-camera-video',
    activeCheck: (p) => p.startsWith('/floor/fault-reports'),
  },
]

const ACCOUNTS_ITEMS: NavLeaf[] = [
  {
    title: 'Daily Inward & Expenses',
    href: '/accounts/inventory-inward',
    icon: 'bi-journal-arrow-down',
    activeCheck: (p) => p === '/accounts/inventory-inward' || p === '/accounts/daily-expense',
  },
  {
    title: 'Traders Synopsis',
    href: '/accounts/traders',
    icon: 'bi-shop',
    activeCheck: (p) => p.startsWith('/accounts/traders') || p.startsWith('/accounts/trader-ledger'),
  },
  {
    title: 'Workshops Ledger',
    href: '/accounts/workshops',
    icon: 'bi-tools',
    activeCheck: (p) => p.startsWith('/accounts/workshops'),
  },
  {
    title: 'Payables (A/P Synopsis)',
    href: '/accounts/payables',
    icon: 'bi-cash-stack',
    activeCheck: (p) => p.startsWith('/accounts/payables'),
  },
  {
    title: 'Petty Cash Journal',
    href: '/accounts/petty-cash',
    icon: 'bi-wallet2',
    activeCheck: (p) => p.startsWith('/accounts/petty-cash'),
  },
  {
    title: 'Final Cost Statement',
    href: '/accounts/cost-statement',
    icon: 'bi-file-earmark-bar-graph',
    activeCheck: (p) => p === '/accounts/cost-statement',
  },
]

const PAYROLL_ITEMS: NavLeaf[] = [
  {
    title: 'HR & CNIC Profiles',
    href: '/payroll/profiles',
    icon: 'bi-person-vcard',
    activeCheck: (p) => p === '/payroll/profiles' || p.startsWith('/payroll/profiles/'),
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
    title: 'Net Payment Contract',
    href: '/payroll/contract?tab=net-payment',
    icon: 'bi-cash-stack',
    activeCheck: (p, sp) => p === '/payroll/contract' && sp.get('tab') === 'net-payment',
  },
  {
    title: 'Weavers',
    href: '/payroll/weavers',
    icon: 'bi-scissors',
    activeCheck: (p) => p === '/payroll/weavers' || p.startsWith('/payroll/weavers'),
  },
  {
    title: 'Helpers',
    href: '/payroll/helpers',
    icon: 'bi-person-plus',
    activeCheck: (p) => p === '/payroll/helpers',
  },
  {
    title: 'Contractors',
    href: '/payroll/contractors',
    icon: 'bi-hammer',
    activeCheck: (p) => p === '/payroll/contractors',
  },
  {
    title: 'Synopsis',
    href: '/payroll/synopsis',
    icon: 'bi-file-earmark-spreadsheet',
    activeCheck: (p) => p === '/payroll/synopsis',
  },
  {
    title: 'Data Check',
    href: '/payroll/data-check',
    icon: 'bi-clipboard-check',
    activeCheck: (p) => p === '/payroll/data-check',
  },
]

const ADMIN_ITEMS: NavLeaf[] = [
  {
    title: 'Users',
    href: '/admin/users',
    icon: 'bi-people',
    activeCheck: (p) => p.startsWith('/admin/users') || p.startsWith('/admin/approvals'),
  },
  {
    title: 'Roles & Permissions',
    href: '/admin/roles',
    icon: 'bi-person-gear',
    activeCheck: (p) => p.startsWith('/admin/roles') || p.startsWith('/admin/permissions'),
  },
  {
    title: 'System',
    href: '/admin/system',
    icon: 'bi-hdd-stack',
    activeCheck: (p) => p.startsWith('/admin/system'),
  },
  {
    title: 'Audit log',
    href: '/admin/audit',
    icon: 'bi-clock-history',
    activeCheck: (p) => p.startsWith('/admin/audit'),
  },
]

const anyActive = (items: NavLeaf[]) => (p: string, sp: URLSearchParams) => items.some((i) => i.activeCheck(p, sp))

const closeOnMobile = () => {
  if (isSidebarMobileViewport()) closeSidebar()
}

/** One menu link, or a sub-menu (opens by itself when one of its pages is open). */
function NavItem({ item, pathname, searchParams }: { item: NavLeaf; pathname: string; searchParams: URLSearchParams }) {
  const active = item.activeCheck(pathname, searchParams)
  if (!item.children) {
    return (
      <li className="nav-item">
        <Link href={item.href} className={cn('nav-link', active && 'active')} onClick={closeOnMobile}>
          <i className={cn('nav-icon bi', item.icon)} />
          <p>{item.title}</p>
        </Link>
      </li>
    )
  }
  return (
    <li className={cn('nav-item', active && 'menu-open')}>
      <a href="#" className={cn('nav-link', active && 'active')} onClick={(e) => e.preventDefault()}>
        <i className={cn('nav-icon bi', item.icon)} />
        <p>
          {item.title}
          <i className="nav-arrow bi bi-chevron-right" />
        </p>
      </a>
      <ul className="nav nav-treeview ps-2">
        {item.children.map((child) => (
          <NavItem key={child.href} item={child} pathname={pathname} searchParams={searchParams} />
        ))}
      </ul>
    </li>
  )
}

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
    if (isAdmin) {
      // Admin (Javed): Salary and Accounts live inside Administration.
      list.push({
        title: 'Administration',
        icon: 'bi-shield-lock',
        items: [
          ...ADMIN_ITEMS,
          ...(canViewAccounts
            ? [
                {
                  title: 'Salary & Wages',
                  href: '/payroll/synopsis',
                  icon: 'bi-cash-stack',
                  activeCheck: anyActive(PAYROLL_ITEMS),
                  children: PAYROLL_ITEMS,
                },
                {
                  title: 'Accounts',
                  href: '/accounts/payables',
                  icon: 'bi-calculator',
                  activeCheck: anyActive(ACCOUNTS_ITEMS),
                  children: ACCOUNTS_ITEMS,
                },
              ]
            : []),
        ],
      })
    } else if (!isQualityController && canViewAccounts) {
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
    return list
  }, [isQualityController, canViewAccounts, isAdmin, isAccountant])

  const isDashboard = pathname === '/dashboard' || pathname.startsWith('/dashboard/')

  return (
    <aside className="app-sidebar bg-body-secondary shadow" data-bs-theme="dark">
      <div className="sidebar-brand d-flex align-items-center justify-content-between pe-2">
        <Link href="/dashboard" className="brand-link flex-grow-1">
          <img
            src="/saratextile.png"
            alt="Sara Textile"
            className="brand-image shadow"
            style={{ maxHeight: 36, width: 36, objectFit: 'contain', borderRadius: 6 }}
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
                    {tree.items.map((item) => (
                      <NavItem key={item.href} item={item} pathname={pathname} searchParams={searchParams} />
                    ))}
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
