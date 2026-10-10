'use client'

import { ReactNode } from 'react'
import { PrintBrandHeader } from '@/components/shared/PrintBrandHeader'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  /** Optional line under the title (e.g. beam # / quality). */
  subtitle?: ReactNode
  breadcrumbs?: BreadcrumbItem[]
  /** Kept so existing pages compile. The trail is not shown. */
  showBreadcrumbs?: boolean
  /** When false, title lives in the app header (slash) — only actions show here. */
  showTitle?: boolean
  actions?: ReactNode
}

/** Page title and actions. Breadcrumb trail is not shown. */
export function PageHeader({
  title,
  subtitle,
  showTitle = true,
  actions,
}: PageHeaderProps) {
  return (
    <>
      <PrintBrandHeader sheetTitle={title} />
      <div className="mb-3 sara-page-header print:hidden">
        <div
          className={
            showTitle
              ? 'd-flex flex-column flex-sm-row gap-2 gap-sm-3 align-items-sm-center justify-content-sm-between sara-page-header__stack'
              : 'd-flex align-items-center sara-page-header__stack'
          }
        >
          {showTitle ? (
            <div className="min-w-0">
              <h1 className="fw-normal text-body text-truncate mb-0">{title}</h1>
              {subtitle ? (
                <div className="small text-secondary text-truncate mt-1">{subtitle}</div>
              ) : null}
            </div>
          ) : null}
          {actions && (
            <div
              className={
                showTitle
                  ? 'd-flex flex-wrap align-items-center gap-2 row-gap-2 justify-content-sm-end sara-page-header__actions'
                  : 'd-flex flex-nowrap align-items-center justify-content-between gap-2 overflow-x-auto w-100 pb-1 sara-page-header__actions'
              }
            >
              {actions}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
