#!/usr/bin/env node
/**
 * Checks the local database configuration (.env.local and .env.test.local) WITHOUT printing any value.
 * Every line of output is a pass/fail statement; connection strings, hosts, users and passwords are never shown.
 *
 * Usage: npm run db:check-env
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ENVIRONMENTS = [
  {
    file: ".env.local",
    expectedEnv: "development",
    project: "finance-dashboard-dev",
  },
  {
    file: ".env.test.local",
    expectedEnv: "test",
    project: "finance-dashboard-test",
  },
];

/** Minimal parser for KEY=value / KEY="value" lines; ignores comments and blank lines. */
function parseEnvFile(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    let value = match[2].trim();
    if (/^(["']).*\1$/.test(value)) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function isGitIgnored(file) {
  try {
    execFileSync("git", ["check-ignore", "-q", file], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function inspectConnectionString(value) {
  if (!value || value.startsWith("REPLACE_WITH")) {
    return { filled: false };
  }
  try {
    const url = new URL(value);
    return {
      filled: true,
      parses: ["postgres:", "postgresql:"].includes(url.protocol),
      host: url.hostname,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ""),
      sslRequired: url.searchParams.get("sslmode") === "require",
    };
  } catch {
    return { filled: true, parses: false };
  }
}

/** Neon pooled hosts are the direct host with "-pooler" added to the first label. */
const endpointOf = (host) => host.replace(/-pooler(?=\.)/, "");

let failures = 0;
function report(passed, message) {
  if (!passed) {
    failures += 1;
  }
  console.log(`  ${passed ? "[ok]  " : "[FAIL]"} ${message}`);
}

const inspected = [];
for (const { file, expectedEnv, project } of ENVIRONMENTS) {
  console.log(`\n${file}  (Neon project: ${project})`);
  const exists = existsSync(file);
  report(exists, "file exists");
  if (!exists) {
    continue;
  }
  report(isGitIgnored(file), "file is ignored by git");

  const values = parseEnvFile(readFileSync(file, "utf8"));
  const pooled = inspectConnectionString(values.DATABASE_URL);
  const direct = inspectConnectionString(values.DIRECT_URL);

  report(
    values.DATABASE_ENV === expectedEnv,
    `DATABASE_ENV is "${expectedEnv}"`,
  );
  for (const [name, info] of [
    ["DATABASE_URL", pooled],
    ["DIRECT_URL", direct],
  ]) {
    report(info.filled, `${name} is filled in (not the placeholder)`);
    if (!info.filled) {
      continue;
    }
    report(info.parses, `${name} is a postgresql:// connection string`);
    if (!info.parses) {
      continue;
    }
    report(info.host.endsWith(".neon.tech"), `${name} points at a Neon host`);
    report(
      info.user !== "" && info.password !== "",
      `${name} includes a user and password`,
    );
    report(info.database !== "", `${name} names a database`);
    report(info.sslRequired, `${name} requires SSL (sslmode=require)`);
  }

  if (pooled.parses && direct.parses) {
    report(
      pooled.host.includes("-pooler."),
      'DATABASE_URL is the POOLED string (host contains "-pooler")',
    );
    report(
      !direct.host.includes("-pooler."),
      'DIRECT_URL is the DIRECT string (host has no "-pooler")',
    );
    report(
      endpointOf(pooled.host) === endpointOf(direct.host) &&
        pooled.database === direct.database &&
        pooled.user === direct.user,
      "DATABASE_URL and DIRECT_URL point at the same database",
    );
    inspected.push({
      file,
      endpoint: endpointOf(direct.host),
      password: direct.password,
    });
  }
}

if (inspected.length === 2) {
  const [dev, test] = inspected;
  console.log("\nIsolation between development and test");
  report(
    dev.endpoint !== test.endpoint,
    "development and test use different Neon databases",
  );
  report(
    dev.password !== test.password,
    "development and test use different credentials (separate projects)",
  );
}

console.log(
  failures === 0
    ? "\nAll checks passed. No values were printed."
    : `\n${failures} check(s) failed. No values were printed.`,
);
process.exitCode = failures === 0 ? 0 : 1;
