#!/usr/bin/env node
/**
 * Checks the local database configuration (.env.local and .env.test.local) WITHOUT printing any value.
 * Every line of output is a pass/fail statement; connection strings, hosts, users and passwords are never shown.
 *
 * Usage:
 *   npm run db:check-env          file checks only (offline)
 *   npm run db:check-connection   file checks, then a read-only sign-in to each database
 *
 * The sign-in runs inside a READ ONLY transaction that is rolled back, so it cannot create or change anything.
 * Driver errors are reduced to an error code, because their messages can contain hosts or role names.
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
const authSecrets = [];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Authentication settings (Phase 1 Task 4). */
function checkAuthSettings(file, values) {
  const secret = values.BETTER_AUTH_SECRET ?? "";
  report(
    secret.length >= 32 && !secret.startsWith("REPLACE_WITH"),
    "BETTER_AUTH_SECRET is set (32+ characters)",
  );
  let urlOk = false;
  try {
    urlOk = ["http:", "https:"].includes(
      new URL(values.BETTER_AUTH_URL ?? "").protocol,
    );
  } catch {
    urlOk = false;
  }
  report(urlOk, "BETTER_AUTH_URL is an http(s) URL");
  const owner = (values.OWNER_EMAIL ?? "").trim();
  report(
    EMAIL.test(owner) && !owner.startsWith("REPLACE_WITH"),
    "OWNER_EMAIL is set to an email address",
  );
  if (file === ".env.test.local") {
    report(
      owner.toLowerCase().endsWith("@example.com"),
      "test OWNER_EMAIL is synthetic (@example.com)",
    );
  }
  authSecrets.push(secret);
}
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
      database: direct.database,
      user: direct.user,
      urls: {
        DATABASE_URL: values.DATABASE_URL,
        DIRECT_URL: values.DIRECT_URL,
      },
    });
  }
  checkAuthSettings(file, values);
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
  report(
    authSecrets.length === 2 && authSecrets[0] !== authSecrets[1],
    "development and test use different BETTER_AUTH_SECRET values",
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Read-only sign-in

const SAFE_ERROR_DESCRIPTIONS = {
  "28P01": "the password was rejected",
  28000: "the role is not allowed to sign in",
  "3D000": "the database does not exist",
  "57P03": "the database is starting up; try again",
  ENOTFOUND: "the host could not be found",
  EAI_AGAIN: "the host could not be resolved (network issue)",
  ECONNREFUSED: "the connection was refused",
  ECONNRESET: "the connection was reset",
  ETIMEDOUT: "the connection timed out",
  SELF_SIGNED_CERT_IN_CHAIN: "the server certificate could not be verified",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY:
    "the server certificate could not be verified",
};

/** Describes a driver error by code only; the message itself may contain a host or role name. */
function describeError(error) {
  const code = typeof error?.code === "string" ? error.code : undefined;
  if (code) {
    return `${SAFE_ERROR_DESCRIPTIONS[code] ?? "connection failed"} (code ${code})`;
  }
  return /timeout/i.test(String(error?.message))
    ? "the connection timed out"
    : "connection failed (no error code)";
}

async function signIn(connectionString) {
  const { default: pg } = await import("pg");
  // pg already treats sslmode=require as verify-full (certificate and host verified); saying so explicitly keeps
  // that behaviour and silences pg's deprecation warning. The env files themselves are not changed.
  const url = new URL(connectionString);
  url.searchParams.set("sslmode", "verify-full");
  const client = new pg.Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 20_000, // allows for a Neon compute waking from scale-to-zero
    query_timeout: 15_000,
  });
  // Without a listener, a late socket error would crash the process with a message that may include the host.
  client.on("error", () => {});
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const { rows } = await client.query(`
      select current_database() as database,
             current_user as role,
             current_setting('transaction_read_only') as read_only,
             current_setting('neon.tenant_id', true) as project_id,
             (select coalesce(json_object_agg(table_schema, tables), '{}'::json)
                from (select table_schema, count(*)::int as tables
                        from information_schema.tables
                       where table_type = 'BASE TABLE'
                         and table_schema not in ('pg_catalog', 'information_schema')
                       group by table_schema) per_schema) as tables_by_schema
    `);
    await client.query("ROLLBACK");
    return { ok: true, row: rows[0] };
  } catch (error) {
    return { ok: false, reason: describeError(error) };
  } finally {
    await client.end().catch(() => {});
  }
}

async function checkConnections(environments) {
  const projectIds = [];
  for (const environment of environments) {
    console.log(`\nSign-in: ${environment.file}`);
    for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
      const result = await signIn(environment.urls[name]);
      if (!result.ok) {
        report(false, `${name}: sign-in failed: ${result.reason}`);
        continue;
      }
      const { row } = result;
      report(true, `${name}: signed in`);
      report(row.read_only === "on", `${name}: session was read-only`);
      report(
        row.database === environment.database && row.role === environment.user,
        `${name}: connected to the database and role named in the file`,
      );
      // Schema names and counts only (e.g. "public: 0"); never table contents.
      const schemas = Object.entries(row.tables_by_schema ?? {});
      console.log(
        `  [info] ${name}: tables by schema: ${
          schemas.length === 0
            ? "none"
            : schemas.map(([schema, count]) => `${schema}: ${count}`).join(", ")
        }`,
      );
      if (name === "DIRECT_URL") {
        projectIds.push(row.project_id || null);
      }
    }
  }

  console.log("\nIsolation confirmed by the servers");
  const [devId, testId] = projectIds;
  if (devId && testId) {
    report(
      devId !== testId,
      "development and test report different Neon project ids",
    );
  } else {
    console.log(
      "  [info] Neon did not expose a project id; isolation rests on the separate hosts and credentials above.",
    );
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Run

if (process.argv.includes("--connect")) {
  if (failures > 0 || inspected.length !== 2) {
    console.log("\nSkipping the sign-in check until the file checks pass.");
  } else {
    await checkConnections(inspected);
  }
}

console.log(
  failures === 0
    ? "\nAll checks passed. No values were printed."
    : `\n${failures} check(s) failed. No values were printed.`,
);
process.exitCode = failures === 0 ? 0 : 1;
