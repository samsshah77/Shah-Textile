import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL must be a postgres connection string",
    ),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must contain at least 32 characters"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
  });
  return cached;
}

export function jwtSecret(): Uint8Array {
  const value = process.env.JWT_SECRET || "shah_textile_super_secure_jwt_secret_key_2026_demo_default";
  return new TextEncoder().encode(value);
}
