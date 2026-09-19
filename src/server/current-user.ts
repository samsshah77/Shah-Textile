import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  roleKey: true,
  roleId: true,
  department: true,
  status: true,
  isActive: true,
} as const;

export async function currentUser(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySession(token);
  if (!claims) return null;
  const user = await prisma.user.findUnique({ where: { id: claims.userId }, select: publicUserSelect });
  if (!user || !user.isActive || user.status !== "APPROVED") return null;
  return user;
}

export function serializeUser(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.roleKey,
    department: user.department,
  };
}
