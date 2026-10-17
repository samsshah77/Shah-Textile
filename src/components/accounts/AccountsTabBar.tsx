'use client'

import { useRef, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export interface AccountsTabItem {
  id: string
  label: string
  href: string
  icon: string
  activeCheck: (pathname: string) => boolean
}

export const ACCOUNTS_TABS: AccountsTabItem[] = [
  {
    id: 'inventory-inward',
    label: 'Daily Inward & Expenses',
    href: '/accounts/inventory-inward',
    icon: 'bi-journal-arrow-down',
    activeCheck: (p) => p === '/accounts/inventory-inward' || p === '/accounts/daily-expense',
  },
  {
    id: 'traders',
    label: 'Traders',
    href: '/accounts/traders',
    icon: 'bi-shop',
    activeCheck: (p) => p.startsWith('/accounts/traders') || p.startsWith('/accounts/trader-ledger'),
  },
  {
    id: 'workshops',
    label: 'Workshops',
    href: '/accounts/workshops',
    icon: 'bi-tools',
    activeCheck: (p) => p.startsWith('/accounts/workshops'),
  },
  {
    id: 'petty-cash',
    label: 'Petty Cash Journal',
    href: '/accounts/petty-cash',
    icon: 'bi-wallet2',
    activeCheck: (p) => p.startsWith('/accounts/petty-cash'),
  },
  {
    id: 'monthly-purchases',
    label: 'Monthly Purchases',
    href: '/accounts/reports/monthly-purchases',
    icon: 'bi-bar-chart-line',
    activeCheck: (p) => p.startsWith('/accounts/reports/monthly-purchases') || p === '/accounts/reports',
  },
  {
    id: 'cost-statement',
    label: 'Final Cost Statement',
    href: '/accounts/cost-statement',
    icon: 'bi-file-earmark-spreadsheet',
    activeCheck: (p) => p === '/accounts/cost-statement',
  },
]

function AccountsTabBarContent() {
  const pathname = usePathname()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    if (activeTabRef.current && scrollContainerRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [pathname])

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -220, behavior: 'smooth' })
    }
  }

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 220, behavior: 'smooth' })
    }
  }

  return (
    <div className="sara-sheet-tabs d-print-none mb-3">
      <div className="d-flex align-items-stretch">
        <button
          type="button"
          onClick={scrollLeft}
          className="sara-sheet-tabs__scroll"
          title="Scroll left"
          aria-label="Scroll tabs left"
        >
          <i className="bi bi-chevron-left" />
        </button>

        <div
          ref={scrollContainerRef}
          className="flex-grow-1 overflow-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          <ul className="nav nav-tabs flex-nowrap border-0 mb-0" style={{ minWidth: 'max-content' }}>
            {ACCOUNTS_TABS.map((tab) => {
              const isActive = tab.activeCheck(pathname)
              return (
                <li className="nav-item" key={tab.id}>
                  <Link
                    href={tab.href}
                    ref={isActive ? activeTabRef : undefined}
                    className={`nav-link sara-sheet-tabs__link d-inline-flex align-items-center gap-1.5 ${
                      isActive ? 'active' : ''
                    }`}
                  >
                    <i className={`bi ${tab.icon} text-primary`} style={{ fontSize: '0.9rem' }} />
                    <span className="fw-semibold">{tab.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>

        <button
          type="button"
          onClick={scrollRight}
          className="sara-sheet-tabs__scroll"
          title="Scroll right"
          aria-label="Scroll tabs right"
        >
          <i className="bi bi-chevron-right" />
        </button>
      </div>
    </div>
  )
}

export function AccountsTabBar() {
  return (
    <Suspense fallback={<div className="sara-sheet-tabs mb-3" style={{ height: 50 }} />}>
      <AccountsTabBarContent />
    </Suspense>
  )
}
