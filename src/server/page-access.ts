import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { resolvePermission } from "@/server/permissions";

export async function requirePagePermission(moduleKey: string, resourceKey: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySession(token) : null;
  if (!claims) redirect(`/login?redirect=${encodeURIComponent(`/${moduleKey}`)}`);

  const user = await prisma.user.findUnique({
    where: { id: claims!.userId },
    select: { id: true, status: true, isActive: true },
  });
  if (!user?.isActive || user.status !== "APPROVED") redirect(`/login?redirect=${encodeURIComponent(`/${moduleKey}`)}`);
  const permission = await resolvePermission(user.id, { moduleKey, resourceKey, action: "VIEW" });
  if (!permission.allowed) redirect("/forbidden");
  return user;
}
