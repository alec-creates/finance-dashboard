import { z } from "zod";

import { DATABASE_ENVIRONMENTS } from "./db/environment";
import { assertDeploymentConfiguration } from "./deployment";

const serverEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .refine(
      (value) => /^postgres(ql)?:\/\//.test(value),
      "must be a postgresql:// connection string",
    ),
  DATABASE_ENV: z.enum(DATABASE_ENVIRONMENTS),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Validates server configuration. The error lists only the names of invalid variables, never their values.
 */
export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ];
    throw new Error(`Invalid server configuration: ${names.join(", ")}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cached) {
    // Refuse to reach any database from a deployment configured for another one.
    assertDeploymentConfiguration(process.env);
  }
  cached ??= parseServerEnv(process.env);
  return cached;
}
