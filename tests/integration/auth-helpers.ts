import { createHmac } from "node:crypto";

import type { PrismaClient } from "../../src/generated/prisma/client";
import { createAuth, type Auth } from "../../src/server/auth/config";
import { parseAuthEnv } from "../../src/server/auth/env";

/** Invented credentials for the synthetic test owner. */
export const TEST_PASSWORD = "correct-horse-battery-staple-2026"; // gitleaks:allow (invented test value)

export function testAuthEnv() {
  return parseAuthEnv(process.env);
}

/** A Better Auth instance for the test database. Breach checks are off so tests stay offline. */
export function createTestAuth(
  prisma: PrismaClient,
  ownerEmail = testAuthEnv().OWNER_EMAIL,
): Auth {
  const env = testAuthEnv();
  return createAuth({
    prisma,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    ownerEmail,
    checkBreachedPasswords: false,
  });
}

/** Applies Set-Cookie headers to a Cookie header, the way a browser would. */
export function mergeCookies(
  cookieHeader: string,
  setCookies: string[],
): string {
  const jar = new Map(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map(
        (part) =>
          [
            part.slice(0, part.indexOf("=")),
            part.slice(part.indexOf("=") + 1),
          ] as const,
      ),
  );
  for (const setCookie of setCookies) {
    const [pair = "", ...attributes] = setCookie.split(";");
    const name = pair.slice(0, pair.indexOf("=")).trim();
    const value = pair.slice(pair.indexOf("=") + 1).trim();
    const expired = attributes.some((attribute) =>
      /^\s*max-age=0\s*$/i.test(attribute),
    );
    if (expired || value === "") {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

export interface AuthResponse {
  status: number;
  json: Record<string, unknown> | null;
  cookies: string;
}

/** Calls a Better Auth endpoint through its HTTP handler (so rate limits, origin checks and cookies apply). */
export async function callAuth(
  auth: Auth,
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    cookies?: string;
    ip?: string;
  } = {},
): Promise<AuthResponse> {
  const { method = "POST", body, cookies = "", ip = "203.0.113.10" } = options;
  const baseURL = testAuthEnv().BETTER_AUTH_URL;
  const headers = new Headers({ origin: baseURL, "x-forwarded-for": ip });
  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (cookies) {
    headers.set("cookie", cookies);
  }
  const response = await auth.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const text = await response.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return {
    status: response.status,
    json,
    cookies: mergeCookies(cookies, response.headers.getSetCookie()),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// TOTP (RFC 6238) for tests, so codes can be produced from the secret in the otpauth:// URI.

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) {
      throw new Error("Invalid base32 secret");
    }
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => parseInt(byte, 2)));
}

export function secretFromTotpUri(totpURI: string): string {
  const secret = new URL(totpURI).searchParams.get("secret");
  if (!secret) {
    throw new Error("No secret in TOTP URI");
  }
  return secret;
}

export function totpCode(
  secret: string,
  timeMs = Date.now(),
  periodSeconds = 30,
  digits = 6,
): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timeMs / 1000 / periodSeconds)));
  const hmac = createHmac("sha1", base32Decode(secret))
    .update(counter)
    .digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(binary).padStart(digits, "0");
}

/** Signs up the owner and turns on 2FA; returns the session cookies, TOTP secret and backup codes. */
export async function createOwnerWithTwoFactor(auth: Auth) {
  const email = testAuthEnv().OWNER_EMAIL;
  const signUp = await callAuth(auth, "/sign-up/email", {
    body: { email, password: TEST_PASSWORD, name: "Test Owner" },
  });
  const enable = await callAuth(auth, "/two-factor/enable", {
    body: { password: TEST_PASSWORD },
    cookies: signUp.cookies,
  });
  const secret = secretFromTotpUri(String(enable.json?.totpURI));
  const verify = await callAuth(auth, "/two-factor/verify-totp", {
    body: { code: totpCode(secret) },
    cookies: enable.cookies,
  });
  return {
    email,
    secret,
    backupCodes: enable.json?.backupCodes as string[],
    cookies: verify.cookies,
    statuses: [signUp.status, enable.status, verify.status],
  };
}
