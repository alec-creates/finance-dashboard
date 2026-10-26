/**
 * Where the app is running, and the rules that keep each deployment on its own database (ADR-0008, ADR-0011).
 * Errors name variables only, never their values.
 */

/** Vercel sets VERCEL_ENV; anything else (next dev, next start, tests) is "local". */
export type DeploymentStage =
  "production" | "preview" | "development" | "local";

export function deploymentStage(
  source: Record<string, string | undefined>,
): DeploymentStage {
  const value = source.VERCEL_ENV;
  return value === "production" ||
    value === "preview" ||
    value === "development"
    ? value
    : "local";
}

/**
 * Throws if this deployment and its configuration disagree:
 * - Vercel production must use the production database and an https:// BETTER_AUTH_URL;
 * - nothing but Vercel production may use the production database (not previews, not a local server).
 */
export function assertDeploymentConfiguration(
  source: Record<string, string | undefined>,
): void {
  const stage = deploymentStage(source);
  const usesProductionDatabase = source.DATABASE_ENV === "production";
  if (stage === "production" && !usesProductionDatabase) {
    throw new Error(
      'Invalid deployment configuration: DATABASE_ENV must be "production" on the production deployment',
    );
  }
  if (stage !== "production" && usesProductionDatabase) {
    throw new Error(
      "Invalid deployment configuration: DATABASE_ENV is production outside the production deployment",
    );
  }
  if (
    stage === "production" &&
    source.BETTER_AUTH_URL !== undefined &&
    !source.BETTER_AUTH_URL.startsWith("https://")
  ) {
    throw new Error(
      "Invalid deployment configuration: BETTER_AUTH_URL must be https:// in production",
    );
  }
}

/**
 * Production stays in a testing state, with a visible banner, until the owner signs off gate B in TASKS.md and sets
 * REAL_DATA_APPROVED=true. Other environments never show it (they hold synthetic data by design).
 */
export function isTestingState(
  source: Record<string, string | undefined>,
): boolean {
  return (
    source.DATABASE_ENV === "production" && source.REAL_DATA_APPROVED !== "true"
  );
}
