'use client'

import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'

/**
 * One "Fabric Fault" place with two tabs (Administration → Permissions decides who sees which):
 *  - Fault Add   → /floor/fault-reports (Kamran: loom, photo / video / voice, note)
 *  - Fault Table → Production → Fabric Fault (Ahmer / Javed Sir: the day's faults, editable)
 * The bar shows only when a person may open both.
 */
export function FabricFaultTabs({ active }: { active: 'add' | 'table' }) {
  const { canView, canEdit } = useAuth()
  const tabs = [
    { key: 'add' as const, label: 'Fault Add', icon: 'bi-camera-video', href: '/floor/fault-reports', show: canEdit('fault_reports') },
    { key: 'table' as const, label: 'Fault Table', icon: 'bi-table', href: '/floor/production?tab=fabric-fault', show: canView('prod_fabric_fault') },
  ].filter((t) => t.show)
  if (tabs.length < 2) return null
  return (
    <div className="btn-group btn-group-sm" role="tablist" aria-label="Fabric Fault">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          role="tab"
          aria-selected={t.key === active}
          className={`btn ${t.key === active ? 'btn-danger' : 'btn-outline-danger'}`}
        >
          <i className={`bi ${t.icon} me-1`} aria-hidden="true" />
          {t.label}
        </Link>
      ))}
    </div>
  )
}
