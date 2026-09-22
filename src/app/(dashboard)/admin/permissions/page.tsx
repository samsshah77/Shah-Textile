"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

const ACTIONS = ["VIEW", "CREATE", "UPDATE", "DELETE", "APPROVE", "POST", "EXPORT", "ASSIGN", "MANAGE"] as const;
type Action = (typeof ACTIONS)[number];
type Effect = "ALLOW" | "DENY" | "NONE";
type Role = { id: string; key: string; label: string; description: string | null };
type ModuleData = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  resources: Array<{ id: string; key: string; label: string; sensitive: boolean; permissions: Array<{ id: string; action: Action }> }>;
};
type Grant = { moduleId: string; action: Action; effect: "ALLOW" | "DENY"; scope: string };
type Override = { effect: "ALLOW" | "DENY"; scope: string; permission: { id: string; action: Action; resource: { key: string; moduleId: string } } };
type PermissionData = { roles: Role[]; selectedRoleId: string; modules: ModuleData[]; grants: Grant[]; overrides: Override[] };

function effectLabel(effect: Effect) {
  return effect === "ALLOW" ? "Allowed" : effect === "DENY" ? "Denied" : "Inherited";
}

export default function PermissionsPage() {
  const [data, setData] = useState<PermissionData | null>(null);
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  const load = useCallback(async (selectedRoleId?: string) => {
    const query = selectedRoleId ? `?roleId=${encodeURIComponent(selectedRoleId)}` : "";
    const response = await fetch(`/api/admin/permissions${query}`, { cache: "no-store" });
    const body = await response.json() as PermissionData & { error?: string };
    if (!response.ok) { setError(body.error ?? "Unable to load permissions"); return; }
    setData(body);
    setRoleId(body.selectedRoleId);
    setError("");
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/permissions", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() as PermissionData & { error?: string } }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok) { setError(body.error ?? "Unable to load permissions"); return; }
        setData(body);
        setRoleId(body.selectedRoleId);
        setError("");
      })
      .catch(() => { if (active) setError("Unable to load permissions"); });
    return () => { active = false; };
  }, []);

  const moduleGrant = useMemo(() => {
    const map = new Map<string, Grant>();
    for (const grant of data?.grants ?? []) map.set(`${grant.moduleId}:${grant.action}`, grant);
    return map;
  }, [data]);
  const override = useMemo(() => {
    const map = new Map<string, Override>();
    for (const item of data?.overrides ?? []) map.set(`${item.permission.resource.moduleId}:${item.permission.resource.key}:${item.permission.action}`, item);
    return map;
  }, [data]);

  async function save(input: { target: "MODULE" | "RESOURCE"; moduleKey: string; resourceKey?: string; action: Action; effect: Effect }) {
    setSaving(`${input.moduleKey}:${input.resourceKey ?? ""}:${input.action}`);
    const response = await fetch("/api/admin/permissions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, roleId, scope: "ALL" }),
    });
    if (!response.ok) {
      const body = await response.json() as { error?: string };
      setError(body.error ?? "Permission could not be saved");
    } else {
      await load(roleId);
    }
    setSaving("");
  }

  if (!data) {
    return (
      <main className="page-content !w-full !max-w-6xl !mx-0 !p-0">
        {error ? <div className="form-message error">{error}</div> : <p>Loading permissions…</p>}
      </main>
    );
  }

  return (
      <main className="page-content permission-page sara-module-content !w-full !max-w-6xl !mx-0 !p-0">
        <div className="page-title">
          <div>
            <p className="eyebrow">Administration</p>
            <h1>Role permissions</h1>
          </div>
          <div className="row-actions">
            <Link className="btn btn-secondary" href="/admin/approvals">Approvals</Link>
            <Link className="btn btn-secondary" href="/admin/roles">Roles</Link>
            <label className="role-picker">
              Role
              <select
                value={roleId}
                onChange={(event) => {
                  setRoleId(event.target.value)
                  void load(event.target.value)
                }}
              >
                {data.roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <p className="muted permission-intro">
          Module actions provide quick bulk access. Resource rows override the module grant for one table. Unconfigured permissions are denied.
        </p>
        {error && <div className="form-message error">{error}</div>}
        <div className="permission-list">
          {data.modules.map((module) => (
            <section className="permission-module" key={module.id}>
              <div className="permission-module-heading">
                <div>
                  <h2>{module.label}</h2>
                  <p>{module.description}</p>
                </div>
                <span>{module.resources.length} resources</span>
              </div>
              <div className="permission-actions permission-module-actions">
                {ACTIONS.map((action) => {
                  const grant = moduleGrant.get(`${module.id}:${action}`)
                  const effect: Effect = grant?.effect ?? "NONE"
                  return (
                    <button
                      key={action}
                      className={`permission-chip ${effect.toLowerCase()}`}
                      disabled={saving === `${module.key}::${action}`}
                      onClick={() => void save({ target: "MODULE", moduleKey: module.key, action, effect: effect === "ALLOW" ? "NONE" : "ALLOW" })}
                      type="button"
                    >
                      {action} · {effectLabel(effect)}
                    </button>
                  )
                })}
              </div>
              <div className="permission-resources">
                {module.resources.map((resource) => (
                  <div className="permission-resource" key={resource.id}>
                    <div className="resource-name">
                      <strong>{resource.label}</strong>
                      {resource.sensitive && <span className="sensitive-badge">Sensitive</span>}
                      <small>{resource.key}</small>
                    </div>
                    <div className="permission-actions">
                      {resource.permissions.map((permission) => {
                        const key = `${module.id}:${resource.key}:${permission.action}`
                        const item = override.get(key)
                        const moduleEffect = moduleGrant.get(`${module.id}:${permission.action}`)?.effect
                        const effect: Effect = item?.effect ?? "NONE"
                        const effective = effect !== "NONE" ? effect : moduleEffect ?? "NONE"
                        return (
                          <button
                            key={permission.id}
                            className={`permission-chip compact ${effect.toLowerCase()}`}
                            title={`Effective: ${effectLabel(effective)}`}
                            disabled={saving === `${module.key}:${resource.key}:${permission.action}`}
                            onClick={() =>
                              void save({
                                target: "RESOURCE",
                                moduleKey: module.key,
                                resourceKey: resource.key,
                                action: permission.action,
                                effect: effect === "NONE" ? "ALLOW" : effect === "ALLOW" ? "DENY" : "NONE",
                              })
                            }
                            type="button"
                          >
                            {permission.action}
                            <span>{effect === "NONE" ? `(${effective.toLowerCase()})` : effectLabel(effect)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
  )
}
