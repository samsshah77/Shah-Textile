import { jwtVerify, SignJWT } from "jose";
import { jwtSecret } from "@/lib/env";

export const SESSION_COOKIE = "sara_auth_token";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const ISSUER = "sara-textiles";
const AUDIENCE = "sara-textiles-web";

export type SessionClaims = { userId: string };

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ type: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(jwtSecret());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (payload.type !== "session" || typeof payload.sub !== "string") return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function expiredSessionCookie() {
  return { ...sessionCookie(""), maxAge: 0 };
}
