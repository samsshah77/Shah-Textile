'use client'

import Link from 'next/link'
import { ReactNode } from 'react'
import { PrintBrandHeader } from '@/components/shared/PrintBrandHeader'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  breadcrumbs?: BreadcrumbItem[]
  /** When false, breadcrumb trail is hidden (title + actions only). */
  showBreadcrumbs?: boolean
  actions?: ReactNode
}

/** AdminLTE app-content-header: title + optional breadcrumb, responsive on mobile. */
export function PageHeader({
  title,
  breadcrumbs = [],
  showBreadcrumbs = true,
  actions,
}: PageHeaderProps) {
  const crumbs =
    breadcrumbs.length > 0
      ? breadcrumbs
      : [{ label: 'Home', href: '/dashboard' }, { label: title }]

  return (
    <>
      <PrintBrandHeader sheetTitle={title} />
      <div className="mb-3 sara-page-header print:hidden">
        <div className="d-flex flex-column flex-sm-row gap-2 gap-sm-3 align-items-sm-center justify-content-sm-between sara-page-header__stack">
          <div className="min-w-0">
            <h1 className={`fw-normal text-body text-truncate${showBreadcrumbs ? ' mb-1' : ' mb-0'}`}>
              {title}
            </h1>
            {showBreadcrumbs && (
              <ol className="breadcrumb mb-0 small flex-wrap">
                {crumbs.map((c, i) => {
                  const isLast = i === crumbs.length - 1
                  return (
                    <li
                      key={`${c.label}-${i}`}
                      className={`breadcrumb-item${isLast ? ' active' : ''}`}
                      aria-current={isLast ? 'page' : undefined}
                    >
                      {!isLast && c.href ? <Link href={c.href}>{c.label}</Link> : c.label}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
          {actions && (
            <div className="d-flex flex-wrap align-items-center gap-2 row-gap-2 sara-page-header__actions">
              {actions}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
