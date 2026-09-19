import { prisma } from "@/lib/prisma";
import { createLoginHandler, defaultPasswordCompare, defaultSessionSigner } from "@/server/login-handler";
import {
  clearLoginFailures,
  consumeLoginAttempt,
  loginFingerprint,
} from "@/server/login-throttle";

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
    return await handler(request);
  } catch (err: any) {
    console.error("LOGIN API ERROR:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal Server Error", stack: err.stack }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
