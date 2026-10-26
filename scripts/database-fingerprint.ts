/**
 * Prints the fingerprint of a database connection string, for the PRODUCTION_DATABASE_FINGERPRINT variable of the
 * GitHub "production" environment (docs/deployment.md). Paste the connection string when asked; it is not shown on
 * screen, stored or sent anywhere, and only its SHA-256 fingerprint (host and database name, not credentials) is printed.
 *
 *   npm run db:fingerprint
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

import { databaseFingerprint } from "../src/server/db/production";

const silent = new Writable({
  write(_chunk, _encoding, callback) {
    callback();
  },
});

process.stdout.write(
  "Paste the connection string (hidden), then press Enter: ",
);
const reader = createInterface({
  input: process.stdin,
  output: silent,
  terminal: true,
});
reader.once("line", (line) => {
  reader.close();
  process.stdout.write("\n");
  try {
    console.log(`Fingerprint: ${databaseFingerprint(line.trim())}`);
  } catch {
    console.error("That isn't a postgresql:// connection string.");
    process.exitCode = 1;
  }
});
