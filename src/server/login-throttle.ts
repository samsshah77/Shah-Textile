import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export function loginFingerprint(ip: string, email: string): string {
  return createHash("sha256").update(`${ip}|${email.trim().toLowerCase()}`).digest("hex");
}

export async function consumeLoginAttempt(fingerprint: string, now = new Date()) {
  const windowCutoff = new Date(now.getTime() - WINDOW_MS);
  const newBlockEnd = new Date(now.getTime() + BLOCK_MS);
  const rows = await prisma.$queryRaw<Array<{ failures: number; blockedUntil: Date | null }>>`
    INSERT INTO "login_throttles"
      ("fingerprint", "failures", "windowStartedAt", "blockedUntil", "updatedAt")
    VALUES
      (${fingerprint}, 1, ${now}, NULL, ${now})
    ON CONFLICT ("fingerprint") DO UPDATE SET
      "failures" = CASE
        WHEN "login_throttles"."blockedUntil" > ${now} THEN "login_throttles"."failures"
        WHEN "login_throttles"."windowStartedAt" <= ${windowCutoff} THEN 1
        ELSE "login_throttles"."failures" + 1
      END,
      "windowStartedAt" = CASE
        WHEN "login_throttles"."blockedUntil" > ${now} THEN "login_throttles"."windowStartedAt"
        WHEN "login_throttles"."windowStartedAt" <= ${windowCutoff} THEN ${now}
        ELSE "login_throttles"."windowStartedAt"
      END,
      "blockedUntil" = CASE
        WHEN "login_throttles"."blockedUntil" > ${now} THEN "login_throttles"."blockedUntil"
        WHEN "login_throttles"."windowStartedAt" > ${windowCutoff}
          AND "login_throttles"."failures" + 1 > ${MAX_FAILURES} THEN ${newBlockEnd}
        ELSE NULL
      END,
      "updatedAt" = ${now}
    RETURNING "failures", "blockedUntil"
  `;
  const blockedUntil = rows[0]?.blockedUntil;
  if (!blockedUntil || blockedUntil <= now) return { allowed: true as const };
  return {
    allowed: false as const,
    retryAfter: Math.max(1, Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000)),
  };
}

export async function clearLoginFailures(fingerprint: string) {
  if (prisma.loginThrottle?.deleteMany) {
    await prisma.loginThrottle.deleteMany({ where: { fingerprint } });
  } else {
    await prisma.$executeRaw`DELETE FROM "login_throttles" WHERE "fingerprint" = ${fingerprint}`;
  }
}
