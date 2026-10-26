/**
 * Runs a Prisma CLI command against an explicitly named database, after verifying it (ADR-0008).
 *
 *   tsx scripts/db.ts development migrate dev --name init
 *   tsx scripts/db.ts test migrate deploy
 *
 * - "development" requires DATABASE_ENV=development and a database different from the test one.
 * - "test" requires DATABASE_ENV=test and a database different from the development one; only non-destructive
 *   commands are allowed (tests reset data themselves, after the same checks).
 * - "production" is refused until deployment is set up (Phase 1 Task 10).
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

const ALLOWED_TEST_COMMANDS = ["migrate deploy", "migrate status", "db seed"];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const [target, ...prismaArgs] = process.argv.slice(2);
if (prismaArgs.length === 0) {
  fail("Usage: tsx scripts/db.ts <development|test> <prisma command...>");
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
  } else {
    fail(
      `Refusing to run against "${target ?? ""}": only development and test are supported`,
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
