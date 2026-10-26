import { describe, expect, it } from "vitest";

import { describeAuthError } from "@/lib/auth-messages";

import { MIN_PASSWORD_LENGTH } from "./constants";
import { parseAuthEnv } from "./env";
import { isOwnerEmail, normalizeEmail } from "./owner";

describe("owner email", () => {
  it("matches the configured owner, ignoring case and surrounding spaces", () => {
    expect(normalizeEmail("  Owner@Example.COM ")).toBe("owner@example.com");
    expect(isOwnerEmail("OWNER@example.com", "owner@example.com")).toBe(true);
    expect(isOwnerEmail(" owner@example.com", "Owner@Example.com")).toBe(true);
  });

  it("rejects every other address and non-strings", () => {
    expect(
      isOwnerEmail("owner@example.com.evil.test", "owner@example.com"),
    ).toBe(false);
    expect(isOwnerEmail("other@example.com", "owner@example.com")).toBe(false);
    expect(isOwnerEmail(undefined, "owner@example.com")).toBe(false);
    expect(isOwnerEmail(["owner@example.com"], "owner@example.com")).toBe(
      false,
    );
  });

  it("matches nothing when no owner is configured", () => {
    expect(isOwnerEmail("", "")).toBe(false);
    expect(isOwnerEmail("owner@example.com", "  ")).toBe(false);
  });
});

describe("parseAuthEnv", () => {
  const valid = {
    BETTER_AUTH_SECRET: "a".repeat(43),
    BETTER_AUTH_URL: "http://localhost:3000",
    OWNER_EMAIL: "owner@example.com",
  };

  it("accepts a complete configuration", () => {
    expect(parseAuthEnv(valid)).toEqual(valid);
  });

  it("rejects weak secrets, placeholders and bad values, naming only the variables", () => {
    const attempt = () =>
      parseAuthEnv({
        BETTER_AUTH_SECRET: "too-short-secret",
        BETTER_AUTH_URL: "ftp://example.com",
        OWNER_EMAIL: "REPLACE_WITH_YOUR_EMAIL",
      });
    expect(attempt).toThrow(
      /^Invalid authentication configuration: BETTER_AUTH_SECRET, BETTER_AUTH_URL, OWNER_EMAIL$/,
    );
    expect(() =>
      parseAuthEnv({
        ...valid,
        BETTER_AUTH_SECRET: `REPLACE_WITH_${"x".repeat(40)}`,
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => parseAuthEnv({})).toThrow(/BETTER_AUTH_SECRET/);
  });
});

describe("describeAuthError", () => {
  it("returns nothing when there is no error", () => {
    expect(describeAuthError(null)).toBe("");
  });

  it("gives one message for wrong passwords and unknown accounts", () => {
    expect(
      describeAuthError(
        { status: 401, code: "INVALID_EMAIL_OR_PASSWORD" },
        "signIn",
      ),
    ).toBe("Incorrect email or password.");
    expect(describeAuthError({ status: 401 }, "signIn")).toBe(
      "Incorrect email or password.",
    );
    expect(describeAuthError({ status: 403 }, "signIn")).toBe(
      "Incorrect email or password.",
    );
  });

  it("explains rate limits, lockouts, weak passwords and bad codes without details", () => {
    expect(describeAuthError({ status: 429 }, "signIn")).toMatch(
      /Too many attempts/,
    );
    expect(describeAuthError({ code: "ACCOUNT_TEMPORARILY_LOCKED" })).toMatch(
      /15 minutes/,
    );
    expect(describeAuthError({ code: "PASSWORD_TOO_SHORT" })).toContain(
      String(MIN_PASSWORD_LENGTH),
    );
    expect(describeAuthError({ code: "PASSWORD_COMPROMISED" })).toMatch(
      /data breach/,
    );
    expect(describeAuthError({ status: 401 }, "twoFactor")).toMatch(
      /code didn't work/,
    );
    expect(describeAuthError({ status: 403 }, "signUp")).toBe(
      "Account creation is not available.",
    );
  });

  it("falls back to a generic message", () => {
    expect(describeAuthError({ status: 500, code: "SOMETHING_INTERNAL" })).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
