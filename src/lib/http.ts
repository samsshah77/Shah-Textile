import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}

export function validationError(error: ZodError) {
  return NextResponse.json(
    { error: "Invalid request", code: "VALIDATION_ERROR", fields: error.flatten().fieldErrors },
    { status: 400 },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function requestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}
