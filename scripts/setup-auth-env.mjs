#!/usr/bin/env node
/**
 * Adds missing authentication settings to the local env files without printing any value:
 *
 *   BETTER_AUTH_SECRET  a new random 256-bit secret per file (development and test never share one)
 *   BETTER_AUTH_URL     http://localhost:3000
 *   OWNER_EMAIL         a placeholder in .env.local for you to replace; a synthetic address in .env.test.local
 *
 * Existing values are never changed. Usage: npm run auth:setup-env
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const FILES = [
  { file: ".env.local", ownerEmail: "REPLACE_WITH_YOUR_EMAIL" },
  { file: ".env.test.local", ownerEmail: "owner@example.com" },
];

const definedKeys = (text) =>
  new Set(
    text
      .split(/\r?\n/)
      .map((line) => /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1])
      .filter(Boolean),
  );

for (const { file, ownerEmail } of FILES) {
  if (!existsSync(file)) {
    console.log(`${file}: not found (create it first; see .env.example)`);
    continue;
  }
  const existing = definedKeys(readFileSync(file, "utf8"));
  const additions = [];
  if (!existing.has("BETTER_AUTH_SECRET")) {
    additions.push(
      `BETTER_AUTH_SECRET="${randomBytes(32).toString("base64url")}"`,
    );
  }
  if (!existing.has("BETTER_AUTH_URL")) {
    additions.push('BETTER_AUTH_URL="http://localhost:3000"');
  }
  if (!existing.has("OWNER_EMAIL")) {
    additions.push(`OWNER_EMAIL="${ownerEmail}"`);
  }
  if (additions.length === 0) {
    console.log(
      `${file}: authentication settings already present (nothing changed)`,
    );
    continue;
  }
  const comment =
    file === ".env.local"
      ? [
          "",
          "# Authentication (Better Auth). BETTER_AUTH_SECRET signs sessions and encrypts 2FA secrets: keep it private,",
          "# never reuse it elsewhere, and changing it signs everyone out. OWNER_EMAIL is the only address that can",
          "# create the account or sign in; replace the placeholder with your own email.",
        ]
      : [
          "",
          "# Authentication for automated tests only. Synthetic owner; never a real address.",
        ];
  appendFileSync(file, `${[...comment, ...additions].join("\n")}\n`);
  const names = additions.map((line) => line.split("=")[0]).join(", ");
  console.log(`${file}: added ${names} (values not shown)`);
}
