import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson, validationError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/server/permissions";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const admin = await requirePermission(request, { moduleKey: "admin", resourceKey: "users", action: "ASSIGN" });
  if (!admin) return jsonError("Forbidden", 403, "FORBIDDEN");
  const roles = await prisma.role.findMany({
    select: { id: true, key: true, label: true, department: true, description: true },
    orderBy: { label: "asc" },
  });
  return NextResponse.json({ roles });
}

const roleSchema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers, and underscores"),
  label: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  department: z.string().trim().max(80).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const admin = await requirePermission(request, { moduleKey: "admin", resourceKey: "roles", action: "MANAGE" });
  if (!admin) return jsonError("Forbidden", 403, "FORBIDDEN");
  const parsed = roleSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const role = await prisma.role.create({ data: { ...parsed.data, canSignup: false } });
    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") return jsonError("That role key already exists", 409, "ROLE_EXISTS");
    throw error;
  }
}

const editRoleSchema = roleSchema.extend({ roleId: z.string().min(1) });

export async function PATCH(request: NextRequest) {
  const admin = await requirePermission(request, { moduleKey: "admin", resourceKey: "roles", action: "MANAGE" });
  if (!admin) return jsonError("Forbidden", 403, "FORBIDDEN");
  const parsed = editRoleSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const existing = await prisma.role.findUnique({ where: { id: parsed.data.roleId }, select: { id: true, key: true } });
  if (!existing) return jsonError("Role not found", 404, "ROLE_NOT_FOUND");
  if (existing.key === "admin" && parsed.data.key !== "admin") return jsonError("The administrator role key cannot be changed", 400, "ADMIN_ROLE_LOCKED");
  try {
    const role = await prisma.role.update({ where: { id: parsed.data.roleId }, data: { key: parsed.data.key, label: parsed.data.label, description: parsed.data.description, department: parsed.data.department }, });
    return NextResponse.json({ role });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") return jsonError("That role key already exists", 409, "ROLE_EXISTS");
    throw error;
  }
}
