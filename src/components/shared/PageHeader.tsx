'use client'

import { ReactNode } from 'react'
import { PrintBrandHeader } from '@/components/shared/PrintBrandHeader'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  breadcrumbs?: BreadcrumbItem[]
  /** Kept so existing pages compile. The trail is not shown. */
  showBreadcrumbs?: boolean
  actions?: ReactNode
}

/** Page title and actions. Breadcrumb trail is not shown. */
export function PageHeader({
  title,
  actions,
}: PageHeaderProps) {
  return (
    <>
      <PrintBrandHeader sheetTitle={title} />
      <div className="mb-3 sara-page-header print:hidden">
        <div className="d-flex flex-column flex-sm-row gap-2 gap-sm-3 align-items-sm-center justify-content-sm-between sara-page-header__stack">
          <div className="min-w-0">
            <h1 className="fw-normal text-body text-truncate mb-0">{title}</h1>
          </div>
          {actions && (
            <div className="d-flex flex-wrap align-items-center gap-2 row-gap-2 justify-content-sm-end sara-page-header__actions">
              {actions}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
