import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

// Prisma 7 does not load env files. Load them the way Next.js does: .env.test.local when NODE_ENV=test, otherwise
// .env.local. Existing process variables win.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "test", {
  info: () => {},
  error: console.error,
});

// Commands that touch a database must go through scripts/db.ts, which checks DATABASE_ENV and isolation first.
const DATABASE_COMMANDS = new Set(["migrate", "db", "studio"]);
if (
  DATABASE_COMMANDS.has(process.argv[2] ?? "") &&
  process.env.FINANCE_DB_GUARD !== "1"
) {
  throw new Error(
    "Run database commands through the npm scripts (npm run db:migrate, db:migrate:test, db:seed, db:status), " +
      "which verify the target database first.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations use the direct (unpooled) connection; the app uses the pooled DATABASE_URL.
    url: process.env.DIRECT_URL,
  },
});
