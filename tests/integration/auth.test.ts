import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { AUTH_SERVER_MESSAGES } from "../../src/server/auth/owner";

import {
  callAuth,
  createOwnerWithTwoFactor,
  createTestAuth,
  secretFromTotpUri,
  testAuthEnv,
  TEST_PASSWORD,
  totpCode,
} from "./auth-helpers";
import { createTestPrisma, resetDatabase } from "./helpers";

const prisma = createTestPrisma();
const auth = createTestAuth(prisma);
const owner = testAuthEnv().OWNER_EMAIL;
afterAll(() => prisma.$disconnect());

const signUp = (email: string, ip?: string) =>
  callAuth(auth, "/sign-up/email", {
    body: { email, password: TEST_PASSWORD, name: "Someone" },
    ip,
  });
const signIn = (email: string, password: string, ip?: string) =>
  callAuth(auth, "/sign-in/email", { body: { email, password }, ip });
const getSession = async (cookies: string) =>
  (await callAuth(auth, "/get-session", { method: "GET", cookies })).json;

beforeEach(async () => {
  await resetDatabase(prisma);
});

describe("account creation is limited to the configured owner", () => {
  it("rejects sign-up with an unapproved email without revealing why", async () => {
    const response = await signUp("intruder@example.com");
    expect(response.status).toBe(403);
    expect(response.json?.message).toBe(AUTH_SERVER_MESSAGES.signUpUnavailable);
    expect(await prisma.user.count()).toBe(0);
  });

  it("creates the owner account once, then refuses every further sign-up", async () => {
    const first = await signUp(owner);
    expect(first.status).toBe(200);
    expect(await prisma.user.count()).toBe(1);

    for (const email of [
      owner,
      owner.toUpperCase(),
      "someone-else@example.com",
    ]) {
      const again = await signUp(email, "203.0.113.20");
      expect(again.status).toBe(403);
      expect(again.json?.message).toBe(AUTH_SERVER_MESSAGES.signUpUnavailable);
    }
    expect(await prisma.user.count()).toBe(1);
  });

  it("is not blocked by a user that has no sign-in method (such as the synthetic demo user)", async () => {
    await prisma.user.create({
      data: {
        id: "synthetic-demo-user",
        name: "Demo User",
        email: "demo@example.com",
      },
    });
    // The demo user cannot sign in: it has no password.
    expect(
      (await signIn("demo@example.com", TEST_PASSWORD, "203.0.113.70")).status,
    ).toBe(401);
    expect((await signUp(owner)).status).toBe(200);
    expect(await prisma.user.count()).toBe(2);
  });

  it("enforces the minimum password length", async () => {
    const response = await callAuth(auth, "/sign-up/email", {
      body: { email: owner, password: "short-pass", name: "Owner" },
    });
    expect(response.status).toBe(400);
    expect(await prisma.user.count()).toBe(0);
  });

  it("stores only a password hash", async () => {
    await signUp(owner);
    const account = await prisma.account.findFirstOrThrow({
      where: { providerId: "credential" },
    });
    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain(TEST_PASSWORD);
  });
});

describe("sign-in", () => {
  beforeEach(async () => {
    await signUp(owner);
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    const wrongPassword = await signIn(
      owner,
      "not-the-right-password",
      "203.0.113.30",
    );
    const unknownEmail = await signIn(
      "nobody@example.com",
      TEST_PASSWORD,
      "203.0.113.31",
    );
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.json?.message).toBe(unknownEmail.json?.message);
  });

  it("signs in the owner and sets an httpOnly session cookie", async () => {
    const response = await signIn(owner, TEST_PASSWORD);
    expect(response.status).toBe(200);
    expect(response.cookies).toContain("finance.session_token=");
    expect((await getSession(response.cookies))?.user).toMatchObject({
      email: owner,
    });
  });

  it("refuses sessions for an account whose email is no longer the configured owner", async () => {
    const authWithNewOwner = createTestAuth(prisma, "new-owner@example.com");
    const response = await callAuth(authWithNewOwner, "/sign-in/email", {
      body: { email: owner, password: TEST_PASSWORD },
    });
    expect(response.status).toBe(401);
    expect(await prisma.session.count()).toBe(1); // only the session from sign-up
  });
});

describe("sessions", () => {
  it("returns no session without a cookie", async () => {
    expect(await getSession("")).toBeNull();
  });

  it("invalidates the session on sign-out", async () => {
    const { cookies } = await signUp(owner);
    expect(await getSession(cookies)).not.toBeNull();
    const signOut = await callAuth(auth, "/sign-out", { cookies });
    expect(signOut.status).toBe(200);
    expect(await prisma.session.count()).toBe(0);
    // The old cookie value no longer works, even if a client kept it.
    expect(await getSession(cookies)).toBeNull();
  });

  it("rejects an expired session", async () => {
    const { cookies } = await signUp(owner);
    await prisma.session.updateMany({
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect(await getSession(cookies)).toBeNull();
  });

  it("can sign out every other device", async () => {
    await signUp(owner);
    const laptop = await signIn(owner, TEST_PASSWORD, "203.0.113.40");
    const phone = await signIn(owner, TEST_PASSWORD, "203.0.113.41");
    expect(await getSession(phone.cookies)).not.toBeNull();
    const revoke = await callAuth(auth, "/revoke-other-sessions", {
      cookies: laptop.cookies,
    });
    expect(revoke.status).toBe(200);
    expect(await getSession(phone.cookies)).toBeNull();
    expect(await getSession(laptop.cookies)).not.toBeNull();
  });
});

describe("two-factor authentication (TOTP)", () => {
  it("requires the password to turn on 2FA", async () => {
    const { cookies } = await signUp(owner);
    const response = await callAuth(auth, "/two-factor/enable", {
      body: { password: "wrong-password-here" },
      cookies,
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.twoFactor.count()).toBe(0);
  });

  it("only turns on after a valid code is entered", async () => {
    const { cookies } = await signUp(owner);
    const enable = await callAuth(auth, "/two-factor/enable", {
      body: { password: TEST_PASSWORD },
      cookies,
    });
    expect(enable.status).toBe(200);
    expect(String(enable.json?.totpURI)).toMatch(/^otpauth:\/\/totp\//);
    expect(enable.json?.backupCodes).toHaveLength(10);
    expect((await prisma.user.findFirstOrThrow()).twoFactorEnabled).toBe(false);

    const secret = secretFromTotpUri(String(enable.json?.totpURI));
    const verify = await callAuth(auth, "/two-factor/verify-totp", {
      body: { code: totpCode(secret) },
      cookies: enable.cookies,
    });
    expect(verify.status).toBe(200);
    expect((await prisma.user.findFirstOrThrow()).twoFactorEnabled).toBe(true);
  });

  it("stores the TOTP secret and backup codes encrypted", async () => {
    const { secret, backupCodes } = await createOwnerWithTwoFactor(auth);
    const row = await prisma.twoFactor.findFirstOrThrow();
    expect(row.secret).not.toContain(secret);
    for (const code of backupCodes) {
      expect(row.backupCodes).not.toContain(code);
    }
  });

  it("asks for a code after the password and grants no session until it is correct", async () => {
    const { secret } = await createOwnerWithTwoFactor(auth);
    const step1 = await signIn(owner, TEST_PASSWORD, "203.0.113.50");
    expect(step1.status).toBe(200);
    expect(step1.json?.twoFactorRedirect).toBe(true);
    expect(await getSession(step1.cookies)).toBeNull();

    const wrong = await callAuth(auth, "/two-factor/verify-totp", {
      body: { code: "000000" },
      cookies: step1.cookies,
      ip: "203.0.113.50",
    });
    expect(wrong.status).toBe(401);
    expect(await getSession(wrong.cookies)).toBeNull();

    const right = await callAuth(auth, "/two-factor/verify-totp", {
      body: { code: totpCode(secret, Date.now() + 30_000) },
      cookies: step1.cookies,
      ip: "203.0.113.50",
    });
    expect(right.status).toBe(200);
    expect((await getSession(right.cookies))?.user).toMatchObject({
      email: owner,
    });
  });

  it("accepts each backup code only once", async () => {
    const { backupCodes } = await createOwnerWithTwoFactor(auth);
    const code = backupCodes[0] ?? "";
    const first = await signIn(owner, TEST_PASSWORD, "203.0.113.60");
    const useCode = await callAuth(auth, "/two-factor/verify-backup-code", {
      body: { code },
      cookies: first.cookies,
      ip: "203.0.113.60",
    });
    expect(useCode.status).toBe(200);
    expect(await getSession(useCode.cookies)).not.toBeNull();

    const second = await signIn(owner, TEST_PASSWORD, "203.0.113.61");
    const reuse = await callAuth(auth, "/two-factor/verify-backup-code", {
      body: { code },
      cookies: second.cookies,
      ip: "203.0.113.61",
    });
    expect(reuse.status).toBe(401);
    expect(await getSession(reuse.cookies)).toBeNull();
  });
});

describe("brute-force protection", () => {
  it("rate-limits repeated sign-in attempts from one address", async () => {
    await signUp(owner);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push(
        (await signIn(owner, `wrong-password-${attempt}`, "198.51.100.1"))
          .status,
      );
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
    // Another address is unaffected, and the correct password still works there.
    expect((await signIn(owner, TEST_PASSWORD, "198.51.100.2")).status).toBe(
      200,
    );
  });

  it("rate-limits repeated two-factor codes", async () => {
    await createOwnerWithTwoFactor(auth);
    const { cookies } = await signIn(owner, TEST_PASSWORD, "198.51.100.3");
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push(
        (
          await callAuth(auth, "/two-factor/verify-totp", {
            body: { code: "123456" },
            cookies,
            ip: "198.51.100.3",
          })
        ).status,
      );
    }
    expect(statuses[5]).toBe(429);
  });

  it("locks two-factor verification for the account after repeated failures from many addresses", async () => {
    const { secret } = await createOwnerWithTwoFactor(auth);
    // Spread attempts over addresses so the per-IP rate limit does not stop them first.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const ip = `192.0.2.${attempt + 1}`;
      const { cookies } = await signIn(owner, TEST_PASSWORD, ip);
      await callAuth(auth, "/two-factor/verify-totp", {
        body: { code: "000000" },
        cookies,
        ip,
      });
    }
    const { cookies } = await signIn(owner, TEST_PASSWORD, "192.0.2.50");
    const correct = await callAuth(auth, "/two-factor/verify-totp", {
      body: { code: totpCode(secret, Date.now() + 30_000) },
      cookies,
      ip: "192.0.2.50",
    });
    expect(correct.status).not.toBe(200);
    expect(await getSession(correct.cookies)).toBeNull();
    expect(
      (await prisma.twoFactor.findFirstOrThrow()).lockedUntil?.getTime(),
    ).toBeGreaterThan(Date.now());
  });
});
