import type { PermissionAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PERMISSION_ACTIONS,
  PERMISSION_CATALOG,
  ROLE_MODULE_ACTIONS,
  ROLE_RESOURCE_DENIES,
} from "@/server/permission-catalog";

const ROLE_META: Record<string, { label: string; department: string; description: string; canSignup: boolean }> = {
  admin: {
    label: "Main Admin",
    department: "Executive Management",
    description: "Full executive control over all accounts, production, payroll, and users.",
    canSignup: false,
  },
  accountant: {
    label: "Accountant",
    department: "Accounts & Payroll",
    description: "Access to manage salaries, invoices, payroll, and financial reports.",
    canSignup: true,
  },
  fault: {
    label: "Floor Fault Inspector",
    department: "Floor & Quality Control",
    description: "Kamran Fault: loom faults with photo / video / note. Cannot change production numbers.",
    canSignup: false,
  },
  quality_controller: {
    label: "Quality Controller",
    department: "Floor & Quality Control",
    description: "Access to manage loom production, quality logs, and warp records.",
    canSignup: true,
  },
};

/**
 * Sync modules/resources/permissions + role grants from catalog.
 * Also normalizes VPS leftovers (role key ACCOUNTANT vs accountant) and re-links users.
 */
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

  // Normalize / create canonical roles (lowercase keys)
  const allRoles = await prisma.role.findMany({ select: { id: true, key: true } });
  const seededRoles: Record<string, string> = {};

  for (const canonKey of Object.keys(ROLE_MODULE_ACTIONS)) {
    const meta = ROLE_META[canonKey] || {
      label: canonKey,
      department: null as string | null,
      description: null as string | null,
      canSignup: true,
    };

    let canonical = allRoles.find((r) => r.key === canonKey);
    if (!canonical) {
      // Reuse case-variant row if present (e.g. ACCOUNTANT → rename to accountant)
      const variant = allRoles.find((r) => r.key.toLowerCase() === canonKey);
      if (variant) {
        canonical = await prisma.role.update({
          where: { id: variant.id },
          data: {
            key: canonKey,
            label: meta.label,
            department: meta.department ?? undefined,
            description: meta.description ?? undefined,
            canSignup: meta.canSignup,
          },
          select: { id: true, key: true },
        });
      } else {
        canonical = await prisma.role.create({
          data: {
            key: canonKey,
            label: meta.label,
            department: meta.department,
            description: meta.description,
            canSignup: meta.canSignup,
          },
          select: { id: true, key: true },
        });
      }
    } else {
      await prisma.role.update({
        where: { id: canonical.id },
        data: {
          label: meta.label,
          department: meta.department ?? undefined,
          description: meta.description ?? undefined,
          canSignup: meta.canSignup,
        },
      });
    }
    seededRoles[canonKey] = canonical.id;
  }

  // Re-link users whose roleKey is ACCOUNTANT / Accountant / etc.
  for (const [canonKey, roleId] of Object.entries(seededRoles)) {
    await prisma.user.updateMany({
      where: {
        OR: [
          { roleKey: { equals: canonKey, mode: "insensitive" } },
          { roleId },
        ],
      },
      data: { roleKey: canonKey, roleId },
    });
  }

  // Explicit known mill users
  if (seededRoles.accountant) {
    await prisma.user.updateMany({
      where: {
        OR: [
          { email: "tufail@saratextile.com" },
          { email: "accountant@saratextile.com" },
          { id: "usr_acc_tufail" },
        ],
      },
      data: {
        roleKey: "accountant",
        roleId: seededRoles.accountant,
        status: "APPROVED",
        isActive: true,
      },
    });
  }

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
