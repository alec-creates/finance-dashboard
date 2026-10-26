import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { GET as getAccounts } from "../../src/app/api/accounts/route";

import {
  callAuth,
  createOwnerWithTwoFactor,
  createTestAuth,
  testAuthEnv,
  TEST_PASSWORD,
} from "./auth-helpers";
import { createTestPrisma, createUser, resetDatabase } from "./helpers";

const prisma = createTestPrisma();
const auth = createTestAuth(prisma);
afterAll(() => prisma.$disconnect());

const accountsRequest = (cookies?: string) =>
  getAccounts(
    new Request(
      `${testAuthEnv().BETTER_AUTH_URL}/api/accounts`,
      cookies ? { headers: { cookie: cookies } } : undefined,
    ),
  );

describe("financial API routes require an authenticated owner", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  it("returns 401 without a session", async () => {
    const response = await accountsRequest();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Not signed in." });
  });

  it("returns 401 for a forged or unknown session cookie", async () => {
    const response = await accountsRequest(
      "finance.session_token=forged-token.signature",
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 until two-factor authentication is set up", async () => {
    const signUp = await callAuth(auth, "/sign-up/email", {
      body: {
        email: testAuthEnv().OWNER_EMAIL,
        password: TEST_PASSWORD,
        name: "Owner",
      },
    });
    const response = await accountsRequest(signUp.cookies);
    expect(response.status).toBe(403);
  });

  it("returns only the signed-in owner's accounts", async () => {
    const owner = await createOwnerWithTwoFactor(auth);
    const ownerId = (
      await prisma.user.findUniqueOrThrow({ where: { email: owner.email } })
    ).id;
    // Another user's data exists in the database but must never be returned.
    const other = await createUser(prisma, "someone-else");
    await prisma.financialAccount.createMany({
      data: [
        { userId: ownerId, name: "Owner Checking", type: "CHECKING" },
        { userId: other.id, name: "Other Checking", type: "CHECKING" },
      ],
    });

    const response = await accountsRequest(owner.cookies);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const { accounts } = (await response.json()) as {
      accounts: { name: string }[];
    };
    expect(accounts.map((account) => account.name)).toEqual(["Owner Checking"]);
  });

  it("stops working after sign-out", async () => {
    const owner = await createOwnerWithTwoFactor(auth);
    expect((await accountsRequest(owner.cookies)).status).toBe(200);
    await callAuth(auth, "/sign-out", { cookies: owner.cookies });
    expect((await accountsRequest(owner.cookies)).status).toBe(401);
  });
});
