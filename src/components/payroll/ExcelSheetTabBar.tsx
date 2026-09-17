'use client'

import { useRef, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    href: '/',
    activeCheck: (p, sp) =>
      p === '/' || (p === '/payroll/synopsis' && sp.get('fortnight') === 'grand'),
  },
]

export const PRODUCTION_EXCEL_SHEETS: SheetTabInfo[] = [
  {
    sheetNumber: 1,
    name: 'Production',
    href: '/floor/production',
    activeCheck: (p, sp) =>
      p === '/floor/production' && (!sp.get('tab') || sp.get('tab') === 'daily'),
  },
  {
    sheetNumber: 2,
    name: 'Total',
    href: '/floor/production?tab=matrix',
    activeCheck: (p, sp) => p === '/floor/production' && sp.get('tab') === 'matrix',
  },
  {
    sheetNumber: 3,
    name: 'Chalan FOI',
    href: '/floor/challan',
    activeCheck: (p) => p.startsWith('/floor/challan'),
  },
  {
    sheetNumber: 4,
    name: 'Beem Stock',
    href: '/floor/production?tab=beam-stock',
    activeCheck: (p, sp) => p === '/floor/production' && sp.get('tab') === 'beam-stock',
  },
  {
    sheetNumber: 5,
    name: 'Weft Stock',
    href: '/floor/production?tab=weft-stock',
    activeCheck: (p, sp) => p === '/floor/production' && sp.get('tab') === 'weft-stock',
  },
  {
    sheetNumber: 6,
    name: 'Quality End Report',
    href: '/floor/production?tab=quality-end',
    activeCheck: (p, sp) => p === '/floor/production' && sp.get('tab') === 'quality-end',
  },
  {
    sheetNumber: 7,
    name: 'Active Qualities',
    href: '/floor/production?tab=qualities',
    activeCheck: (p, sp) => p === '/floor/production' && sp.get('tab') === 'qualities',
  },
  {
    sheetNumber: 8,
    name: 'Fabric Report',
    href: '/floor/production?tab=fabric-report',
    activeCheck: (p, sp) => p === '/floor/production' && sp.get('tab') === 'fabric-report',
  },
]

export const ACCOUNTS_EXCEL_SHEETS: SheetTabInfo[] = [
  {
    sheetNumber: 1,
    name: 'Cost Statement',
    href: '/accounts/cost-statement',
    activeCheck: (p) => p === '/accounts/cost-statement',
  },
  {
    sheetNumber: 2,
    name: 'Traders Synopsis',
    href: '/accounts/traders',
    activeCheck: (p) => p.startsWith('/accounts/traders') || p.startsWith('/accounts/trader-ledger'),
  },
  {
    sheetNumber: 3,
    name: 'Daily Inward Exp',
    href: '/accounts/daily-expense',
    activeCheck: (p) => p === '/accounts/daily-expense',
  },
  {
    sheetNumber: 4,
    name: 'Petty Cash',
    href: '/accounts/petty-cash',
    activeCheck: (p) => p.startsWith('/accounts/petty-cash'),
  },
  {
    sheetNumber: 5,
    name: 'Store Inventory Control',
    href: '/accounts/inventory-inward',
    activeCheck: (p) => p === '/accounts/inventory-inward',
  },
  {
    sheetNumber: 6,
    name: 'Monthly Purchases',
    href: '/accounts/reports/monthly-purchases',
    activeCheck: (p) => p.startsWith('/accounts/reports/monthly-purchases'),
  },
]

export const EXCEL_SHEETS = SALARY_EXCEL_SHEETS

function ExcelSheetTabBarContent() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<HTMLAnchorElement>(null)

  const isProduction = pathname.startsWith('/floor') || pathname.startsWith('/production')
  const isAccounts = pathname.startsWith('/accounts')
  const currentSheets = isProduction
    ? PRODUCTION_EXCEL_SHEETS
    : isAccounts
    ? ACCOUNTS_EXCEL_SHEETS
    : SALARY_EXCEL_SHEETS

  // Smooth auto-scroll active tab into view
  useEffect(() => {
    if (activeTabRef.current && scrollContainerRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [pathname, searchParams, isProduction, isAccounts])

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
    <div className="w-full border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111c2d] text-slate-700 dark:text-slate-300 print:hidden select-none">
      {/* Main Excel Sheet Tabs Ribbon */}
      <div className="flex items-stretch relative h-9">
        {/* Left Scroll Button */}
        <button
          onClick={scrollLeft}
          title="Scroll Sheets Left"
          className="flex items-center justify-center w-7 bg-white dark:bg-[#111c2d] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-800 dark:hover:text-white border-r border-slate-200 dark:border-slate-800 transition-colors shrink-0 cursor-pointer z-10"
        >
          <ChevronLeft className="size-3.5" />
        </button>

        {/* Horizontal Scrollable Tabs Container */}
        <div
          ref={scrollContainerRef}
          className="flex-1 flex items-stretch overflow-x-auto no-scrollbar scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {currentSheets.map((sheet) => {
            const isActive = sheet.activeCheck(pathname, searchParams)
            return (
              <Link
                key={sheet.sheetNumber}
                href={sheet.href}
                ref={isActive ? activeTabRef : undefined}
                className={cn(
                  'group flex items-center px-3.5 text-xs transition-colors shrink-0 cursor-pointer relative border-r border-slate-100 dark:border-slate-800/60',
                  isActive
                    ? 'text-[#0066cc] dark:text-sky-400 font-semibold bg-blue-50/50 dark:bg-sky-950/30'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/50 font-normal'
                )}
              >
                {/* Active Indicator Bar on bottom (Plesk style) */}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0066cc] dark:bg-sky-400" />
                )}

                {/* Sheet Name */}
                <span className="tracking-tight">
                  {sheet.name}
                </span>
              </Link>
            )
          })}
        </div>

        {/* Right Scroll Button */}
        <button
          onClick={scrollRight}
          title="Scroll Sheets Right"
          className="flex items-center justify-center w-7 bg-white dark:bg-[#111c2d] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-800 dark:hover:text-white border-l border-slate-200 dark:border-slate-800 transition-colors shrink-0 cursor-pointer z-10"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

export function ExcelSheetTabBar() {
  return (
    <Suspense fallback={<div className="h-9 bg-white dark:bg-[#111c2d] border-b border-slate-200 animate-pulse" />}>
      <ExcelSheetTabBarContent />
    </Suspense>
  )
}
