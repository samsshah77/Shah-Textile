import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import type { PermissionAction, PermissionEffect, PermissionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/server/current-user";
import { ensurePermissionCatalog } from "@/server/ensure-permission-catalog";
import { ROLE_MODULE_ACTIONS, ROLE_RESOURCE_DENIES } from "@/server/permission-catalog";

export type PermissionDecision = {
  allowed: boolean;
  scope?: PermissionScope;
  source?: "USER" | "ROLE_RESOURCE" | "ROLE_MODULE" | "ADMIN" | "CATALOG";
};

type PermissionTarget = {
  moduleKey: string;
  resourceKey: string;
  action: PermissionAction;
};

function decision(
  effect: PermissionEffect,
  scope: PermissionScope,
  source: PermissionDecision["source"],
): PermissionDecision {
  return { allowed: effect === "ALLOW", scope, source };
}

function roleExpectsModuleAction(roleKey: string, moduleKey: string, action: PermissionAction) {
  const actions = ROLE_MODULE_ACTIONS[roleKey]?.[moduleKey];
  return Array.isArray(actions) && actions.includes(action);
}

function catalogDeniesAction(roleKey: string, target: PermissionTarget) {
  return ROLE_RESOURCE_DENIES.some(
    (d) =>
      d.roleKey === roleKey &&
      d.moduleKey === target.moduleKey &&
      d.resourceKey === target.resourceKey &&
      d.actions.includes(target.action),
  );
}

let cachedRoles: Array<{ id: string; key: string }> | null = null
let cachedRolesAt = 0

async function getCachedRoles() {
  const now = Date.now()
  if (cachedRoles && now - cachedRolesAt < 60000) return cachedRoles
  cachedRoles = await prisma.role.findMany({ select: { id: true, key: true } })
  cachedRolesAt = now
  return cachedRoles
}

/** Resolve canonical lowercase role key + role id (fixes VPS ACCOUNTANT vs accountant mismatch). */
async function resolveRoleIdentity(user: {
  id: string;
  roleId: string | null;
  roleKey: string | null;
}) {
  let roleKey = (user.roleKey || "").trim().toLowerCase();
  let roleId = user.roleId;

  if (roleId) {
    const linked = await prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, key: true },
    });
    if (linked) {
      const linkedKey = linked.key.toLowerCase();
      if (!roleKey) roleKey = linkedKey;
      // Prefer canonical catalog role when keys differ only by case / alias
      if (ROLE_MODULE_ACTIONS[linkedKey] || ROLE_MODULE_ACTIONS[roleKey]) {
        roleKey = ROLE_MODULE_ACTIONS[roleKey] ? roleKey : linkedKey;
      }
    }
  }

  if (!roleKey && !roleId) {
    return { roleKey: "", roleId: null as string | null };
  }

  // Always bind to role row whose key matches (case-insensitive)
  if (roleKey) {
    const roles = await getCachedRoles();
    const match = roles.find((r) => r.key.toLowerCase() === roleKey);
    if (match) {
      roleId = match.id;
      if (user.roleId !== match.id || (user.roleKey || "").toLowerCase() !== roleKey) {
        await prisma.user
          .update({
            where: { id: user.id },
            data: { roleId: match.id, roleKey },
          })
          .catch(() => undefined);
      }
    }
  }

  return { roleKey, roleId };
}

async function resolvePermissionOnce(
  userId: string,
  target: PermissionTarget,
  healed: boolean,
): Promise<PermissionDecision> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, roleId: true, roleKey: true, isActive: true, status: true },
  });
  if (!user || !user.isActive || user.status !== "APPROVED") return { allowed: false };

  const rawRoleKey = (user.roleKey || "").trim().toLowerCase();
  if (rawRoleKey === "admin") return { allowed: true, source: "ADMIN", scope: "ALL" };

  const { roleKey, roleId } = await resolveRoleIdentity(user);
  if (roleKey === "admin") return { allowed: true, source: "ADMIN", scope: "ALL" };
  if (!roleId && !roleKey) return { allowed: false };

  // Catalog fallback — works even when VPS DB grants were never seeded for accountant
  const expects = roleExpectsModuleAction(roleKey, target.moduleKey, target.action);
  const deniedByCatalog = catalogDeniesAction(roleKey, target);

  let moduleRecord = await prisma.module.findUnique({
    where: { key: target.moduleKey },
    select: { id: true },
  });

  if (!healed) {
    const grantCount = roleId
      ? await prisma.roleModuleGrant.count({ where: { roleId } })
      : 0;
    const moduleGrantCount =
      roleId && moduleRecord
        ? await prisma.roleModuleGrant.count({
            where: { roleId, moduleId: moduleRecord.id },
          })
        : 0;
    if (!moduleRecord || grantCount === 0 || (expects && moduleGrantCount === 0)) {
      try {
        await ensurePermissionCatalog();
      } catch (err) {
        console.error("[resolvePermission] catalog heal failed", err);
      }
      return resolvePermissionOnce(userId, target, true);
    }
  }

  if (!moduleRecord) {
    moduleRecord = await prisma.module.findUnique({
      where: { key: target.moduleKey },
      select: { id: true },
    });
  }

  // If catalog says this role may VIEW/UPDATE this module, allow unless catalog denies this action
  if (expects && !deniedByCatalog) {
    // Best-effort DB grant check for audit; still allow on catalog even if rows missing
    if (moduleRecord && roleId) {
      const resource = await prisma.resource.findUnique({
        where: { moduleId_key: { moduleId: moduleRecord.id, key: target.resourceKey } },
        select: { id: true },
      });
      if (resource) {
        const permission = await prisma.permission.findUnique({
          where: { resourceId_action: { resourceId: resource.id, action: target.action } },
          select: { id: true },
        });
        if (permission) {
          const userOverride = await prisma.userPermission.findUnique({
            where: { userId_permissionId: { userId, permissionId: permission.id } },
            select: { effect: true, scope: true },
          });
          if (userOverride?.effect === "DENY") {
            return decision("DENY", userOverride.scope, "USER");
          }
          if (userOverride?.effect === "ALLOW") {
            return decision("ALLOW", userOverride.scope, "USER");
          }
        }
      }
    }
    return { allowed: true, source: "CATALOG", scope: "ALL" };
  }

  if (!moduleRecord || !roleId) return { allowed: false };

  const resource = await prisma.resource.findUnique({
    where: { moduleId_key: { moduleId: moduleRecord.id, key: target.resourceKey } },
    select: { id: true },
  });
  if (!resource) return { allowed: false };

  const permission = await prisma.permission.findUnique({
    where: { resourceId_action: { resourceId: resource.id, action: target.action } },
    select: { id: true },
  });
  if (!permission) return { allowed: false };

  const userOverride = await prisma.userPermission.findUnique({
    where: { userId_permissionId: { userId, permissionId: permission.id } },
    select: { effect: true, scope: true },
  });
  if (userOverride) return decision(userOverride.effect, userOverride.scope, "USER");

  const roleOverride = await prisma.rolePermission.findUnique({
    where: { roleId_permissionId: { roleId, permissionId: permission.id } },
    select: { effect: true, scope: true },
  });
  // Ignore stale DENY rows that are not in the catalog deny list (VPS merge leftovers)
  if (roleOverride?.effect === "ALLOW") {
    return decision("ALLOW", roleOverride.scope, "ROLE_RESOURCE");
  }
  if (roleOverride?.effect === "DENY" && deniedByCatalog) {
    return decision("DENY", roleOverride.scope, "ROLE_RESOURCE");
  }

  const moduleGrant = await prisma.roleModuleGrant.findUnique({
    where: {
      roleId_moduleId_action: { roleId, moduleId: moduleRecord.id, action: target.action },
    },
    select: { effect: true, scope: true },
  });
  if (moduleGrant) return decision(moduleGrant.effect, moduleGrant.scope, "ROLE_MODULE");

  return { allowed: false };
}

export async function resolvePermission(
  userId: string,
  target: PermissionTarget,
): Promise<PermissionDecision> {
  try {
    return await resolvePermissionOnce(userId, target, false);
  } catch (err) {
    console.error("[resolvePermission]", target, err);
    // Last resort: if catalog says yes, don't lock accountant out of ERP on DB blips
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { roleKey: true, isActive: true, status: true },
      });
      const roleKey = (user?.roleKey || "").toLowerCase();
      if (
        user?.isActive &&
        user.status === "APPROVED" &&
        roleExpectsModuleAction(roleKey, target.moduleKey, target.action) &&
        !catalogDeniesAction(roleKey, target)
      ) {
        return { allowed: true, source: "CATALOG", scope: "ALL" };
      }
    } catch {
      /* ignore */
    }
    return { allowed: false };
  }
}

export async function hasPermission(userId: string, target: PermissionTarget) {
  return (await resolvePermission(userId, target)).allowed;
}

export async function requirePermission(request: NextRequest, target: PermissionTarget) {
  const user = await currentUser(request);
  if (!user) return null;
  return (await resolvePermission(user.id, target)).allowed ? user : null;
}

export async function permissionCatalogForRole(roleId: string) {
  const [role, modules, grants, overrides] = await Promise.all([
    prisma.role.findUnique({ where: { id: roleId }, select: { id: true, key: true, label: true } }),
    prisma.module.findMany({
      where: { isActive: true },
      include: {
        resources: {
          orderBy: { key: "asc" },
          include: { permissions: { orderBy: { action: "asc" } } },
        },
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.roleModuleGrant.findMany({ where: { roleId } }),
    prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: { include: { resource: true } } },
    }),
  ]);
  return { role, modules, grants, overrides };
}

export async function recordPermissionAudit(input: {
  actorUserId: string;
  roleId?: string;
  permissionId?: string;
  moduleKey: string;
  resourceKey?: string;
  action: PermissionAction;
  effect?: PermissionEffect;
  scope?: PermissionScope;
  operation: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.permissionAuditLog.create({ data: input });
}
