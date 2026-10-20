import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { resolvePermission } from "@/server/permissions";
import { canViewFinance } from "@/lib/accountsAccess";

export async function requirePagePermission(moduleKey: string, resourceKey: string) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    const claims = token ? await verifySession(token) : null;
    if (!claims) redirect(`/login?redirect=${encodeURIComponent(`/${moduleKey}`)}`);

    const user = await prisma.user.findUnique({
      where: { id: claims!.userId },
      select: { id: true, status: true, isActive: true },
    });
    if (!user?.isActive || user.status !== "APPROVED") {
      redirect(`/login?redirect=${encodeURIComponent(`/${moduleKey}`)}`);
    }

    const permission = await resolvePermission(user.id, {
      moduleKey,
      resourceKey,
      action: "VIEW",
    });
    if (!permission.allowed) redirect("/forbidden");
    return user;
  } catch (err) {
    // Next.js redirect() throws; rethrow those. Also rethrow dynamic-rendering signals —
    // catching DYNAMIC_SERVER_USAGE and "handling" it breaks App Router dynamic detection
    // (live tabs can 500 / land on forbidden while `next dev` looks fine).
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest?: string }).digest === "string"
    ) {
      const digest = (err as { digest: string }).digest;
      if (
        digest.startsWith("NEXT_REDIRECT") ||
        digest.startsWith("NEXT_NOT_FOUND") ||
        digest === "DYNAMIC_SERVER_USAGE" ||
        digest.startsWith("NEXT_DYNAMIC")
      ) {
        throw err;
      }
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/Dynamic server usage|DYNAMIC_SERVER_USAGE/i.test(msg)) {
      throw err;
    }
    console.error("[requirePagePermission]", moduleKey, resourceKey, err);
    redirect("/forbidden");
  }
}

/**
 * Accounts / Salary pages: on top of the module permission, only Tufail (edit) and
 * Javed (view) may open them — everyone else is sent to /forbidden.
 */
export async function requireFinancePage(moduleKey: "accounts" | "payroll", resourceKey: string) {
  const user = await requirePagePermission(moduleKey, resourceKey);
  const full = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true, roleKey: true },
  });
  if (!canViewFinance(full ? { ...full, role: full.roleKey } : null)) redirect("/forbidden");
  return user;
}
