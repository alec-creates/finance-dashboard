/**
 * Runs a Prisma CLI command against an explicitly named database, after verifying it (ADR-0008).
 *
 *   tsx scripts/db.ts development migrate dev --name init
 *   tsx scripts/db.ts test migrate deploy
 *
 * - "development" requires DATABASE_ENV=development and a database different from the test one.
 * - "test" requires DATABASE_ENV=test and a database different from the development one; only non-destructive
 *   commands are allowed (tests reset data themselves, after the same checks).
 * - "production" runs only inside the release workflow (GitHub Actions, main, protected environment), only as
 *   "migrate deploy", and only after the database matches PRODUCTION_DATABASE_FINGERPRINT (ADR-0011). Credentials come
 *   from the workflow's environment, never from env files.
 * Prisma's output is filtered so connection strings, hosts, users and passwords are never printed.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

import {
  connectionSecrets,
  redactConnectionDetails,
} from "../src/server/db/environment";
import {
  loadAndAssertDevelopmentDatabase,
  loadAndAssertTestDatabase,
} from "../src/server/db/load-env";
import {
  assertProductionMigrationContext,
  PRODUCTION_COMMANDS,
} from "../src/server/db/production";

const ALLOWED_TEST_COMMANDS = ["migrate deploy", "migrate status", "db seed"];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const [target, ...prismaArgs] = process.argv.slice(2);
if (prismaArgs.length === 0) {
  fail(
    "Usage: tsx scripts/db.ts <development|test|production> <prisma command...>",
  );
}

try {
  if (target === "development") {
    loadAndAssertDevelopmentDatabase();
  } else if (target === "test") {
    loadAndAssertTestDatabase();
    const command = prismaArgs.slice(0, 2).join(" ");
    if (!ALLOWED_TEST_COMMANDS.includes(command)) {
      fail(
        `Refusing "${command}" on the test database; allowed: ${ALLOWED_TEST_COMMANDS.join(", ")}`,
      );
    }
  } else if (target === "production") {
    // Exact match: no extra flags, and never reset, db push, migrate dev, seed or studio.
    const command = prismaArgs.join(" ");
    if (!(PRODUCTION_COMMANDS as readonly string[]).includes(command)) {
      fail(
        `Refusing "${command}" on the production database; allowed: ${PRODUCTION_COMMANDS.join(", ")}`,
      );
    }
    const { fingerprintPrefix } = assertProductionMigrationContext(process.env);
    console.log(`Production database ${fingerprintPrefix}… verified.`);
  } else {
    fail(
      `Refusing to run against "${target ?? ""}": use development, test or production`,
    );
  }
} catch (error) {
  fail(
    error instanceof Error
      ? error.message
      : "Database environment check failed",
  );
}

const secrets = connectionSecrets([
  process.env.DATABASE_URL,
  process.env.DIRECT_URL,
]);
const prismaCli = createRequire(import.meta.url).resolve(
  "prisma/build/index.js",
);
const child = spawn(process.execPath, [prismaCli, ...prismaArgs], {
  env: { ...process.env, FINANCE_DB_GUARD: "1" },
  stdio: ["inherit", "pipe", "pipe"],
});

// Redact whole lines, so a value split across two chunks can never slip through.
const streamsDone: Promise<void>[] = [];
for (const [source, sink] of [
  [child.stdout, process.stdout],
  [child.stderr, process.stderr],
] as const) {
  let pending = "";
  source.setEncoding("utf8");
  source.on("data", (chunk: string) => {
    pending += chunk;
    const lastNewline = pending.lastIndexOf("\n");
    if (lastNewline >= 0) {
      sink.write(
        redactConnectionDetails(pending.slice(0, lastNewline + 1), secrets),
      );
      pending = pending.slice(lastNewline + 1);
    }
  });
  streamsDone.push(
    new Promise((resolve) =>
      source.on("end", () => {
        if (pending) {
          sink.write(redactConnectionDetails(pending, secrets));
        }
        resolve();
      }),
    ),
  );
}

child.on("close", async (code) => {
  await Promise.all(streamsDone);
  process.exit(code ?? 1);
});
