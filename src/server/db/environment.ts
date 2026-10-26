/**
 * Guards that keep development, test and production databases apart (ADR-0008). Error messages never include
 * connection strings, hosts, users or passwords.
 */

export const DATABASE_ENVIRONMENTS = [
  "development",
  "test",
  "production",
] as const;
export type DatabaseEnvironment = (typeof DATABASE_ENVIRONMENTS)[number];

export class DatabaseEnvironmentError extends Error {
  override name = "DatabaseEnvironmentError";
}

/** Minimal parser for KEY=value / KEY="value" lines; ignores comments and blank lines. */
export function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match?.[1]) {
      continue;
    }
    let value = (match[2] ?? "").trim();
    if (/^(["']).*\1$/.test(value)) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

/**
 * Identifies the database a connection string points at: its host with Neon's "-pooler" suffix removed (pooled and
 * direct strings for one database map to the same value), plus the database name.
 */
export function databaseIdentity(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new DatabaseEnvironmentError(
      "A database URL is not a valid connection string",
    );
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new DatabaseEnvironmentError(
      "A database URL is not a postgresql:// connection string",
    );
  }
  const host = url.hostname.toLowerCase().replace(/-pooler(?=\.)/, "");
  return `${host}/${url.pathname.replace(/^\//, "")}`;
}

/** Throws unless DATABASE_ENV names the expected environment. */
export function assertDatabaseEnvironment(
  expected: DatabaseEnvironment,
  actual: string | undefined,
): void {
  if (actual !== expected) {
    throw new DatabaseEnvironmentError(
      `Refusing to continue: DATABASE_ENV must be "${expected}" for this command`,
    );
  }
}

export interface TestDatabaseCheck {
  databaseEnv: string | undefined;
  databaseUrls: readonly (string | undefined)[];
  /** Connection strings that tests must never use (the development database). */
  forbiddenUrls: readonly (string | undefined)[];
}

/**
 * Throws unless the configuration is clearly the test database: DATABASE_ENV is "test", every URL is set, and none of
 * them points at a forbidden (development) database.
 */
export function assertIsolatedTestDatabase(check: TestDatabaseCheck): void {
  assertDatabaseEnvironment("test", check.databaseEnv);
  if (
    check.databaseUrls.length === 0 ||
    check.databaseUrls.some((url) => !url)
  ) {
    throw new DatabaseEnvironmentError(
      "Refusing to continue: the test database URLs are not set",
    );
  }
  const forbidden = new Set(
    check.forbiddenUrls
      .filter((url): url is string => Boolean(url))
      .map(databaseIdentity),
  );
  for (const url of check.databaseUrls as string[]) {
    if (forbidden.has(databaseIdentity(url))) {
      throw new DatabaseEnvironmentError(
        "Refusing to continue: the test configuration points at the development database",
      );
    }
  }
}

/**
 * pg treats sslmode=require as verify-full (certificate and host verified) and warns that this will change. Stating
 * verify-full keeps today's stronger behaviour explicitly.
 */
export function normalizeConnectionString(connectionString: string): string {
  const url = new URL(connectionString);
  const sslmode = url.searchParams.get("sslmode");
  if (
    sslmode === null ||
    sslmode === "require" ||
    sslmode === "prefer" ||
    sslmode === "verify-ca"
  ) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}

/** Removes connection strings, Neon hosts and the given secret values from text before it is printed. */
export function redactConnectionDetails(
  text: string,
  secrets: readonly string[] = [],
): string {
  let redacted = text
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[redacted connection string]")
    .replace(
      /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech\b/gi,
      "[redacted host]",
    );
  for (const secret of secrets) {
    if (secret.length >= 4) {
      redacted = redacted.split(secret).join("[redacted]");
    }
  }
  return redacted;
}

/** User names and passwords contained in connection strings, for use with redactConnectionDetails. */
export function connectionSecrets(
  urls: readonly (string | undefined)[],
): string[] {
  const secrets = new Set<string>();
  for (const value of urls) {
    if (!value) {
      continue;
    }
    try {
      const url = new URL(value);
      for (const part of [url.username, url.password, url.hostname]) {
        if (part) {
          secrets.add(decodeURIComponent(part));
        }
      }
    } catch {
      // not a URL: nothing to extract
    }
  }
  return [...secrets];
}
