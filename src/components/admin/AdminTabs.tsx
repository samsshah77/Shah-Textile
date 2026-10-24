'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/admin/users', label: 'Users', icon: 'bi-people' },
  { href: '/admin/roles', label: 'Roles', icon: 'bi-person-gear' },
  { href: '/admin/system', label: 'System', icon: 'bi-hdd-stack' },
  { href: '/admin/audit', label: 'Audit log', icon: 'bi-clock-history' },
]

/** One tab strip for every Administration page. */
export function AdminTabs() {
  const pathname = usePathname()
  return (
    <nav className="mb-3 print:hidden" aria-label="Administration">
      <ul className="nav nav-pills flex-nowrap overflow-auto gap-1 pb-1">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href) || (t.href === '/admin/users' && pathname.startsWith('/admin/approvals'))
          return (
            <li className="nav-item" key={t.href}>
              <Link href={t.href} className={`nav-link py-1 px-3 text-nowrap ${active ? 'active' : 'bg-body-secondary'}`} aria-current={active ? 'page' : undefined}>
                <i className={`bi ${t.icon} me-1`} />
                {t.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
