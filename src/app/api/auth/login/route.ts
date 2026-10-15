import { prisma } from "@/lib/prisma";
import { createLoginHandler, defaultPasswordCompare, defaultSessionSigner } from "@/server/login-handler";
import {
  clearLoginFailures,
  consumeLoginAttempt,
  loginFingerprint,
} from "@/server/login-throttle";
import { ensurePermissionCatalog } from "@/server/ensure-permission-catalog";

export const runtime = "nodejs";

const handler = createLoginHandler({
  findUser: (email) =>
    prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        roleKey: true,
        department: true,
        status: true,
        isActive: true,
      },
    }),
  comparePassword: defaultPasswordCompare,
  fingerprint: loginFingerprint,
  consumeAttempt: consumeLoginAttempt,
  clearFailures: clearLoginFailures,
  createSession: defaultSessionSigner,
});

export async function POST(request: Request) {
  try {
    const response = await handler(request);
    // After successful login, heal RBAC so accountant (Tufail) gets module grants
    if (response.status === 200) {
      try {
        await ensurePermissionCatalog();
      } catch (healErr) {
        console.error("[login] permission catalog heal failed", healErr);
      }
    }
    return response;
  } catch (err: any) {
    console.error("LOGIN API ERROR:", err);
    let errorMessage = err.message || "Internal Server Error";
    if (
      errorMessage.includes("Can't reach database server") ||
      errorMessage.includes("queryRaw") ||
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("connect")
    ) {
      errorMessage = "Database connection failed. Please ensure Docker Desktop and the PostgreSQL container are running.";
    }
    return new Response(JSON.stringify({ error: errorMessage, stack: err.stack }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
