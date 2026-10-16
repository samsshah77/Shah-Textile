'use client'

import { useRef, useEffect, Suspense, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { usePayrollDirtyContextOptional } from '@/context/PayrollDirtyContext'

export interface SheetTabInfo {
  sheetNumber: number
  name: string
  href: string
  activeCheck: (pathname: string, searchParams: URLSearchParams) => boolean
}

export const SALARY_EXCEL_SHEETS: SheetTabInfo[] = [
  {
    sheetNumber: 1,
    name: 'General Wages',
    href: '/payroll/employees',
    activeCheck: (p) => p === '/payroll/employees',
  },
  {
    sheetNumber: 2,
    name: 'Advance',
    href: '/payroll/advances',
    activeCheck: (p) => p === '/payroll/advances',
  },
  {
    sheetNumber: 3,
    name: 'Staff Salary And OverTime',
    href: '/payroll/staff',
    activeCheck: (p) => p === '/payroll/staff',
  },
  {
    sheetNumber: 4,
    name: 'Contract Employees',
    href: '/payroll/contract?tab=employees',
    activeCheck: (p, sp) =>
      p === '/payroll/contract' && (!sp.get('tab') || sp.get('tab') === 'employees'),
  },
  {
    sheetNumber: 5,
    name: 'Contract OverTime',
    href: '/payroll/contract?tab=overtime',
    activeCheck: (p, sp) => p === '/payroll/contract' && sp.get('tab') === 'overtime',
  },
  {
    sheetNumber: 6,
    name: 'Efficency',
    href: '/payroll/efficiency',
    activeCheck: (p) => p === '/payroll/efficiency',
  },
  {
    sheetNumber: 7,
    name: 'Net Payment Contract 1 to 31',
    href: '/payroll/contract?tab=net-payment',
    activeCheck: (p, sp) => p === '/payroll/contract' && sp.get('tab') === 'net-payment',
  },
  {
    sheetNumber: 8,
    name: 'Weawers Wages 1 to 15',
    href: '/payroll/weavers?tab=wages&fortnight=1-15',
    activeCheck: (p, sp) =>
      p === '/payroll/weavers' &&
      sp.get('fortnight') !== '16-31' &&
      (!sp.get('tab') || sp.get('tab') === 'wages'),
  },
  {
    sheetNumber: 9,
    name: 'Weawers OT 1 to 15',
    href: '/payroll/weavers?tab=overtime&fortnight=1-15',
    activeCheck: (p, sp) =>
      p === '/payroll/weavers' &&
      sp.get('fortnight') !== '16-31' &&
      sp.get('tab') === 'overtime',
  },
  {
    sheetNumber: 10,
    name: 'Net Payment Weawers 1 To 15',
    href: '/payroll/weavers?tab=net-payment&fortnight=1-15',
    activeCheck: (p, sp) =>
      p === '/payroll/weavers' &&
      sp.get('fortnight') !== '16-31' &&
      sp.get('tab') === 'net-payment',
  },
  {
    sheetNumber: 11,
    name: 'Helper Wages 1 to 15',
    href: '/payroll/helpers?fortnight=1-15',
    activeCheck: (p, sp) =>
      p === '/payroll/helpers' && sp.get('fortnight') !== '16-31',
  },
  {
    sheetNumber: 12,
    name: 'Contractor 1 to 15',
    href: '/payroll/contractors?fortnight=1-15',
    activeCheck: (p, sp) =>
      p === '/payroll/contractors' && sp.get('fortnight') !== '16-31',
  },
  {
    sheetNumber: 13,
    name: 'Petty Cash 1 to 15',
    href: '/payroll/petty-cash?fortnight=1-15',
    activeCheck: (p, sp) =>
      p === '/payroll/petty-cash' && sp.get('fortnight') !== '16-31',
  },
  {
    sheetNumber: 14,
    name: 'Synopsis 1 to 15',
    href: '/payroll/synopsis?fortnight=1-15',
    activeCheck: (p, sp) =>
      p === '/payroll/synopsis' && sp.get('fortnight') === '1-15',
  },
  {
    sheetNumber: 15,
    name: 'Weawers Wages 16 to 31',
    href: '/payroll/weavers?tab=wages&fortnight=16-31',
    activeCheck: (p, sp) =>
      p === '/payroll/weavers' &&
      sp.get('fortnight') === '16-31' &&
      (!sp.get('tab') || sp.get('tab') === 'wages'),
  },
  {
    sheetNumber: 16,
    name: 'Weawers OT 16 to 31',
    href: '/payroll/weavers?tab=overtime&fortnight=16-31',
    activeCheck: (p, sp) =>
      p === '/payroll/weavers' &&
      sp.get('fortnight') === '16-31' &&
      sp.get('tab') === 'overtime',
  },
  {
    sheetNumber: 17,
    name: 'Net Payment Weawers 16 to 31',
    href: '/payroll/weavers?tab=net-payment&fortnight=16-31',
    activeCheck: (p, sp) =>
      p === '/payroll/weavers' &&
      sp.get('fortnight') === '16-31' &&
      sp.get('tab') === 'net-payment',
  },
  {
    sheetNumber: 18,
    name: 'Helper Wages 16 to 31',
    href: '/payroll/helpers?fortnight=16-31',
    activeCheck: (p, sp) =>
      p === '/payroll/helpers' && sp.get('fortnight') === '16-31',
  },
  {
    sheetNumber: 19,
    name: 'Contracter 16 to 31',
    href: '/payroll/contractors?fortnight=16-31',
    activeCheck: (p, sp) =>
      p === '/payroll/contractors' && sp.get('fortnight') === '16-31',
  },
  {
    sheetNumber: 20,
    name: 'Petty Cash 16 to 31',
    href: '/payroll/petty-cash?fortnight=16-31',
    activeCheck: (p, sp) =>
      p === '/payroll/petty-cash' && sp.get('fortnight') === '16-31',
  },
  {
    sheetNumber: 21,
    name: 'Synopsis 16 to 31',
    href: '/payroll/synopsis?fortnight=16-31',
    activeCheck: (p, sp) =>
      p === '/payroll/synopsis' && sp.get('fortnight') === '16-31',
  },
  {
    sheetNumber: 22,
    name: 'Monthly Summery',
    href: '/payroll/synopsis?fortnight=grand',
    activeCheck: (p, sp) =>
      p === '/payroll/synopsis' && sp.get('fortnight') === 'grand',
  },
]

export const PRODUCTION_EXCEL_SHEETS: SheetTabInfo[] = [
  {
    sheetNumber: 1,
    name: 'Daily Entry',
    href: '/floor/production?tab=entry',
    activeCheck: (p, sp) =>
      p === '/floor/production' &&
      (sp.get('tab') === 'entry' || sp.get('tab') === 'daily'),
  },
  {
    sheetNumber: 2,
    name: 'Production Sheet',
    href: '/floor/production',
    activeCheck: (p, sp) =>
      p === '/floor/production' &&
      (!sp.get('tab') || sp.get('tab') === 'sheet'),
  },
  {
    sheetNumber: 3,
    name: 'Looms',
    href: '/floor/production?tab=looms',
    activeCheck: (p, sp) => p === '/floor/production' && sp.get('tab') === 'looms',
  },
  {
    sheetNumber: 4,
    name: 'Beams',
    href: '/floor/production?tab=beams',
    activeCheck: (p, sp) =>
      p === '/floor/production' &&
      (sp.get('tab') === 'beams' || sp.get('tab') === 'beam-stock'),
  },
  {
    sheetNumber: 5,
    name: 'Yarn Stock',
    href: '/floor/production?tab=yarn',
    activeCheck: (p, sp) =>
      p === '/floor/production' &&
      (sp.get('tab') === 'yarn' || sp.get('tab') === 'weft-stock'),
  },
  {
    sheetNumber: 6,
    name: 'Quality',
    href: '/floor/production?tab=quality',
    activeCheck: (p, sp) =>
      p === '/floor/production' &&
      (sp.get('tab') === 'quality' || sp.get('tab') === 'qualities'),
  },
  {
    sheetNumber: 7,
    name: 'Tracking',
    href: '/floor/reports/total',
    activeCheck: (p) => p.startsWith('/floor/reports'),
  },
  {
    sheetNumber: 8,
    name: 'Fabric Fault',
    href: '/floor/production?tab=fabric-fault',
    activeCheck: (p, sp) =>
      p === '/floor/production' && sp.get('tab') === 'fabric-fault',
  },
]

export const ACCOUNTS_EXCEL_SHEETS: SheetTabInfo[] = [
  {
    sheetNumber: 1,
    name: 'Store Inventory Control',
    href: '/accounts/inventory-inward',
    activeCheck: (p) => p === '/accounts/inventory-inward',
  },
  {
    sheetNumber: 2,
    name: 'Daily Inward Exp',
    href: '/accounts/daily-expense',
    activeCheck: (p) => p === '/accounts/daily-expense',
  },
  {
    sheetNumber: 3,
    name: 'Traders',
    href: '/accounts/traders',
    activeCheck: (p) => p.startsWith('/accounts/traders') || p.startsWith('/accounts/trader-ledger'),
  },
  {
    sheetNumber: 4,
    name: 'Workshops',
    href: '/accounts/workshops',
    activeCheck: (p) => p.startsWith('/accounts/workshops'),
  },
  {
    sheetNumber: 5,
    name: 'Petty Cash',
    href: '/accounts/petty-cash',
    activeCheck: (p) => p.startsWith('/accounts/petty-cash'),
  },
  {
    sheetNumber: 6,
    name: 'Monthly Purchases',
    href: '/accounts/reports/monthly-purchases',
    activeCheck: (p) => p.startsWith('/accounts/reports/monthly-purchases'),
  },
  {
    sheetNumber: 7,
    name: 'Final Cost Statement',
    href: '/accounts/cost-statement',
    activeCheck: (p) => p === '/accounts/cost-statement',
  },
]

export const EXCEL_SHEETS = SALARY_EXCEL_SHEETS

function ExcelSheetTabBarContent() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<HTMLAnchorElement>(null)
  const { isQualityController, isAccountant } = useAuth()
  const dirtyContext = usePayrollDirtyContextOptional()
  const hasUnsavedChanges = dirtyContext?.hasUnsavedChanges ?? false
  const dirtyCount = dirtyContext?.dirtyCount ?? 0

  const isProduction = pathname.startsWith('/floor') || pathname.startsWith('/production')
  const isAccounts = pathname.startsWith('/accounts')

  const currentSheets = useMemo(() => {
    let sheets: SheetTabInfo[]
    if (isQualityController || isProduction) {
      sheets = PRODUCTION_EXCEL_SHEETS
    } else if (isAccounts) {
      sheets = ACCOUNTS_EXCEL_SHEETS
    } else {
      sheets = SALARY_EXCEL_SHEETS
    }
    if (isAccountant && isProduction) {
      sheets = sheets.filter((s) => s.name === 'Production Sheet')
    }
    return sheets
  }, [isQualityController, isAccountant, isProduction, isAccounts])

  // Smooth auto-scroll active tab into view
  useEffect(() => {
    if (activeTabRef.current && scrollContainerRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [pathname, searchParams, currentSheets])

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
    <div className="sara-sheet-tabs d-print-none">
      <div className="d-flex align-items-stretch">
        <button
          type="button"
          onClick={scrollLeft}
          className="sara-sheet-tabs__scroll"
          title="Scroll left"
        >
          <i className="bi bi-chevron-left" />
        </button>
        <div
          ref={scrollContainerRef}
          className="flex-grow-1 overflow-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          <ul className="nav nav-tabs flex-nowrap border-0 mb-0" style={{ minWidth: 'max-content' }}>
            {currentSheets.map((sheet) => {
              const isActive = sheet.activeCheck(pathname, searchParams)
              return (
                <li className="nav-item" key={sheet.sheetNumber}>
                  <Link
                    href={sheet.href}
                    ref={isActive ? activeTabRef : undefined}
                    onClick={(e) => {
                      if (!isActive && hasUnsavedChanges && dirtyContext) {
                        e.preventDefault()
                        dirtyContext.confirmDiscardAndNavigate(sheet.href)
                      }
                    }}
                    className={`nav-link sara-sheet-tabs__link ${isActive ? 'active' : ''}`}
                  >
                    <span>{sheet.name}</span>
                    {isActive && hasUnsavedChanges && (
                      <span
                        className="badge rounded-pill bg-warning text-dark ms-1.5 px-1.5 py-0.5 text-[10px] font-bold"
                        title={`${dirtyCount} unsaved changes`}
                      >
                        {dirtyCount}
                      </span>
                    )}
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
        >
          <i className="bi bi-chevron-right" />
        </button>
      </div>
    </div>
  )
}

export function ExcelSheetTabBar() {
  return (
    <Suspense
      fallback={<div className="sara-sheet-tabs" style={{ height: 52 }} />}
    >
      <ExcelSheetTabBarContent />
    </Suspense>
  )
}
