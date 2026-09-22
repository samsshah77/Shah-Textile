import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import type { PermissionAction, PermissionEffect, PermissionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/server/current-user";
import { ensurePermissionCatalog } from "@/server/ensure-permission-catalog";

export type PermissionDecision = {
  allowed: boolean;
  scope?: PermissionScope;
  source?: "USER" | "ROLE_RESOURCE" | "ROLE_MODULE" | "ADMIN";
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

async function resolvePermissionOnce(
  userId: string,
  target: PermissionTarget,
  healed: boolean,
): Promise<PermissionDecision> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { roleId: true, roleKey: true, isActive: true, status: true },
  });
  if (!user || !user.isActive || user.status !== "APPROVED") return { allowed: false };

  const roleKey = (user.roleKey || "").toLowerCase();
  if (roleKey === "admin") return { allowed: true, source: "ADMIN", scope: "ALL" };

  let roleId = user.roleId;
  if (!roleId && roleKey) {
    const byKey = await prisma.role.findUnique({
      where: { key: roleKey },
      select: { id: true },
    });
    roleId = byKey?.id ?? null;
    if (roleId) {
      await prisma.user
        .update({ where: { id: userId }, data: { roleId, roleKey } })
        .catch(() => undefined);
    }
  } else if (user.roleKey !== roleKey) {
    await prisma.user.update({ where: { id: userId }, data: { roleKey } }).catch(() => undefined);
  }
  if (!roleId) return { allowed: false };

  let moduleRecord = await prisma.module.findUnique({
    where: { key: target.moduleKey },
    select: { id: true },
  });

  // Live DB often missing RBAC catalog — heal once then retry
  if (!healed) {
    const grantCount = await prisma.roleModuleGrant.count({ where: { roleId } });
    if (!moduleRecord || grantCount === 0) {
      await ensurePermissionCatalog();
      return resolvePermissionOnce(userId, target, true);
    }
  }

  if (!moduleRecord) {
    moduleRecord = await prisma.module.findUnique({
      where: { key: target.moduleKey },
      select: { id: true },
    });
  }
  if (!moduleRecord) return { allowed: false };

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
  if (roleOverride) return decision(roleOverride.effect, roleOverride.scope, "ROLE_RESOURCE");

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
