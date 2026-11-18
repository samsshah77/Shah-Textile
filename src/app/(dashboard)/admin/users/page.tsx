'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminTabs } from '@/components/admin/AdminTabs'
import { AdminTableSkeleton } from '@/components/admin/AdminSkeleton'
import { useAuth } from '@/context/AuthContext'

type User = {
  id: string
  name: string
  email: string
  roleKey: string
  roleLabel: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  isActive: boolean
  createdAt: string
}
type Role = { key: string; label: string }

/** 14 characters with upper, lower, digit and symbol — meets the server's password rule. */
function makePassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#$%&*!?']
  const all = sets.join('')
  const rnd = (n: number) => {
    const a = new Uint32Array(1)
    crypto.getRandomValues(a)
    return a[0] % n
  }
  const chars = sets.map((s) => s[rnd(s.length)])
  while (chars.length < 14) chars.push(all[rnd(all.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

const PW_RULE = 'At least 12 characters: capital (A), small (a), number (1) and symbol (@#$…).'
const pwOk = (p: string) => p.length >= 12 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p)

async function api(method: 'POST' | 'PATCH', body: unknown) {
  const res = await fetch('/api/admin/users', {
    method,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = data?.issues?.[0]?.message || data?.details?.[0]?.message
    throw new Error(data.error === 'Validation failed' && detail ? detail : data.error || 'Could not save')
  }
  return data
}

/** Administration → Users: create logins (e.g. Kamran), reset passwords, change role, switch off. */
export default function AdminUsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [q, setQ] = useState('')

  const [form, setForm] = useState({ name: '', email: '', role: '', password: '' })
  const [creating, setCreating] = useState(false)
  /** Shown once after create / reset so it can be given to the person. */
  const [shownPassword, setShownPassword] = useState<{ who: string; email: string; password: string } | null>(null)
  const [resetFor, setResetFor] = useState<User | null>(null)
  const [resetPw, setResetPw] = useState('')

  const load = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([
        fetch('/api/admin/users', { credentials: 'same-origin', cache: 'no-store' }).then((x) => x.json()),
        fetch('/api/admin/roles', { credentials: 'same-origin', cache: 'no-store' }).then((x) => x.json()),
      ])
      setUsers(u.users || [])
      setRoles((r.roles || []).map((x: Role) => ({ key: x.key, label: x.label })))
      setError(u.users ? '' : u.error || 'Users did not load')
    } catch {
      setError('Users did not load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setError('')
    setNotice('')
    try {
      await fn()
      setNotice(ok)
      await load()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      return false
    }
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pwOk(form.password)) return setError(`Password: ${PW_RULE}`)
    setCreating(true)
    const done = await run(() => api('POST', form), `Login created for ${form.name}.`)
    setCreating(false)
    if (done) {
      setShownPassword({ who: form.name, email: form.email, password: form.password })
      setForm({ name: '', email: '', role: form.role, password: '' })
    }
  }

  const saveReset = async () => {
    if (!resetFor) return
    if (!pwOk(resetPw)) return setError(`Password: ${PW_RULE}`)
    const target = resetFor
    const done = await run(() => api('PATCH', { userId: target.id, password: resetPw }), `Password changed for ${target.name}.`)
    if (done) {
      setShownPassword({ who: target.name, email: target.email, password: resetPw })
      setResetFor(null)
      setResetPw('')
    }
  }

  const pending = users.filter((u) => u.status === 'PENDING')
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return users.filter((u) => u.status !== 'PENDING' && (!n || `${u.name} ${u.email} ${u.roleLabel}`.toLowerCase().includes(n)))
  }, [users, q])

  return (
    <div className="container-fluid px-2 px-md-3 py-3" style={{ maxWidth: 1100 }}>
      <AdminTabs />
      <h1 className="h5 fw-bold mb-3">Users</h1>

      {error && <div className="alert alert-danger py-2 small">{error}</div>}
      {notice && <div className="alert alert-success py-2 small">{notice}</div>}

      {shownPassword && (
        <div className="alert alert-warning small d-flex flex-wrap align-items-center gap-2" role="status">
          <div className="me-auto">
            Login for <strong>{shownPassword.who}</strong>: <span className="font-monospace">{shownPassword.email}</span> · password:{' '}
            <span className="font-monospace fw-bold user-select-all">{shownPassword.password}</span>
            <div className="text-secondary">This password is shown only now — give it to the person yourself (do not post it in a WhatsApp group).</div>
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void navigator.clipboard?.writeText(shownPassword.password)}>
            Copy
          </button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShownPassword(null)}>
            Done
          </button>
        </div>
      )}

      {pending.length > 0 && (
        <div className="card border-warning mb-3">
          <div className="card-header py-2 small fw-bold">Naye account — manzoori ka intezar ({pending.length})</div>
          <ul className="list-group list-group-flush">
            {pending.map((u) => (
              <li key={u.id} className="list-group-item d-flex flex-wrap align-items-center gap-2 small">
                <span className="fw-semibold">{u.name}</span>
                <span className="text-secondary">{u.email}</span>
                <span className="badge text-bg-light">{u.roleLabel}</span>
                <span className="ms-auto d-flex gap-1">
                  <button type="button" className="btn btn-sm btn-success" onClick={() => void run(() => api('PATCH', { userId: u.id, action: 'APPROVE' }), `${u.name} approved.`)}>
                    Approve
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void run(() => api('PATCH', { userId: u.id, action: 'REJECT' }), `${u.name} rad.`)}>
                    Rad
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card shadow-sm mb-4">
        <div className="card-header py-2 small fw-bold">Create new login</div>
        <form className="card-body row g-2 align-items-end" onSubmit={create}>
          <div className="col-12 col-md-3">
            <label className="form-label small mb-1" htmlFor="nu-name">Name</label>
            <input id="nu-name" className="form-control form-control-sm" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kamran" />
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label small mb-1" htmlFor="nu-email">Email (login)</label>
            <input id="nu-email" type="email" className="form-control form-control-sm" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="kamran@saratextile.com" />
          </div>
          <div className="col-12 col-md-2">
            <label className="form-label small mb-1" htmlFor="nu-role">Role</label>
            <select id="nu-role" className="form-select form-select-sm" required value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="">— select —</option>
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label small mb-1" htmlFor="nu-pw">Password</label>
            <div className="input-group input-group-sm">
              <input id="nu-pw" className="form-control font-monospace" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
              <button type="button" className="btn btn-outline-secondary" title="Make a strong password" onClick={() => setForm({ ...form, password: makePassword() })}>
                Make password
              </button>
            </div>
          </div>
          <div className="col-12 col-md-1 d-grid">
            <button type="submit" className="btn btn-sm btn-primary" disabled={creating}>
              {creating ? '…' : 'Create login'}
            </button>
          </div>
          <div className="col-12 form-text small mt-1">{PW_RULE} A new login works right away.</div>
        </form>
      </div>

      {loading ? (
        <AdminTableSkeleton rows={6} cols={5} />
      ) : (
        <>
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <h2 className="h6 fw-bold mb-0">All users ({shown.length})</h2>
            <input className="form-control form-control-sm" style={{ width: 220 }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search user" />
          </div>
          <div className="table-responsive card shadow-sm">
            <table className="table table-sm align-middle mb-0 small">
              <thead className="table-light">
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th style={{ width: 200 }}>Role</th>
              <th>Status</th>
              <th className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => {
              const self = me?.id === u.id
              const active = u.isActive && u.status === 'APPROVED'
              return (
                <tr key={u.id} className={active ? '' : 'table-secondary'}>
                  <td className="fw-semibold">
                    {u.name}
                    {self && <span className="badge text-bg-info ms-1">Aap</span>}
                  </td>
                  <td className="font-monospace">{u.email}</td>
                  <td>
                    <select
                      className="form-select form-select-sm"
                      value={u.roleKey}
                      disabled={self}
                      aria-label={`Role of ${u.name}`}
                      onChange={(e) => {
                        const role = e.target.value
                        if (window.confirm(`Change the role of ${u.name} to "${roles.find((r) => r.key === role)?.label || role}"?`))
                          void run(() => api('PATCH', { userId: u.id, role }), `Role changed for ${u.name}.`)
                      }}
                    >
                      {roles.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{active ? <span className="badge text-bg-success">Active</span> : <span className="badge text-bg-secondary">Off</span>}</td>
                  <td className="text-end text-nowrap">
                    <button type="button" className="btn btn-sm btn-outline-primary me-1" onClick={() => (setResetFor(u), setResetPw(makePassword()))}>
                      Password
                    </button>
                    {!self &&
                      (active ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => window.confirm(`Turn off the login of ${u.name}? (No data is deleted)`) && void run(() => api('PATCH', { userId: u.id, isActive: false }), `Login of ${u.name} turned off.`)}
                        >
                          Turn off
                        </button>
                      ) : (
                        <button type="button" className="btn btn-sm btn-outline-success" onClick={() => void run(() => api('PATCH', { userId: u.id, action: 'APPROVE' }), `Login of ${u.name} turned on.`)}>
                          Turn on
                        </button>
                      ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
        </>
      )}
      <p className="form-text small mt-2">
        The role decides who can see what (see the Roles tab). A new role is made in the Roles tab. Only Tufail can change Salary and Accounts; Javed sahab can view them.
      </p>

      {resetFor && (
        <div className="modal fade show d-block" role="dialog" aria-modal="true" style={{ background: 'rgba(15,23,42,.45)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h5 className="modal-title fs-6 fw-bold">New password for {resetFor.name}</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setResetFor(null)} />
              </div>
              <div className="modal-body">
                <div className="input-group">
                  <input className="form-control font-monospace" value={resetPw} onChange={(e) => setResetPw(e.target.value)} aria-label="New password" />
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setResetPw(makePassword())}>
                    Make new
                  </button>
                </div>
                <div className="form-text small">{PW_RULE} The old password stops at once — anyone already logged in stays logged in until they log out.</div>
              </div>
              <div className="modal-footer py-2">
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setResetFor(null)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => void saveReset()}>
                  Save password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
