'use client'

import Link from 'next/link'
import { ReactNode } from 'react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  breadcrumbs?: BreadcrumbItem[]
  actions?: ReactNode
}

/** AdminLTE app-content-header: title + breadcrumb, no badges/subtitles. */
export function PageHeader({ title, breadcrumbs = [], actions }: PageHeaderProps) {
  const crumbs =
    breadcrumbs.length > 0
      ? breadcrumbs
      : [{ label: 'Home', href: '/dashboard' }, { label: title }]

  return (
    <div className="card mb-3 border-0 shadow-none bg-transparent">
      <div className="card-body px-0 py-2">
        <div className="row mb-0 align-items-center">
          <div className="col-sm-6">
            <h1 className="mb-0 fs-3 fw-normal text-body">{title}</h1>
          </div>
          <div className="col-sm-6">
            <div className="d-flex flex-wrap align-items-center justify-content-sm-end gap-2">
              {actions}
              <ol className="breadcrumb float-sm-end mb-0">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
