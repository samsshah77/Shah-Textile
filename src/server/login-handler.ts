import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson, requestIp, validationError } from "@/lib/http";
import { sessionCookie, signSession } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(256),
});

export type LoginUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  roleKey: string;
  department: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  isActive: boolean;
};

export type LoginDependencies = {
  findUser(email: string): Promise<LoginUser | null>;
  comparePassword(password: string, hash: string): Promise<boolean>;
  fingerprint(ip: string, email: string): string;
  consumeAttempt(fingerprint: string): Promise<{ allowed: true } | { allowed: false; retryAfter: number }>;
  clearFailures(fingerprint: string): Promise<void>;
  createSession(userId: string): Promise<string>;
};

// A bcrypt value used only to equalize work for unknown users.
const DUMMY_PASSWORD_HASH = "$2b$12$p90BXkMSVbMkpSRxkCAnNeGllHL7WgIYR8h5cE2HQg5Ym4mPXqY9u";

export function createLoginHandler(dependencies: LoginDependencies) {
  return async function login(request: Request) {
    const parsed = loginSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);

    const { email, password } = parsed.data;
    const fingerprint = dependencies.fingerprint(requestIp(request), email);
    const throttle = await dependencies.consumeAttempt(fingerprint);
    if (!throttle.allowed) {
      const response = jsonError("Too many login attempts. Try again later.", 429, "RATE_LIMITED");
      response.headers.set("Retry-After", String(throttle.retryAfter));
      return response;
    }

    const user = await dependencies.findUser(email);
    const passwordMatches = await dependencies.comparePassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatches) {
      return jsonError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }
    await dependencies.clearFailures(fingerprint);
    if (!user.isActive) return jsonError("This account is unavailable", 403, "ACCOUNT_INACTIVE");
    if (user.status === "PENDING") {
      return jsonError("This account is awaiting approval", 403, "ACCOUNT_PENDING");
    }
    if (user.status === "REJECTED") {
      return jsonError("This account is unavailable", 403, "ACCOUNT_REJECTED");
    }

    const token = await dependencies.createSession(user.id);
    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.roleKey,
        department: user.department,
      },
    });
    response.cookies.set(sessionCookie(token));
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
}

export const defaultPasswordCompare = compare;
export const defaultSessionSigner = signSession;
