'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminTabs } from '@/components/admin/AdminTabs'
import { useAuth } from '@/context/AuthContext'
import { ACCESS_AREAS, levelsFor, type AccessArea, type AccessLevel, type AccessMap } from '@/lib/access'

type Person = {
  id: string
  name: string
  email: string
  role: string
  access: AccessMap
  saved: Partial<AccessMap>
}

const LEVEL_LABEL: Record<AccessLevel, string> = { hide: 'Hide', view: 'View only', edit: 'Edit' }
const LEVEL_BTN: Record<AccessLevel, string> = { hide: 'btn-secondary', view: 'btn-info', edit: 'btn-success' }
const GROUPS = ['Modules', 'Production', 'System'] as const

/** Administration → Permissions: per person, each area Hide / View only / Edit. */
export default function AccessPage() {
  const { refresh } = useAuth()
  const [people, setPeople] = useState<Person[]>([])
  const [me, setMe] = useState('')
  const [pick, setPick] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/access', { credentials: 'same-origin', cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return setError(data.error || 'Load nahi hua')
    setPeople(data.users)
    setMe(data.me)
    setError('')
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const person = people.find((p) => p.id === pick) || people[0]

  const change = async (area: AccessArea, level: AccessLevel) => {
    if (!person || person.access[area] === level) return
    setBusy(area)
    setNote('')
    try {
      const res = await fetch('/api/admin/access', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: person.id, area, level }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Save nahi hua')
      setPeople((list) => list.map((p) => (p.id === person.id ? { ...p, ...data.user } : p)))
      const label = ACCESS_AREAS.find((a) => a.key === area)?.label
      setNote(`${person.name}: ${label} → ${LEVEL_LABEL[level]}. Us bande ke page refresh karne par lagega.`)
      if (person.id === me) void refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save nahi hua')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="container-fluid py-3">
      <AdminTabs />
      <h1 className="h5 mb-3">
        <i className="bi bi-toggles me-2" />
        Permissions
      </h1>
      {error && <div className="alert alert-danger py-2">{error}</div>}
      {note && <div className="alert alert-success py-2">{note}</div>}

      <div className="d-flex flex-wrap gap-2 mb-3">
        {people.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`btn btn-sm ${person?.id === p.id ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setPick(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      {person && (
        <div className="card" style={{ maxWidth: 640 }}>
          <div className="card-header py-2">
            <strong>{person.name}</strong> <span className="text-secondary small">{person.email}</span>
          </div>
          <div className="card-body py-2">
            {GROUPS.map((group) => (
              <div key={group} className="mb-3">
                <div className="small fw-semibold text-uppercase text-secondary mb-1">{group}</div>
                {ACCESS_AREAS.filter((a) => a.group === group).map((a) => (
                  <div key={a.key} className="d-flex align-items-center justify-content-between gap-2 py-1 border-bottom">
                    <span>{a.label}</span>
                    <div className="btn-group btn-group-sm" role="group" aria-label={a.label}>
                      {levelsFor(a.key).map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          disabled={busy === a.key}
                          className={`btn ${person.access[a.key] === lvl ? LEVEL_BTN[lvl] : 'btn-outline-secondary'}`}
                          onClick={() => void change(a.key, lvl)}
                        >
                          {LEVEL_LABEL[lvl]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <p className="small text-secondary mb-0">
              Users, Roles, System aur Audit log hamesha sirf Admin ke liye hain.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
