import { describe, expect, it } from "vitest";

import {
  assertDeploymentConfiguration,
  deploymentStage,
  isTestingState,
} from "./deployment";

const production = {
  VERCEL_ENV: "production",
  DATABASE_ENV: "production",
  BETTER_AUTH_URL: "https://finance.example.test",
};

describe("deploymentStage", () => {
  it("reads Vercel's environment and treats everything else as local", () => {
    expect(deploymentStage({ VERCEL_ENV: "production" })).toBe("production");
    expect(deploymentStage({ VERCEL_ENV: "preview" })).toBe("preview");
    expect(deploymentStage({})).toBe("local");
    expect(deploymentStage({ VERCEL_ENV: "staging" })).toBe("local");
  });
});

describe("assertDeploymentConfiguration", () => {
  it("accepts production on the production database over https", () => {
    expect(() => assertDeploymentConfiguration(production)).not.toThrow();
  });

  it("accepts local development and tests on their own databases", () => {
    for (const DATABASE_ENV of ["development", "test"]) {
      expect(() =>
        assertDeploymentConfiguration({ DATABASE_ENV }),
      ).not.toThrow();
    }
  });

  it("refuses a production deployment that isn't on the production database", () => {
    expect(() =>
      assertDeploymentConfiguration({
        ...production,
        DATABASE_ENV: "development",
      }),
    ).toThrow(/must be "production"/);
    expect(() =>
      assertDeploymentConfiguration({ ...production, DATABASE_ENV: undefined }),
    ).toThrow(/must be "production"/);
  });

  it("refuses the production database anywhere but the production deployment", () => {
    for (const VERCEL_ENV of ["preview", "development", undefined]) {
      expect(() =>
        assertDeploymentConfiguration({
          VERCEL_ENV,
          DATABASE_ENV: "production",
        }),
      ).toThrow(/outside the production deployment/);
    }
  });

  it("requires https for production sign-in", () => {
    expect(() =>
      assertDeploymentConfiguration({
        ...production,
        BETTER_AUTH_URL: "http://finance.example.test",
      }),
    ).toThrow(/https/);
  });

  it("never includes values in its errors", () => {
    try {
      assertDeploymentConfiguration({
        ...production,
        BETTER_AUTH_URL: "http://secret-host.example.test",
      });
    } catch (error) {
      expect(String(error)).not.toContain("secret-host");
    }
  });
});

describe("isTestingState", () => {
  it("is on in production until real data is explicitly approved", () => {
    expect(isTestingState({ DATABASE_ENV: "production" })).toBe(true);
    expect(
      isTestingState({ DATABASE_ENV: "production", REAL_DATA_APPROVED: "yes" }),
    ).toBe(true);
    expect(
      isTestingState({
        DATABASE_ENV: "production",
        REAL_DATA_APPROVED: "true",
      }),
    ).toBe(false);
  });

  it("is off outside production", () => {
    expect(isTestingState({ DATABASE_ENV: "development" })).toBe(false);
    expect(isTestingState({})).toBe(false);
  });
});
