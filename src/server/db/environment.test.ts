import { describe, expect, it } from "vitest";

import {
  assertDatabaseEnvironment,
  assertIsolatedTestDatabase,
  connectionSecrets,
  databaseIdentity,
  DatabaseEnvironmentError,
  normalizeConnectionString,
  parseEnvFile,
  redactConnectionDetails,
} from "./environment";

// Invented connection strings; none of these hosts or credentials exist.
const devPooled =
  "postgresql://dev_owner:devSecret123@ep-alpha-111111-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"; // gitleaks:allow (invented test value)
const devDirect =
  "postgresql://dev_owner:devSecret123@ep-alpha-111111.us-east-1.aws.neon.tech/neondb?sslmode=require"; // gitleaks:allow (invented test value)
const testPooled =
  "postgresql://test_owner:testSecret456@ep-beta-222222-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"; // gitleaks:allow (invented test value)
const testDirect =
  "postgresql://test_owner:testSecret456@ep-beta-222222.us-east-1.aws.neon.tech/neondb?sslmode=require"; // gitleaks:allow (invented test value)

describe("parseEnvFile", () => {
  it("reads quoted and unquoted values and skips comments", () => {
    const text = [
      "# comment",
      "",
      'A="quoted value"',
      "B=plain",
      "C='single'",
      "not a pair",
    ].join("\r\n");
    expect(parseEnvFile(text)).toEqual({
      A: "quoted value",
      B: "plain",
      C: "single",
    });
  });
});

describe("databaseIdentity", () => {
  it("maps pooled and direct strings of one database to the same identity", () => {
    expect(databaseIdentity(devPooled)).toBe(databaseIdentity(devDirect));
    expect(databaseIdentity(devDirect)).not.toBe(databaseIdentity(testDirect));
  });

  it("rejects non-postgres and malformed strings without echoing them", () => {
    expect(() => databaseIdentity("mysql://x@y/z")).toThrow(
      DatabaseEnvironmentError,
    );
    expect(() => databaseIdentity("not a url")).toThrow(/^(?!.*not a url).*$/);
  });
});

describe("assertDatabaseEnvironment", () => {
  it("passes only for the expected environment", () => {
    expect(() =>
      assertDatabaseEnvironment("development", "development"),
    ).not.toThrow();
    expect(() => assertDatabaseEnvironment("development", "test")).toThrow(
      DatabaseEnvironmentError,
    );
    expect(() => assertDatabaseEnvironment("test", undefined)).toThrow(
      DatabaseEnvironmentError,
    );
  });
});

describe("assertIsolatedTestDatabase", () => {
  it("accepts a test configuration that points away from development", () => {
    expect(() =>
      assertIsolatedTestDatabase({
        databaseEnv: "test",
        databaseUrls: [testPooled, testDirect],
        forbiddenUrls: [devPooled, devDirect],
      }),
    ).not.toThrow();
  });

  it("refuses when DATABASE_ENV is not test", () => {
    expect(() =>
      assertIsolatedTestDatabase({
        databaseEnv: "development",
        databaseUrls: [testPooled],
        forbiddenUrls: [devDirect],
      }),
    ).toThrow(/DATABASE_ENV must be "test"/);
  });

  it("refuses when any test URL points at the development database, pooled or direct", () => {
    expect(() =>
      assertIsolatedTestDatabase({
        databaseEnv: "test",
        databaseUrls: [testPooled, devPooled],
        forbiddenUrls: [devDirect],
      }),
    ).toThrow(/points at the development database/);
  });

  it("refuses when URLs are missing", () => {
    expect(() =>
      assertIsolatedTestDatabase({
        databaseEnv: "test",
        databaseUrls: [undefined],
        forbiddenUrls: [],
      }),
    ).toThrow(/not set/);
    expect(() =>
      assertIsolatedTestDatabase({
        databaseEnv: "test",
        databaseUrls: [],
        forbiddenUrls: [],
      }),
    ).toThrow(/not set/);
  });

  it("never includes hosts or credentials in its errors", () => {
    try {
      assertIsolatedTestDatabase({
        databaseEnv: "test",
        databaseUrls: [devPooled],
        forbiddenUrls: [devDirect],
      });
    } catch (error) {
      expect(String(error)).not.toMatch(
        /neon\.tech|dev_owner|devSecret123|ep-alpha/,
      );
    }
  });
});

describe("normalizeConnectionString", () => {
  it("makes certificate verification explicit", () => {
    expect(
      new URL(normalizeConnectionString(devPooled)).searchParams.get("sslmode"),
    ).toBe("verify-full");
    expect(
      new URL(
        normalizeConnectionString(
          devPooled.replace("sslmode=require", "sslmode=disable"),
        ),
      ).searchParams.get("sslmode"),
    ).toBe("disable");
  });
});

describe("redactConnectionDetails", () => {
  it("removes connection strings, Neon hosts and known secrets", () => {
    const secrets = connectionSecrets([devPooled, devDirect]);
    const text = `url ${devPooled} host ep-alpha-111111.us-east-1.aws.neon.tech user dev_owner pw devSecret123`;
    const redacted = redactConnectionDetails(text, secrets);
    expect(redacted).not.toMatch(
      /neon\.tech|dev_owner|devSecret123|postgresql:/,
    );
    expect(redacted).toContain("[redacted");
  });

  it("leaves ordinary text alone", () => {
    expect(redactConnectionDetails("Applying migration init")).toBe(
      "Applying migration init",
    );
  });
});
