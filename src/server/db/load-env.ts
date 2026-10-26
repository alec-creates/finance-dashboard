import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadEnvConfig } from "@next/env";

import {
  assertDatabaseEnvironment,
  assertIsolatedTestDatabase,
  parseEnvFile,
  type DatabaseEnvironment,
} from "./environment";

const quietLogger = { info: () => {}, error: () => {} };

/**
 * Loads env files the way Next.js does for the given environment: "test" reads .env.test.local (and never
 * .env.local); "development" reads .env.local. Variables already set in the process are not overridden.
 */
export function loadDatabaseEnv(
  target: Exclude<DatabaseEnvironment, "production">,
  dir = process.cwd(),
): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = target;
  loadEnvConfig(dir, target === "development", quietLogger, true);
}

function readEnvFileIfPresent(
  dir: string,
  file: string,
): Record<string, string> {
  const path = join(dir, file);
  return existsSync(path) ? parseEnvFile(readFileSync(path, "utf8")) : {};
}

/** Development connection strings from .env.local, used to make sure tests never point at them. */
export function developmentUrls(dir = process.cwd()): string[] {
  const values = readEnvFileIfPresent(dir, ".env.local");
  return [values.DATABASE_URL, values.DIRECT_URL].filter((url): url is string =>
    Boolean(url),
  );
}

/** Test connection strings from .env.test.local, used to make sure development never points at them. */
export function testUrls(dir = process.cwd()): string[] {
  const values = readEnvFileIfPresent(dir, ".env.test.local");
  return [values.DATABASE_URL, values.DIRECT_URL].filter((url): url is string =>
    Boolean(url),
  );
}

/** Loads the test configuration and throws unless it is isolated from development. */
export function loadAndAssertTestDatabase(dir = process.cwd()): void {
  loadDatabaseEnv("test", dir);
  assertIsolatedTestDatabase({
    databaseEnv: process.env.DATABASE_ENV,
    databaseUrls: [process.env.DATABASE_URL, process.env.DIRECT_URL],
    forbiddenUrls: developmentUrls(dir),
  });
}

/** Loads the development configuration and throws unless it is development and not the test database. */
export function loadAndAssertDevelopmentDatabase(dir = process.cwd()): void {
  loadDatabaseEnv("development", dir);
  assertDatabaseEnvironment("development", process.env.DATABASE_ENV);
  assertIsolatedTestDatabase({
    // Reuse the isolation check in reverse: development must not point at the test database.
    databaseEnv: "test",
    databaseUrls: [process.env.DATABASE_URL, process.env.DIRECT_URL],
    forbiddenUrls: testUrls(dir),
  });
}
