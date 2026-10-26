import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("accepts a valid configuration", () => {
    expect(
      parseServerEnv({
        DATABASE_URL: "postgresql://u:p@host/db",
        DATABASE_ENV: "development",
      }),
    ).toEqual({
      DATABASE_URL: "postgresql://u:p@host/db",
      DATABASE_ENV: "development",
    });
  });

  it("names invalid variables without revealing their values", () => {
    expect(() =>
      parseServerEnv({
        DATABASE_URL: "mysql://secret-user:secret-pass@host/db", // gitleaks:allow (invented test value)
        DATABASE_ENV: "staging",
      }),
    ).toThrow(/^Invalid server configuration: DATABASE_URL, DATABASE_ENV$/);
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/);
  });
});
