'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminTabs } from '@/components/admin/AdminTabs'

type Role = { id: string; key: string; label: string; department: string | null; description: string | null }
type User = { roleKey: string; status: string; isActive: boolean }

/** What the three built-in roles can do, in plain words. */
const BUILT_IN: Record<string, string> = {
  admin: 'Everything — Production, Users, System; view Salary and Accounts',
  quality_controller: 'Production: Daily Entry, Looms, Beams, Quality, Kamran Fault',
  accountant: 'Accounts and Salary (Tufail); view Production Sheet',
}


/** Administration → Roles: see the roles, and make a new one with just a name and a ready-made access. */
export default function AdminRolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [users, setUsers] = useState<User[]>([])
  // Every new role starts as "view only"; what each person sees is set on the Permissions page.
  const [form, setForm] = useState<{ label: string; department: string; access: 'view' }>({ label: '', department: '', access: 'view' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [r, u] = await Promise.all([
        fetch('/api/admin/roles', { credentials: 'same-origin', cache: 'no-store' }).then((x) => x.json()),
        fetch('/api/admin/users', { credentials: 'same-origin', cache: 'no-store' }).then((x) => x.json()),
      ])
      setRoles(r.roles || [])
      setUsers(u.users || [])
    } catch {
      setError('Roles did not load')
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/admin/roles/simple', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Role not created (server ${res.status})`)
      setNotice(`Role "${form.label}" created. You can now give this role to someone in the Users tab.`)
      setForm({ label: '', department: '', access: form.access })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Role not created')
    } finally {
      setSaving(false)
    }
  }

  const count = (key: string) => users.filter((u) => u.roleKey === key && u.status === 'APPROVED' && u.isActive).length

  return (
    <div className="container-fluid px-2 px-md-3 py-3" style={{ maxWidth: 1000 }}>
      <AdminTabs />
      <h1 className="h5 fw-bold mb-3">Roles</h1>
      {error && <div className="alert alert-danger py-2 small">{error}</div>}
      {notice && <div className="alert alert-success py-2 small">{notice}</div>}

      <div className="card shadow-sm mb-4">
        <div className="card-header py-2 small fw-bold">Create new role</div>
        <form className="card-body row g-2 align-items-end" onSubmit={create}>
          <div className="col-12 col-md-5">
            <label className="form-label small mb-1" htmlFor="nr-name">Role name</label>
            <input id="nr-name" className="form-control form-control-sm" required minLength={2} maxLength={60} placeholder="Fault Inspector" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label small mb-1" htmlFor="nr-dept">Department (optional)</label>
            <input id="nr-dept" className="form-control form-control-sm" maxLength={60} placeholder="Floor" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </div>
          <div className="col-12 col-md-3 d-flex justify-content-md-end">
            <button type="submit" className="btn btn-sm btn-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create role'}
            </button>
          </div>
          <div className="col-12 form-text small">
            A new role can only view at first. After creating it, give it to someone in <strong>Users</strong>, then in{' '}
            <strong>Permissions</strong> set Hide / View / Edit for each thing for that person. To change Daily Entry, give the
            Quality Controller role; the Salary / Accounts role is only for Tufail for now.
          </div>
        </form>
      </div>

      <div className="table-responsive card shadow-sm">
        <table className="table table-sm small align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Role</th>
              <th>What it can do</th>
              <th className="text-end">Log</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td className="fw-semibold">
                  {r.label}
                  {r.department && <div className="text-secondary fw-normal">{r.department}</div>}
                </td>
                <td>{BUILT_IN[r.key] || r.description || '—'}</td>
                <td className="text-end">{count(r.key)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
