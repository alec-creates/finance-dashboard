/**
 * Run by the Playwright global setup in its own process (the generated Prisma client is ESM-only): empties the TEST
 * database, creates the invented test owner with 2FA, and prints one JSON line with the owner's email and TOTP secret
 * for the tests. Refuses anything but the isolated test database.
 */
import { loadAndAssertTestDatabase } from "../src/server/db/load-env";
import {
  createOwnerWithTwoFactor,
  createTestAuth,
} from "../tests/integration/auth-helpers";
import {
  createTestPrisma,
  resetDatabase,
} from "../tests/support/test-database";

loadAndAssertTestDatabase();
const prisma = createTestPrisma();
try {
  await resetDatabase(prisma);
  const owner = await createOwnerWithTwoFactor(createTestAuth(prisma));
  if (!owner.statuses.every((status) => status === 200)) {
    throw new Error("Could not create the test owner");
  }
  process.stdout.write(
    `${JSON.stringify({ email: owner.email, secret: owner.secret })}\n`,
  );
} finally {
  await prisma.$disconnect();
}
