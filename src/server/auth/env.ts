import { z } from "zod";

const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z
    .string()
    .min(32)
    .refine((value) => !value.startsWith("REPLACE_WITH"), "placeholder"),
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }),
  OWNER_EMAIL: z
    .email()
    .refine((value) => !value.startsWith("REPLACE_WITH"), "placeholder"),
});

export type AuthEnv = z.infer<typeof authEnvSchema>;

/** Validates auth configuration. The error names invalid variables only, never their values. */
export function parseAuthEnv(
  source: Record<string, string | undefined>,
): AuthEnv {
  const result = authEnvSchema.safeParse({
    BETTER_AUTH_SECRET: source.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: source.BETTER_AUTH_URL,
    OWNER_EMAIL: source.OWNER_EMAIL?.trim(),
  });
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ];
    throw new Error(
      `Invalid authentication configuration: ${names.join(", ")}`,
    );
  }
  return result.data;
}

let cached: AuthEnv | undefined;

export function getAuthEnv(): AuthEnv {
  cached ??= parseAuthEnv(process.env);
  return cached;
}
