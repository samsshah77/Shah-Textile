'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import type { AccessArea } from '@/lib/access'
import { markVerifiedSeen, newVerifiedCount, VERIFIED_SEEN_EVENT, verifiedSeenAt } from '@/lib/floor/yarnSupply'
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
  badge?: number | null
  badgeClass?: string
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
    title: 'Active Qualities',
    href: '/floor/production?tab=quality',
    icon: 'bi-tags',
    activeCheck: (p, sp) =>
      p === '/floor/production' &&
      (sp.get('tab') === 'quality' || sp.get('tab') === 'qualities'),
  },
  {
    title: 'Quality Ends',
    href: '/floor/production?tab=quality-ends',
    icon: 'bi-flag',
    activeCheck: (p, sp) => p === '/floor/production' && sp.get('tab') === 'quality-ends',
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
      (p === '/floor/production' && sp.get('tab') === 'fabric-fault') || p.startsWith('/floor/fault-reports'),
  },
]

/** Yarn Supply module (the supplier, and Javed Sir with View): its tabs on the side. */
const SUPPLIER_YARN_ITEMS: NavLeaf[] = [
  {
    title: 'Requests from Sara Textile',
    href: '/yarn-supply?tab=requests',
    icon: 'bi-clipboard-check',
    activeCheck: (p, sp) => p === '/yarn-supply' && (!sp.get('tab') || sp.get('tab') === 'requests'),
  },
  {
    title: 'Sent — waiting',
    href: '/yarn-supply?tab=sent',
    icon: 'bi-hourglass-split',
    activeCheck: (p, sp) => p === '/yarn-supply' && sp.get('tab') === 'sent',
  },
  {
    title: 'Verified',
    href: '/yarn-supply?tab=verified',
    icon: 'bi-check2-circle',
    activeCheck: (p, sp) => p === '/yarn-supply' && sp.get('tab') === 'verified',
  },
  {
    title: 'Send yarn',
    href: '/yarn-supply/send',
    icon: 'bi-send',
    activeCheck: (p) => p.startsWith('/yarn-supply/send'),
  },
  {
    title: 'Fazal Umer Inventory',
    href: '/yarn-supply/store?tab=stock',
    icon: 'bi-shop',
    activeCheck: (p, sp) => p.startsWith('/yarn-supply/store') && sp.get('tab') !== 'out',
  },
  {
    title: 'Sizing / Sectional Warping',
    href: '/yarn-supply/store?tab=out',
    icon: 'bi-diagram-3',
    activeCheck: (p, sp) => p.startsWith('/yarn-supply/store') && sp.get('tab') === 'out',
  },
  {
    title: 'Sara Textile stock',
    href: '/yarn-supply?tab=stock',
    icon: 'bi-box-seam',
    activeCheck: (p, sp) => p === '/yarn-supply' && sp.get('tab') === 'stock',
  },
]

/** Fabric Fault → Fault Add (Kamran's phone form), for someone without the Fault Table. */
const KAMRAN_FAULT_ITEM: NavLeaf = {
  title: 'Fabric Fault',
  href: '/floor/fault-reports',
  icon: 'bi-camera-video',
  activeCheck: (p) => p.startsWith('/floor/fault-reports'),
}

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
    title: 'Advance',
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
    title: 'Roles',
    href: '/admin/roles',
    icon: 'bi-person-gear',
    activeCheck: (p) => p.startsWith('/admin/roles'),
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
  {
    title: 'Permissions',
    href: '/admin/access',
    icon: 'bi-toggles',
    activeCheck: (p) => p.startsWith('/admin/access'),
  },
]

const QUALITY_ARCHIVE_ITEM: NavLeaf = {
  title: 'Quality Archive',
  href: '/quality-archive',
  icon: 'bi-archive',
  activeCheck: (p) => p.startsWith('/quality-archive') || p.startsWith('/admin/quality-archive'),
}

/** Which Permission area each Production menu entry belongs to ("any" = any production tab). */
const FLOOR_ITEM_AREA: Record<string, AccessArea | 'any'> = {
  'Daily Entry': 'prod_entry',
  'Production Sheet': 'prod_sheet',
  Looms: 'prod_looms',
  Beams: 'prod_beams',
  'Yarn Stock': 'prod_yarn',
  'Active Qualities': 'prod_quality',
  'Quality Ends': 'prod_quality',
  'Data Check': 'prod_entry',
  'Fabric Fault': 'prod_fabric_fault',
}

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
          <p className="d-flex align-items-center justify-content-between w-100">
            <span>{item.title}</span>
            {item.badge ? (
              <span className={cn('badge rounded-pill ms-auto', item.badgeClass || 'bg-primary text-white')}>{item.badge}</span>
            ) : null}
          </p>
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
  const { canViewAccounts, canViewPayroll, canViewProduction, canView, canEdit, isAdmin } = useAuth()

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

  // Menu follows Administration → Permissions: a hidden area is not in the menu.
  const showFault = canView('fault_reports')
  const showFaultTable = canView('prod_fabric_fault')
  const showTracking = canView('tracking')
  const showArchive = canView('quality_archive')
  const showYarnSupply = canView('yarn_supply')
  const canSendYarn = canEdit('yarn_supply')
  const areaKey = FLOOR_ITEMS.map((i) => {
    const area = FLOOR_ITEM_AREA[i.title]
    return area === 'any' ? (canViewProduction ? 1 : 0) : area && canView(area) ? 1 : 0
  }).join('')
  /** Only the fault page (Kamran): the old "Floor Fault" menu. */
  const faultOnly = showFault && !canViewProduction && !showTracking
  const supplierOnly = showYarnSupply && !canViewProduction && !showFault && !showTracking
  const showDashboard = canViewProduction || showTracking

  const [supplierCounts, setSupplierCounts] = useState<{ requests: number; waiting: number }>({ requests: 0, waiting: 0 })
  const [verifiedLots, setVerifiedLots] = useState<Array<{ status: string; verifiedAt: string | null; destination?: string }>>([])
  const [seenAt, setSeenAt] = useState(() => verifiedSeenAt())
  useEffect(() => {
    const onSeen = () => setSeenAt(verifiedSeenAt())
    window.addEventListener(VERIFIED_SEEN_EVENT, onSeen)
    return () => window.removeEventListener(VERIFIED_SEEN_EVENT, onSeen)
  }, [])
  const newVerified = newVerifiedCount(verifiedLots, seenAt)
  const canSeeYarnSidebar = supplierOnly || showYarnSupply || areaKey[3] === '1'
  useEffect(() => {
    if (!canSeeYarnSidebar) return
    let alive = true
    const load = () => {
      fetch('/api/floor/yarn-supply', { credentials: 'same-origin', cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive || !d?.ok) return
          const reqs = Array.isArray(d.requests) ? d.requests.filter((q: { status?: string }) => q.status === 'OPEN').length : 0
          const wait = Array.isArray(d.dispatches) ? d.dispatches.filter((x: { status?: string }) => x.status !== 'VERIFIED').length : 0
          setSupplierCounts({ requests: reqs, waiting: wait })
          const lots = Array.isArray(d.dispatches) ? d.dispatches : []
          if (verifiedSeenAt() == null) markVerifiedSeen(lots)
          setVerifiedLots(lots)
        })
        .catch(() => undefined)
    }
    load()
    window.addEventListener('focus', load)
    const t = setInterval(load, 30_000)
    return () => {
      alive = false
      window.removeEventListener('focus', load)
      clearInterval(t)
    }
  }, [canSeeYarnSidebar, pathname])

  const trees: NavTree[] = useMemo(() => {
    // Yarn Supply module: the same tabs for the supplier and Javed Sir (Send yarn only with Edit).
    const yarnTree: NavTree = {
      title: 'Yarn Supply',
      icon: 'bi-truck',
      items: SUPPLIER_YARN_ITEMS.filter((item) => canSendYarn || item.href !== '/yarn-supply/send').map((item) => {
        if (item.href === '/yarn-supply?tab=requests') {
          return { ...item, badge: supplierCounts.requests, badgeClass: 'bg-primary text-white' }
        }
        if (item.href === '/yarn-supply?tab=sent') {
          return { ...item, badge: supplierCounts.waiting, badgeClass: 'bg-warning text-dark' }
        }
        if (item.href === '/yarn-supply?tab=verified') {
          return { ...item, badge: newVerified, badgeClass: 'bg-success text-white' }
        }
        return item
      }),
    }
    if (supplierOnly) return [yarnTree]
    if (faultOnly) {
      return [
        {
          title: 'Fabric Fault',
          icon: 'bi-camera-video',
          items: [{ ...KAMRAN_FAULT_ITEM, title: 'Fault Add' }],
        },
      ]
    }

    const floorItems: NavLeaf[] = [
      ...FLOOR_ITEMS.filter((_, idx) => areaKey[idx] === '1').map((item) =>
        item.title === 'Yarn Stock' && supplierCounts.waiting > 0
          ? { ...item, badge: supplierCounts.waiting, badgeClass: 'bg-warning text-dark' }
          : item
      ),
      // One "Fabric Fault" entry: the Fault Table when allowed (its tab bar opens Fault Add),
      // otherwise Fault Add alone.
      ...(showFault && !showFaultTable ? [KAMRAN_FAULT_ITEM] : []),
    ]

    const list: NavTree[] = []
    if (floorItems.length) {
      list.push({
        title: 'Production',
        icon: 'bi-buildings',
        items: floorItems,
      })
    }
    // Each module is its own menu: Yarn Supply, Accounts, Salary & Wages, then Administration.
    if (showYarnSupply) list.push(yarnTree)
    if (canViewAccounts) list.push({ title: 'Accounts', icon: 'bi-calculator', items: ACCOUNTS_ITEMS })
    if (canViewPayroll) list.push({ title: 'Salary & Wages', icon: 'bi-cash-stack', items: PAYROLL_ITEMS })
    if (isAdmin) {
      list.push({
        title: 'Administration',
        icon: 'bi-shield-lock',
        items: [...ADMIN_ITEMS, ...(showArchive ? [QUALITY_ARCHIVE_ITEM] : [])],
      })
    } else if (showArchive) {
      list.push({ title: 'System', icon: 'bi-archive', items: [QUALITY_ARCHIVE_ITEM] })
    }
    return list
  }, [faultOnly, supplierOnly, supplierCounts, newVerified, areaKey, showFault, showFaultTable, showArchive, showYarnSupply, canSendYarn, canViewAccounts, canViewPayroll, isAdmin])

  const isDashboard = pathname === '/dashboard' || pathname.startsWith('/dashboard/')

  return (
    <aside className="app-sidebar bg-body-secondary shadow" data-bs-theme="dark">
      <div className="sidebar-brand d-flex align-items-center justify-content-between pe-2">
        <Link href={showDashboard ? "/dashboard" : showFault ? "/floor/fault-reports" : showYarnSupply ? "/yarn-supply" : "/dashboard"} className="brand-link flex-grow-1">
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
            {showDashboard && (
              <>
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
                {showTracking && (
                  <li className="nav-item">
                    <Link
                      href="/floor/reports/total"
                      className={cn(
                        'nav-link',
                        pathname.startsWith('/floor/reports') && !pathname.startsWith('/floor/reports/check') && 'active'
                      )}
                      onClick={() => {
                        if (isSidebarMobileViewport()) closeSidebar()
                      }}
                    >
                      <i className="nav-icon bi bi-grid-3x3-gap" />
                      <p>Monthly Tracking</p>
                    </Link>
                  </li>
                )}
              </>
            )}

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
