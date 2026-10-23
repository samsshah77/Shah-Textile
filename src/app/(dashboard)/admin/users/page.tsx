'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminTabs } from '@/components/admin/AdminTabs'
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

const PW_RULE = 'Kam se kam 12 harf: bara (A), chhota (a), number (1) aur nishan (@#$…).'
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
    throw new Error(data.error === 'Validation failed' && detail ? detail : data.error || 'Save nahi hua')
  }
  return data
}

/** Administration → Users: create logins (e.g. Kamran), reset passwords, change role, switch off. */
export default function AdminUsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
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
      setError(u.users ? '' : u.error || 'Users load nahi hue')
    } catch {
      setError('Users load nahi hue')
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
      setError(e instanceof Error ? e.message : 'Save nahi hua')
      return false
    }
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pwOk(form.password)) return setError(`Password: ${PW_RULE}`)
    setCreating(true)
    const done = await run(() => api('POST', form), `${form.name} ka login ban gaya.`)
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
    const done = await run(() => api('PATCH', { userId: target.id, password: resetPw }), `${target.name} ka password badal gaya.`)
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
            <strong>{shownPassword.who}</strong> ka login: <span className="font-monospace">{shownPassword.email}</span> · password:{' '}
            <span className="font-monospace fw-bold user-select-all">{shownPassword.password}</span>
            <div className="text-secondary">Yeh password sirf abhi dikh raha hai — us shakhs ko khud de dein (WhatsApp group mein na likhein).</div>
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void navigator.clipboard?.writeText(shownPassword.password)}>
            Copy
          </button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShownPassword(null)}>
            Ho gaya
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
                  <button type="button" className="btn btn-sm btn-success" onClick={() => void run(() => api('PATCH', { userId: u.id, action: 'APPROVE' }), `${u.name} ko ijazat mil gayi.`)}>
                    Manzoor
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
        <div className="card-header py-2 small fw-bold">Naya login banayein</div>
        <form className="card-body row g-2 align-items-end" onSubmit={create}>
          <div className="col-12 col-md-3">
            <label className="form-label small mb-1" htmlFor="nu-name">Naam</label>
            <input id="nu-name" className="form-control form-control-sm" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kamran" />
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label small mb-1" htmlFor="nu-email">Email (login)</label>
            <input id="nu-email" type="email" className="form-control form-control-sm" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="kamran@saratextile.com" />
          </div>
          <div className="col-12 col-md-2">
            <label className="form-label small mb-1" htmlFor="nu-role">Role</label>
            <select id="nu-role" className="form-select form-select-sm" required value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="">— chunein —</option>
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
              <button type="button" className="btn btn-outline-secondary" title="Mazboot password banayein" onClick={() => setForm({ ...form, password: makePassword() })}>
                Password banao
              </button>
            </div>
          </div>
          <div className="col-12 col-md-1 d-grid">
            <button type="submit" className="btn btn-sm btn-primary" disabled={creating}>
              {creating ? '…' : 'Login banayein'}
            </button>
          </div>
          <div className="col-12 form-text small mt-1">{PW_RULE} Naya login fauran chal jata hai.</div>
        </form>
      </div>

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <h2 className="h6 fw-bold mb-0">Sab users ({shown.length})</h2>
        <input className="form-control form-control-sm" style={{ width: 220 }} placeholder="Dhoondein" value={q} onChange={(e) => setQ(e.target.value)} aria-label="User dhoondein" />
      </div>
      <div className="table-responsive card shadow-sm">
        <table className="table table-sm align-middle mb-0 small">
          <thead className="table-light">
            <tr>
              <th>Naam</th>
              <th>Email</th>
              <th style={{ width: 200 }}>Role</th>
              <th>Haal</th>
              <th className="text-end">Kaam</th>
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
                      aria-label={`${u.name} ka role`}
                      onChange={(e) => {
                        const role = e.target.value
                        if (window.confirm(`${u.name} ka role "${roles.find((r) => r.key === role)?.label || role}" kar dein?`))
                          void run(() => api('PATCH', { userId: u.id, role }), `${u.name} ka role badal gaya.`)
                      }}
                    >
                      {roles.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{active ? <span className="badge text-bg-success">Chalu</span> : <span className="badge text-bg-secondary">Band</span>}</td>
                  <td className="text-end text-nowrap">
                    <button type="button" className="btn btn-sm btn-outline-primary me-1" onClick={() => (setResetFor(u), setResetPw(makePassword()))}>
                      Password
                    </button>
                    {!self &&
                      (active ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => window.confirm(`${u.name} ka login band karein? (Data nahi mitega)`) && void run(() => api('PATCH', { userId: u.id, isActive: false }), `${u.name} ka login band.`)}
                        >
                          Band
                        </button>
                      ) : (
                        <button type="button" className="btn btn-sm btn-outline-success" onClick={() => void run(() => api('PATCH', { userId: u.id, action: 'APPROVE' }), `${u.name} ka login chalu.`)}>
                          Chalu
                        </button>
                      ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="form-text small mt-2">
        Kaun kya dekh sakta hai, woh role se tay hota hai (Roles / Permissions tab). Salary aur Accounts sirf Tufail badal sakte hain, Javed sahab dekh sakte hain.
      </p>

      {resetFor && (
        <div className="modal fade show d-block" role="dialog" aria-modal="true" style={{ background: 'rgba(15,23,42,.45)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h5 className="modal-title fs-6 fw-bold">{resetFor.name} ka naya password</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setResetFor(null)} />
              </div>
              <div className="modal-body">
                <div className="input-group">
                  <input className="form-control font-monospace" value={resetPw} onChange={(e) => setResetPw(e.target.value)} aria-label="Naya password" />
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setResetPw(makePassword())}>
                    Naya banayein
                  </button>
                </div>
                <div className="form-text small">{PW_RULE} Purana password foran band — jo pehle se login hai woh logout tak chalta rahega.</div>
              </div>
              <div className="modal-footer py-2">
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setResetFor(null)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => void saveReset()}>
                  Password save karein
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
