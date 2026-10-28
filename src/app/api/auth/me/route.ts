import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { expiredSessionCookie } from "@/lib/session";
import { currentUser, serializeUser } from "@/server/current-user";
import { accessFor } from "@/server/userAccess";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await currentUser(request);
  if (!user) {
    const response = NextResponse.json({ user: null }, { status: 401 });
    response.cookies.set(expiredSessionCookie());
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  // What this person may see / change (Administration → Permissions).
  const { access } = await accessFor(user);
  const response = NextResponse.json({ user: { ...serializeUser(user), access } });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
