import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

const request = (path: string, cookie?: string) =>
  new NextRequest(
    new URL(path, "http://localhost:3000"),
    cookie ? { headers: { cookie } } : undefined,
  );
const SESSION = "finance.session_token=abc.def";

describe("proxy (optimistic session check)", () => {
  it("redirects signed-out visitors from app pages to sign-in", () => {
    for (const path of ["/", "/settings/security", "/security/two-factor"]) {
      const response = proxy(request(path));
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
        "/sign-in",
      );
    }
  });

  it("rejects signed-out API calls with 401 JSON instead of redirecting", async () => {
    const response = proxy(request("/api/accounts"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Not signed in." });
  });

  it("lets public pages and the auth API through without a session", () => {
    for (const path of [
      "/sign-in",
      "/two-factor",
      "/setup",
      "/api/auth/get-session",
    ]) {
      expect(proxy(request(path)).headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("does not treat look-alike paths as public", () => {
    expect(proxy(request("/sign-in-anything")).status).toBe(307);
    expect(proxy(request("/api/authx")).status).toBe(401);
  });

  it("lets requests with a session cookie continue to the real (database) check", () => {
    expect(proxy(request("/", SESSION)).headers.get("x-middleware-next")).toBe(
      "1",
    );
    expect(
      proxy(request("/api/accounts", SESSION)).headers.get("x-middleware-next"),
    ).toBe("1");
  });
});
