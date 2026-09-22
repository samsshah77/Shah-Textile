import type { PermissionAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PERMISSION_ACTIONS,
  PERMISSION_CATALOG,
  ROLE_MODULE_ACTIONS,
  ROLE_RESOURCE_DENIES,
} from "@/server/permission-catalog";

/** Sync modules/resources/permissions + role grants from catalog (no password changes). */
export async function ensurePermissionCatalog() {
  for (const moduleDef of PERMISSION_CATALOG) {
    const moduleRecord = await prisma.module.upsert({
      where: { key: moduleDef.key },
      update: {
        label: moduleDef.label,
        description: moduleDef.description,
        sortOrder: moduleDef.sortOrder,
        isActive: true,
      },
      create: {
        key: moduleDef.key,
        label: moduleDef.label,
        description: moduleDef.description,
        sortOrder: moduleDef.sortOrder,
      },
    });

    for (const resourceDef of moduleDef.resources) {
      const resource = await prisma.resource.upsert({
        where: { moduleId_key: { moduleId: moduleRecord.id, key: resourceDef.key } },
        update: {
          label: resourceDef.label,
          description: resourceDef.description,
          sensitive: Boolean(resourceDef.sensitive),
        },
        create: {
          moduleId: moduleRecord.id,
          key: resourceDef.key,
          label: resourceDef.label,
          description: resourceDef.description,
          sensitive: Boolean(resourceDef.sensitive),
        },
      });

      for (const action of PERMISSION_ACTIONS) {
        await prisma.permission.upsert({
          where: { resourceId_action: { resourceId: resource.id, action } },
          update: {},
          create: { resourceId: resource.id, action },
        });
      }
    }
  }

  const roles = await prisma.role.findMany({
    where: { key: { in: Object.keys(ROLE_MODULE_ACTIONS) } },
    select: { id: true, key: true },
  });
  const seededRoles = Object.fromEntries(roles.map((r) => [r.key.toLowerCase(), r.id]));

  for (const [roleKey, moduleActions] of Object.entries(ROLE_MODULE_ACTIONS)) {
    const roleId = seededRoles[roleKey.toLowerCase()];
    if (!roleId) continue;
    for (const [moduleKey, actions] of Object.entries(moduleActions)) {
      const moduleRecord = await prisma.module.findUnique({ where: { key: moduleKey } });
      if (!moduleRecord || !actions) continue;
      for (const action of actions as PermissionAction[]) {
        await prisma.roleModuleGrant.upsert({
          where: {
            roleId_moduleId_action: {
              roleId,
              moduleId: moduleRecord.id,
              action,
            },
          },
          update: { effect: "ALLOW", scope: "ALL" },
          create: {
            roleId,
            moduleId: moduleRecord.id,
            action,
            effect: "ALLOW",
            scope: "ALL",
          },
        });
      }
    }
  }

  for (const roleKey of Object.keys(ROLE_MODULE_ACTIONS)) {
    const roleId = seededRoles[roleKey.toLowerCase()];
    if (!roleId) continue;
    const catalogDenies = ROLE_RESOURCE_DENIES.filter((d) => d.roleKey === roleKey);
    const existingDenies = await prisma.rolePermission.findMany({
      where: { roleId, effect: "DENY" },
      include: { permission: { include: { resource: { include: { module: true } } } } },
    });
    for (const row of existingDenies) {
      const keep = catalogDenies.some(
        (d) =>
          d.moduleKey === row.permission.resource.module.key &&
          d.resourceKey === row.permission.resource.key &&
          d.actions.includes(row.permission.action),
      );
      if (!keep) {
        await prisma.rolePermission.delete({
          where: { roleId_permissionId: { roleId, permissionId: row.permissionId } },
        });
      }
    }
  }

  for (const deny of ROLE_RESOURCE_DENIES) {
    const roleId = seededRoles[deny.roleKey.toLowerCase()];
    const moduleRecord = await prisma.module.findUnique({ where: { key: deny.moduleKey } });
    if (!roleId || !moduleRecord) continue;
    const resource = await prisma.resource.findUnique({
      where: { moduleId_key: { moduleId: moduleRecord.id, key: deny.resourceKey } },
    });
    if (!resource) continue;
    for (const action of deny.actions) {
      const permission = await prisma.permission.findUnique({
        where: { resourceId_action: { resourceId: resource.id, action } },
      });
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: permission.id } },
        update: { effect: "DENY", scope: "ALL" },
        create: {
          roleId,
          permissionId: permission.id,
          effect: "DENY",
          scope: "ALL",
        },
      });
    }
  }
}
