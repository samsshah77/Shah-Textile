import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

/** Public signup is intentionally disabled; administrators create accounts. */
export async function POST() {
  return jsonError("Public signup is disabled. Ask an administrator to create your account.", 403, "PUBLIC_SIGNUP_DISABLED");
}
