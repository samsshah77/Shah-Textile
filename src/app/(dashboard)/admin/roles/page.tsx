"use client";

import { AdminTabs } from '@/components/admin/AdminTabs'
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type Role = { id?: string; key: string; label: string; department: string | null; description: string | null };

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [editing, setEditing] = useState<Role | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/admin/roles", { cache: "no-store" });
    const data = (await response.json()) as { roles?: Role[]; error?: string };
    if (!response.ok) {
      setError(data.error ?? "Could not load roles.");
      return;
    }
    setRoles(data.roles ?? []);
    setError("");
  }

  useEffect(() => {
    let active = true;
    fetch("/api/admin/roles", { cache: "no-store" })
      .then(async (response) => ({
        response,
        data: (await response.json()) as { roles?: Role[]; error?: string },
      }))
      .then(({ response, data }) => {
        if (!active) return;
        if (!response.ok) {
          setError(data.error ?? "Could not load roles.");
          return;
        }
        setRoles(data.roles ?? []);
      })
      .catch(() => {
        if (active) setError("Could not load roles.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/admin/roles", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editing ? { ...values, roleId: editing.id } : values),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Could not save role.");
      return;
    }
    setMessage(editing ? "Role updated." : "Role created.");
    setEditing(null);
    event.currentTarget.reset();
    await load();
  }

  return (
    <main className="page-content !w-full !max-w-5xl !mx-0 !p-0">
        <AdminTabs />
      <div className="page-title">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Roles</h1>
        </div>
        <div className="row-actions">
          <Link className="btn btn-secondary" href="/admin/approvals">
            Approvals
          </Link>
          <Link className="btn btn-secondary" href="/admin/permissions">
            Permissions
          </Link>
        </div>
      </div>
      {error && <div className="form-message error">{error}</div>}
      {message && <div className="form-message success">{message}</div>}
      <section className="create-user-card role-form-card">
        <div>
          <p className="eyebrow">Role setup</p>
          <h2>{editing ? "Edit role" : "Create role"}</h2>
          <p>Define the role name and description first. Module and table permissions are managed separately.</p>
        </div>
        <form className="role-form" onSubmit={save}>
          <input
            name="key"
            placeholder="Role key (e.g. production_manager)"
            defaultValue={editing?.key ?? ""}
            required
          />
          <input name="label" placeholder="Role name" defaultValue={editing?.label ?? ""} required />
          <input
            name="department"
            placeholder="Department (optional)"
            defaultValue={editing?.department ?? ""}
          />
          <textarea
            name="description"
            placeholder="Description"
            defaultValue={editing?.description ?? ""}
            rows={3}
          />
          <div className="row-actions">
            <button className="btn btn-primary primary-button" type="submit">
              {editing ? "Save changes" : "Create role"}
            </button>
            {editing && (
              <button className="btn btn-secondary" type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
      <div className="role-list user-list">
        {roles.map((role) => (
          <article className="user-row" key={role.id ?? role.key}>
            <div className="avatar">{role.label.slice(0, 1).toUpperCase()}</div>
            <div className="user-details">
              <strong>{role.label}</strong>
              <span>{role.key}</span>
              <small>{role.description || role.department || "No description"}</small>
            </div>
            <div className="row-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setEditing(role)}>
                Edit
              </button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
