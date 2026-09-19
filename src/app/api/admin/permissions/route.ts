import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson, validationError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/server/current-user";
import { permissionCatalogForRole, recordPermissionAudit } from "@/server/permissions";

export const runtime = "nodejs";

const actions = ["VIEW", "CREATE", "UPDATE", "DELETE", "APPROVE", "POST", "EXPORT", "ASSIGN", "MANAGE"] as const;
const effects = ["ALLOW", "DENY", "NONE"] as const;
const scopes = ["ALL", "OWN", "DEPARTMENT", "ASSIGNED"] as const;

async function requireAdmin(request: NextRequest) {
  const user = await currentUser(request);
  return user?.roleKey.toLowerCase() === "admin" ? user : null;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return jsonError("Forbidden", 403, "FORBIDDEN");

  const roles = await prisma.role.findMany({
    select: { id: true, key: true, label: true, description: true },
    orderBy: { label: "asc" },
  });
  const selectedRoleId = request.nextUrl.searchParams.get("roleId") ?? roles[0]?.id;
  const selected = selectedRoleId ? await permissionCatalogForRole(selectedRoleId) : null;
  return NextResponse.json({ roles, selectedRoleId, ...selected });
}

const updateSchema = z.object({
  roleId: z.string().min(1),
  target: z.enum(["MODULE", "RESOURCE"]),
  moduleKey: z.string().trim().min(1).max(64),
  resourceKey: z.string().trim().min(1).max(64).optional(),
  action: z.enum(actions),
  effect: z.enum(effects),
  scope: z.enum(scopes).default("ALL"),
});

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return jsonError("Forbidden", 403, "FORBIDDEN");
  const parsed = updateSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;

  const role = await prisma.role.findUnique({ where: { id: input.roleId }, select: { id: true, key: true } });
  const moduleRecord = await prisma.module.findUnique({ where: { key: input.moduleKey }, select: { id: true, key: true } });
  if (!role || !moduleRecord) return jsonError("Role or module not found", 404, "TARGET_NOT_FOUND");
  if (input.target === "RESOURCE" && !input.resourceKey) {
    return jsonError("resourceKey is required for a resource permission", 400, "RESOURCE_REQUIRED");
  }

  if (input.target === "MODULE") {
    const where = { roleId_moduleId_action: { roleId: role.id, moduleId: moduleRecord.id, action: input.action } };
    if (input.effect === "NONE") {
      await prisma.roleModuleGrant.deleteMany({ where: { roleId: role.id, moduleId: moduleRecord.id, action: input.action } });
    } else {
      await prisma.roleModuleGrant.upsert({
        where,
        create: { roleId: role.id, moduleId: moduleRecord.id, action: input.action, effect: input.effect, scope: input.scope },
        update: { effect: input.effect, scope: input.scope },
      });
    }
    await recordPermissionAudit({
      actorUserId: admin.id,
      roleId: role.id,
      moduleKey: moduleRecord.key,
      action: input.action,
      effect: input.effect === "NONE" ? undefined : input.effect,
      scope: input.effect === "NONE" ? undefined : input.scope,
      operation: input.effect === "NONE" ? "REMOVE_MODULE_GRANT" : "SET_MODULE_GRANT",
    });
    return NextResponse.json({ ok: true });
  }

  const resource = await prisma.resource.findUnique({
    where: { moduleId_key: { moduleId: moduleRecord.id, key: input.resourceKey! } },
    select: { id: true, key: true },
  });
  if (!resource) return jsonError("Resource not found in module", 404, "RESOURCE_NOT_FOUND");
  const permission = await prisma.permission.findUnique({
    where: { resourceId_action: { resourceId: resource.id, action: input.action } },
    select: { id: true },
  });
  if (!permission) return jsonError("Permission not found", 404, "PERMISSION_NOT_FOUND");

  const where = { roleId_permissionId: { roleId: role.id, permissionId: permission.id } };
  if (input.effect === "NONE") {
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: permission.id } });
  } else {
    await prisma.rolePermission.upsert({
      where,
      create: { roleId: role.id, permissionId: permission.id, effect: input.effect, scope: input.scope },
      update: { effect: input.effect, scope: input.scope },
    });
  }
  await recordPermissionAudit({
    actorUserId: admin.id,
    roleId: role.id,
    permissionId: permission.id,
    moduleKey: moduleRecord.key,
    resourceKey: resource.key,
    action: input.action,
    effect: input.effect === "NONE" ? undefined : input.effect,
    scope: input.effect === "NONE" ? undefined : input.scope,
    operation: input.effect === "NONE" ? "REMOVE_RESOURCE_OVERRIDE" : "SET_RESOURCE_OVERRIDE",
  });
  return NextResponse.json({ ok: true });
}
