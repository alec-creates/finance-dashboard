import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

/**
 * Prepares the test database in a separate tsx process and hands the invented test owner's email and TOTP secret to
 * the tests through the environment (Playwright passes it to its workers). Nothing is written to disk.
 */
export default function globalSetup(): void {
  const tsx = createRequire(__filename).resolve("tsx/cli");
  const output = execFileSync(
    process.execPath,
    [tsx, "e2e/prepare-test-owner.mts"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const last = output.trim().split("\n").at(-1) ?? "";
  const owner = JSON.parse(last) as { email: string; secret: string };
  process.env.E2E_OWNER_EMAIL = owner.email;
  process.env.E2E_TOTP_SECRET = owner.secret;
}
